import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base=process.argv[2]||'http://127.0.0.1:8798';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const report={base,observedAt:new Date().toISOString(),checks:[],pageErrors:[],network:[],camera:'Chromium generated test stream; not a physical webcam',ai:'Mocked image/error responses; no provider call'};
const pass=name=>report.checks.push(name);
try {
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('request',request=>report.network.push({method:request.method(),url:request.url()}));
  await page.goto(base,{waitUntil:'networkidle'});
  assert.match(await page.title(),/Jedi mindtrick/);pass('application loaded');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);pass('desktop fits viewport');
  const before=await page.locator('#scene').evaluate(c=>Array.from(c.getContext('2d').getImageData(415,285,1,1).data));
  await page.locator('[data-fade="100"]').click();
  await page.waitForFunction(before=>{const c=document.querySelector('#scene');return JSON.stringify(Array.from(c.getContext('2d').getImageData(415,285,1,1).data))!==JSON.stringify(before);},before);
  pass('Invisible changes intended preview pixels');
  await page.locator('[data-fade="0"]').click();
  await page.waitForFunction(before=>{const c=document.querySelector('#scene');return JSON.stringify(Array.from(c.getContext('2d').getImageData(415,285,1,1).data))===JSON.stringify(before);},before);
  pass('Invisible restores original preview pixels');
  await page.locator('#portal').check();await page.locator('[data-fade="100"]').click();
  await page.screenshot({path:'test-results/portal-desktop.png',fullPage:true});pass('portal controls render');
  await page.locator('[data-mode="handframe"]').click();
  const unstyled=await page.locator('#scene').evaluate(c=>Array.from(c.getContext('2d').getImageData(415,285,1,1).data));
  await page.locator('[data-style="thermal"]').click();
  await page.waitForFunction(previous=>{const c=document.querySelector('#scene');return JSON.stringify(Array.from(c.getContext('2d').getImageData(415,285,1,1).data))!==JSON.stringify(previous);},unstyled);
  await page.locator('#layout').selectOption('postcard');pass('HandFrame style and layout change');
  const noUploads=report.network.filter(r=>r.method==='POST');assert.equal(noUploads.length,0);pass('local mode interactions upload no image');
  await page.locator('#capture-still').click();assert.equal(report.network.filter(r=>r.method==='POST').length,0);pass('preparing still does not upload');
  const selected=await page.locator('#still-preview').getAttribute('src');
  const cropSize=await page.locator('#still-preview').evaluate(async img=>{await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};});assert.ok(cropSize.width>0&&cropSize.width<512&&cropSize.height>0&&cropSize.height<512);pass('selected crop fits provider reference-image dimensions');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.fillStyle='#aa77ff';x.fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];});
  let submissions=0;
  await page.route('**/api/render',async route=>{submissions++;assert.equal(route.request().postDataJSON().image,selected.split(',')[1]);await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(png,'base64')});});
  await page.locator('#send-still').click();await page.waitForFunction(()=>document.querySelector('#still-status').textContent.includes('AI still returned'));
  assert.equal(submissions,1);assert.equal(await page.locator('#send-still').isDisabled(),true);pass('explicit submit sends selected crop once and displays returned image (mock)');
  await page.unroute('**/api/render');await page.locator('#capture-still').click();
  await page.route('**/api/render',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Controlled provider failure.'})}));
  await page.locator('#send-still').click();await page.waitForFunction(()=>document.querySelector('#still-status').textContent.includes('Controlled provider failure'));
  assert.equal(await page.locator('#still-preview').isVisible(),true);assert.equal(await page.locator('#send-still').isDisabled(),true);pass('provider failure preserves crop and disables automatic repeat (mock)');
  await page.locator('#clear-still').click();await page.unroute('**/api/render');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);pass('automated WCAG A/AA checks: no violations');
  await page.screenshot({path:'test-results/handframe-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/mobile.png',fullPage:true});pass('390px layout fits viewport');
  await page.setViewportSize({width:1280,height:950});await page.locator('[data-mode="invisible"]').click();await page.locator('#start-camera').click();
  await page.waitForFunction(()=>document.querySelector('#live-metric').textContent.includes('inference'),null,{timeout:40000});
  report.inferenceMetric=await page.locator('#live-metric').textContent;pass('actual MediaPipe models process generated camera stream');
  await page.locator('#stop-camera').click();
  // Chromium color bars contain shapes the model may classify as a person.
  // Use a controlled blank canvas stream to test empty-scene calibration.
  await page.evaluate(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=288;const ctx=canvas.getContext('2d');
      const paint=()=>{ctx.fillStyle='#8b9395';ctx.fillRect(0,0,512,288);};paint();
      const timer=setInterval(paint,80);const stream=canvas.captureStream(12);const track=stream.getVideoTracks()[0];const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};return stream;
    };
  });
  await page.locator('#start-camera').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Camera on'),null,{timeout:40000});
  await page.waitForFunction(()=>document.querySelector('#live-metric').textContent.includes('inference'),null,{timeout:40000});
  await page.locator('#capture-background').click();await page.waitForFunction(()=>document.querySelector('#background-state').textContent==='ROOM SAVED',null,{timeout:9000});pass('empty test camera background captured');
  await page.locator('#stop-camera').click();await page.waitForFunction(()=>document.querySelector('#live-metric').textContent==='YOUR CAMERA IS OFF');pass('camera stop returns to labelled preview');
  assert.deepEqual(report.pageErrors,[]);pass('no uncaught browser errors');
  assert.equal(report.network.some(r=>new URL(r.url).origin!==new URL(base).origin),false);pass('application requests stay on its own origin');
}finally{await writeFile('test-results/browser-report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.checks.length,checks:report.checks,inferenceMetric:report.inferenceMetric},null,2));
