import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv.slice(2).find(value => /^https?:/.test(value)) ?? 'http://127.0.0.1:8798';
const output = path.resolve('test-results/recording-' + (process.argv.includes('--live') ? 'live' : 'local'));
await mkdir(output, { recursive: true });
const report = { base, startedAt: new Date().toISOString(), checks: [], errors: [], screenshots: [],
  evidence: { recorder: 'Actual Chrome MediaRecorder with generated moving canvas camera.',
    camera: 'No physical camera or microphone. Stub vision worker; no tracking-accuracy claim.',
    share: 'Mock navigator.share/canShare only: cancel, retry and completion do not verify iPhone share-sheet behavior.',
    fullscreen: 'Native fullscreen API absent fixture; actual expanded-view UI and focus behavior.',
    interruptions: 'Synthetic visibility event plus normal Stop camera; no OS suspension guarantee.',
    live: process.argv.includes('--live'), limits: { runMs: 150000, actionMs: 6500 } } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let expired = false;
const budget = setTimeout(() => { expired = true; report.errors.push('150-second browser-suite budget exceeded'); void browser.close(); }, 150000);
const worker = `self.onmessage=({data})=>{if(data.type==='init'){self.postMessage({type:'ready'});return;}if(data.type==='frame'){data.bitmap.close();self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands:[],inferenceMs:1});}};`;

async function setup(mode = 'normal') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.route('**/vision-worker.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: worker }));
  await context.route('**/*', route => ['POST','PUT','PATCH','DELETE'].includes(route.request().method()) ? route.abort('blockedbyclient') : route.fallback());
  await context.addInitScript(({ mode }) => {
    const probe = window.__recordingProbe = { requests: [], captures: [], instances: [], active: 0, maxActive: 0, shares: [], revoked: [], uploads: [], blobs: new Map() };
    const capture = HTMLCanvasElement.prototype.captureStream;
    if (capture) HTMLCanvasElement.prototype.captureStream = function (...args) {
      const stream = capture.apply(this, args); probe.captures.push({ id: this.id, stream }); return stream;
    };
    const Recorder = window.MediaRecorder;
    if (Recorder) window.MediaRecorder = new Proxy(Recorder, { construct(Target, args) {
      const instance = new Target(...args); probe.instances.push(instance);
      instance.addEventListener('start', () => { probe.active++; probe.maxActive = Math.max(probe.maxActive, probe.active); });
      instance.addEventListener('stop', () => { probe.active--; }); return instance;
    } });
    const createURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = createURL(blob); probe.blobs.set(url, blob); return url; };
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { probe.revoked.push(url); revoke(url); };
    navigator.mediaDevices.getUserMedia = async constraints => {
      probe.requests.push(constraints);
      const source = document.createElement('canvas'); source.width = 768; source.height = 432;
      const ctx = source.getContext('2d'); let frame = 0;
      const paint = () => {
        frame++; ctx.fillStyle = '#15344c'; ctx.fillRect(0, 0, 768, 432);
        ctx.fillStyle = frame % 40 < 20 ? '#e78040' : '#55dba9'; ctx.fillRect(180, 70, 400, 290);
        ctx.fillStyle = '#faf4da'; ctx.fillRect((frame * 9) % 680, 365, 85, 45);
      }; paint();
      const stream = capture.call(source, 24), timer = setInterval(paint, 40);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      probe.camera = stream; return stream;
    };
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'share' ? async data => {
      probe.shares.push({ file: data.files[0], active: navigator.userActivation?.isActive });
      if (probe.shares.length === 1) throw new DOMException('Controlled share cancellation', 'AbortError');
    } : undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => mode === 'share' && !!data.files?.[0] });
    if (mode === 'unsupported') Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: undefined });
    if (mode === 'capture-unsupported') Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: undefined });
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    probe.visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  }, { mode });
  const page = await context.newPage(); page.setDefaultTimeout(6500); page.setDefaultNavigationTimeout(15000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (['POST','PUT','PATCH','DELETE'].includes(request.method())) requests.push(request.url()); });
  await page.goto(base, { waitUntil: 'networkidle' }); await page.locator('#record-video').waitFor();
  return { context, page, errors, requests };
}
async function startCamera(page) {
  await page.locator('[data-mode="handframe"]').click();
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => window.__recordingProbe.camera?.getVideoTracks()[0].readyState === 'live' && document.querySelector('#start-camera').disabled);
  await page.waitForFunction(() => /Camera on/.test(document.querySelector('#status').textContent));
}
async function record(page, ms = 1250) {
  await page.locator('#record-video').click();
  await page.waitForFunction(() => document.querySelector('#recording-dock').dataset.phase === 'recording');
  await page.waitForTimeout(ms);
}
async function finish(page) {
  await page.locator('#record-video').click();
  await page.waitForFunction(() => document.querySelector('#record-preview').getAttribute('src')?.startsWith('blob:'));
  await page.waitForFunction(() => document.querySelector('#record-preview').readyState >= 2);
}
async function clipFacts(page) {
  return page.evaluate(async () => {
    const video = document.querySelector('#record-preview'); const blob = window.__recordingProbe.blobs.get(video.src);
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; const ctx = c.getContext('2d');
    const frame = async time => {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Recorded video seek timed out')), 4500);
        video.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true }); video.currentTime = time;
      });
      ctx.drawImage(video, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const first = await frame(.1), later = await frame(.75); let changed = 0, light = 0;
    for (let i = 0; i < first.length; i += 4) { if (Math.abs(first[i]-later[i])+Math.abs(first[i+1]-later[i+1])+Math.abs(first[i+2]-later[i+2]) > 45) changed++; if (later[i]+later[i+1]+later[i+2]>120) light++; }
    const probe = window.__recordingProbe;
    return { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : null,
      bytes: blob.size, mime: blob.type, changedPixels: changed, nonblackPixels: light, captureIds: probe.captures.map(x=>x.id),
      cameraLive: probe.camera.getVideoTracks()[0].readyState, requests: probe.requests, maxActive: probe.maxActive,
      recorderTracksEnded: probe.captures.every(x=>x.stream.getTracks().every(t=>t.readyState==='ended')) };
  });
}
async function run(name, mode, operation) {
  if (expired) return;
  const item = { name, fixture: mode, status: 'running' }; report.checks.push(item); let environment;
  try {
    environment = await setup(mode); const { page } = environment;
    await operation(page, item);
    assert.deepEqual(environment.errors, [], 'no uncaught browser errors');
    assert.deepEqual(environment.requests, [], 'recording must not upload media'); item.status = 'passed';
  } catch (error) { item.status = 'failed'; item.error = error.message; report.errors.push({ name, message: error.message, stack: error.stack });
    if (environment?.page && !environment.page.isClosed()) await environment.page.screenshot({ path: path.join(output, `failure-${report.checks.length}.png`) }).catch(()=>{});
  } finally { await environment?.context.close().catch(()=>{}); }
}
try {
  await run('Actual recorder: processed canvas, moving playable clip, camera stays live and cleanup', 'normal', async (page, item) => {
    assert.equal(await page.locator('#record-video').isDisabled(), true);
    await startCamera(page); await page.locator('#manual').check(); await page.locator('[data-style="thermal"]').click();
    await record(page); await finish(page); item.clip = await clipFacts(page);
    assert.equal(item.clip.width,768); assert.equal(item.clip.height,432); assert.ok(item.clip.bytes>1500);
    assert.ok(item.clip.changedPixels>1000); assert.ok(item.clip.nonblackPixels>10000);
    if(item.clip.duration!==null) assert.ok(item.clip.duration>.9&&item.clip.duration<4);
    assert.deepEqual(item.clip.captureIds,['scene']); assert.equal(item.clip.cameraLive,'live');
    assert.ok(item.clip.requests.every(x=>x.audio===false)); assert.equal(item.clip.maxActive,1); assert.ok(item.clip.recorderTracksEnded);
    await page.locator('#record-preview').screenshot({path:path.join(output,'recorded-preview.png')});
    const url=await page.locator('#record-preview').getAttribute('src'); await page.locator('#discard-video').click();
    assert.equal(await page.locator('#record-preview').getAttribute('src'),null);
    assert.equal(await page.evaluate(url=>window.__recordingProbe.revoked.includes(url),url),true);
    assert.equal(await page.locator('#record-video').isEnabled(),true);
  });
  await run('Repeated Stop cannot create a second recorder or overwrite unsaved clip', 'normal', async page => {
    await startCamera(page); await record(page,450);
    await page.evaluate(()=>{document.querySelector('#record-video').click();document.querySelector('#record-video').click();});
    await page.waitForFunction(()=>document.querySelector('#record-preview').getAttribute('src')?.startsWith('blob:'));
    const url=await page.locator('#record-preview').getAttribute('src');
    assert.equal(await page.locator('#record-video').isDisabled(),true);
    await page.evaluate(()=>document.querySelector('#record-video').click());
    assert.equal(await page.evaluate(()=>window.__recordingProbe.instances.length),1);
    assert.equal(await page.locator('#record-preview').getAttribute('src'),url);
  });
  await run('Share cancellation and fresh-tap retry retain the exact same File', 'share', async (page,item) => {
    await startCamera(page); await record(page,500); await finish(page);
    await page.locator('#save-video').click(); await page.waitForFunction(()=>document.querySelector('#record-status').textContent.includes('cancelled'));
    const url=await page.locator('#record-preview').getAttribute('src'); await page.locator('#save-video').click();
    await page.waitForFunction(()=>document.querySelector('#record-status').textContent.includes('Share menu closed'));
    item.share=await page.evaluate(()=>({calls:window.__recordingProbe.shares.length,sameFile:window.__recordingProbe.shares[0].file===window.__recordingProbe.shares[1].file,activations:window.__recordingProbe.shares.map(x=>x.active)}));
    assert.equal(item.share.calls,2);assert.ok(item.share.sameFile);assert.ok(item.share.activations.every(Boolean));
    assert.equal(await page.locator('#record-preview').getAttribute('src'),url);assert.equal(await page.locator('#save-video').isEnabled(),true);
  });
  await run('No Web Share API: real download preserves a nonempty clip', 'normal', async (page,item) => {
    await startCamera(page);await record(page,500);await finish(page);
    const pending=page.waitForEvent('download');await page.locator('#save-video').click();const download=await pending;
    item.filename=download.suggestedFilename();assert.match(item.filename,/\.(mp4|webm)$/);
    await download.saveAs(path.join(output,'download-'+item.filename));assert.equal(await download.failure(),null);
    assert.equal(await page.locator('#record-result').isVisible(),true);
  });
  for(const viewport of [{width:390,height:844},{width:844,height:390}]) await run(`Fullscreen recording and save controls remain reachable at ${viewport.width}×${viewport.height}`, 'normal', async (page,item) => {
    await page.setViewportSize(viewport);await startCamera(page);await page.locator('#full-screen').click();
    await record(page,500);await finish(page);
    item.controls=await page.evaluate(()=>['record-preview','save-video','download-video','discard-video','exit-screen'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{id,x:r.x,y:r.y,w:r.width,h:r.height,visible:r.width>0&&r.height>0,within:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,uncovered:e===top||e.contains(top)};}));
    for(const c of item.controls){assert.ok(c.visible&&c.within&&c.uncovered,JSON.stringify(c));}
    const seen=new Set();await page.locator('#scene').focus();for(let i=0;i<15;i++){await page.keyboard.press('Tab');seen.add(await page.evaluate(()=>document.activeElement?.id));}
    for(const id of ['save-video','download-video','discard-video','exit-screen'])assert.ok(seen.has(id),`${id} must be in fullscreen keyboard loop; saw ${[...seen]}`);
    const screenshot=path.join(output,`fullscreen-${viewport.width}.png`);await page.screenshot({path:screenshot});report.screenshots.push(screenshot);
    await page.locator('#exit-screen').click();assert.equal(await page.locator('#record-result').isVisible(),true);
  });
  for(const mode of ['unsupported','capture-unsupported']) await run(`Unsupported capability is explained without breaking camera: ${mode}`,mode,async page=>{
    await startCamera(page);assert.equal(await page.locator('#record-video').isDisabled(),true);
    assert.match(await page.locator('#record-status').innerText(),/unavailable|not support/i);
    assert.equal(await page.evaluate(()=>window.__recordingProbe.camera.getVideoTracks()[0].readyState),'live');
  });
  for(const mode of ['camera-stop','hidden']) await run(`Recording interruption retains finalized clip: ${mode}`,'normal',async(page,item)=>{
    await startCamera(page);await record(page,500);
    if(mode==='camera-stop')await page.locator('#stop-camera').click();else await page.evaluate(()=>window.__recordingProbe.visibility(true));
    await page.waitForFunction(()=>document.querySelector('#record-preview').getAttribute('src')?.startsWith('blob:'));
    assert.equal(await page.evaluate(()=>window.__recordingProbe.camera.getVideoTracks()[0].readyState),'ended');
    item.bytes=await page.evaluate(()=>window.__recordingProbe.blobs.get(document.querySelector('#record-preview').src).size);assert.ok(item.bytes>1000);
    if(mode==='hidden'){await page.evaluate(()=>window.__recordingProbe.visibility(false));assert.equal(await page.evaluate(()=>window.__recordingProbe.requests.length),1);}
    assert.equal(await page.locator('#record-result').isVisible(),true);
  });
} finally {
  clearTimeout(budget);await browser.close();report.summary={passed:report.checks.filter(x=>x.status==='passed').length,failed:report.checks.filter(x=>x.status==='failed').length};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({summary:report.summary,errors:report.errors,report:path.join(output,'report.json')},null,2));
if(report.errors.length)process.exitCode=1;
