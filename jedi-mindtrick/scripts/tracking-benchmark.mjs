import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:8798',source=await readFile('public/vision-worker.js','utf8');
const browser=await chromium.launch({headless:true,channel:'chrome'}),deadline=setTimeout(()=>void browser.close(),120000);
const report={base,observedAt:new Date().toISOString(),source:'Actual model on a generated empty camera stream. CPU/GPU comparison is not physical-hand latency.',runs:[]};
try{for(const backend of ['CPU','preferred']){
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(()=>{
  window.__trackingTimings=[];const Original=window.Worker;
  window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='frame')window.__trackingTimings.push({backend:data.handBackend,inference:data.inferenceMs,age:performance.now()-data.timestamp,receivedAt:performance.now()});});}};
  navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=768;c.height=432;const ctx=c.getContext('2d'),paint=()=>{ctx.fillStyle='#78828c';ctx.fillRect(0,0,768,432);};paint();const timer=setInterval(paint,16),stream=c.captureStream(60),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};return stream;};
 });
 const page=await context.newPage();
 await page.route('**/vision-worker.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:backend==='CPU'?source.replace("typeof OffscreenCanvas !== 'undefined'",'false'):source}));
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('[data-mode="handframe"]').click();await page.locator('#start-camera').click();
 await page.waitForFunction(()=>window.__trackingTimings.length>=45,null,{timeout:45000});
 const samples=await page.evaluate(()=>window.__trackingTimings.slice(15,45));
 const percentile=(key,p)=>{const values=samples.map(s=>s[key]).sort((a,b)=>a-b);return values[Math.floor((values.length-1)*p)];};
 assert.ok(samples.every(s=>Number.isFinite(s.age)&&s.age<1000));
 report.runs.push({requested:backend,actual:samples[0].backend,samples:samples.length,inferenceMedian:percentile('inference',.5),inferenceP95:percentile('inference',.95),captureToResultMedian:percentile('age',.5),captureToResultP95:percentile('age',.95),samplesPerSecond:29*1000/(samples.at(-1).receivedAt-samples[0].receivedAt)});
 await page.locator('#stop-camera').click();await context.close();
}}finally{clearTimeout(deadline);await writeFile('test-results/tracking-benchmark.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
