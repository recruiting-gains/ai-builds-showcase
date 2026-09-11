import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:8798',label=process.argv[3]||'print-flow';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
const report={base,label,observedAt:new Date().toISOString(),source:'Original procedural preview and a mocked returned still. No physical camera or AI provider call.',measurements:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('[data-mode="handframe"]').click();
 await page.evaluate(()=>{
  const stats=window.flowStats={reads:0,readMs:0,paints:0,paintTimes:[]};
  const get=CanvasRenderingContext2D.prototype.getImageData,draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.getImageData=function(...args){const start=performance.now();const result=get.apply(this,args);if(this.canvas.width===384&&this.canvas.height===256){stats.reads++;stats.readMs+=performance.now()-start;}return result;};
  CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='scene'&&args[0]?.width===768&&args[0]?.height===432){stats.paints++;stats.paintTimes.push(performance.now());}return draw.apply(this,args);};
 });
 const ids=await page.locator('[data-style]').evaluateAll(nodes=>nodes.map(node=>node.dataset.style));
 const expectedStyles=['ocean','risograph','cyanotype','stippling'];
 if(label!=='baseline')assert.ok(expectedStyles.every(id=>ids.includes(id)),'All print worlds must be present before checking flow.');
 const styles=expectedStyles.filter(id=>ids.includes(id));
 async function measure(source,style){
  await page.locator(`[data-style="${style}"]`).click();
  // Begin before the next display tick so the cache miss is counted.
  const result=await page.evaluate(async()=>{
   const s=window.flowStats;s.reads=s.readMs=s.paints=0;s.paintTimes=[];
   const started=performance.now();let step=0;
   await new Promise(resolve=>{const move=()=>{
    const depth=document.querySelector('#frame-depth'),roll=document.querySelector('#frame-roll');
    depth.value=String(Math.round(Math.sin(step/25)*85));depth.dispatchEvent(new Event('input',{bubbles:true}));
    roll.value=String(Math.round(Math.sin(step/19)*20));roll.dispatchEvent(new Event('input',{bubbles:true}));
    if(++step>=120)resolve();else requestAnimationFrame(move);
   };requestAnimationFrame(move);});
   const deltas=s.paintTimes.slice(1).map((t,i)=>t-s.paintTimes[i]).sort((a,b)=>a-b),pct=p=>deltas[Math.min(deltas.length-1,Math.floor(deltas.length*p))];
   return {textureReadbacks:s.reads,textureReadbackMs:s.readMs,paintedFrames:s.paints,elapsedMs:performance.now()-started,paintIntervalP50:pct(.5),paintIntervalP95:pct(.95),gapsOver34ms:deltas.filter(v=>v>34).length};
  });
  report.measurements.push({source,style,...result});
  assert.ok(result.paintedFrames>=60,'The moving preview should continue painting.');
  if(source==='frozen still'&&label!=='baseline')assert.ok(result.textureReadbacks<=1,'A frozen texture should build at most once while only its pose changes.');
 }
 for(const style of styles)await measure('animated preview',style);
 await page.locator('[data-style="cosmic"]').click();await page.locator('#capture-still').click();
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=384;canvas.height=256;const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,384,256);gradient.addColorStop(0,'#102640');gradient.addColorStop(1,'#f8e0b8');ctx.fillStyle=gradient;ctx.fillRect(0,0,384,256);return canvas.toDataURL('image/png').split(',')[1];});
 let posts=0;await page.route('**/api/render',async route=>{posts++;await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(png,'base64')});});
 await page.locator('#send-still').click();await page.waitForFunction(()=>document.querySelector('#still-status').textContent.includes('AI still returned'));
 for(const style of styles){
  await measure('frozen still',style);
  if(style!=='ocean'){
   await page.locator('#frame-depth').evaluate(input=>{input.value='100';input.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.locator('#frame-roll').evaluate(input=>{input.value='22';input.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForTimeout(60);await page.locator('.viewport').screenshot({path:`test-results/print-extreme-${style}.png`});
  }
 }
 assert.equal(posts,1);assert.deepEqual(errors,[]);report.passed=true;
}finally{await writeFile(`test-results/${label}-flow.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
