import './style.css';
import type { FrameRect, Hand, LocalStyle, Mode } from './contracts';
import { deriveFrame, PinchController, stylePixels } from './handframe';
import { blendInvisible, portalMask, scaleMask, PalmHold } from './effects/invisible';
import { CameraPipeline } from './vision/camera';
import { drawDemo, demoMask } from './demo';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<header class="topbar"><a class="brand" href="/" aria-label="Jedi mindtrick home"><span class="brand-mark">⌑</span> JEDI MINDTRICK<span class="edition">CAMERA PLAYGROUND / 01</span></a><a class="about-link" href="#how-it-works">How it works <span>↗</span></a></header>
<main>
  <section class="intro"><div><p class="eyebrow"><span></span> A SMALL EXPERIMENT IN THE IMPOSSIBLE</p><h1>Now you see me.<br><em>Now, imagine.</em></h1></div><p class="intro-note">Disappear into the room.<br> Hold another world in your hands.<br><span>Two camera effects. One little mindtrick.</span></p></section>
  <section class="playground" aria-label="Camera playground">
    <div class="studio">
      <div class="studio-bar"><div class="mode-tabs" role="group" aria-label="Choose an effect"><button class="active" data-mode="invisible" aria-pressed="true"><span>01</span> Invisible</button><button data-mode="handframe" aria-pressed="false"><span>02</span> HandFrame</button></div><span class="local-tag"><i></i> LOCAL VISION</span></div>
      <div class="viewport"><canvas id="scene" width="768" height="432" aria-label="Interactive simulated preview of the Invisible effect"></canvas><div class="viewport-top"><span id="source-tag">INTERACTIVE PREVIEW · SIMULATED SCENE</span><span id="frame-tag">NO CAMERA CONNECTED</span></div><div class="viewport-bottom"><div><span class="record-dot"></span><span id="effect-caption">A little less here.</span></div><span id="live-metric">YOUR CAMERA IS OFF</span></div><div id="countdown" hidden></div></div>
      <div class="studio-footer"><span id="gesture-help">Hold an open palm to disappear. Lower it, then repeat to return.</span><button id="reset" class="text-button">Reset effect ↺</button></div>
    </div>
    <aside class="controls" aria-label="Effect controls">
      <div class="control-title"><span class="eyebrow">YOUR CONTROL ROOM</span><span class="tiny-star">✳</span></div>
      <div class="camera-actions"><button class="primary" id="start-camera">Start your camera <span>↗</span></button><button id="stop-camera" class="secondary" hidden>Stop camera</button></div>
      <p id="status" class="status" role="status">Explore the simulated preview, or turn on your camera when you’re ready.</p>
      <div id="invisible-controls">
        <div class="section-label"><span>01 / SAVE THE ROOM</span><span id="background-state">PREVIEW READY</span></div>
        <button id="capture-background" class="secondary full">Capture empty background <span>5s</span></button><p class="hint">Step out of view. Keep the camera still. Recapture whenever the room or camera changes.</p>
        <div class="section-label"><span>02 / DISAPPEAR</span><output id="fade-value">0%</output></div>
        <div class="segmented" role="group" aria-label="Visibility"><button data-fade="0" class="active" aria-pressed="true">Visible</button><button data-fade="55" aria-pressed="false">Ghost</button><button data-fade="100" aria-pressed="false">Hidden</button></div>
        <label class="sr-only" for="fade">Amount of invisibility</label><input id="fade" type="range" min="0" max="100" value="0">
        <label class="switch-row"><span>Framed invisibility portal<small>Hide only what’s inside the frame.</small></span><input id="portal" type="checkbox"></label>
      </div>
      <div id="handframe-controls" hidden>
        <div class="section-label"><span>01 / CHOOSE YOUR WORLD</span><span>LOCAL FILTER</span></div>
        <div class="styles" role="group" aria-label="Visual style"><button data-style="dream" class="active" aria-pressed="true"><i class="swatch dream"></i>Daydream</button><button data-style="thermal" aria-pressed="false"><i class="swatch thermal"></i>Thermal</button><button data-style="ink" aria-pressed="false"><i class="swatch ink"></i>Ink study</button><button data-style="neon" aria-pressed="false"><i class="swatch neon"></i>Neon night</button></div>
        <label class="select-row" for="layout">Frame layout<select id="layout"><option value="outline">Floating outline</option><option value="postcard">Postcard</option><option value="cinema">Cinema</option></select></label>
        <p class="hint" id="style-note">Instant color effects, processed on your device.</p>
        <div class="section-label"><span>02 / MAKE AN AI STILL</span><span>OPTIONAL UPLOAD</span></div>
        <button id="capture-still" class="secondary full">Prepare a still <span>⌑</span></button><p class="hint">A long pinch also prepares a crop. Sending it to Cloudflare AI is a separate, deliberate step.</p>
        <div id="still-panel" hidden><img id="still-preview" alt="Your selected frozen crop"><p id="still-status" class="hint" role="status">Only this selected crop will be sent.</p><button class="primary full" id="send-still" disabled>Send still to AI ↗</button><button id="clear-still" class="text-button">Clear still</button></div>
      </div>
      <div class="manual-controls"><label class="switch-row"><span>Mouse & keyboard controls<small>Drag the frame. Use the slider to resize.</small></span><input id="manual" type="checkbox" checked></label><label class="sr-only" for="frame-size">Frame size</label><input id="frame-size" type="range" min="22" max="70" value="44"></div>
    </aside>
  </section>
  <section id="how-it-works" class="notes"><article><span>01 / A CAMERA ILLUSION</span><h2>Leave a little mystery.</h2><p>Invisible blends your captured room into your silhouette. A steady camera and even lighting give it the best chance to work.</p></article><article><span>02 / FRAME YOUR IMAGINATION</span><h2>Your hands, the viewfinder.</h2><p>Make an L with each hand. Quick pinch: next style. Hold a pinch for 0.6 seconds: prepare one still. Release before trying again.</p></article><article><span>03 / ON YOUR TERMS</span><h2>Local until you say so.</h2><p>Live camera frames stay in your browser. AI rendering sends only your selected still. No accounts, microphone, or camera recordings.</p></article></section>
</main><footer><span>JEDI MINDTRICK <span class="muted">/ Built by Cruz G.</span></span><span>Hand tracking + a little imagination.</span><a href="https://github.com/recruiting-gains/ai-builds-showcase/tree/codex/jedi-mindtrick/jedi-mindtrick" target="_blank" rel="noopener noreferrer">Explore the source ↗</a></footer>`;

const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const scene=$<HTMLCanvasElement>('#scene'),ctx=scene.getContext('2d')!;
const raw=document.createElement('canvas');raw.width=scene.width;raw.height=scene.height;
const rawCtx=raw.getContext('2d',{willReadFrequently:true})!;
const bgCanvas=document.createElement('canvas');bgCanvas.width=scene.width;bgCanvas.height=scene.height;
const W=scene.width,H=scene.height;
let mode:Mode='invisible',style:LocalStyle='dream',fade=0,targetFade=0,portal=false,manual=true,live=false;
let background:ImageData|null=null,mask:Float32Array|null=null,hands:Hand[]=[],lastVision=0,inferenceMs=0;
let frame:FrameRect|null=null,lastGoodFrame:FrameRect|null=null,lastGoodAt=0;
let manualFrame:FrameRect={x:.28,y:.23,width:.44,height:.54};
let calibration:ReturnType<typeof setInterval>|null=null;
let prepared:{image:string;requestId:string;createdAt:number;style:LocalStyle}|null=null,generated:ImageBitmap|null=null,generatedURL:string|null=null;
let aiEnabled=false,renderAbort:AbortController|null=null,renderGeneration=0;
const pinch=new PinchController(),palm=new PalmHold();
const status=(message:string)=>{$('#status').textContent=message;};
const pipeline=new CameraPipeline(result=>{
  hands=result.hands;lastVision=performance.now();inferenceMs=result.inferenceMs;
  frame=deriveFrame(hands,frame);
  if(frame){lastGoodFrame=frame;lastGoodAt=lastVision;}
  if(result.mask&&result.maskWidth&&result.maskHeight){
    const next=scaleMask(result.mask,result.maskWidth,result.maskHeight,W,H);
    if(mask&&mask.length===next.length)for(let i=0;i<next.length;i++)next[i]=next[i]*.7+mask[i]*.3;
    mask=next;
  }
  if(mode==='invisible'&&!portal&&palm.update(hands,result.timestamp))setFade(targetFade>.5?0:100);
  if(mode==='handframe'){
    const action=pinch.update(hands,result.timestamp);
    if(action==='next-style'){const list:LocalStyle[]=['dream','thermal','ink','neon'];setStyle(list[(list.indexOf(style)+1)%list.length]);}
    if(action==='capture'&&lastGoodFrame&&lastVision-lastGoodAt<1000)captureStill(lastGoodFrame);
  }
},(message,active)=>{
  live=active;status(message);
  const pending=message.includes('Loading')||message.includes('Waiting');
  $('#stop-camera').hidden=!active&&!pending;
  $<HTMLButtonElement>('#start-camera').disabled=active||pending;
  $<HTMLButtonElement>('#capture-background').disabled=pending;
  $<HTMLButtonElement>('#capture-still').disabled=pending;
  if(active){manual=false;$<HTMLInputElement>('#manual').checked=false;$('#background-state').textContent='NOT CAPTURED';}
  else{hands=[];mask=null;frame=null;background=null;targetFade=fade=0;palm.reset();pinch.reset();}
});

function resetCalibration(){if(calibration)clearInterval(calibration);calibration=null;$('#countdown').hidden=true;}
function clearStill(){renderGeneration++;renderAbort?.abort();renderAbort=null;prepared=null;generated?.close();generated=null;if(generatedURL)URL.revokeObjectURL(generatedURL);generatedURL=null;$('#still-panel').hidden=true;$<HTMLImageElement>('#still-preview').removeAttribute('src');}
function stopCamera(message='Camera off. The simulated preview is ready.'){pipeline.stop();live=false;hands=[];mask=null;background=null;frame=null;lastGoodFrame=null;lastVision=0;targetFade=fade=0;manual=true;$<HTMLInputElement>('#manual').checked=true;resetCalibration();clearStill();palm.reset();pinch.reset();$('#stop-camera').hidden=true;$<HTMLButtonElement>('#start-camera').disabled=false;$<HTMLButtonElement>('#capture-background').disabled=false;$<HTMLButtonElement>('#capture-still').disabled=false;$('#background-state').textContent='PREVIEW READY';setFade(0);status(message);}
function setFade(value:number){if(live&&!background&&value>0){status('Capture the empty background before disappearing.');return;}targetFade=value/100;$<HTMLInputElement>('#fade').value=String(value);$('#fade-value').textContent=`${value}%`;document.querySelectorAll<HTMLButtonElement>('[data-fade]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.fade)===value);b.setAttribute('aria-pressed',String(Number(b.dataset.fade)===value));});}
function setStyle(value:LocalStyle){style=value;document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b=>{b.classList.toggle('active',b.dataset.style===value);b.setAttribute('aria-pressed',String(b.dataset.style===value));});$('#style-note').textContent=value==='thermal'?'A brightness-based color palette. It does not measure temperature.':'Instant color effects, processed on your device.';}
function setMode(value:Mode){mode=value;palm.reset();pinch.reset();frame=null;document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===value);b.setAttribute('aria-pressed',String(b.dataset.mode===value));});$('#invisible-controls').hidden=value!=='invisible';$('#handframe-controls').hidden=value!=='handframe';$('#gesture-help').textContent=value==='invisible'?'Hold an open palm to disappear. Lower it, then repeat to return.':'Two L-shaped hands make the frame. Quick pinch: style. Hold 0.6s: prepare a still.';$('#effect-caption').textContent=value==='invisible'?'A little less here.':'A different world, within reach.';scene.setAttribute('aria-label',`${live?'Live camera':'Simulated'} ${value} effect. Use the adjacent controls to interact.`);}
function activeFrame(){return manual||!live?manualFrame:frame;}
function pixelRect(rect:FrameRect){return {x:Math.max(0,Math.round(rect.x*W)),y:Math.max(0,Math.round(rect.y*H)),width:Math.max(1,Math.min(Math.round(rect.width*W),W-Math.round(rect.x*W))),height:Math.max(1,Math.min(Math.round(rect.height*H),H-Math.round(rect.y*H)))};}

function captureStill(rect=activeFrame()){
  if(!rect){status('Make a frame with both hands, or enable mouse controls first.');return;}
  clearStill();const r=pixelRect(rect),crop=document.createElement('canvas');const size=512;
  crop.width=size;crop.height=size;crop.getContext('2d')!.drawImage(raw,r.x,r.y,r.width,r.height,0,0,size,size);
  const data=crop.toDataURL('image/jpeg',.85);
  prepared={image:data.split(',')[1],requestId:crypto.randomUUID(),createdAt:Date.now(),style};
  $<HTMLImageElement>('#still-preview').src=data;$('#still-panel').hidden=false;
  $('#still-status').textContent=aiEnabled?'Only this selected crop will be sent to Cloudflare AI.':'Still prepared. AI rendering is unavailable here; the local effects still work.';
  const button=$<HTMLButtonElement>('#send-still');button.disabled=!aiEnabled;button.textContent='Send still to AI ↗';
}
async function sendStill(){
  if(!prepared||!aiEnabled||renderAbort)return;
  // Capture age can exceed server request age. A newly explicit submission establishes request time.
  prepared.createdAt=Date.now();const submission={...prepared};const generation=++renderGeneration;
  renderAbort=new AbortController();const abort=renderAbort;
  const button=$<HTMLButtonElement>('#send-still');button.disabled=true;button.textContent='Rendering one still…';$('#still-status').textContent='Sending this crop only. You can keep using the local preview.';
  const timer=setTimeout(()=>abort.abort(),55000);
  try {
    const response=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission),signal:abort.signal});
    if(!response.ok){const result=await response.json() as {error?:string};throw new Error(result.error||'AI image could not be returned.');}
    const blob=await response.blob();const bitmap=await createImageBitmap(blob);
    if(generation!==renderGeneration){bitmap.close();return;}
    generated?.close();generated=bitmap;generatedURL=URL.createObjectURL(blob);$<HTMLImageElement>('#still-preview').src=generatedURL;
    $('#still-status').textContent='AI still returned. It now appears inside your frame.';button.textContent='AI still ready ✓';
  } catch(error){if(generation===renderGeneration){$('#still-status').textContent=(error instanceof Error&&error.name!=='AbortError'?error.message:'The request timed out or was cancelled.')+' This request will not be repeated. Prepare a new still to make another attempt.';button.textContent='Prepare a new still to retry';}}
  finally{clearTimeout(timer);if(generation===renderGeneration)renderAbort=null;}
}

$('#start-camera').addEventListener('click',()=>{stopCamera('Starting camera…');$('#stop-camera').hidden=false;void pipeline.start();});
$('#stop-camera').addEventListener('click',()=>stopCamera());
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode as Mode)));
document.querySelectorAll<HTMLButtonElement>('[data-fade]').forEach(b=>b.addEventListener('click',()=>setFade(Number(b.dataset.fade))));
$<HTMLInputElement>('#fade').addEventListener('input',e=>setFade(Number((e.target as HTMLInputElement).value)));
document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b=>b.addEventListener('click',()=>setStyle(b.dataset.style as LocalStyle)));
$<HTMLInputElement>('#portal').addEventListener('change',e=>{portal=(e.target as HTMLInputElement).checked;});
$<HTMLInputElement>('#manual').addEventListener('change',e=>{manual=(e.target as HTMLInputElement).checked;});
$<HTMLInputElement>('#frame-size').addEventListener('input',e=>{const width=Number((e.target as HTMLInputElement).value)/100,height=Math.min(.85,width*1.2);manualFrame={x:Math.min(1-width,Math.max(0,manualFrame.x+(manualFrame.width-width)/2)),y:Math.min(1-height,Math.max(0,manualFrame.y+(manualFrame.height-height)/2)),width,height};});
$('#reset').addEventListener('click',()=>{setFade(0);setStyle('dream');frame=null;manualFrame={x:.28,y:.23,width:.44,height:.54};$<HTMLInputElement>('#frame-size').value='44';palm.reset();pinch.reset();clearStill();});
$('#capture-still').addEventListener('click',()=>captureStill());$('#send-still').addEventListener('click',()=>void sendStill());$('#clear-still').addEventListener('click',clearStill);
$('#capture-background').addEventListener('click',()=>{
  resetCalibration();
  if(!live){status('Simulated background is ready. Use Ghost or Hidden to try the effect.');return;}
  setFade(0);let remaining=5;const indicator=$('#countdown');indicator.hidden=false;indicator.textContent=`${remaining}`;status('Step out of the camera view. Capturing the room in five seconds.');
  calibration=setInterval(()=>{remaining--;indicator.textContent=String(remaining);if(remaining>0)return;resetCalibration();
    if(!live||!mask||performance.now()-lastVision>800){status('Fresh tracking is needed to capture the room. Try again.');return;}
    const personArea=mask.reduce((sum,x)=>sum+(x>.65?1:0),0)/mask.length;
    if(personArea>.035){status('A person is still in view. Step fully out, then capture the background again.');return;}
    background=rawCtx.getImageData(0,0,W,H);$('#background-state').textContent='ROOM SAVED';status('Room saved. Return to view and hold an open palm, or use the visibility controls.');
  },1000);
});
let dragging=false;
scene.addEventListener('pointerdown',e=>{if(!manual&&live)return;dragging=true;scene.setPointerCapture(e.pointerId);moveFrame(e);});
scene.addEventListener('pointermove',e=>{if(dragging)moveFrame(e);});scene.addEventListener('pointerup',()=>dragging=false);scene.addEventListener('pointercancel',()=>dragging=false);
function moveFrame(e:PointerEvent){const r=scene.getBoundingClientRect();manualFrame.x=Math.max(.01,Math.min(.99-manualFrame.width,(e.clientX-r.left)/r.width-manualFrame.width/2));manualFrame.y=Math.max(.01,Math.min(.99-manualFrame.height,(e.clientY-r.top)/r.height-manualFrame.height/2));}
scene.tabIndex=0;scene.addEventListener('keydown',e=>{if(!manual&&live)return;const amount=e.shiftKey?.05:.02;const d:Record<string,[number,number]>={ArrowLeft:[-amount,0],ArrowRight:[amount,0],ArrowUp:[0,-amount],ArrowDown:[0,amount]};if(d[e.key]){e.preventDefault();manualFrame.x=Math.max(.01,Math.min(.99-manualFrame.width,manualFrame.x+d[e.key][0]));manualFrame.y=Math.max(.01,Math.min(.99-manualFrame.height,manualFrame.y+d[e.key][1]));}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera('Camera paused while this tab was hidden. Start it again when ready.');});window.addEventListener('pagehide',()=>stopCamera());

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const simulatedMask=demoMask(W,H);let lastPaint=0,lastMetric=0;
function render(now:number){
  if(now-lastPaint<32){requestAnimationFrame(render);return;}lastPaint=now;
  if(live&&pipeline.video.readyState>=2){rawCtx.save();rawCtx.translate(W,0);rawCtx.scale(-1,1);rawCtx.drawImage(pipeline.video,0,0,W,H);rawCtx.restore();void pipeline.infer(now,mode==='invisible');}
  else drawDemo(rawCtx,reducedMotion?0:now);
  if(live&&now-lastVision>1000){hands=[];frame=null;palm.reset();pinch.reset();}
  ctx.drawImage(raw,0,0);
  const r=activeFrame();
  if(mode==='invisible'){
    fade=reducedMotion?targetFade:fade+(targetFade-fade)*.14;
    let bg=background;
    if(!live){const b=bgCanvas.getContext('2d',{willReadFrequently:true})!;drawDemo(b,reducedMotion?0:now,false);bg=b.getImageData(0,0,W,H);}
    const currentMask=portal?(r?portalMask(W,H,r):null):live?(now-lastVision<800?mask:null):simulatedMask;
    if(bg&&currentMask&&fade>.001){const source=rawCtx.getImageData(0,0,W,H);ctx.putImageData(new ImageData(new Uint8ClampedArray(blendInvisible(source.data,bg.data,currentMask,fade)),W,H),0,0);}
    if(portal&&r)drawFrame(r,false);
  }else if(r){
    const p=pixelRect(r);
    if(generated)ctx.drawImage(generated,p.x,p.y,p.width,p.height);
    else {const pixels=rawCtx.getImageData(p.x,p.y,p.width,p.height);stylePixels(pixels.data,style);ctx.putImageData(pixels,p.x,p.y);}
    drawFrame(r,true);
  }
  if(now-lastMetric>400){lastMetric=now;$('#source-tag').textContent=live?'LIVE CAMERA · ON-DEVICE TRACKING':'INTERACTIVE PREVIEW · SIMULATED SCENE';$('#frame-tag').textContent=live?`${hands.length} HAND${hands.length===1?'':'S'} TRACKED`:'NO CAMERA CONNECTED';$('#live-metric').textContent=live?`${Math.round(inferenceMs)} ms / inference`:'YOUR CAMERA IS OFF';}
  requestAnimationFrame(render);
}
function drawFrame(rect:FrameRect,styled:boolean){
  const p=pixelRect(rect),layout=$<HTMLSelectElement>('#layout').value;ctx.save();ctx.strokeStyle=styled?'#e4ddb9':'#c8f5a4';ctx.lineWidth=2;
  if(layout==='postcard'&&styled){ctx.fillStyle='#e9e7d6';ctx.fillRect(p.x-8,p.y-8,p.width+16,8);ctx.fillRect(p.x-8,p.y+p.height,p.width+16,27);ctx.fillRect(p.x-8,p.y,8,p.height);ctx.fillRect(p.x+p.width,p.y,8,p.height);ctx.fillStyle='#234039';ctx.font='10px monospace';ctx.fillText(generated?'AN AI STILL / JEDI MINDTRICK':'A MOMENT / JEDI MINDTRICK',p.x+5,p.y+p.height+17);}
  else {ctx.strokeRect(p.x,p.y,p.width,p.height);if(layout==='cinema'&&styled){ctx.fillStyle='#050b0bd9';ctx.fillRect(p.x,p.y,p.width,p.height*.09);ctx.fillRect(p.x,p.y+p.height*.91,p.width,p.height*.09);}}
  const len=15;ctx.lineWidth=4;for(const [x,y,dx,dy] of [[p.x,p.y,1,1],[p.x+p.width,p.y,-1,1],[p.x,p.y+p.height,1,-1],[p.x+p.width,p.y+p.height,-1,-1]]){ctx.beginPath();ctx.moveTo(x+dx*len,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*len);ctx.stroke();}ctx.restore();
}
void fetch('/api/config').then(r=>r.ok?r.json():null).then(config=>{aiEnabled=typeof config==='object'&&config!==null&&'aiEnabled' in config&&config.aiEnabled===true;}).catch(()=>{aiEnabled=false;});
requestAnimationFrame(render);
