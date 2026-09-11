import './style.css';
import type { FrameRect, Hand, LocalStyle, Mode, Point } from './contracts';
import { deriveFrame, PinchController, stylePixels } from './handframe';
import { blendInvisible, portalMask, scaleMask } from './effects/invisible';
import { addTrackedHands } from './effects/hand-mask';
import { PalmVisibility } from './vision/palm-visibility';
import { CameraPipeline } from './vision/camera';
import { drawDemo, demoMask } from './demo';
import { PerspectiveTracker, projectFrame, type FramePose } from './handframe/perspective';
import { drawSurface, mappedShape, traceShape } from './handframe/surface';
import { shapePoints, type FrameShape } from './handframe/shapes';
import { installShapeEditor } from './handframe/shape-editor';
import { HandOutlineTracker } from './handframe/hand-outline';
import { installFullscreen } from './fullscreen';

const WORLDS: {id:LocalStyle;name:string;note:string}[] = [
  {id:'dream',name:'Daydream',note:'Soft pastel colors with a painted finish.'},
  {id:'thermal',name:'Thermal',note:'A brightness-based color palette. It does not measure temperature.'},
  {id:'ink',name:'Ink study',note:'Bold ink shadows and warm paper highlights.'},
  {id:'neon',name:'Neon night',note:'Electric violet with bright neon color.'},
  {id:'aurora',name:'Aurora',note:'Purple shadows, emerald light and a mint glow.'},
  {id:'ocean',name:'Deep sea',note:'Deep navy opens into cyan and icy blue.'},
  {id:'sunset',name:'Golden hour',note:'Copper and coral warm into golden highlights.'},
  {id:'cosmic',name:'Cosmic',note:'Indigo and violet fade into silver-pink starlight.'},
  {id:'risograph',name:'Risograph',note:'Layered green and golden ink, soft paper grain and a slight print offset.'},
  {id:'cyanotype',name:'Cyanotype',note:'Prussian blue shadows and chalky paper highlights.'},
  {id:'stippling',name:'Stippling',note:'Fine red ink dots gather into shadows on ivory paper.'},
];
const worldName=(id:LocalStyle)=>WORLDS.find(world=>world.id===id)!.name;
const SHAPES: {id:FrameShape;name:string;icon:string}[] = [
  {id:'rectangle',name:'Rectangle',icon:'▭'}, {id:'triangle',name:'Triangle',icon:'△'},
  {id:'ellipse',name:'Oval',icon:'◯'}, {id:'diamond',name:'Diamond',icon:'◇'},
  {id:'hexagon',name:'Hexagon',icon:'⬡'}, {id:'star',name:'Star',icon:'☆'},
];

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<header class="topbar"><a class="brand" href="/" aria-label="Jedi mindtrick home"><span class="brand-mark">⌑</span> JEDI MINDTRICK<span class="edition">CAMERA PLAYGROUND / 01</span></a><a class="about-link" href="#how-it-works">How it works <span>↗</span></a></header>
<main>
  <section class="intro"><div><p class="eyebrow"><span></span> A SMALL EXPERIMENT IN THE IMPOSSIBLE</p><h1>Now you see me.<br><em>Now, imagine.</em></h1></div><p class="intro-note">Disappear into the room.<br> Hold another world in your hands.<br><span>Two camera effects. One little mindtrick.</span></p></section>
  <section class="playground" aria-label="Camera playground">
    <div class="studio">
      <div class="studio-bar"><div class="mode-tabs" role="group" aria-label="Choose an effect"><button class="active" data-mode="invisible" aria-pressed="true"><span>01</span> Invisible</button><button data-mode="handframe" aria-pressed="false"><span>02</span> HandFrame</button></div><button id="full-screen" class="screen-open" aria-expanded="false" aria-controls="camera-view">Full screen <span aria-hidden="true">⛶</span></button></div>
      <div class="viewport" id="camera-view"><canvas id="scene" width="768" height="432" aria-label="Interactive simulated preview of the Invisible effect"></canvas><div class="viewport-top"><span id="source-tag">INTERACTIVE PREVIEW · SIMULATED SCENE</span><span id="frame-tag">NO CAMERA CONNECTED</span></div><div class="viewport-bottom"><div><span class="record-dot"></span><span id="effect-caption">A little less here.</span></div><span id="live-metric">YOUR CAMERA IS OFF</span></div><div id="countdown" hidden></div><div class="screen-actions" role="group" aria-label="Full screen controls"><span id="screen-notice" role="status">Esc to return</span><button id="camera-only" aria-pressed="false">Just camera</button><button id="fill-screen" aria-pressed="false">Fill view</button><button id="exit-screen">Exit full screen <span aria-hidden="true">✕</span></button></div><span id="screen-camera-state">Simulated preview · Camera off</span></div>
      <div class="studio-footer"><span id="gesture-help">Open palm: visible. Slowly close your hand to disappear. Open it again to return.</span><button id="reset" class="text-button">Reset effect ↺</button></div>
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
        <p class="hint">Start with an open palm facing the camera. Slowly close your fingers to fade out; open them to come back. Your hand fades with you.</p><label class="sr-only" for="fade">Amount of invisibility</label><input id="fade" type="range" min="0" max="100" value="0">
        <label class="switch-row"><span>Framed invisibility portal<small>Hide only what’s inside the frame.</small></span><input id="portal" type="checkbox"></label>
      </div>
      <div id="handframe-controls" hidden>
        <div class="section-label"><span>01 / CHOOSE YOUR WORLD</span><span>LOCAL FILTER</span></div>
        <div class="styles" role="group" aria-label="Visual style">${WORLDS.map(world=>`<button data-style="${world.id}" class="${world.id==='dream'?'active':''}" aria-pressed="${world.id==='dream'}"><i class="swatch ${world.id}" aria-hidden="true"></i>${world.name}</button>`).join('')}</div>
        <div class="section-label"><span>02 / SHAPE IT WITH YOUR HANDS</span><span>AUTOMATIC</span></div>
        <label class="switch-row"><span>Follow my hands<small>Your thumbs and index fingers draw the outline.</small></span><input id="follow-hands" type="checkbox" checked></label>
        <p class="hint" id="hand-shape-state" role="status">Start your camera to form a shape with both hands.</p>
        <p class="hint">Open a space between your thumbs and index fingers. Bring the tips together, curve them or spread them apart—the picture follows that opening.</p>
        <details id="manual-shapes"><summary>Saved shapes & drawing</summary><div class="section-label"><span>OPTIONAL FIXED OUTLINE</span><span id="shape-name">RECTANGLE</span></div>
        <div class="shape-choices" role="group" aria-label="Frame shape">${SHAPES.map(s=>`<button data-shape="${s.id}" aria-pressed="${s.id==='rectangle'}" class="${s.id==='rectangle'?'active':''}"><span aria-hidden="true">${s.icon}</span>${s.name}</button>`).join('')}</div>
        <button id="custom-shape" class="secondary full" aria-expanded="false" aria-controls="shape-editor">Draw a custom shape <span aria-hidden="true">✎</span></button>
        <div id="shape-editor" hidden></div>
        <p class="hint">Choosing a saved outline turns off Follow my hands. Turn it back on to shape the picture directly with your fingers.</p></details>
        <label class="select-row" for="layout">Frame layout<select id="layout"><option value="outline">Floating outline</option><option value="postcard">Postcard</option><option value="cinema">Cinema</option></select></label>
        <p class="hint" id="style-note">Instant color effects, processed on your device.</p>
        <div class="depth-controls"><div class="section-label"><span>03 / MOVE IN 3D</span><output id="depth-state">READY TO STRETCH</output></div>
        <button id="center-depth" class="secondary full">Center depth <span>↔</span></button>
        <p class="hint">Hold both hands side by side, palms toward the camera. Center depth, then push one hand forward and pull the other back. Your outline also follows the way you lift and turn your hands.</p>
        <p class="hint muted">Depth is estimated from hand size. Keep your palms facing the camera for steadier control.</p></div>
        <div class="section-label"><span>04 / MAKE AN AI STILL</span><span>OPTIONAL UPLOAD</span></div>
        <button id="capture-still" class="secondary full">Prepare a still <span>⌑</span></button><p class="hint">Use this button to prepare a crop while shaping with your hands. Sending it to Cloudflare AI is a separate step.</p>
        <div id="still-panel" hidden><img id="still-preview" alt="Your selected frozen crop"><p id="still-status" class="hint" role="status">Only this selected crop will be sent.</p><button class="primary full" id="send-still" disabled>Send still to AI ↗</button><button id="clear-still" class="text-button">Clear still</button></div>
      </div>
      <div class="manual-controls"><label class="switch-row"><span>Mouse & keyboard controls<small>Drag the frame. Use the slider to resize.</small></span><input id="manual" type="checkbox" checked></label><label class="sr-only" for="frame-size">Frame size</label><input id="frame-size" type="range" min="22" max="70" value="44"><div id="perspective-controls" hidden>
        <label class="select-row" for="frame-depth">3D stretch <output id="frame-depth-value">Centered</output></label><input id="frame-depth" type="range" min="-100" max="100" value="0"><div class="range-ends"><span>Right closer</span><span>Left closer</span></div>
        <label class="select-row" for="frame-roll">Tilt <output id="frame-roll-value">0°</output></label><input id="frame-roll" type="range" min="-22" max="22" value="0">
        <p class="hint" id="perspective-manual-hint">Try the depth and tilt sliders, or use both hands with the camera.</p></div></div>
    </aside>
  </section>
  <section id="how-it-works" class="notes"><article><span>01 / A CAMERA ILLUSION</span><h2>Leave a little mystery.</h2><p>Invisible blends your captured room into your silhouette. A steady camera and even lighting give it the best chance to work.</p></article><article><span>02 / FRAME YOUR IMAGINATION</span><h2>Your hands, the viewfinder.</h2><p>Form an opening with both thumbs and index fingers. The picture follows its outline as you move. Bring one hand closer for perspective. Use the world buttons to change its look.</p></article><article><span>03 / ON YOUR TERMS</span><h2>Local until you say so.</h2><p>Live camera frames stay in your browser. AI rendering sends only your selected still. No accounts, microphone, or camera recordings.</p></article></section>
</main><footer><span>JEDI MINDTRICK <span class="muted">/ Built by Cruz G.</span></span><span>Hand tracking + a little imagination.</span><a href="https://github.com/recruiting-gains/ai-builds-showcase/tree/codex/jedi-mindtrick/jedi-mindtrick" target="_blank" rel="noopener noreferrer">Explore the source ↗</a></footer>`;

const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const scene=$<HTMLCanvasElement>('#scene'),ctx=scene.getContext('2d')!;
const raw=document.createElement('canvas');raw.width=scene.width;raw.height=scene.height;
const rawCtx=raw.getContext('2d',{willReadFrequently:true})!;
const bgCanvas=document.createElement('canvas');bgCanvas.width=scene.width;bgCanvas.height=scene.height;
const W=scene.width,H=scene.height;
const texture=document.createElement('canvas');texture.width=384;texture.height=256;
const textureCtx=texture.getContext('2d',{willReadFrequently:true})!;
let textureSource:ImageBitmap|HTMLCanvasElement|null=null,textureKey='';
let mode:Mode='invisible',style:LocalStyle='dream',fade=0,targetFade=0,portal=false,manual=true,live=false;
let shape:FrameShape='rectangle',customOutline=shapePoints('rectangle'),outline=shapePoints(shape),cameraOnly=false;
let handFollowing=true,handOutline:Point[]|null=null;
let focusView:ReturnType<typeof installFullscreen>|null=null;
let background:ImageData|null=null,mask:Float32Array|null=null,hands:Hand[]=[],lastVision=0,inferenceMs=0;
let handBackend='';
let frame:FrameRect|null=null,lastGoodFrame:FrameRect|null=null,lastGoodAt=0;
let manualFrame:FrameRect={x:.28,y:.23,width:.44,height:.54};
let calibration:ReturnType<typeof setInterval>|null=null;
let prepared:{image:string;requestId:string;createdAt:number;style:LocalStyle}|null=null,generated:ImageBitmap|null=null,generatedURL:string|null=null;
let generatedStyle:LocalStyle|null=null;
let aiEnabled=false,renderAbort:AbortController|null=null,renderGeneration=0;
const pinch=new PinchController(),palm=new PalmVisibility(),perspective=new PerspectiveTracker(),handShape=new HandOutlineTracker();
let personMask:Float32Array|null=null,lastMaskAt=0;
let pose:FramePose|null=null,manualDepth=0,manualRoll=0;
const status=(message:string)=>{$('#status').textContent=message;};
const pipeline=new CameraPipeline(result=>{
  hands=result.hands;lastVision=result.timestamp;inferenceMs=result.inferenceMs;handBackend=result.handBackend??'';
  const automatic=automaticShaping();
  if(automatic){const formed=handShape.update(hands,result.timestamp);frame=formed?.rect??null;handOutline=formed?.outline??null;}
  else{handOutline=null;frame=deriveFrame(hands,frame);}
  pose=mode==='handframe'?perspective.update(hands,frame,result.timestamp,automatic):null;
  // The measured contour already includes the hands' screen-space tilt.
  // Apply only the stylized depth warp to avoid rotating that outline twice.
  if(automatic&&pose&&frame)pose=projectFrame(frame,pose.depth,0);
  if(frame){lastGoodFrame=frame;lastGoodAt=lastVision;}
  if(result.mask&&result.maskWidth&&result.maskHeight){
    const next=scaleMask(result.mask,result.maskWidth,result.maskHeight,W,H);
    if(personMask&&personMask.length===next.length)for(let i=0;i<next.length;i++)next[i]=next[i]*.9+personMask[i]*.1;
    personMask=next;lastMaskAt=result.timestamp;
  }
  if(mode==='invisible')mask=personMask?addTrackedHands(personMask,W,H,hands):null;
  if(mode==='invisible'&&!portal&&!calibration){const amount=palm.update(hands,result.timestamp);if(amount!==null)setFade(amount*100);}
  if(mode==='handframe'&&!handFollowing){
    const action=pinch.update(hands,result.timestamp);
    if(action==='next-style'){const list=WORLDS.map(world=>world.id);setStyle(list[(list.indexOf(style)+1)%list.length]);}
    if(action==='capture'&&lastGoodFrame&&lastVision-lastGoodAt<1000)captureStill(lastGoodFrame);
  }else if(mode==='handframe')pinch.reset();
},(message,active)=>{
  live=active;status(message);
  const pending=message.includes('Loading')||message.includes('Waiting');
  $('#stop-camera').hidden=!active&&!pending;
  $<HTMLButtonElement>('#start-camera').disabled=active||pending;
  $<HTMLButtonElement>('#capture-background').disabled=pending;
  $<HTMLButtonElement>('#capture-still').disabled=pending;
  if(active){manual=false;$<HTMLInputElement>('#manual').checked=false;$('#background-state').textContent='NOT CAPTURED';}
  else{resetPerspective();hands=[];mask=null;personMask=null;lastMaskAt=0;frame=null;background=null;targetFade=fade=0;palm.reset();pinch.reset();if(!pending){manual=true;$<HTMLInputElement>('#manual').checked=true;if(focusView?.active)void focusView.exit();}}
  syncManualControls();
});

function automaticShaping(){return mode==='handframe'&&handFollowing&&live&&!manual;}
function resetPerspective(){pose=null;frame=null;lastGoodFrame=null;perspective.reset();handShape.reset();handOutline=null;}
function syncGestureHelp(){$('#gesture-help').textContent=mode==='invisible'?'Open palm: visible. Slowly close your hand to disappear. Open it again to return.':handFollowing?'Form an opening with both thumbs and index fingers. The outline follows your hands. Use the world buttons to change its look.':'Push one hand forward, pull the other back. Lift to tilt. Quick pinch: style. Hold 0.6s: prepare a still.';}
function setHandFollowing(value:boolean){handFollowing=value;$<HTMLInputElement>('#follow-hands').checked=value;resetPerspective();pinch.reset();if(value&&live){manual=false;$<HTMLInputElement>('#manual').checked=false;}syncManualControls();syncGestureHelp();}
function setShape(value:FrameShape){setHandFollowing(false);shape=value;outline=shapePoints(value,customOutline);$('#shape-name').textContent=value==='custom'?'CUSTOM':SHAPES.find(s=>s.id===value)!.name.toUpperCase();document.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach(b=>{b.classList.toggle('active',b.dataset.shape===value);b.setAttribute('aria-pressed',String(b.dataset.shape===value));});$('#custom-shape').classList.toggle('active',value==='custom');}
function syncManualControls(){const disabled=live&&!manual;for(const id of ['#frame-depth','#frame-roll','#frame-size'])$<HTMLInputElement>(id).disabled=disabled;$('#perspective-manual-hint').textContent=disabled?'Your hands control depth and tilt. Enable mouse controls to use these sliders.':'Try the depth and tilt sliders, or use both hands with the camera.';}
function centerDepth(){perspective.recenter();pose=null;manualDepth=manualRoll=0;$<HTMLInputElement>('#frame-depth').value='0';$<HTMLInputElement>('#frame-roll').value='0';$('#frame-depth-value').textContent='Centered';$('#frame-roll-value').textContent='0°';}
function resetCalibration(){if(calibration)clearInterval(calibration);calibration=null;$('#countdown').hidden=true;}
function clearStill(){renderGeneration++;renderAbort?.abort();renderAbort=null;prepared=null;generated?.close();generated=null;generatedStyle=null;textureSource=null;textureKey='';if(generatedURL)URL.revokeObjectURL(generatedURL);generatedURL=null;$('#still-panel').hidden=true;$<HTMLImageElement>('#still-preview').removeAttribute('src');setStyle(style);}
function stopCamera(message='Camera off. The simulated preview is ready.'){if(focusView?.active)void focusView.exit();pipeline.stop();resetPerspective();live=false;hands=[];mask=null;personMask=null;lastMaskAt=0;background=null;frame=null;lastGoodFrame=null;lastVision=0;targetFade=fade=0;manual=true;$<HTMLInputElement>('#manual').checked=true;resetCalibration();clearStill();palm.reset();pinch.reset();$('#stop-camera').hidden=true;$<HTMLButtonElement>('#start-camera').disabled=false;$<HTMLButtonElement>('#capture-background').disabled=false;$<HTMLButtonElement>('#capture-still').disabled=false;$('#background-state').textContent='PREVIEW READY';setFade(0);syncManualControls();status(message);}
function setFade(value:number){if(live&&!background&&value>0){status('Capture the empty background before disappearing.');return;}targetFade=value/100;$<HTMLInputElement>('#fade').value=String(value);$('#fade-value').textContent=`${Math.round(value)}%`;document.querySelectorAll<HTMLButtonElement>('[data-fade]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.fade)===value);b.setAttribute('aria-pressed',String(Number(b.dataset.fade)===value));});}
function setStyle(value:LocalStyle){style=value;document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b=>{b.classList.toggle('active',b.dataset.style===value);b.setAttribute('aria-pressed',String(b.dataset.style===value));});$('#style-note').textContent=WORLDS.find(world=>world.id===value)!.note+(generated&&value!==generatedStyle?' Applied locally to your AI still.':'');}
function setMode(value:Mode){mode=value;palm.reset();pinch.reset();frame=null;resetPerspective();if(live)void pipeline.infer(performance.now(),mode==='invisible');document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===value);b.setAttribute('aria-pressed',String(b.dataset.mode===value));});$('#invisible-controls').hidden=value!=='invisible';$('#handframe-controls').hidden=value!=='handframe';$('#perspective-controls').hidden=value!=='handframe';syncGestureHelp();$('#effect-caption').textContent=value==='invisible'?'A little less here.':'A different world, within reach.';scene.setAttribute('aria-label',`${live?'Live camera':'Simulated'} ${value} effect. Use the adjacent controls to interact.`);}
function activeFrame(){return manual||!live?manualFrame:frame;}
function pixelRect(rect:FrameRect){return {x:Math.max(0,Math.round(rect.x*W)),y:Math.max(0,Math.round(rect.y*H)),width:Math.max(1,Math.min(Math.round(rect.width*W),W-Math.round(rect.x*W))),height:Math.max(1,Math.min(Math.round(rect.height*H),H-Math.round(rect.y*H)))};}

function captureStill(rect=activeFrame()){
  if(!rect){status('Make a frame with both hands, or enable mouse controls first.');return;}
  clearStill();const r=pixelRect(rect),crop=document.createElement('canvas');const size=448;
  crop.width=size;crop.height=size;crop.getContext('2d')!.drawImage(raw,r.x,r.y,r.width,r.height,0,0,size,size);
  const data=crop.toDataURL('image/jpeg',.85);
  prepared={image:data.split(',')[1],requestId:crypto.randomUUID(),createdAt:Date.now(),style};
  $<HTMLImageElement>('#still-preview').src=data;$('#still-panel').hidden=false;
  $('#still-status').textContent=aiEnabled?`Selected look: ${worldName(prepared.style)}. This entire rectangular preview and look will be sent; the frame shape only changes its display. Prepare again to change the selection.`:'Still prepared. AI rendering is unavailable here; the local effects still work.';
  const button=$<HTMLButtonElement>('#send-still');button.disabled=!aiEnabled;button.textContent='Send still to AI ↗';
}
async function sendStill(){
  if(!prepared||!aiEnabled||renderAbort)return;
  // Capture age can exceed server request age. A newly explicit submission establishes request time.
  prepared.createdAt=Date.now();const submission={...prepared};const generation=++renderGeneration;
  renderAbort=new AbortController();const abort=renderAbort;
  const button=$<HTMLButtonElement>('#send-still');button.disabled=true;button.textContent='Rendering one still…';$('#still-status').textContent=`Sending this crop in ${worldName(submission.style)}. You can keep using the local preview.`;
  const timer=setTimeout(()=>abort.abort(),55000);
  try {
    const response=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission),signal:abort.signal});
    if(!response.ok){const result=await response.json() as {error?:string};throw new Error(result.error||'AI image could not be returned.');}
    const blob=await response.blob();const bitmap=await createImageBitmap(blob);
    if(generation!==renderGeneration){bitmap.close();return;}
    generated?.close();generated=bitmap;generatedStyle=submission.style;setStyle(style);generatedURL=URL.createObjectURL(blob);$<HTMLImageElement>('#still-preview').src=generatedURL;
    $('#still-status').textContent='AI still returned. It now appears inside your frame.';button.textContent='AI still ready ✓';
  } catch(error){if(generation===renderGeneration){$('#still-status').textContent=(error instanceof Error&&error.name!=='AbortError'?error.message:'The request timed out or was cancelled.')+' This request will not be repeated. Prepare a new still to make another attempt.';button.textContent='Prepare a new still to retry';}}
  finally{clearTimeout(timer);if(generation===renderGeneration)renderAbort=null;}
}

const shapeEditor=installShapeEditor($('#shape-editor'),points=>{customOutline=points;setShape('custom');});
$<HTMLInputElement>('#follow-hands').addEventListener('change',e=>setHandFollowing((e.target as HTMLInputElement).checked));
document.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach(b=>b.addEventListener('click',()=>{shapeEditor.close();setShape(b.dataset.shape as FrameShape);}));
$('#custom-shape').addEventListener('click',()=>shapeEditor.open(customOutline,$('#custom-shape')));
focusView=installFullscreen($('#camera-view'),$<HTMLButtonElement>('#full-screen'),active=>{if(!active){cameraOnly=false;$('#camera-only').setAttribute('aria-pressed','false');$('#camera-only').textContent='Just camera';}});
$('#camera-only').addEventListener('click',()=>{cameraOnly=!cameraOnly;$('#camera-only').setAttribute('aria-pressed',String(cameraOnly));$('#camera-only').textContent=cameraOnly?'Show effects':'Just camera';});
$('#start-camera').addEventListener('click',()=>{stopCamera('Starting camera…');$('#stop-camera').hidden=false;void pipeline.start();});
$('#stop-camera').addEventListener('click',()=>stopCamera());
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode as Mode)));
document.querySelectorAll<HTMLButtonElement>('[data-fade]').forEach(b=>b.addEventListener('click',()=>setFade(Number(b.dataset.fade))));
$<HTMLInputElement>('#fade').addEventListener('input',e=>setFade(Number((e.target as HTMLInputElement).value)));
document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b=>b.addEventListener('click',()=>setStyle(b.dataset.style as LocalStyle)));
$<HTMLInputElement>('#portal').addEventListener('change',e=>{portal=(e.target as HTMLInputElement).checked;palm.reset();});
$<HTMLInputElement>('#manual').addEventListener('change',e=>{manual=(e.target as HTMLInputElement).checked;resetPerspective();syncManualControls();});
$<HTMLInputElement>('#frame-size').addEventListener('input',e=>{const width=Number((e.target as HTMLInputElement).value)/100,height=Math.min(.85,width*1.2);manualFrame={x:Math.min(1-width,Math.max(0,manualFrame.x+(manualFrame.width-width)/2)),y:Math.min(1-height,Math.max(0,manualFrame.y+(manualFrame.height-height)/2)),width,height};});
$('#center-depth').addEventListener('click',()=>{centerDepth();status(live&&!manual?'Hold both hands at the same distance, palms facing the camera. The next tracked pair sets your neutral depth.':'Depth and tilt centered. Try the sliders below.');});
$<HTMLInputElement>('#frame-depth').addEventListener('input',e=>{manualDepth=Number((e.target as HTMLInputElement).value)/100;$('#frame-depth-value').textContent=manualDepth===0?'Centered':`${manualDepth>0?'Left':'Right'} closer ${Math.round(Math.abs(manualDepth)*100)}%`;});
$<HTMLInputElement>('#frame-roll').addEventListener('input',e=>{const degrees=Number((e.target as HTMLInputElement).value);manualRoll=degrees*Math.PI/180;$('#frame-roll-value').textContent=`${degrees}°`;});
$('#reset').addEventListener('click',()=>{setFade(0);setStyle('dream');setShape('rectangle');setHandFollowing(true);shapeEditor.close();frame=null;resetPerspective();centerDepth();manualFrame={x:.28,y:.23,width:.44,height:.54};$<HTMLInputElement>('#frame-size').value='44';palm.reset();pinch.reset();clearStill();});
$('#capture-still').addEventListener('click',()=>captureStill());$('#send-still').addEventListener('click',()=>void sendStill());$('#clear-still').addEventListener('click',clearStill);
$('#capture-background').addEventListener('click',()=>{
  resetCalibration();
  if(!live){status('Simulated background is ready. Use Ghost or Hidden to try the effect.');return;}
  palm.reset();setFade(0);let remaining=5;const indicator=$('#countdown');indicator.hidden=false;indicator.textContent=`${remaining}`;status('Step out of the camera view. Capturing the room in five seconds.');
  calibration=setInterval(()=>{remaining--;indicator.textContent=String(remaining);if(remaining>0)return;resetCalibration();
    if(!live||!mask||performance.now()-lastVision>800||performance.now()-lastMaskAt>800){status('Fresh tracking is needed to capture the room. Try again.');return;}
    const personArea=mask.reduce((sum,x)=>sum+(x>.65?1:0),0)/mask.length;
    if(personArea>.035){status('A person is still in view. Step fully out, then capture the background again.');return;}
    background=rawCtx.getImageData(0,0,W,H);$('#background-state').textContent='ROOM SAVED';status('Room saved. Show an open palm to stay visible. Slowly close it to disappear; open it to return.');
  },1000);
});
let dragging=false;
scene.addEventListener('pointerdown',e=>{if(!manual&&live)return;dragging=true;scene.setPointerCapture(e.pointerId);moveFrame(e);});
scene.addEventListener('pointermove',e=>{if(dragging)moveFrame(e);});scene.addEventListener('pointerup',()=>dragging=false);scene.addEventListener('pointercancel',()=>dragging=false);
function moveFrame(e:PointerEvent){const r=scene.getBoundingClientRect();manualFrame.x=Math.max(.01,Math.min(.99-manualFrame.width,(e.clientX-r.left)/r.width-manualFrame.width/2));manualFrame.y=Math.max(.01,Math.min(.99-manualFrame.height,(e.clientY-r.top)/r.height-manualFrame.height/2));}
scene.tabIndex=0;scene.addEventListener('keydown',e=>{if(!manual&&live)return;const amount=e.shiftKey?.05:.02;const d:Record<string,[number,number]>={ArrowLeft:[-amount,0],ArrowRight:[amount,0],ArrowUp:[0,-amount],ArrowDown:[0,amount]};if(d[e.key]){e.preventDefault();manualFrame.x=Math.max(.01,Math.min(.99-manualFrame.width,manualFrame.x+d[e.key][0]));manualFrame.y=Math.max(.01,Math.min(.99-manualFrame.height,manualFrame.y+d[e.key][1]));}});
let hiddenTimer:ReturnType<typeof setTimeout>|undefined;
document.addEventListener('visibilitychange',()=>{
  clearTimeout(hiddenTimer);
  if(!document.hidden)return;
  // Some embedded hosts briefly mark the document hidden while expanding it.
  // A genuinely hidden tab still releases its camera after this bounded grace.
  if(focusView?.active)hiddenTimer=setTimeout(()=>{if(document.hidden)stopCamera('Camera paused while this tab was hidden. Start it again when ready.');},150);
  else stopCamera('Camera paused while this tab was hidden. Start it again when ready.');
});window.addEventListener('pagehide',()=>{clearTimeout(hiddenTimer);stopCamera();});

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const simulatedMask=demoMask(W,H);let lastPaint=0,lastMetric=0;
function render(now:number){
  // Capture scheduling must not wait behind painting; the pipeline handles cadence and backpressure.
  if(live)void pipeline.infer(now,mode==='invisible');
  if(now-lastPaint<(mode==='handframe'?16:32)){requestAnimationFrame(render);return;}lastPaint=now;
  if(live&&pipeline.video.readyState>=2){rawCtx.save();rawCtx.translate(W,0);rawCtx.scale(-1,1);rawCtx.drawImage(pipeline.video,0,0,W,H);rawCtx.restore();}
  else drawDemo(rawCtx,reducedMotion?0:now);
  if(live&&now-lastVision>1000){hands=[];frame=null;resetPerspective();palm.reset();pinch.reset();}
  ctx.drawImage(raw,0,0);
  const r=activeFrame();
  if(focusView?.active&&cameraOnly){/* Clean camera view keeps the selected effect ready to restore. */}
  else if(mode==='invisible'){
    fade=reducedMotion?targetFade:fade+(targetFade-fade)*.65;
    if(Math.abs(fade-targetFade)<.004)fade=targetFade;
    let bg=background;
    if(!live){const b=bgCanvas.getContext('2d',{willReadFrequently:true})!;drawDemo(b,reducedMotion?0:now,false);bg=b.getImageData(0,0,W,H);}
    const currentMask=portal?(r?portalMask(W,H,r):null):live?(now-lastMaskAt<800?mask:null):simulatedMask;
    if(bg&&currentMask&&fade>.001){const source=rawCtx.getImageData(0,0,W,H);ctx.putImageData(new ImageData(new Uint8ClampedArray(blendInvisible(source.data,bg.data,currentMask,fade)),W,H),0,0);}
    if(portal&&r)drawFrame(r,false);
  }else if(r){
    const displayPose=manual||!live?projectFrame(r,manualDepth,manualRoll):pose;
    const automatic=automaticShaping(),displayOutline=automatic?handOutline:outline;
    if(displayPose&&displayOutline)drawHandSurface(r,displayPose,live?`camera:${pipeline.video.currentTime}`:`preview:${reducedMotion?0:now}`,displayOutline,!automatic&&shape==='rectangle');
  }
  if(now-lastMetric>400){lastMetric=now;$('#screen-camera-state').hidden=live;$('#hand-shape-state').textContent=!handFollowing?'Using your saved outline. Turn on Follow my hands to shape it directly.':!live?'Start your camera to form a shape with both hands.':manual?'Mouse controls are on. Turn them off to follow your hands.':handOutline?'Following your hand-shaped outline.':hands.length===2?'Open a clear space between your thumbs and index fingers.':'Show both hands to form an opening.';const depth=manual||!live?manualDepth:pose?.depth;
    $('#depth-state').textContent=depth===undefined?'SHOW BOTH HANDS':Math.abs(depth)<.08?'CENTERED':depth>0?'LEFT SIDE CLOSER':'RIGHT SIDE CLOSER';$('#source-tag').textContent=live?'LIVE CAMERA · ON-DEVICE TRACKING':'INTERACTIVE PREVIEW · SIMULATED SCENE';$('#frame-tag').textContent=live?`${hands.length} HAND${hands.length===1?'':'S'} TRACKED`:'NO CAMERA CONNECTED';$('#live-metric').textContent=live?(lastVision>0?`${Math.round(inferenceMs)} ms / inference${handBackend?` · ${handBackend}`:''}`:'Starting tracking…'):'YOUR CAMERA IS OFF';}
  requestAnimationFrame(render);
}
function drawHandSurface(rect:FrameRect,displayPose:FramePose,sourceRevision:string,displayOutline:readonly Point[],rectangleDecoration:boolean){
  const p=pixelRect(rect),tw=384,th=256;
  const layout=$<HTMLSelectElement>('#layout').value,source=generated??raw;
  const nextKey=`${style}:${layout}:${rectangleDecoration?'rectangle':'shaped'}:${generated?'still':`${sourceRevision}:${p.x},${p.y},${p.width},${p.height}`}`;
  // The image can stay cached while its position and perspective keep moving.
  if(textureSource!==source||textureKey!==nextKey){
    if(generated){textureCtx.clearRect(0,0,tw,th);textureCtx.drawImage(generated,0,0,tw,th);}
    else textureCtx.drawImage(raw,p.x,p.y,p.width,p.height,0,0,tw,th);
    if(!generated||style!==generatedStyle){const pixels=textureCtx.getImageData(0,0,tw,th);stylePixels(pixels.data,style,tw);textureCtx.putImageData(pixels,0,0);}
    if(layout==='postcard'&&rectangleDecoration){
      textureCtx.fillStyle='#e9e7d6';textureCtx.fillRect(0,0,tw,7);textureCtx.fillRect(0,th-25,tw,25);textureCtx.fillRect(0,0,7,th);textureCtx.fillRect(tw-7,0,7,th);
      textureCtx.fillStyle='#234039';textureCtx.font='9px monospace';textureCtx.fillText(generated?'AN AI STILL / JEDI MINDTRICK':'A MOMENT / JEDI MINDTRICK',14,th-10);
    }else if(layout==='cinema'){
      textureCtx.fillStyle='#050b0be6';textureCtx.fillRect(0,0,tw,th*.09);textureCtx.fillRect(0,th*.91,tw,th*.09);
    }
    if(rectangleDecoration){
      textureCtx.strokeStyle='#e4ddb9';textureCtx.lineWidth=1.5;textureCtx.strokeRect(1,1,tw-2,th-2);
      textureCtx.lineWidth=4;
      for(const [x,y,dx,dy] of [[2,2,1,1],[tw-2,2,-1,1],[2,th-2,1,-1],[tw-2,th-2,-1,-1]]){textureCtx.beginPath();textureCtx.moveTo(x+dx*12,y);textureCtx.lineTo(x,y);textureCtx.lineTo(x,y+dy*12);textureCtx.stroke();}
    }
    textureSource=source;textureKey=nextKey;
  }
  drawSurface(ctx,texture,displayPose,W,H,displayOutline);
  if(!rectangleDecoration){
    const boundary=mappedShape(displayPose.quad,displayOutline).map(p=>({x:p.x*W,y:p.y*H}));
    ctx.save();traceShape(ctx,boundary);ctx.clip();traceShape(ctx,boundary);ctx.strokeStyle=layout==='postcard'?'#e9e7d6':'#e4ddb9';ctx.lineWidth=layout==='postcard'?14:3;ctx.lineJoin='round';ctx.stroke();ctx.restore();
  }
}
function drawFrame(rect:FrameRect,styled:boolean){
  const p=pixelRect(rect),layout=$<HTMLSelectElement>('#layout').value;ctx.save();ctx.strokeStyle=styled?'#e4ddb9':'#c8f5a4';ctx.lineWidth=2;
  if(layout==='postcard'&&styled){ctx.fillStyle='#e9e7d6';ctx.fillRect(p.x-8,p.y-8,p.width+16,8);ctx.fillRect(p.x-8,p.y+p.height,p.width+16,27);ctx.fillRect(p.x-8,p.y,8,p.height);ctx.fillRect(p.x+p.width,p.y,8,p.height);ctx.fillStyle='#234039';ctx.font='10px monospace';ctx.fillText(generated?'AN AI STILL / JEDI MINDTRICK':'A MOMENT / JEDI MINDTRICK',p.x+5,p.y+p.height+17);}
  else {ctx.strokeRect(p.x,p.y,p.width,p.height);if(layout==='cinema'&&styled){ctx.fillStyle='#050b0bd9';ctx.fillRect(p.x,p.y,p.width,p.height*.09);ctx.fillRect(p.x,p.y+p.height*.91,p.width,p.height*.09);}}
  const len=15;ctx.lineWidth=4;for(const [x,y,dx,dy] of [[p.x,p.y,1,1],[p.x+p.width,p.y,-1,1],[p.x,p.y+p.height,1,-1],[p.x+p.width,p.y+p.height,-1,-1]]){ctx.beginPath();ctx.moveTo(x+dx*len,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*len);ctx.stroke();}ctx.restore();
}
void fetch('/api/config').then(r=>r.ok?r.json():null).then(config=>{aiEnabled=typeof config==='object'&&config!==null&&'aiEnabled' in config&&config.aiEnabled===true;}).catch(()=>{aiEnabled=false;});
requestAnimationFrame(render);
