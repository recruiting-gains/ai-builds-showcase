import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { palmPose } from '../tests/palm-visibility-fixtures.ts';
const base=process.argv[2]||'http://127.0.0.1:8798';
const fixtures={background:[],'stale-mask':[],lost:[],open:[palmPose(0,{x:.3})],quarter:[palmPose(.25,{x:.3})],half:[palmPose(.5,{x:.3})],mostly:[palmPose(.75,{x:.3})],fist:[palmPose(1,{x:.3})]};
fixtures.malformed=[palmPose(.5,{x:.3})];fixtures.malformed[0].landmarks[9]=null;
const worker=`const fixtures=${JSON.stringify(fixtures)};let name='background';self.onmessage=({data})=>{
if(data.type==='fixture'){name=data.name;return;}if(data.type==='init'){self.postMessage({type:'ready'});return;}if(data.type!=='frame')return;
data.bitmap.close();const mask=new Float32Array(32*18);if(name!=='background')for(let y=6;y<17;y++)for(let x=18;x<28;x++)mask[y*32+x]=1;
const result={type:'frame',id:data.id,timestamp:data.timestamp,hands:fixtures[name],inferenceMs:2,fixture:name};if(name!=='stale-mask')Object.assign(result,{mask,maskWidth:32,maskHeight:18});self.postMessage(result);};`;
const report={base,observedAt:new Date().toISOString(),source:'Generated uniform camera colors, synthetic articulated hands and a person mask deliberately missing the hand. No physical camera or provider.',checks:[],errors:[],posts:0,fadeSequence:[]};
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),deadline=setTimeout(()=>void browser.close(),120000);
const pass=name=>report.checks.push(name);
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});context.setDefaultTimeout(10000);
 await context.addInitScript(()=>{
   window.__palmProbe={worker:null,counts:{},foreground:false};
   const WorkerOriginal=window.Worker;window.Worker=class extends WorkerOriginal{constructor(...args){super(...args);window.__palmProbe.worker=this;this.addEventListener('message',({data})=>{if(data.fixture)window.__palmProbe.counts[data.fixture]=(window.__palmProbe.counts[data.fixture]||0)+1;});}};
   navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=768;c.height=432;const x=c.getContext('2d');const paint=()=>{x.fillStyle=window.__palmProbe.foreground?'#bd6946':'#778899';x.fillRect(0,0,c.width,c.height);};paint();const timer=setInterval(paint,33),stream=c.captureStream(30),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};return stream;};
 });
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('request',r=>{if(r.method()==='POST')report.posts++;});
 await page.route('**/vision-worker.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:worker}));
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('#start-camera').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Camera on'));
 const set=async name=>{const count=await page.evaluate(name=>{const p=window.__palmProbe,before=p.counts[name]||0;p.worker.postMessage({type:'fixture',name});return before;},name);await page.waitForFunction(({name,count})=>(window.__palmProbe.counts[name]||0)>=count+10,{name,count});await page.waitForTimeout(80);};
 const pixel=(x,y)=>page.locator('#scene').evaluate((c,[x,y])=>Array.from(c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data),[x,y]);
 const value=async()=>Number((await page.locator('#fade-value').textContent()).replace('%',''));
 await set('background');const room=await pixel(.3,.65);
 await page.evaluate(()=>window.__palmProbe.foreground=true);await set('open');await set('fist');
 assert.match(await page.locator('#status').textContent(),/Capture the empty background/);assert.equal(await value(),0);
 pass('closing a hand cannot hide anything until an empty background is captured');
 await page.evaluate(()=>window.__palmProbe.foreground=false);await set('background');await set('stale-mask');await page.locator('#capture-background').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Fresh tracking is needed'),null,{timeout:9000});
 assert.notEqual(await page.locator('#background-state').textContent(),'ROOM SAVED');
 pass('fresh hand messages cannot make an expired person mask pass background calibration');
 await set('background');await page.locator('#capture-background').click();
 await page.waitForFunction(()=>document.querySelector('#background-state').textContent==='ROOM SAVED',null,{timeout:9000});
 pass('empty-room calibration succeeds before continuous palm control');
 await page.evaluate(()=>window.__palmProbe.foreground=true);await set('open');const raw=await pixel(.3,.65);assert.notDeepEqual(raw,room);assert.equal(await value(),0);
 for(const name of ['open','quarter','half','mostly','fist']){await set(name);report.fadeSequence.push({name,fade:await value()});}
 const values=report.fadeSequence.map(x=>x.fade);assert.equal(values[0],0);assert.ok(values[1]>0,'early closure must begin fading');assert.equal(values.at(-1),100);assert.ok(values[2]>15&&values[2]<90);assert.ok(values.every((v,i)=>i===0||v>=values[i-1]));
 assert.deepEqual(await pixel(.3,.65),room,'body must use saved background');
 const fist=fixtures.fist[0];for(const i of [0,8,12,16,20]){const p=fist.landmarks[i];assert.deepEqual(await pixel(1-p.x,p.y),room,`tracked hand joint ${i} must hide despite missing segmentation`);}
 assert.deepEqual(await pixel(.06,.08),raw,'unmasked source must remain unchanged');
 pass('closing continuously fades the body and tracked hand together to fully hidden');
 await page.locator('.viewport').screenshot({path:'test-results/palm-hidden.png'});
 for(const name of ['mostly','half','quarter','open']){await set(name);report.fadeSequence.push({name,fade:await value()});}
 assert.equal(await value(),0);assert.deepEqual(await pixel(.3,.65),raw);const tip=fixtures.open[0].landmarks[8];assert.deepEqual(await pixel(1-tip.x,tip.y),raw);
 pass('reopening continuously restores original body and hand pixels without a toggle');
 await set('half');const partial=await pixel(.3,.65),amount=(await value())/100;
 for(let c=0;c<3;c++)assert.ok(Math.abs(partial[c]-(raw[c]*(1-amount)+room[c]*amount))<=3);
 pass('partial closure produces the corresponding partial pixel blend');
 await set('fist');await set('lost');assert.equal(await value(),100);await set('half');assert.equal(await value(),100,'a partially closed reacquired hand must not take over');await set('open');assert.equal(await value(),0);
 await set('malformed');await set('fist');assert.equal(await value(),0);await set('open');await set('fist');assert.equal(await value(),100);
 pass('loss and malformed hands disarm control; a clear open palm safely reacquires it');
 await page.locator('#portal').check();await page.locator('[data-fade="0"]').click();await set('fist');assert.equal(await value(),0);await page.locator('#portal').uncheck();await set('fist');assert.equal(await value(),0);await set('open');await set('fist');assert.equal(await value(),100);
 pass('portal and manual visibility remain separate; direct palm control rearms on return');
 await page.locator('#stop-camera').click();assert.equal(await value(),0);assert.equal(report.posts,0);assert.deepEqual(report.errors,[]);
 pass('camera stop restores visibility and the entire gesture sequence makes no uploads or uncaught errors');
}catch(error){report.failure=String(error);throw error;}finally{clearTimeout(deadline);await writeFile('test-results/palm-browser-report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.checks.length,checks:report.checks,fadeSequence:report.fadeSequence},null,2));
