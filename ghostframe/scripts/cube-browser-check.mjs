// Independent integrated Cube proof: synthetic camera/landmarks; real WebGL,
// Canvas2D compositor, MediaRecorder, saved-file download and decoded replay.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from '@playwright/test';

const base = process.argv.find(value => /^https?:/.test(value)) || 'http://127.0.0.1:8806';
const output = path.resolve(process.env.CUBE_OUTPUT || 'test-results/cube-browser');
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
await mkdir(output, { recursive: true });
const report = { base, engine, at: new Date().toISOString(), checks: [], errors: [], mutations: [],
  evidence: 'Synthetic canvas camera and injected image landmarks; actual browser WebGL/compositor and encoded saved-clip replay. Physical iPhone, real MediaPipe accuracy, device thermal load and native iPhone save remain pending.' };
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const deadline = setTimeout(() => { report.errors.push('180-second suite deadline'); void browser.close(); }, 180000);
const worker = `let fixture={hands:[],aspect:16/9,stall:false};self.onmessage=({data})=>{
 if(data.type==='fixture'){fixture=data.value;self.postMessage({type:'fixture-ready'});return;}
 if(data.type==='init'){self.postMessage({type:'ready'});return;}
 if(data.type==='frame'){data.bitmap.close();if(fixture.stall)return;self.postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands:fixture.hands,aspectRatio:fixture.aspect,inferenceMs:1,testSegment:data.segment});}
};`;
// Articulated image-space landmarks, with palm dimensions measured in y units.
function pair({ center = .34, gap = .22, aspect = 16 / 9, pinched = false, swap = false, only = null } = {}) {
  const result = [-1, 1].map((side, index) => {
    const x = center + side * gap / 2, y = .52;
    const p = (dx, dy) => ({ x: x + dx / aspect, y: y + dy, z: 0 });
    const landmarks = Array.from({ length: 21 }, () => p(0, 0));
    landmarks[0] = p(0, .1); landmarks[5] = p(-.04, -.01); landmarks[9] = p(0, -.06);
    landmarks[13] = p(.03, -.03); landmarks[17] = p(.055, 0);
    landmarks[4] = p(-.095, -.035); landmarks[8] = pinched && index === 0 ? p(-.09, -.035) : p(-.035, -.19);
    landmarks[12] = p(0, -.21); landmarks[16] = p(.035, -.18); landmarks[20] = p(.06, -.12);
    return { landmarks, score: .99, handedness: index === 0 ? 'Left' : 'Right' };
  });
  const selected = only ? result.filter(hand => hand.handedness === only) : result;
  return swap ? selected.reverse() : selected;
}
let page, context;
async function check(name, operation) {
  const item = { name, status: 'running' }; report.checks.push(item);
  try { await operation(item); item.status = 'passed'; console.log('PASS: '+name); }
  catch (error) { item.status = 'failed'; item.error = error.message; report.errors.push({ name, message: error.message });
    await page?.screenshot({ path: path.join(output, `failure-${report.checks.length}.png`) }).catch(() => {}); }
}
const fixture = async (options = {}, extra = {}) => {
  const value = { hands: options === null ? [] : pair(options), aspect: options?.aspect || 16 / 9, ...extra };
  await page.evaluate(value => new Promise(resolve => { const w = window.__cubeProbe.worker; const ready = ({ data }) => { if(data.type === 'fixture-ready') { w.removeEventListener('message', ready); resolve(); } }; w.addEventListener('message', ready); w.postMessage({ type:'fixture', value }); }), value);
};
const pixels = () => page.locator('#scene').evaluate(c => {
  const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let blue=0, white=0, sumX=0, minX=c.width,maxX=0;
  for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(b>100&&b-r>14&&b-g>3){blue++;sumX+=x;minX=Math.min(minX,x);maxX=Math.max(maxX,x);}if(r>205&&g>205&&b>205)white++;}
  return { blue,white,center:blue?sumX/blue/c.width:null,width:blue?(maxX-minX)/c.width:0,corner:Array.from(d.slice(0,4)),canvasWidth:c.width,canvasHeight:c.height };
});
const appearance = () => page.locator('#cube-preset').innerText();
const violetPixels = () => page.locator('#scene').evaluate(c => { const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<d.length;i+=4)if(d[i+2]>d[i]+5&&d[i]>d[i+1]+8)count++;return count; });
const ensureBlue = async () => { if(!/Blue/.test(await appearance()))await page.locator('#cube-preset').click();await page.waitForTimeout(100); };
const interaction = async label => page.waitForFunction(label=>document.querySelector('#cube-status').textContent.includes(label),label);
// Use blue chroma above the neutral camera, rather than the previous opaque
// material's channel ratios. The translucent core deliberately shows the camera.
const carryReplay = (bytes,mime,samples) => page.evaluate(async({data,mime,samples})=>{
  const v=document.createElement('video');v.muted=true;v.playsInline=true;
  const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:mime}));
  const event=(name,action)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Saved carry clip '+name+' timed out')),5000);v.addEventListener(name,()=>{clearTimeout(timer);resolve();},{once:true});v.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Saved carry clip could not decode'));},{once:true});action();});
  try {
    await event('loadeddata',()=>{v.src=url;});
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d'),frames=[];
    for(const sample of samples){
      await event('seeked',()=>{v.currentTime=sample.time;});ctx.drawImage(v,0,0);
      const d=ctx.getImageData(0,0,c.width,c.height).data;let blue=0,white=0,sumX=0,minX=c.width,maxX=-1;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(b>100&&b-r>14&&b-g>3){blue++;sumX+=x;minX=Math.min(minX,x);maxX=Math.max(maxX,x);}if(r>205&&g>205&&b>205)white++;}
      let warmCenter=0;const cx=Math.round(c.width*.38),cy=Math.round(c.height*.52);for(let y=cy-5;y<=cy+5;y++)for(let x=cx-12;x<=cx+12;x++){const i=(y*c.width+x)*4;if(d[i]-d[i+2]>35&&d[i]-d[i+1]>25)warmCenter++;}
      frames.push({name:sample.name,time:sample.time,blue,white,warmCenter,center:blue?sumX/blue/c.width:null,width:blue?(maxX-minX)/c.width:0,corner:Array.from(d.slice(0,3)),png:c.toDataURL('image/png').split(',')[1]});
    }
    return {width:c.width,height:c.height,frames};
  } finally {v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url);}
},{data:bytes.toString('base64'),mime,samples});
try {
  context = await browser.newContext({ viewport: { width: 1200, height: 920 }, acceptDownloads: true });
  context.setDefaultTimeout(8000);
  await context.route('**/vision-worker.js', r => r.fulfill({ contentType:'text/javascript', body:worker }));
  await context.route('**/api/config', r => r.fulfill({ contentType:'application/json', body:'{"aiEnabled":false}' }));
  await context.route('**/*', r => ['POST','PUT','PATCH','DELETE'].includes(r.request().method()) ? r.abort('blockedbyclient') : r.fallback());
  await context.addInitScript(() => {
    const state = window.__cubeProbe = { streams:[], sources:[], cameraRequests:[], captures:[], contexts:[], workers:[], segments:[], blobs:new Map() };
    try {
    const nativePlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){return nativePlay.apply(this,args).catch(error=>{state.playError={name:error.name,message:error.message};throw error;});};
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args) {const value=getContext.apply(this,args);if(value&&String(args[0]).startsWith('webgl')&&!state.contexts.some(x=>x.gl===value))state.contexts.push({canvas:this,gl:value});return value;};
    const capture = HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream = function(...args){const stream=capture.apply(this,args);if(this.id==='scene')state.captures.push(stream);return stream;};
    const recorderStart=window.MediaRecorder?.prototype.start;
    if(recorderStart)window.MediaRecorder.prototype.start=function(...args){state.recordingStartedAt=performance.now();return recorderStart.apply(this,args);};
    const OriginalWorker=window.Worker;
    window.Worker=class extends OriginalWorker { constructor(...args){super(...args);state.worker=this;state.workers.push({worker:this,terminated:false});this.addEventListener('message',({data})=>{if(data.type==='frame')state.segments.push(data.testSegment);});} terminate(){const item=state.workers.find(x=>x.worker===this);if(item)item.terminated=true;super.terminate();} };
    const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);state.blobs.set(url,blob);return url;};
    navigator.mediaDevices.getUserMedia=async constraints=>{
      state.cameraRequests.push(constraints);const c=document.createElement('canvas');const portrait=state.portrait===true;c.width=portrait?432:768;c.height=portrait?768:432;
      const x=c.getContext('2d');let tick=0;const paint=()=>{const bright=state.background==='bright';x.fillStyle=bright?'#b7bbc0':'#707070';x.fillRect(0,0,c.width,c.height);if(bright){x.fillStyle='#74b9ee';x.fillRect(c.width*.45,0,c.width*.2,c.height);x.fillStyle='#f28c55';x.fillRect(c.width*.25,c.height*.52-6,c.width*.5,12);x.strokeStyle='#46556b';x.lineWidth=5;x.strokeRect(c.width*.12,c.height*.18,c.width*.15,c.height*.16);}x.fillStyle='#d05428';x.fillRect(5,c.height-45,50,35);x.fillStyle='#505050';x.fillRect((tick++*7)%(c.width-40),c.height-25,32,15);};paint();
      const stream=capture.call(c,30),timer=setInterval(paint,33),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};
      track.getSettings=()=>({facingMode:constraints.video.facingMode.exact||constraints.video.facingMode.ideal||'user'});state.streams.push(stream);state.sources.push(c);return stream;
    };
    Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});
    } catch(error) { state.initError={name:error.name,message:error.message,stack:error.stack}; }
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(['POST','PUT','PATCH','DELETE'].includes(r.method()))report.mutations.push(r.url());});
  await page.goto(base);await page.locator('[data-mode="handframe"]').click();await page.locator('#follow-hands').uncheck();await page.locator('[data-mode="cube"]').click();await page.locator('#cube-manual').check();
  await page.waitForFunction(()=>window.__cubeProbe.contexts.length>0);await page.waitForTimeout(200);
  await check('Cube preview is visible without camera permission',async item=>{item.pixels=await pixels();assert.ok(item.pixels.blue>1000,JSON.stringify(item.pixels));assert.ok(item.pixels.white>30);assert.equal(await page.evaluate(()=>window.__cubeProbe.cameraRequests.length),0);await page.locator('#scene').screenshot({path:path.join(output,'cube-preview.png')});});
  await page.locator('#start-camera').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Camera on'));await page.locator('#cube-manual').check();await page.waitForTimeout(200);
  await check('Transparent blue fill and white wireframe composite over the camera',async item=>{item.pixels=await pixels();assert.ok(item.pixels.blue>1000,JSON.stringify(item.pixels));assert.ok(item.pixels.white>30);assert.ok(item.pixels.corner.slice(0,3).every(v=>Math.abs(v-112)<8),JSON.stringify(item.pixels.corner));});
  await check('Actual downloaded saved clip decodes camera, blue fill and wireframe in two frames',async item=>{
    await page.locator('#record-video').click();await page.waitForFunction(()=>document.querySelector('#recording-dock').dataset.phase==='recording');await page.waitForTimeout(1450);await page.locator('#record-video').click();await page.waitForFunction(()=>document.querySelector('#record-preview').readyState>=2&&document.querySelector('#record-preview').src.startsWith('blob:'));
    const pending=page.waitForEvent('download');await page.locator('#save-video').click();const download=await pending;const filename=path.join(output,'saved-cube-'+download.suggestedFilename());await download.saveAs(filename);assert.equal(await download.failure(),null);const bytes=await readFile(filename);assert.ok(bytes.length>1500);
    const mime=filename.endsWith('.mp4')?'video/mp4':'video/webm';item.file=filename;item.bytes=bytes.length;
    item.replay=await page.evaluate(async({data,mime})=>{const v=document.createElement('video');v.muted=true;v.playsInline=true;const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:mime}));try{v.src=url;await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=()=>reject(new Error('Saved bytes could not decode'));});const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const x=c.getContext('2d');const frames=[];for(const time of [.1,.8]){await new Promise(resolve=>{v.onseeked=resolve;v.currentTime=time;});x.drawImage(v,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let blue=0,white=0,hash=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];if(b>100&&b-r>14&&b-g>3)blue++;if(r>195&&g>195&&b>195)white++;hash=(hash+d[i]*((i%101)+1))%2147483647;}frames.push({time,blue,white,hash,corner:Array.from(d.slice(0,3))});}return{width:c.width,height:c.height,frames};}finally{v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url);}},{data:bytes.toString('base64'),mime});
    for(const f of item.replay.frames){assert.ok(f.blue>1000,JSON.stringify(f));assert.ok(f.white>20,JSON.stringify(f));assert.ok(f.corner.every(v=>Math.abs(v-112)<20),JSON.stringify(f));}assert.notEqual(item.replay.frames[0].hash,item.replay.frames[1].hash,'saved frames must update');
    assert.equal(await page.evaluate(()=>window.__cubeProbe.captures.length),1);assert.equal(await page.evaluate(()=>window.__cubeProbe.captures.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
    await page.locator('#record-preview').screenshot({path:path.join(output,'saved-cube-replay.png')});await page.locator('#discard-video').click();
  });
  await page.locator('#cube-manual').uncheck();await fixture();await page.waitForTimeout(350);
  await check('Front camera reflects raw hand midpoint exactly once',async item=>{item.pixels=await pixels();assert.ok(item.pixels.blue>100);assert.ok(Math.abs(item.pixels.center-.66)<.09,JSON.stringify(item.pixels));});
  await check('Separation controls bounded cube size',async item=>{await fixture({gap:.14});await page.waitForTimeout(350);const small=await pixels();await fixture({gap:.36});await page.waitForTimeout(350);const large=await pixels();item.small=small;item.large=large;assert.ok(large.width>small.width*1.2,JSON.stringify(item));assert.ok(large.width<.8);});
  for(const survivor of ['Left','Right'])await check(`Either hand carries the sized cube without a jump: ${survivor}`,async item=>{
    await ensureBlue();await fixture(null);await page.waitForTimeout(200);await fixture({center:.5,gap:.24});await interaction('Sizing with both hands');await page.waitForTimeout(250);item.pair=await pixels();
    await fixture({center:.5,gap:.24,only:survivor});await interaction('Holding with one hand');await page.waitForTimeout(220);item.carried=await pixels();
    assert.ok(item.carried.blue>100,JSON.stringify(item.carried));assert.ok(Math.abs(item.carried.center-item.pair.center)<.035,'Pair-to-carry must preserve cube position');assert.ok(Math.abs(item.carried.width/item.pair.width-1)<.20,'Pair-to-carry must preserve cube size');
    await fixture({center:.62,gap:.24,only:survivor});await page.waitForTimeout(350);item.moved=await pixels();
    assert.ok(item.carried.center-item.moved.center>.07&&item.carried.center-item.moved.center<.17,'Front-camera carry must follow the remaining hand');assert.ok(Math.abs(item.moved.width/item.carried.width-1)<.20,'Carry movement must retain the chosen size');
    await page.locator('#scene').screenshot({path:path.join(output,`carry-${survivor.toLowerCase()}.png`)});
    await fixture({center:.62,gap:.38});await interaction('Sizing with both hands');await page.waitForTimeout(300);item.returned=await pixels();assert.ok(item.returned.width>item.moved.width*1.15,'Returning the second hand must restore sizing');
  });
  await check('One hand cannot create a cube after tracking loss, reset or a mode boundary',async item=>{
    await ensureBlue();await fixture(null);await page.waitForTimeout(240);assert.equal((await pixels()).blue,0);
    await fixture({only:'Left'});await page.waitForTimeout(240);assert.equal((await pixels()).blue,0);
    await fixture();await interaction('Sizing with both hands');await page.waitForTimeout(200);await fixture({only:'Left'});await interaction('Holding with one hand');
    await page.locator('#reset').click();await page.waitForTimeout(240);assert.equal((await pixels()).blue,0);
    await fixture();await interaction('Sizing with both hands');await page.waitForTimeout(180);await fixture({only:'Right'});await interaction('Holding with one hand');
    await page.locator('[data-mode="handframe"]').click();await page.locator('[data-mode="cube"]').click();await page.waitForTimeout(240);assert.equal((await pixels()).blue,0);
    item.finalStatus=await page.locator('#cube-status').innerText();
  });
  await check('Pair/carry transitions cannot release a pending appearance pinch',async item=>{
    await ensureBlue();const before=await appearance();
    for(const survivor of ['Left','Right']){
      await fixture();await interaction('Sizing with both hands');await page.waitForTimeout(180);await fixture({pinched:true});await page.waitForTimeout(180);
      await fixture({pinched:true,only:survivor});await interaction('Holding with one hand');await page.waitForTimeout(180);await fixture({only:survivor});await page.waitForTimeout(180);
      assert.equal(await appearance(),before);await fixture();await interaction('Sizing with both hands');await page.waitForTimeout(180);assert.equal(await appearance(),before);
    }
    item.appearance=before;assert.equal(await page.locator('#still-panel').evaluate(e=>e.hidden),true);
  });
  await check('Downloaded clip visibly preserves sizing, one-hand carry, movement and two-hand return',async item=>{
    await ensureBlue();await fixture(null);await page.waitForTimeout(200);await fixture({center:.5,gap:.24});await interaction('Sizing with both hands');await page.waitForTimeout(200);
    item.samples=[];
    try {
      await page.locator('#record-video').click();await page.waitForFunction(()=>document.querySelector('#recording-dock').dataset.phase==='recording');
      const stage=async(name,options,label)=>{await fixture(options);await interaction(label);await page.waitForTimeout(550);const time=await page.evaluate(()=>(performance.now()-window.__cubeProbe.recordingStartedAt)/1000-.15);item.samples.push({name,time,...await pixels()});await page.locator('#scene').screenshot({path:path.join(output,'carry-live-'+name+'.png')});};
      await stage('spreading',{center:.5,gap:.14},'Sizing with both hands');
      await stage('sizing',{center:.5,gap:.24},'Sizing with both hands');
      await stage('holding',{center:.5,gap:.24,only:'Right'},'Holding with one hand');
      await stage('moved',{center:.62,gap:.24,only:'Right'},'Holding with one hand');
      await stage('resizing',{center:.62,gap:.38},'Sizing with both hands');
      await page.evaluate(()=>{window.__cubeProbe.background='bright';});
      await stage('bright-background',{center:.62,gap:.38},'Sizing with both hands');
      await page.locator('#record-video').click();await page.waitForFunction(()=>document.querySelector('#record-preview').readyState>=2&&document.querySelector('#record-preview').src.startsWith('blob:'));
      const pending=page.waitForEvent('download');await page.locator('#save-video').click();const download=await pending;
      const filename=path.join(output,'saved-carry-'+download.suggestedFilename());await download.saveAs(filename);assert.equal(await download.failure(),null);const bytes=await readFile(filename);assert.ok(bytes.length>1500);item.file=filename;item.bytes=bytes.length;
      item.replay=await carryReplay(bytes,filename.endsWith('.mp4')?'video/mp4':'video/webm',item.samples.map(({name,time})=>({name,time})));
      for(const frame of item.replay.frames){const screenshot=path.join(output,'carry-replay-'+frame.name+'.png');await writeFile(screenshot,Buffer.from(frame.png,'base64'));delete frame.png;frame.screenshot=screenshot;assert.ok(frame.blue>100,JSON.stringify(frame));assert.ok(frame.white>20,JSON.stringify(frame));const expected=frame.name==='bright-background'?[183,187,192]:[112,112,112];assert.ok(frame.corner.every((v,i)=>Math.abs(v-expected[i])<20),JSON.stringify(frame));}
      const [spreading,sizing,holding,moved,resizing,bright]=item.replay.frames;
      assert.ok(sizing.width>spreading.width*1.2,'Saved clip must show spreading two hands to choose a size');
      assert.ok(bright.warmCenter>30,'The orange camera stripe must remain visible through the translucent center');assert.ok(bright.white>20,'Bright backdrop must retain visible white/cyan outline pixels');
      assert.ok(Math.abs(holding.center-sizing.center)<.035,'Saved pair-to-carry position must not jump');assert.ok(Math.abs(holding.width/sizing.width-1)<.20,'Saved carry keeps chosen size');
      assert.ok(holding.center-moved.center>.07&&holding.center-moved.center<.17,'Saved clip must show one-hand movement');assert.ok(Math.abs(moved.width/holding.width-1)<.20,'Saved carried cube size stays held during movement');assert.ok(resizing.width>moved.width*1.15,'Saved returning pair must resume resizing');
      assert.equal(await page.evaluate(()=>window.__cubeProbe.captures.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
    } finally {
      await page.evaluate(()=>{window.__cubeProbe.background='gray';});
      const phase=await page.locator('#recording-dock').getAttribute('data-phase');
      if(phase==='recording'){await page.locator('#record-video').click();await page.waitForFunction(()=>document.querySelector('#recording-dock').dataset.phase==='ready');}
      if(await page.locator('#discard-video').isVisible())await page.locator('#discard-video').click();
    }
  });
  await check('One deliberate pinch/release changes appearance once; hold and loss never prepare a still',async item=>{await ensureBlue();await fixture();await page.waitForTimeout(300);const before=await appearance();const beforeViolet=await violetPixels();await fixture({pinched:true});await page.waitForTimeout(850);assert.equal(await appearance(),before);assert.equal(await page.locator('#still-panel').evaluate(e=>e.hidden),true);await fixture();await page.waitForTimeout(250);const after=await appearance();assert.notEqual(after,before);const afterViolet=await violetPixels();assert.ok(afterViolet>beforeViolet+200,'Pinch must visibly change core color, not just its button label');item.violetPixels={before:beforeViolet,after:afterViolet};await page.locator('#scene').screenshot({path:path.join(output,'cube-violet.png')});await page.waitForTimeout(250);assert.equal(await appearance(),after);await fixture({pinched:true});await page.waitForTimeout(220);await fixture(null);await page.waitForTimeout(220);assert.equal(await appearance(),after);await fixture({pinched:true});await page.waitForTimeout(250);await fixture();await page.waitForTimeout(250);assert.equal(await appearance(),after);item.appearances={before,after};});
  await check('Manual/automatic boundary cancels an active pinch and preserves loaded photo selection',async item=>{
    await page.locator('[data-mode="handframe"]').click();
    const photo=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=80;const x=c.getContext('2d');x.fillStyle='#f44336';x.fillRect(0,0,80,80);return c.toDataURL('image/png').split(',')[1];}),'base64');
    for(let i=0;i<2;i++)await page.locator('#photo-file-'+i).setInputFiles({name:'synthetic-photo-'+i+'.png',mimeType:'image/png',buffer:photo});
    await page.locator('[data-photo-select="0"]').click();await page.locator('[data-mode="cube"]').click();await fixture();await page.waitForTimeout(200);
    const before=await appearance();await fixture({pinched:true});await page.waitForTimeout(180);await page.locator('#cube-manual').check();await page.locator('#cube-manual').uncheck();await fixture({pinched:true});await page.waitForTimeout(200);await fixture();await page.waitForTimeout(200);assert.equal(await appearance(),before);
    assert.equal(await page.locator('[data-photo-select="0"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#still-panel').evaluate(e=>e.hidden),true);item.appearance=before;item.photoIndex=0;
  });
  await check('Missing hands and stalled inference expire the cube; reacquisition is fresh',async item=>{await ensureBlue();await fixture();await page.waitForTimeout(250);await fixture(null);await page.waitForTimeout(240);assert.equal((await pixels()).blue,0);await fixture();await page.waitForTimeout(250);assert.ok((await pixels()).blue>100);await fixture({}, {stall:true});await page.waitForTimeout(260);item.stalled=await pixels();assert.equal(item.stalled.blue,0);});
  // Restart releases the deliberately stalled worker before testing rear camera.
  await page.locator('#camera-facing').selectOption('environment');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Camera on'));await fixture();await page.waitForTimeout(300);
  await check('Rear camera uses unreflected hand midpoint',async item=>{item.pixels=await pixels();assert.ok(item.pixels.blue>100);assert.ok(Math.abs(item.pixels.center-.34)<.09,JSON.stringify(item.pixels));});
  await check('Orientation change finalizes a playable clip before changing the recorded canvas dimensions',async item=>{
    await page.locator('#cube-manual').check();await page.evaluate(()=>{const c=document.querySelector('#scene'),d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width');window.__cubeProbe.dimensionChanges=[];Object.defineProperty(c,'width',{configurable:true,get(){return d.get.call(this);},set(value){window.__cubeProbe.dimensionChanges.push({from:d.get.call(this),to:value,phase:document.querySelector('#recording-dock').dataset.phase});d.set.call(this,value);}});});
    await page.locator('#record-video').click();await page.waitForFunction(()=>document.querySelector('#recording-dock').dataset.phase==='recording');await page.waitForTimeout(650);
    await page.evaluate(()=>{const c=window.__cubeProbe.sources.at(-1);c.width=432;c.height=768;});
    await page.waitForFunction(()=>document.querySelector('#recording-dock').dataset.phase==='ready'&&document.querySelector('#scene').width===432);await page.waitForFunction(()=>document.querySelector('#record-preview').readyState>=2);
    item.changes=await page.evaluate(()=>window.__cubeProbe.dimensionChanges);assert.ok(item.changes.length>0);assert.ok(item.changes.every(x=>x.phase==='ready'),JSON.stringify(item.changes));
    item.clip=await page.locator('#record-preview').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,bytes:window.__cubeProbe.blobs.get(v.src)?.size}));assert.equal(item.clip.width,768);assert.equal(item.clip.height,432);assert.ok(item.clip.bytes>1500);await page.locator('#discard-video').click();
  });
  await check('Portrait source keeps its aspect and both front/rear coordinate mappings',async item=>{
    await page.evaluate(()=>{window.__cubeProbe.portrait=true;});
    await page.locator('#camera-facing').selectOption('user');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Camera on'));
    await fixture({center:.38,gap:.2,aspect:9/16});await page.waitForTimeout(300);item.front=await pixels();assert.equal(item.front.canvasWidth,432);assert.equal(item.front.canvasHeight,768);assert.ok(item.front.blue>100);assert.ok(Math.abs(item.front.center-.62)<.09,JSON.stringify(item.front));
    await page.locator('#camera-facing').selectOption('environment');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Camera on'));
    await fixture({center:.38,gap:.2,aspect:9/16});await page.waitForTimeout(300);item.rear=await pixels();assert.equal(item.rear.canvasWidth,432);assert.equal(item.rear.canvasHeight,768);assert.ok(item.rear.blue>100);assert.ok(Math.abs(item.rear.center-.38)<.09,JSON.stringify(item.rear));
  });
  await check('Cube uses the existing single worker with segmentation disabled',async item=>{item.segments=await page.evaluate(()=>window.__cubeProbe.segments);assert.ok(item.segments.length>5);assert.ok(item.segments.every(v=>v===false));assert.equal(await page.evaluate(()=>window.__cubeProbe.workers.filter(w=>!w.terminated).length),1);});
  await check('Portrait and landscape controls remain accessible',async item=>{item.layouts=[];for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);for(const id of ['cube-manual','cube-size','cube-preset']){await page.locator('#'+id).scrollIntoViewIfNeeded();const bounds=await page.locator('#'+id).boundingBox();assert.ok(bounds&&bounds.width>0&&bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1,JSON.stringify({id,bounds,viewport}));}item.layouts.push(viewport);await page.screenshot({path:path.join(output,`cube-${viewport.width}.png`)});}});
  await page.setViewportSize({width:1200,height:920});
  await check('Mode switching preserves camera, isolates still controls and disposes cube graphics',async item=>{const contexts=await page.evaluate(()=>window.__cubeProbe.contexts.length);await page.locator('[data-mode="handframe"]').click();assert.equal(await page.locator('#cube-manual').isVisible(),false);assert.equal(await page.locator('#still-panel').evaluate(e=>e.hidden),true);assert.equal(await page.locator('[data-photo-select="0"]').getAttribute('aria-pressed'),'true');await page.locator('[data-source="filters"]').click();assert.equal(await page.locator('#capture-still').isVisible(),true);await page.locator('[data-mode="invisible"]').click();assert.equal(await page.locator('#capture-background').isVisible(),true);await page.locator('[data-mode="cube"]').click();await page.locator('#cube-manual').check();await page.waitForTimeout(150);item.contextsBefore=contexts;item.contextsAfter=await page.evaluate(()=>window.__cubeProbe.contexts.length);assert.equal(item.contextsAfter,contexts+1);assert.equal(await page.evaluate(()=>window.__cubeProbe.streams.filter(s=>s.getTracks().some(t=>t.readyState==='live')).length),1);assert.ok((await pixels()).blue>100);});
  await check('Graphics context loss exposes one deliberate retry, then stays unavailable without breaking camera',async item=>{await page.locator('#full-screen').click();await page.evaluate(()=>window.__cubeProbe.contexts.at(-1).gl.getExtension('WEBGL_lose_context').loseContext());await page.waitForFunction(()=>!document.querySelector('#cube-retry').hidden);await page.locator('#world-gesture').waitFor({state:'visible'});assert.match(await page.locator('#world-gesture').innerText(),/graphics|interrupted|unavailable/i);item.fullscreenCue=await page.locator('#world-gesture').innerText();await page.locator('#exit-screen').click();await page.locator('#cube-retry').click();await page.waitForTimeout(200);assert.ok((await pixels()).blue>100);await page.evaluate(()=>window.__cubeProbe.contexts.at(-1).gl.getExtension('WEBGL_lose_context').loseContext());await page.waitForTimeout(200);assert.ok(await page.locator('#cube-retry').isHidden()||await page.locator('#cube-retry').isDisabled());item.unavailableMessage=await page.locator('#cube-status').innerText();assert.equal(await page.evaluate(()=>window.__cubeProbe.streams.filter(s=>s.getTracks().some(t=>t.readyState==='live')).length),1);});
  await check('Stop releases all camera tracks/workers and Cube never uploads',async item=>{await page.locator('#stop-camera').click();item.liveTracks=await page.evaluate(()=>window.__cubeProbe.streams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length);item.activeWorkers=await page.evaluate(()=>window.__cubeProbe.workers.filter(w=>!w.terminated).length);assert.equal(item.liveTracks,0);assert.equal(item.activeWorkers,0);assert.deepEqual(report.mutations,[]);});
} catch(error) {report.errors.push(String(error.stack||error));report.cameraDiagnostics=await page?.evaluate(()=>({status:document.querySelector('#status')?.textContent,requests:window.__cubeProbe?.cameraRequests.length,streams:window.__cubeProbe?.streams.length,playError:window.__cubeProbe?.playError,initError:window.__cubeProbe?.initError})).catch(()=>null);await page?.screenshot({path:path.join(output,'fatal.png')}).catch(()=>{});}
finally {clearTimeout(deadline);await context?.close();await browser.close();report.summary={passed:report.checks.filter(x=>x.status==='passed').length,failed:report.checks.filter(x=>x.status==='failed').length};await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({summary:report.summary,errors:report.errors,report:path.join(output,'report.json')},null,2));if(report.errors.length)process.exitCode=1;
