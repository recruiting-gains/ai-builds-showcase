import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { shapePoints } from '../src/handframe/shapes.ts';
import { projectFrame } from '../src/handframe/perspective.ts';
import { mappedShape } from '../src/handframe/surface.ts';

const base=process.argv[2]||'http://127.0.0.1:8798';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={base,observedAt:new Date().toISOString(),source:'Procedural preview only; no camera, reference media or AI call.',checks:[],pageErrors:[],posts:0};
await mkdir('test-results',{recursive:true});
const pass=name=>report.checks.push(name);
const contains=(p,polygon)=>{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
const edgeDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(r.method()==='POST')report.posts++;});
  await page.goto(base,{waitUntil:'networkidle'});
  const samples=[];for(let y=12;y<432;y+=10)for(let x=12;x<768;x+=10)samples.push({x,y});
  const readSamples=()=>page.locator('#scene').evaluate((canvas,points)=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return points.map(p=>{const i=(p.y*canvas.width+p.x)*4;return [data[i],data[i+1],data[i+2]];});},samples);
  const raw=await readSamples();
  await page.locator('[data-mode="handframe"]').click();await page.locator('[data-style="cyanotype"]').click();
  const rect={x:.28,y:.23,width:.44,height:.54};
  async function verifySilhouette(name,points,depth,roll=0){
    await page.waitForTimeout(65);
    const pixels=await readSamples(),boundary=mappedShape(projectFrame(rect,depth,roll).quad,points).map(p=>({x:p.x*768,y:p.y*432}));
    let insideChanged=0,outsideCompared=0;
    for(let i=0;i<samples.length;i++){
      const p=samples[i];if(Math.min(...boundary.map((a,j)=>edgeDistance(p,a,boundary[(j+1)%boundary.length])))<3)continue;
      const changed=pixels[i].some((v,c)=>v!==raw[i][c]);
      if(contains(p,boundary)){if(changed)insideChanged++;}
      else{assert.equal(changed,false,`${name} leaked outside shape at ${p.x},${p.y}, depth ${depth}`);outsideCompared++;}
    }
    assert.ok(insideChanged>20,`${name} must visibly change inside its shape`);assert.ok(outsideCompared>1000);
  }
  for(const name of ['rectangle','triangle','ellipse','diamond','hexagon','star']){
    await page.locator(`[data-shape="${name}"]`).click();
    assert.equal(await page.locator(`[data-shape="${name}"]`).getAttribute('aria-pressed'),'true');
    for(const depth of [0,.85,-.85]){
      await page.locator('#frame-depth').evaluate((input,value)=>{input.value=String(value*100);input.dispatchEvent(new Event('input',{bubbles:true}));},depth);
      await verifySilhouette(name,shapePoints(name),depth);
    }
    await page.locator('.viewport').screenshot({path:`test-results/shape-${name}.png`});
  }
  pass('six shapes clip actual pixels correctly in neutral and both perspective directions (18 cases)');
  await page.locator('#layout').selectOption('postcard');await verifySilhouette('star postcard',shapePoints('star'),-.85);
  await page.locator('#layout').selectOption('cinema');await verifySilhouette('star cinema',shapePoints('star'),-.85);
  await page.locator('#layout').selectOption('outline');pass('postcard border and cinema treatment stay inside the shaped silhouette');
  await page.locator('#center-depth').click();
  await page.locator('#custom-shape').click();await page.locator('#clear-shape').click();
  const clickPoint=async(x,y)=>{const board=page.locator('#shape-board');await board.scrollIntoViewIfNeeded();const b=await board.boundingBox();await page.mouse.click(b.x+b.width*x,b.y+b.height*y);};
  const custom=[{x:.15,y:.15},{x:.85,y:.15},{x:.65,y:.5},{x:.85,y:.85},{x:.15,y:.85}];
  for(const p of custom)await clickPoint(p.x,p.y);
  assert.equal(await page.locator('#apply-shape').isDisabled(),false);
  await page.locator('#apply-shape').click();assert.equal(await page.locator('#shape-editor').isVisible(),false);
  assert.equal(await page.locator('#shape-name').textContent(),'CUSTOM');await verifySilhouette('custom concave',custom,0);pass('a pointer-drawn concave custom shape applies and renders');
  await page.locator('[data-shape="triangle"]').click();await page.locator('#custom-shape').click();
  const points=()=>page.locator('#shape-board polygon').getAttribute('points');
  const approved=await points();assert.equal(await page.locator('#shape-board circle').count(),5);
  await page.locator('#shape-point').selectOption('2');await page.locator('[aria-label="Move point left"]').click();assert.notEqual(await points(),approved);
  await page.locator('[aria-label="Move point right"]').click();
  await page.locator('#cancel-shape').click();await page.locator('#custom-shape').click();assert.equal(await points(),approved);pass('preset switching preserves custom design; keyboard controls edit draft and Cancel restores approved points');
  await page.locator('#clear-shape').click();for(const p of [[.1,.1],[.9,.9],[.1,.9],[.9,.1]])await clickPoint(...p);
  assert.equal(await page.locator('#apply-shape').isDisabled(),true);assert.match(await page.locator('#shape-message').textContent(),/cross|overlap|touch/);
  assert.equal(await page.locator('#shape-name').textContent(),'TRIANGLE');pass('crossing draft is rejected without replacing the active shape');
  await page.locator('#clear-shape').click();for(let i=0;i<12;i++){const angle=i*Math.PI/6;await clickPoint(.5+.4*Math.cos(angle),.5+.4*Math.sin(angle));}
  assert.equal(await page.locator('#shape-board circle').count(),12);assert.equal(await page.locator('#add-point').isDisabled(),true);
  const capped=await points();await clickPoint(.5,.5);assert.equal(await points(),capped);
  for(let i=0;i<10;i++)await page.locator('#remove-point').click();assert.equal(await page.locator('#apply-shape').isDisabled(),true);
  pass('twelve-point cap and minimum-area/point validation protect incomplete drafts');
  await page.locator('#cancel-shape').click();await page.locator('#custom-shape').click();
  await page.locator('#shape-board').scrollIntoViewIfNeeded();const b=await page.locator('#shape-board').boundingBox();
  await page.mouse.move(b.x+b.width*.15,b.y+b.height*.15);await page.mouse.down();await page.keyboard.press('Escape');
  await page.mouse.move(b.x+b.width*.7,b.y+b.height*.3);await page.mouse.up();
  await page.locator('#custom-shape').click();assert.equal(await points(),approved);pass('Escape releases an active point drag; reopening retains approved vertices');
  await page.locator('#apply-shape').click();await page.locator('#frame-depth').evaluate(input=>{input.value='80';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#frame-roll').evaluate(input=>{input.value='20';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await verifySilhouette('custom tilted',custom,.8,20*Math.PI/180);await page.locator('.viewport').screenshot({path:'test-results/shape-custom-perspective.png'});pass('custom silhouette and border follow depth and tilt together');
  for(const width of [320,390,760,1440]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  pass('shape controls fit 320, 390, 760 and 1440px layouts');
  await page.locator('#custom-shape').click();const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);pass('shape editor has no automated WCAG A/AA violations');
  await page.locator('#cancel-shape').click();await page.locator('#capture-still').click();assert.match(await page.locator('#still-status').textContent(),/entire rectangular preview/);
  assert.equal(report.posts,0);assert.deepEqual(report.pageErrors,[]);pass('shape and editor interactions make no uploads and raise no page errors');
  report.passed=true;
}catch(error){report.failure=error.stack;throw error;}
finally{await writeFile('test-results/shapes-browser-report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed||false,checks:report.checks.length,failure:report.failure}));}
