// Integrated rendering regression: synthetic portrait camera and worker landmarks.
// This exercises the real application compositor, not physical iPhone detection.
import { chromium, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { worldCyclePair, worldCyclePrayer } from '../tests/world-cycle-fixtures.ts';
import { handOutlineFixture, opposingLFixture } from '../tests/hand-outline-fixtures.ts';

const base = process.argv[2] || 'http://127.0.0.1:8804';
const output = new URL(process.argv[3] || '../test-results/tracking-stability/', import.meta.url);
await mkdir(output, { recursive: true });
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
const report = { base, engine, at: new Date().toISOString(), checks: [], errors: [], posts: [], failures: [],
  evidence: `${engine === 'webkit' ? 'WebKit' : 'Chromium'} phone viewport; real portrait canvas MediaStream, image decode and app rendering; synthetic worker landmarks. Not a physical iPhone/MediaPipe accuracy measurement.` };
const fixtures = { open: worldCyclePair(3.2), closed: worldCyclePrayer(), partial: worldCyclePair(2.1),
  low: worldCyclePair(2.02), high: worldCyclePair(2.18), none: [], single: worldCyclePair(3.2).slice(0, 1),
  rectangle: handOutlineFixture('rectangle', { tipGap: .2 }), inverted: opposingLFixture('right'),
  poseLow: handOutlineFixture('rectangle', { tipGap: .2, dx: -.004 }),
  poseHigh: handOutlineFixture('rectangle', { tipGap: .2, dx: .004 }) };
// Equivalent physical palms in portrait-normalized coordinates. x and z are
// width-normalized; y is height-normalized. Keep smaller hands in the crop.
const portrait = hands => hands.map(hand => ({ ...hand, landmarks: hand.landmarks.map(p => ({
  ...p, x: .5 + (p.x - .5) * (16 / 9) / (9 / 16), z: (p.z || 0) * (16 / 9) / (9 / 16),
})) }));
fixtures.nativeOpen = portrait(worldCyclePair(3.2, { scale: .35 }));
fixtures.nativeClosed = portrait(worldCyclePrayer(.04, .35));
const worker = `const fixtures=${JSON.stringify(fixtures)};let mode='none',index=0;self.onmessage=({data})=>{
  if(data.type==='fixture'){mode=data.name;index=0;self.postMessage({type:'fixture-ready',name:mode});return;}
  if(data.type==='init'){self.postMessage({type:'ready'});return;}
  if(data.type==='frame'){const name=mode==='jitter'?(index++%2?'high':'low'):mode==='poseJitter'?(index++%2?'poseHigh':'poseLow'):mode;
    const size=[data.bitmap.width,data.bitmap.height];data.bitmap.close();self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands:fixtures[name],aspectRatio:name.startsWith('native')?9/16:16/9,inferenceMs:1,testInput:name,testBitmap:size});}
};`;
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const deadline = setTimeout(() => void browser.close(), 150000);
let page;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  context.setDefaultTimeout(8000);
  await context.addInitScript(() => {
    const state = window.__trackingTest = { worker: null, frames: [], streams: [] };
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) { super(...args); state.worker = this; this.addEventListener('message', ({ data }) => { if (data.type === 'frame') state.frames.push({ input: data.testInput, bitmap: data.testBitmap, timestamp: data.timestamp, at: performance.now() }); }); }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 720; c.height = 1280;
      const ctx = c.getContext('2d'); let frame = 0;
      const paint = () => { ctx.fillStyle = '#777777'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = frame++ % 2 ? '#666666' : '#888888'; ctx.fillRect(0, 0, 10, 10); };
      paint(); const timer = setInterval(paint, 33), stream = c.captureStream(30), track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
      track.getSettings = () => ({ facingMode: 'user' }); track.stop = () => { clearInterval(timer); stop(); }; state.streams.push(stream); return stream;
    };
  });
  await context.route('**/vision-worker.js', route => route.fulfill({ contentType: 'text/javascript', body: worker }));
  await context.route('**/api/config', route => route.fulfill({ contentType: 'application/json', body: '{"aiEnabled":false}' }));
  await context.route('**/api/render', route => route.abort());
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') report.posts.push(request.url()); });
  await page.goto(base); await page.locator('#photo-file-0').waitFor({ state: 'attached' });
  const photo = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const x = c.getContext('2d'); x.fillStyle = '#ee2244'; x.fillRect(0, 0, 120, 80); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await page.locator('#photo-file-0').setInputFiles({ name: 'tracking-test.png', mimeType: 'image/png', buffer: photo });
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Camera on'), {}, { timeout: 20000 });
  const fixture = name => page.evaluate(name => new Promise(resolve => {
    const worker = window.__trackingTest.worker;
    const ready = ({ data }) => { if (data.type === 'fixture-ready' && data.name === name) { worker.removeEventListener('message', ready); resolve(); } };
    worker.addEventListener('message', ready); worker.postMessage({ type: 'fixture', name });
  }), name);
  const extent = () => page.locator('#scene').evaluate(c => {
    const data = c.getContext('2d').getImageData(0, Math.floor(c.height * .5), c.width, 1).data;
    let left = c.width, right = -1;
    for (let x = 0; x < c.width; x++) { const i = x * 4; if (Math.abs(data[i] - 238) < 8 && Math.abs(data[i + 1] - 34) < 8 && Math.abs(data[i + 2] - 68) < 8) { left = Math.min(left, x); right = x; } }
    return { width: Math.max(0, right - left + 1), center: (left + right) / 2, canvasWidth: c.width, canvasHeight: c.height };
  });
  const observeOmission = async () => {
    await fixture('none');
    await page.waitForFunction(() => window.__trackingTest.frames.at(-1)?.input === 'none');
    // Observe an actual omitted detection, then allow its compositor paint.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const age = await page.evaluate(() => {
      const last = window.__trackingTest.frames.findLast(frame => frame.input !== 'none');
      return performance.now() - last.timestamp;
    });
    assert.ok(age < 150, `Test runner missed the transient observation window (${age.toFixed(1)}ms)`);
    return age;
  };
  const check = async (name, action) => { try { await action(); report.checks.push(name); } catch (error) { report.failures.push({ name, error: String(error.message || error) }); } };
  await fixture('open'); await page.waitForTimeout(250);
  await check('Portrait camera inference preserves source aspect at a maximum 512-pixel edge', async () => {
    const sizes = await page.evaluate(() => window.__trackingTest.frames.map(f => f.bitmap));
    assert.ok(sizes.length > 0); assert.ok(sizes.every(([w, h]) => w === 288 && h === 512), JSON.stringify(sizes.slice(-3)));
  });
  await check('Opening two hands reveals the complete local photo', async () => { assert.ok((await extent()).width > 600); });
  await check('A short missing-hand result does not flash the photo away', async () => {
    report.shortLossAgeMs = await observeOmission(); const rendered = await extent(); report.shortLossWidth = rendered.width; assert.ok(rendered.width > 600, JSON.stringify(rendered));
  });
  await check('Sustained missing hands hide the picture within the bounded grace', async () => { await page.waitForTimeout(210); assert.equal((await extent()).width, 0); });
  await check('Reacquisition restores the same photo and true hands-together closes promptly', async () => {
    await fixture('open'); await page.waitForTimeout(150); assert.ok((await extent()).width > 600); assert.equal(await page.locator('[data-photo-select="0"]').getAttribute('aria-pressed'), 'true');
    await fixture('closed'); await page.waitForTimeout(90); assert.equal((await extent()).width, 0);
    await fixture('open'); await page.waitForTimeout(150); assert.ok((await extent()).width > 600);
  });
  await fixture('partial'); await page.waitForTimeout(200); await fixture('jitter'); await page.waitForTimeout(350);
  const samples = [];
  for (let i = 0; i < 24; i++) { samples.push(await extent()); await page.waitForTimeout(34); }
  const rawReveal = separation => { const x = (separation - 1.25) / (2.8 - 1.25); return x * x * (3 - 2 * x); };
  const photoFullWidth = Math.min(samples[0].canvasWidth, samples[0].canvasHeight * 1.5);
  const rawRange = (rawReveal(2.18) - rawReveal(2.02)) * photoFullWidth;
  const widths = samples.map(s => s.width), renderedRange = Math.max(...widths) - Math.min(...widths);
  report.revealJitter = { separationRange: [2.02, 2.18], rawWidthRange: rawRange, renderedWidthRange: renderedRange, widthSamples: widths };
  await check('Partial photo reveal damps repeated tremor without disappearing', async () => {
    assert.ok(widths.every(width => width > 100), JSON.stringify(widths)); assert.ok(renderedRange < rawRange * .45, JSON.stringify(report.revealJitter));
  });
  await page.locator('#photo-fit').selectOption('stretch'); await fixture('rectangle'); await page.waitForTimeout(220);
  await check('Finger-pinned photo still renders after switching out of whole-picture reveal', async () => { assert.ok((await extent()).width > 250); });
  await check('Finger-pinned photo retains its last measured outline through a short omission', async () => {
    report.fittedLossAgeMs = await observeOmission(); assert.ok((await extent()).width > 250);
  });
  await check('Finger-pinned omission expires and valid hands reacquire the photo', async () => {
    await page.waitForTimeout(210); assert.equal((await extent()).width, 0);
    await fixture('rectangle'); await page.waitForTimeout(150); assert.ok((await extent()).width > 250);
  });
  await fixture('poseJitter'); await page.waitForTimeout(200);
  const poseSamples = [];
  for (let i = 0; i < 18; i++) { poseSamples.push(await extent()); await page.waitForTimeout(34); }
  report.poseJitter = { rawTranslationSpan: .008 * samples[0].canvasWidth, centerSpan: Math.max(...poseSamples.map(s => s.center)) - Math.min(...poseSamples.map(s => s.center)), minWidth: Math.min(...poseSamples.map(s => s.width)) };
  await check('Finger-pinned photo damps small corner movement without disappearing', async () => {
    assert.ok(poseSamples.every(s => s.width > 250), JSON.stringify(poseSamples));
    assert.ok(report.poseJitter.centerSpan < report.poseJitter.rawTranslationSpan * .75, JSON.stringify(report.poseJitter));
  });
  await fixture('inverted'); await page.waitForTimeout(200);
  await check('One inverted L keeps the photo connected', async () => { assert.ok((await extent()).width > 200); });
  await page.locator('#photo-fit').selectOption('reveal'); await fixture('nativeOpen'); await page.waitForTimeout(220);
  await check('Native portrait hand geometry opens the complete photo with aspect-correct metrics', async () => { assert.ok((await extent()).width > 600, JSON.stringify(await extent())); });
  await fixture('nativeClosed'); await page.waitForTimeout(90);
  await check('Native portrait hands-together closes the photo', async () => { assert.equal((await extent()).width, 0); });
  await page.locator('#stop-camera').click();
  await check('Stop releases the synthetic camera; no upload or page errors', async () => {
    assert.equal(await page.evaluate(() => window.__trackingTest.streams.filter(s => s.getVideoTracks()[0].readyState === 'live').length), 0);
    assert.deepEqual(report.posts, []); assert.deepEqual(report.errors, []);
  });
  report.ok = report.failures.length === 0; if (!report.ok) process.exitCode = 1;
  console.log(JSON.stringify(report, null, 2));
} catch (error) { report.ok = false; report.failure = String(error.stack || error); report.status = await page?.locator('#status').textContent().catch(() => 'Unavailable'); console.error(JSON.stringify({ failure: report.failure, status: report.status })); process.exitCode = 1; }
finally { clearTimeout(deadline); await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2)); await browser.close(); }
