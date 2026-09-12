import './style.css';
import './studio.css';
import type { FrameRect, Hand, LocalStyle, Mode, Point } from './contracts';
import { deriveFrame, PinchController, stylePixels } from './handframe';
import { blendInvisible, portalMask, scaleMask } from './effects/invisible';
import { addTrackedHands } from './effects/hand-mask';
import { PalmVisibility } from './vision/palm-visibility';
import { CameraPipeline } from './vision/camera';
import { handsForCameraDisplay } from './vision/camera-transform';
import { PhotoSlots, photoFit } from './photos';
import { PhotoPoseTracker } from './handframe/photo-pose';
import { PhotoReveal } from './handframe/photo-reveal';
import { installStudioDepth } from './studio-depth';
import { drawDemo, demoMask } from './demo';
import { PerspectiveTracker, projectFrame, type FramePose } from './handframe/perspective';
import { drawSurface, mappedShape, traceShape } from './handframe/surface';
import { shapePoints, type FrameShape } from './handframe/shapes';
import { installShapeEditor } from './handframe/shape-editor';
import { HandOutlineTracker } from './handframe/hand-outline';
import { WorldCycle } from './handframe/world-cycle';
import { installFullscreen } from './fullscreen';
import { installRecording } from './recording-ui';

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
<header class="topbar"><a class="brand" href="/" aria-label="GhostFrame home"><span class="brand-mark">⌑</span> GHOSTFRAME<span class="edition">YOUR HANDS. NEW DIMENSIONS.</span></a><a class="about-link" href="#how-it-works">How it works <span>↗</span></a></header>
<main>
  <section class="intro"><div><p class="eyebrow"><span></span> A SMALL EXPERIMENT IN THE IMPOSSIBLE</p><h1>Now you see me.<br><em>Now, imagine.</em></h1></div><p class="intro-note">Disappear into the room.<br> Hold another world in your hands.<br><span>Two camera effects. One playful studio.</span></p></section>
  <section class="playground" aria-label="Camera playground">
    <div class="studio"><div class="studio-heading"><div><span class="eyebrow">YOUR POCKET STUDIO</span><h2>Make room for <em>imagination.</em></h2></div><span class="orbital-mark" aria-hidden="true"><i></i><i></i><i></i></span></div>
      <div class="studio-bar"><div class="mode-tabs" role="group" aria-label="Choose an effect"><button class="active" data-mode="invisible" aria-pressed="true"><span>01</span> Invisible</button><button data-mode="handframe" aria-pressed="false"><span>02</span> HandFrame</button></div><div class="studio-actions" id="studio-actions"><button id="full-screen" class="screen-open" aria-expanded="false" aria-controls="camera-view">Full screen <span aria-hidden="true">⛶</span></button></div></div><div id="studio-status"></div>
      <div class="viewport" id="camera-view"><canvas id="scene" width="768" height="432" aria-label="Interactive simulated preview of the Invisible effect"></canvas><div class="viewport-top"><span id="source-tag">INTERACTIVE PREVIEW · SIMULATED SCENE</span><span id="frame-tag">NO CAMERA CONNECTED</span></div><div class="viewport-bottom"><div><span class="record-dot"></span><span id="effect-caption">A little less here.</span></div><span id="live-metric">YOUR CAMERA IS OFF</span></div><div id="countdown" hidden></div><div class="screen-actions" role="group" aria-label="Full screen controls"><span id="screen-notice" role="status">Esc to return</span><button id="camera-only" aria-pressed="false">Just camera</button><button id="fill-screen" aria-pressed="false">Fill view</button><button id="exit-screen">Exit full screen <span aria-hidden="true">✕</span></button></div><span id="screen-camera-state">Simulated preview · Camera off</span></div>
      <div id="recording-home"><section id="recording-dock" aria-label="Record your GhostFrame"></section></div>
      <div class="studio-footer"><span id="gesture-help">Open palm: visible. Slowly close your hand to disappear. Open it again to return.</span><button id="reset" class="text-button">Reset effect ↺</button></div>
    </div>
    <aside class="controls" aria-label="Effect controls">
      <div class="control-title"><span class="eyebrow">DESIGN YOUR NEXT DIMENSION</span><span class="tiny-star" aria-hidden="true">✳</span></div>
      <div id="camera-dock"><div class="camera-actions"><label class="camera-picker" for="camera-facing"><span>Camera</span><select id="camera-facing"><option value="user">Front · selfie</option><option value="environment">Back · world</option></select></label><button class="primary" id="start-camera">Start your camera <span>↗</span></button><button id="stop-camera" class="secondary" hidden>Stop camera</button></div></div>
      <div id="status-dock"><p id="status" class="status" role="status">Explore the simulated preview, or turn on your camera when you’re ready.</p></div>
      <div id="invisible-controls">
        <div class="section-label"><span>01 / SAVE THE ROOM</span><span id="background-state">PREVIEW READY</span></div>
        <button id="capture-background" class="secondary full">Capture empty background <span>5s</span></button><p class="hint">Step out of view. Keep the camera still. Recapture whenever the room or camera changes.</p>
        <div class="section-label"><span>02 / DISAPPEAR</span><output id="fade-value">0%</output></div>
        <div class="segmented" role="group" aria-label="Visibility"><button data-fade="0" class="active" aria-pressed="true">Visible</button><button data-fade="55" aria-pressed="false">Ghost</button><button data-fade="100" aria-pressed="false">Hidden</button></div>
        <p class="hint">Start with an open palm facing the camera. Slowly close your fingers to fade out; open them to come back. Your hand fades with you.</p><label class="sr-only" for="fade">Amount of invisibility</label><input id="fade" type="range" min="0" max="100" value="0">
        <label class="switch-row"><span>Framed invisibility portal<small>Hide only what’s inside the frame.</small></span><input id="portal" type="checkbox"></label>
      </div>
      <div id="handframe-controls" hidden><section class="photo-controls" aria-label="Your pictures"><div class="section-label"><span>01 / HOLD A PICTURE</span><span>ON YOUR DEVICE</span></div>
        <div class="source-choices" role="group" aria-label="Frame content"><button data-source="filters" class="active" aria-pressed="true">Color worlds</button><button data-source="photos" aria-pressed="false">My pictures</button></div>
        <div class="photo-slots">${[0,1].map(index=>`<article class="photo-card" data-photo-card="${index}"><button class="photo-select" data-photo-select="${index}" aria-label="Use picture ${index+1}" aria-pressed="false" disabled><span class="photo-number">0${index+1}</span><img id="photo-preview-${index}" alt="Picture ${index+1} preview" hidden><span class="photo-placeholder" aria-hidden="true"><i></i><b>Picture ${index+1}</b></span><span class="photo-current" hidden>In your hands</span></button><div class="photo-card-actions"><button data-photo-load="${index}">Add picture ${index+1}</button><button data-photo-clear="${index}" aria-label="Remove picture ${index+1}" hidden>✕</button></div><input id="photo-file-${index}" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" hidden></article>`).join('')}</div>
        <p id="photo-status" class="hint" role="status">Add one or two pictures. Open your hands to reveal one; bring your palms together and reopen to switch.</p>
        <div class="photo-options"><button id="next-photo" class="secondary" disabled>Next picture ↗</button><label for="photo-fit">Picture movement<select id="photo-fit"><option value="reveal">Open to full view</option><option value="contain">Fit between hands</option><option value="stretch">Stretch with hands</option></select></label></div><p id="photo-view-help" class="hint">Open your hands to enlarge the whole picture. Original proportions, with no cinema bars.</p><label id="one-hand-option" class="switch-row" hidden><span>One-hand full picture<small>Back camera · open your palm to reveal; close it to hide.</small></span><input id="one-hand-photo" type="checkbox"></label><p class="hint photo-privacy">Pictures stay in this tab. Add them again after a refresh. Choose them before starting your camera.</p>
        </section>
        <section class="world-controls" aria-label="Choose your world"><div class="section-label"><span>02 / COLOR WORLDS</span><span>LOCAL FILTER</span></div>
        <p class="hint wide-view-hint">Whole camera view · Keep both hands inside the picture. Full screen opens an even larger view without cropping the sides.</p><div class="styles" role="group" aria-label="Visual style">${WORLDS.map(world=>`<button data-style="${world.id}" class="${world.id==='dream'?'active':''}" aria-pressed="${world.id==='dream'}"><i class="swatch ${world.id}" aria-hidden="true"></i>${world.name}</button>`).join('')}</div>
        </section><section class="hand-design-controls" aria-label="Shape with your hands"><div class="section-label"><span id="hand-control-heading">03 / SHAPE IT WITH YOUR HANDS</span><span>AUTOMATIC</span></div>
        <label class="switch-row"><span>Follow my hands<small id="follow-hands-help">Your thumbs and index fingers draw the outline—even with one L upside down.</small></span><input id="follow-hands" type="checkbox" checked></label>
        <p class="hint" id="hand-shape-state" role="status">Start your camera to form a shape with both hands.</p>
        <p class="hint" id="world-cycle-state">Open both hands to start. Bring your palms together, then reopen for the next color.</p>
        <p class="hint" id="hand-design-hint">Shape the opening with your thumbs and index fingers. Both L shapes can point up, or turn one upside down to connect opposite corners. To change colors, bring your palms together until the cue appears, then reopen. Keep both hands in view; touching fingertips alone keeps your current world.</p>
        <details id="manual-shapes"><summary>Saved shapes & drawing</summary><div class="section-label"><span>OPTIONAL FIXED OUTLINE</span><span id="shape-name">RECTANGLE</span></div>
        <div class="shape-choices" role="group" aria-label="Frame shape">${SHAPES.map(s=>`<button data-shape="${s.id}" aria-pressed="${s.id==='rectangle'}" class="${s.id==='rectangle'?'active':''}"><span aria-hidden="true">${s.icon}</span>${s.name}</button>`).join('')}</div>
        <button id="custom-shape" class="secondary full" aria-expanded="false" aria-controls="shape-editor">Draw a custom shape <span aria-hidden="true">✎</span></button>
        <div id="shape-editor" hidden></div>
        <p class="hint">Choosing a saved outline turns off Follow my hands. Turn it back on to shape the picture directly with your fingers.</p></details>
        <label class="select-row" for="layout">Frame layout<select id="layout"><option value="outline">Floating outline</option><option value="postcard">Postcard</option><option value="cinema">Cinema</option></select></label>
        <p class="hint" id="style-note">Instant color effects, processed on your device.</p></section>
        <div class="depth-controls"><div class="section-label"><span>04 / MOVE IN 3D</span><output id="depth-state">READY TO STRETCH</output></div>
        <button id="center-depth" class="secondary full">Center depth <span>↔</span></button>
        <p class="hint">Hold both hands side by side, palms toward the camera. Center depth, then push one hand forward and pull the other back. Your outline also follows the way you lift and turn your hands.</p>
        <p class="hint muted">Depth is estimated from hand size. Keep your palms facing the camera for steadier control.</p></div>
        <section class="still-controls" aria-label="Optional AI still"><div class="section-label"><span>05 / MAKE AN AI STILL</span><span>OPTIONAL UPLOAD</span></div>
        <button id="capture-still" class="secondary full">Prepare a still <span>⌑</span></button><p class="hint">Use this button to prepare a crop while shaping with your hands. Sending it to Cloudflare AI is a separate step.</p>
        <div id="still-panel" hidden><img id="still-preview" alt="Your selected frozen crop"><p id="still-status" class="hint" role="status">Only this selected crop will be sent.</p><button class="primary full" id="send-still" disabled>Send still to AI ↗</button><button id="clear-still" class="text-button">Clear still</button></div></section>
      </div>
      <div class="manual-controls"><label class="switch-row"><span>Mouse & keyboard controls<small>Drag the frame. Use the slider to resize.</small></span><input id="manual" type="checkbox" checked></label><label class="sr-only" for="frame-size">Frame size</label><input id="frame-size" type="range" min="22" max="70" value="44"><div id="perspective-controls" hidden>
        <label class="select-row" for="frame-depth">3D stretch <output id="frame-depth-value">Centered</output></label><input id="frame-depth" type="range" min="-100" max="100" value="0"><div class="range-ends"><span>Right closer</span><span>Left closer</span></div>
        <label class="select-row" for="frame-roll">Tilt <output id="frame-roll-value">0°</output></label><input id="frame-roll" type="range" min="-22" max="22" value="0">
        <p class="hint" id="perspective-manual-hint">Try the depth and tilt sliders, or use both hands with the camera.</p></div></div>
    </aside>
  </section>
  <section id="how-it-works" class="notes"><article><span>01 / A CAMERA ILLUSION</span><h2>Leave a little mystery.</h2><p>Invisible blends your captured room into your silhouette. A steady camera and even lighting give it the best chance to work.</p></article><article><span>02 / FRAME YOUR IMAGINATION</span><h2>Your hands, the viewfinder.</h2><p>Form an opening with both thumbs and index fingers. The picture follows its outline as you move. Bring one hand closer for perspective. Bring both hands together and reopen to change worlds.</p></article><article><span>03 / ON YOUR TERMS</span><h2>Local until you say so.</h2><p>Live camera frames stay in your browser. AI rendering sends only your selected still. No accounts or microphone. Record a clip only when you tap Record; save it directly from your browser.</p></article></section>
</main><footer><span>GHOSTFRAME <span class="muted">/ Built by Cruz G.</span></span><span>Hand tracking + a little imagination.</span><a href="https://github.com/recruiting-gains/ai-builds-showcase/tree/main/ghostframe" target="_blank" rel="noopener noreferrer">Explore the source ↗</a></footer>`;

const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const worldCue=document.createElement('span');worldCue.id='world-gesture';worldCue.className='world-gesture';worldCue.setAttribute('role','status');worldCue.hidden=true;$('#camera-view').append(worldCue);
const scene=$<HTMLCanvasElement>('#scene'),ctx=scene.getContext('2d')!;
const raw=document.createElement('canvas');raw.width=scene.width;raw.height=scene.height;
const rawCtx=raw.getContext('2d',{willReadFrequently:true})!;
const bgCanvas=document.createElement('canvas');bgCanvas.width=scene.width;bgCanvas.height=scene.height;
const W=scene.width,H=scene.height;
const texture=document.createElement('canvas');texture.width=384;texture.height=256;
const textureCtx=texture.getContext('2d',{willReadFrequently:true})!;
let textureSource:ImageBitmap|HTMLCanvasElement|null=null,textureKey='';
const photos=new PhotoSlots();
const photoReveal=new PhotoReveal();
const photoPoseTracker=new PhotoPoseTracker();
let trackedPhotoPose:FramePose|null=null;
let photoAperture:{frame:FrameRect;outline:Point[];pose:FramePose;measuredAt:number;aspect:number}|null=null;
let photoMeasuredAt=0,holdingPhotoAperture=false;
let photoRevealAmount:number|null=null;
let contentMode:'filters'|'photos'='filters';
let cameraFacing:'user'|'environment'='user';
const photoLoads=[0,0];
let mode:Mode='invisible',style:LocalStyle='dream',fade=0,targetFade=0,portal=false,manual=true,live=false;
let shape:FrameShape='rectangle',customOutline=shapePoints('rectangle'),outline=shapePoints(shape),cameraOnly=false;
let handFollowing=true,handOutline:Point[]|null=null;
let worldNoticeUntil=0;
let focusView:ReturnType<typeof installFullscreen>|null=null;
let recording:ReturnType<typeof installRecording>|null=null;
let background:ImageData|null=null,mask:Float32Array|null=null,hands:Hand[]=[],lastVision=0,inferenceMs=0;
let handBackend='';
let frame:FrameRect|null=null,lastGoodFrame:FrameRect|null=null,lastGoodAt=0;
let manualFrame:FrameRect={x:.28,y:.23,width:.44,height:.54};
let calibration:ReturnType<typeof setInterval>|null=null;
let prepared:{image:string;requestId:string;createdAt:number;style:LocalStyle}|null=null,generated:ImageBitmap|null=null,generatedURL:string|null=null;
let generatedStyle:LocalStyle|null=null;
let aiEnabled=false,renderAbort:AbortController|null=null,renderGeneration=0;
const pinch=new PinchController(),palm=new PalmVisibility(),perspective=new PerspectiveTracker(),handShape=new HandOutlineTracker(),worldCycle=new WorldCycle();
let personMask:Float32Array|null=null,lastMaskAt=0;
let pose:FramePose|null=null,manualDepth=0,manualRoll=0;
const status=(message:string)=>{$('#status').textContent=message;};
const pipeline=new CameraPipeline(result=>{
  hands=handsForCameraDisplay(result.hands,pipeline.mirrored);lastVision=result.timestamp;inferenceMs=result.inferenceMs;handBackend=result.handBackend??'';
  const automatic=automaticShaping(),aspect=result.aspectRatio??W/H;
  photoRevealAmount=automatic&&wholePhotoView()&&!cameraOnly?photoReveal.update(hands,result.timestamp,oneHandPhotoEnabled()?'one':'two',aspect):null;
  if(photoRevealAmount!==null&&(hands.length===2||oneHandPhotoEnabled()))photoMeasuredAt=result.timestamp;
  if(!automatic||!wholePhotoView()||cameraOnly)photoReveal.reset();
  if(automatic){const formed=handShape.update(hands,result.timestamp,aspect);frame=formed?.rect??null;handOutline=formed?.outline??null;}
  else{handOutline=null;frame=deriveFrame(hands,frame);}
  pose=mode==='handframe'?perspective.update(hands,frame,result.timestamp,automatic,aspect):null;
  // The measured contour already includes the hands' screen-space tilt.
  // Apply only the stylized depth warp to avoid rotating that outline twice.
  if(automatic&&pose&&frame)pose=projectFrame(frame,pose.depth,0);
  // Update filtered photo corners once per camera result, not every paint.
  // Valid measured outlines remain required for the fitted-photo path.
  holdingPhotoAperture=false;
  if(automatic&&contentMode==='photos'&&!wholePhotoView()&&!cameraOnly){
    if(photoAperture&&Math.abs(photoAperture.aspect-aspect)>.001){photoPoseTracker.reset();photoAperture=null;trackedPhotoPose=null;}
    trackedPhotoPose=photoPoseTracker.update(hands,result.timestamp,pose?.depth??trackedPhotoPose?.depth??0);
    if(frame&&handOutline&&pose&&trackedPhotoPose){
      photoAperture={frame,outline:handOutline,pose,measuredAt:result.timestamp,aspect};
    }else if(hands.length<2&&trackedPhotoPose&&photoAperture&&result.timestamp-photoAperture.measuredAt<=150){
      // Hold only the last valid measured drawing through a short omission.
      // Gesture cycling still receives the current, unheld detector results.
      frame=photoAperture.frame;handOutline=photoAperture.outline;pose=photoAperture.pose;holdingPhotoAperture=true;
    }else{photoAperture=null;photoPoseTracker.reset();trackedPhotoPose=null;}
  }else{photoPoseTracker.reset();trackedPhotoPose=null;photoAperture=null;}
  if(frame){lastGoodFrame=frame;lastGoodAt=lastVision;}
  if(result.mask&&result.maskWidth&&result.maskHeight){
    const next=scaleMask(result.mask,result.maskWidth,result.maskHeight,W,H,pipeline.mirrored);
    if(personMask&&personMask.length===next.length)for(let i=0;i<next.length;i++)next[i]=next[i]*.9+personMask[i]*.1;
    personMask=next;lastMaskAt=result.timestamp;
  }
  if(mode==='invisible')mask=personMask?addTrackedHands(personMask,W,H,hands):null;
  if(mode==='invisible'&&!portal&&!calibration){const amount=palm.update(hands,result.timestamp,aspect);if(amount!==null)setFade(amount*100);}
  if(automatic&&!cameraOnly&&!oneHandPhotoEnabled()){if(worldCycle.update(hands,result.timestamp,aspect)){nextContent();worldNoticeUntil=performance.now()+1400;}}else worldCycle.reset();
  syncWorldCue();
  if(mode==='handframe'&&!handFollowing){
    const action=pinch.update(hands,result.timestamp);
    if(action==='next-style')nextContent();
    if(action==='capture'&&lastGoodFrame&&lastVision-lastGoodAt<1000)captureStill(lastGoodFrame);
  }else if(mode==='handframe')pinch.reset();
},(message,active)=>{
  live=active;status(message);
  if(!active)recording?.stop('Camera paused. Your clip is ready to save.');
  recording?.refresh();
  const pending=message.includes('Loading')||message.includes('Waiting');
  $<HTMLSelectElement>('#camera-facing').disabled=pending;
  if(active){cameraFacing=pipeline.facing;$<HTMLSelectElement>('#camera-facing').value=cameraFacing;}
  $('#stop-camera').hidden=!active&&!pending;
  $<HTMLButtonElement>('#start-camera').disabled=active||pending;
  $<HTMLButtonElement>('#capture-background').disabled=pending;
  $<HTMLButtonElement>('#capture-still').disabled=pending;
  if(active){manual=false;$<HTMLInputElement>('#manual').checked=false;$('#background-state').textContent='NOT CAPTURED';}
  else{resetPerspective();hands=[];mask=null;personMask=null;lastMaskAt=0;frame=null;background=null;targetFade=fade=0;palm.reset();pinch.reset();if(!pending){manual=true;$<HTMLInputElement>('#manual').checked=true;if(focusView?.active)void focusView.exit();}}
  syncManualControls();
});

function oneHandPhotoEnabled(){return handFollowing&&mode==='handframe'&&contentMode==='photos'&&cameraFacing==='environment'&&$<HTMLInputElement>('#one-hand-photo').checked;}
function wholePhotoView(){return handFollowing&&contentMode==='photos'&&(oneHandPhotoEnabled()||$<HTMLSelectElement>('#photo-fit').value==='reveal');}
function resetPhotoReveal(){photoReveal.reset();photoRevealAmount=null;photoMeasuredAt=0;photoPoseTracker.reset();trackedPhotoPose=null;photoAperture=null;holdingPhotoAperture=false;}
function automaticShaping(){return mode==='handframe'&&handFollowing&&live&&!manual;}
function resetWorldCycle(){worldCycle.reset();worldNoticeUntil=0;syncWorldCue();}
function resetPerspective(){resetPhotoReveal();resetWorldCycle();photoPoseTracker.reset();trackedPhotoPose=null;pose=null;frame=null;lastGoodFrame=null;perspective.reset();handShape.reset();handOutline=null;}
function syncWorldCue(now=performance.now()){
  if(oneHandPhotoEnabled()){const message=!live?'Start the back camera. Open one palm to reveal your full picture.':manual?'Turn off mouse controls to reveal your picture with one palm.':cameraOnly?'Show effects to reveal your picture.':'Open one palm to reveal the whole picture. Close it to hide. Use Next picture to switch.';$('#world-cycle-state').textContent=message;worldCue.hidden=true;return;}
  const active=automaticShaping()&&!cameraOnly,phase=worldCycle.status;
  const subject=contentMode==='photos'?'picture':'color';
  const message=!live?'Start your camera, then open both hands to begin.':!handFollowing||manual?'Turn on Follow my hands and turn off mouse controls to change colors with your palms.':cameraOnly?'Show effects to change colors with your palms.':phase==='waiting-open'?'Show both hands apart to begin. If tracking was lost, open to reset, then bring your palms together again.':phase==='open'?'Ready · palms together, then reopen for the next color.':phase==='reacquiring'?'Keep both hands in view as you bring your palms together.':phase==='closing'?'Bring your palms together briefly…':phase==='closed'?'Hands together · reopen for the next color.':'Reopen both hands now for the next color.';
  const contentMessage=message.replaceAll('colors',contentMode==='photos'?'pictures':'colors').replaceAll('next color',`next ${subject}`);
  const hint=$('#world-cycle-state');if(hint.textContent!==contentMessage)hint.textContent=contentMessage;
  const pending=phase==='closed'||phase==='closing'||phase==='occluded'||phase==='reacquiring';
  const notice=pending?contentMessage:now<worldNoticeUntil?`${contentMode==='photos'?photos.current?`Picture ${photos.selected+1}`:'Add a picture':worldName(style)} · keep creating`:'';
  worldCue.hidden=!active||!notice;
  if(worldCue.textContent!==notice)worldCue.textContent=notice;
}
function syncGestureHelp(){$('#gesture-help').textContent=mode==='invisible'?'Open palm: visible. Slowly close your hand to disappear. Open it again to return.':handFollowing?'Form an opening with both L-shaped hands—even with one upside down. Open to design. Bring both hands together, then reopen for the next world.':'Push one hand forward, pull the other back. Lift to tilt. Quick pinch: style. Hold 0.6s: prepare a still.';if(mode==='handframe'&&contentMode==='photos')$('#gesture-help').textContent=oneHandPhotoEnabled()?'Open one palm to reveal the full picture. Close it to hide. Tap Next picture to switch.':wholePhotoView()?'Open both hands apart to reveal the whole picture. Palms together, then reopen to switch pictures.':'Open the space between your thumbs and index fingers to shape your picture. Palms together, then reopen to switch pictures.';}
function setHandFollowing(value:boolean){handFollowing=value;$<HTMLInputElement>('#follow-hands').checked=value;resetPerspective();pinch.reset();if(value&&live){manual=false;$<HTMLInputElement>('#manual').checked=false;}syncManualControls();syncPhotos();}
function setShape(value:FrameShape){setHandFollowing(false);shape=value;outline=shapePoints(value,customOutline);$('#shape-name').textContent=value==='custom'?'CUSTOM':SHAPES.find(s=>s.id===value)!.name.toUpperCase();document.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach(b=>{b.classList.toggle('active',b.dataset.shape===value);b.setAttribute('aria-pressed',String(b.dataset.shape===value));});$('#custom-shape').classList.toggle('active',value==='custom');}
function syncManualControls(){const disabled=live&&!manual;for(const id of ['#frame-depth','#frame-roll','#frame-size'])$<HTMLInputElement>(id).disabled=disabled;$('#perspective-manual-hint').textContent=disabled?'Your hands control depth and tilt. Enable mouse controls to use these sliders.':'Try the depth and tilt sliders, or use both hands with the camera.';}
function centerDepth(){perspective.recenter();pose=null;manualDepth=manualRoll=0;$<HTMLInputElement>('#frame-depth').value='0';$<HTMLInputElement>('#frame-roll').value='0';$('#frame-depth-value').textContent='Centered';$('#frame-roll-value').textContent='0°';}
function resetCalibration(){if(calibration)clearInterval(calibration);calibration=null;$('#countdown').hidden=true;}
function clearStill(){renderGeneration++;renderAbort?.abort();renderAbort=null;prepared=null;generated?.close();generated=null;generatedStyle=null;textureSource=null;textureKey='';if(generatedURL)URL.revokeObjectURL(generatedURL);generatedURL=null;$('#still-panel').hidden=true;$<HTMLImageElement>('#still-preview').removeAttribute('src');setStyle(style);}
function stopCamera(message='Camera off. The simulated preview is ready.'){recording?.stop();if(focusView?.active)void focusView.exit();pipeline.stop();resetPerspective();live=false;recording?.refresh();hands=[];mask=null;personMask=null;lastMaskAt=0;background=null;frame=null;lastGoodFrame=null;lastVision=0;targetFade=fade=0;manual=true;$<HTMLInputElement>('#manual').checked=true;resetCalibration();clearStill();palm.reset();pinch.reset();$('#stop-camera').hidden=true;$<HTMLButtonElement>('#start-camera').disabled=false;$<HTMLSelectElement>('#camera-facing').disabled=false;$<HTMLButtonElement>('#capture-background').disabled=false;$<HTMLButtonElement>('#capture-still').disabled=false;$('#background-state').textContent='PREVIEW READY';setFade(0);syncManualControls();status(message);}
function setFade(value:number){if(live&&!background&&value>0){status('Capture the empty background before disappearing.');return;}targetFade=value/100;$<HTMLInputElement>('#fade').value=String(value);$('#fade-value').textContent=`${Math.round(value)}%`;document.querySelectorAll<HTMLButtonElement>('[data-fade]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.fade)===value);b.setAttribute('aria-pressed',String(Number(b.dataset.fade)===value));});}
function nextWorld(){const list=WORLDS.map(world=>world.id);setStyle(list[(list.indexOf(style)+1)%list.length]);}
function nextContent(){if(contentMode==='photos'){photos.next();syncPhotos();}else nextWorld();}
function syncPhotos(){
  for(let index=0;index<2;index++){
    const asset=photos.slots[index],preview=$<HTMLImageElement>(`#photo-preview-${index}`),card=$(`[data-photo-card="${index}"]`);
    const select=$<HTMLButtonElement>(`[data-photo-select="${index}"]`),active=contentMode==='photos'&&photos.selected===index&&!!asset;
    select.disabled=!asset;select.setAttribute('aria-pressed',String(active));card.classList.toggle('selected',active);
    preview.hidden=!asset;if(asset&&preview.src!==asset.preview)preview.src=asset.preview;else if(!asset)preview.removeAttribute('src');
    card.querySelector<HTMLElement>('.photo-placeholder')!.hidden=!!asset;card.querySelector<HTMLElement>('.photo-current')!.hidden=!active;
    $(`[data-photo-clear="${index}"]`).hidden=!asset;$(`[data-photo-load="${index}"]`).textContent=asset?'Change picture':`Add picture ${index+1}`;
  }
  $<HTMLButtonElement>('#next-photo').disabled=photos.count<2;
  document.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(button=>{const selected=button.dataset.source===contentMode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  $('.photo-controls').classList.toggle('photo-mode',contentMode==='photos');
  if(mode==='handframe')$('#effect-caption').textContent=contentMode==='photos'?(photos.current?`Picture ${photos.selected+1} · In your hands.`:'Add a picture to open a new world.'):`${worldName(style)} · A world within reach.`;
  $('.still-controls').hidden=contentMode==='photos';
  $('#one-hand-option').hidden=cameraFacing!=='environment';
  $<HTMLSelectElement>('#photo-fit').disabled=oneHandPhotoEnabled();
  $('#photo-view-help').textContent=wholePhotoView()?'The whole picture grows into the camera view at its original proportions. No cropping or cinema bars.':$<HTMLSelectElement>('#photo-fit').value==='contain'?'Keep the whole picture inside your hand opening. Use Open to full view for a bigger picture.':'Stretch and tilt the picture with your fingers. Use Open to full view to keep its original proportions.';
  const whole=wholePhotoView(),one=oneHandPhotoEnabled();
  $('.depth-controls').hidden=whole;
  $('#perspective-controls').hidden=mode!=='handframe'||whole;
  $('#hand-control-heading').textContent=whole?'03 / CONTROL YOUR PICTURE':'03 / SHAPE IT WITH YOUR HANDS';
  $('#follow-hands-help').textContent=whole?(one?'Your palm opens and closes the full picture.':'Your hands open and close the full picture.'):'Your thumbs and index fingers draw the outline—even with one L upside down.';
  $('#hand-design-hint').textContent=whole?(one?'Face one open palm toward the back camera. Close it to hide the picture; reopen to reveal it. Next picture switches images.':'Open both hands apart to enlarge the whole picture. Bring your palms together until the cue appears, then reopen to switch. Select Fit between hands or Stretch with hands for a shaped window.'):'Shape the opening with your thumbs and index fingers. Both L shapes can point up, or turn one upside down to connect opposite corners. To change worlds, bring your palms together until the cue appears, then reopen. Keep both hands in view; touching fingertips alone keeps your current world.';
  syncGestureHelp();
}
function photoReadyMessage(){return (photos.count===2?'Both pictures ready. ':'Picture ready. ')+(oneHandPhotoEnabled()?'Open one palm to reveal. Use Next picture to switch.':photos.count===2?'Open your hands, bring your palms together, then reopen to switch.':'Add a second picture to switch between them with your hands.');}
function setContent(value:'filters'|'photos'){const changed=contentMode!==value;contentMode=value;resetWorldCycle();if(changed)resetPhotoReveal();if(changed)clearStill();syncGestureHelp();syncPhotos();}
function setStyle(value:LocalStyle){style=value;if(mode==='handframe')$('#effect-caption').textContent=`${worldName(style)} · A world within reach.`;document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b=>{b.classList.toggle('active',b.dataset.style===value);b.setAttribute('aria-pressed',String(b.dataset.style===value));});$('#style-note').textContent=WORLDS.find(world=>world.id===value)!.note+(generated&&value!==generatedStyle?' Applied locally to your AI still.':'');if(contentMode==='photos')syncPhotos();}
function setMode(value:Mode){mode=value;
  document.body.classList.toggle('handframe-mode',value==='handframe');
  if(value==='handframe'){$('#studio-actions').prepend($('.camera-actions'));$('#studio-status').append($('#status'));}
  else{$('#camera-dock').append($('.camera-actions'));$('#status-dock').append($('#status'));}
palm.reset();pinch.reset();frame=null;resetPerspective();if(live)void pipeline.infer(performance.now(),mode==='invisible');document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===value);b.setAttribute('aria-pressed',String(b.dataset.mode===value));});$('#invisible-controls').hidden=value!=='invisible';$('#handframe-controls').hidden=value!=='handframe';$('#perspective-controls').hidden=value!=='handframe';syncGestureHelp();$('#effect-caption').textContent=value==='invisible'?'A little less here.':`${worldName(style)} · A world within reach.`;scene.setAttribute('aria-label',`${live?'Live camera':'Simulated'} ${value} effect. Use the adjacent controls to interact.`);syncPhotos();}
function activeFrame(){return manual||!live?manualFrame:frame;}
function pixelRect(rect:FrameRect){return {x:Math.max(0,Math.round(rect.x*W)),y:Math.max(0,Math.round(rect.y*H)),width:Math.max(1,Math.min(Math.round(rect.width*W),W-Math.round(rect.x*W))),height:Math.max(1,Math.min(Math.round(rect.height*H),H-Math.round(rect.y*H)))};}

function captureStill(rect=activeFrame()){
  if(contentMode==='photos'){status('Switch to Color worlds to prepare a camera still. Your pictures stay local.');return;}
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
focusView=installFullscreen($('#camera-view'),$<HTMLButtonElement>('#full-screen'),active=>{const dock=$('#recording-dock');(active?$('#camera-view'):$('#recording-home')).append(dock);try{dock.inert=false;}catch{/* Fullscreen fallback also supports hosts without inert. */}dock.removeAttribute('aria-hidden');if(!active){cameraOnly=false;$('#camera-only').setAttribute('aria-pressed','false');$('#camera-only').textContent='Just camera';}});
recording=installRecording(scene,$('#recording-dock'),()=>live);
$('#camera-only').addEventListener('click',()=>{cameraOnly=!cameraOnly;resetWorldCycle();$('#camera-only').setAttribute('aria-pressed',String(cameraOnly));$('#camera-only').textContent=cameraOnly?'Show effects':'Just camera';});
$('#start-camera').addEventListener('click',()=>{stopCamera('Starting camera…');$('#stop-camera').hidden=false;void pipeline.start(cameraFacing);});
$('#stop-camera').addEventListener('click',()=>stopCamera());
$<HTMLSelectElement>('#camera-facing').addEventListener('change',()=>{const wasLive=live;cameraFacing=$<HTMLSelectElement>('#camera-facing').value as 'user'|'environment';stopCamera(wasLive?'Switching camera…':`${cameraFacing==='user'?'Front':'Back'} camera selected. Tap Start your camera.`);syncPhotos();if(wasLive)void pipeline.start(cameraFacing);});
document.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(button=>button.addEventListener('click',()=>setContent(button.dataset.source as 'filters'|'photos')));
for(let index=0;index<2;index++){
  const input=$<HTMLInputElement>(`#photo-file-${index}`);
  $(`[data-photo-load="${index}"]`).addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];input.value='';if(!file)return;
    const revision=++photoLoads[index];$('#photo-status').textContent=`Opening picture ${index+1} on your device…`;
    try{if(await photos.load(index,file)){setContent('photos');$('#photo-status').textContent=photoReadyMessage();}}
    catch(error){if(revision===photoLoads[index])$('#photo-status').textContent=error instanceof Error?error.message:'The picture could not load. Try another one.';}
    syncPhotos();
  });
  $(`[data-photo-select="${index}"]`).addEventListener('click',()=>{photos.select(index);setContent('photos');});
  $(`[data-photo-clear="${index}"]`).addEventListener('click',()=>{++photoLoads[index];photos.remove(index);resetWorldCycle();syncPhotos();$('#photo-status').textContent='Picture removed from this tab. Add another whenever you like.';});
}
$<HTMLSelectElement>('#photo-fit').addEventListener('change',()=>{resetPhotoReveal();syncPhotos();});
$<HTMLInputElement>('#one-hand-photo').addEventListener('change',()=>{resetPerspective();if($<HTMLInputElement>('#one-hand-photo').checked){setContent('photos');setHandFollowing(true);}syncPhotos();if(photos.count)$('#photo-status').textContent=photoReadyMessage();});
$('#next-photo').addEventListener('click',()=>{contentMode='photos';photos.next();resetWorldCycle();syncPhotos();});
installStudioDepth(document.querySelectorAll<HTMLElement>('.photo-card'));

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode as Mode)));
document.querySelectorAll<HTMLButtonElement>('[data-fade]').forEach(b=>b.addEventListener('click',()=>setFade(Number(b.dataset.fade))));
$<HTMLInputElement>('#fade').addEventListener('input',e=>setFade(Number((e.target as HTMLInputElement).value)));
document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b=>b.addEventListener('click',()=>{setContent('filters');setStyle(b.dataset.style as LocalStyle);}));
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
  if(live&&pipeline.video.readyState>=2){rawCtx.save();if(pipeline.mirrored){rawCtx.translate(W,0);rawCtx.scale(-1,1);}rawCtx.drawImage(pipeline.video,0,0,W,H);rawCtx.restore();}
  else drawDemo(rawCtx,reducedMotion?0:now);
  if(live&&now-lastVision>1000){hands=[];frame=null;resetPerspective();palm.reset();pinch.reset();}
  syncWorldCue(now);
  ctx.drawImage(raw,0,0);
  const r=holdingPhotoAperture&&photoAperture&&now-photoAperture.measuredAt>150?null:activeFrame();
  if(focusView?.active&&cameraOnly){/* Clean camera view keeps the selected effect ready to restore. */}
  else if(mode==='invisible'){
    fade=reducedMotion?targetFade:fade+(targetFade-fade)*.65;
    if(Math.abs(fade-targetFade)<.004)fade=targetFade;
    let bg=background;
    if(!live){const b=bgCanvas.getContext('2d',{willReadFrequently:true})!;drawDemo(b,reducedMotion?0:now,false);bg=b.getImageData(0,0,W,H);}
    const currentMask=portal?(r?portalMask(W,H,r):null):live?(now-lastMaskAt<800?mask:null):simulatedMask;
    if(bg&&currentMask&&fade>.001){const source=rawCtx.getImageData(0,0,W,H);ctx.putImageData(new ImageData(new Uint8ClampedArray(blendInvisible(source.data,bg.data,currentMask,fade)),W,H),0,0);}
    if(portal&&r)drawFrame(r,false);
  }else if(wholePhotoView()&&photos.current){
    const missingExpired=!oneHandPhotoEnabled()&&hands.length<2&&now-photoMeasuredAt>150;
    const amount=manual||!live?1:missingExpired?0:photoRevealAmount??0;
    if(amount>.01)drawWholePhoto(amount);
  }else if(r&&(contentMode!=='photos'||photos.current)){
    const displayPose=manual||!live?projectFrame(r,manualDepth,manualRoll):pose;
    const automatic=automaticShaping(),displayOutline=automatic?handOutline:outline;
    if(displayPose&&displayOutline){
      const photoPose=contentMode==='photos'&&automatic?trackedPhotoPose:null;
      if(photoPose){
        // A photo's own corners follow the fingertips. The measured finger chains
        // remain the outer clip, so curved shapes do not paint over the hands.
        ctx.save();traceShape(ctx,displayOutline.map(p=>({x:(r.x+p.x*r.width)*W,y:(r.y+p.y*r.height)*H})));ctx.clip();
        drawHandSurface(r,photoPose,'local-photo',shapePoints('rectangle'),false);ctx.restore();
      }else if(contentMode!=='photos'||!automatic)drawHandSurface(r,displayPose,live?`camera:${pipeline.video.currentTime}`:`preview:${reducedMotion?0:now}`,displayOutline,!automatic&&shape==='rectangle');
    }
  }
  if(now-lastMetric>400){lastMetric=now;$('#screen-camera-state').hidden=live;$('#hand-shape-state').textContent=wholePhotoView()&&live&&!manual?(photoRevealAmount===null?(oneHandPhotoEnabled()?'Show one open palm to the back camera.':'Show both hands and open them apart.'):(photoRevealAmount<.05?'Picture hidden · open to reveal.':'Whole picture · '+Math.round(photoRevealAmount*100)+'% open')):!handFollowing?'Using your saved outline. Turn on Follow my hands to shape it directly.':!live?'Start your camera to form a shape with both hands.':manual?'Mouse controls are on. Turn them off to follow your hands.':handOutline?'Following your hand-shaped outline.':hands.length===2?'Open a clear space between your thumbs and index fingers.':'Show both hands to form an opening.';const depth=manual||!live?manualDepth:pose?.depth;
    $('#depth-state').textContent=depth===undefined?'SHOW BOTH HANDS':Math.abs(depth)<.08?'CENTERED':depth>0?'LEFT SIDE CLOSER':'RIGHT SIDE CLOSER';$('#source-tag').textContent=live?'LIVE CAMERA · ON-DEVICE TRACKING':'INTERACTIVE PREVIEW · SIMULATED SCENE';$('#frame-tag').textContent=live?`${hands.length} HAND${hands.length===1?'':'S'} TRACKED`:'NO CAMERA CONNECTED';$('#live-metric').textContent=live?(lastVision>0?`${Math.round(inferenceMs)} ms / inference${handBackend?` · ${handBackend}`:''}`:'Starting tracking…'):'YOUR CAMERA IS OFF';}
  requestAnimationFrame(render);
}
function drawWholePhoto(amount:number){
  const photo=photos.current;if(!photo)return;
  const fitted=photoFit(photo.image.width,photo.image.height,W,H),scale=Math.max(0,Math.min(1,amount));
  const width=fitted.width*scale,height=fitted.height*scale;
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(photo.image,(W-width)/2,(H-height)/2,width,height);ctx.restore();
}
function drawHandSurface(rect:FrameRect,displayPose:FramePose,sourceRevision:string,displayOutline:readonly Point[],rectangleDecoration:boolean){
  const p=pixelRect(rect),photo=contentMode==='photos'?photos.current:null,tw=photo?768:384,th=photo?512:256;
  if(texture.width!==tw||texture.height!==th){texture.width=tw;texture.height=th;textureKey='';}
  const fit=$<HTMLSelectElement>('#photo-fit').value;
  const [a,b,c,d]=displayPose.quad;
  const edge=(a:Point,b:Point)=>Math.hypot((a.x-b.x)*W,(a.y-b.y)*H);
  const surfaceWidth=(edge(a,b)+edge(d,c))/2,surfaceHeight=(edge(a,d)+edge(b,c))/2;
  const photoAspect=surfaceWidth/surfaceHeight;
  const layout=$<HTMLSelectElement>('#layout').value,source=photo?.image??generated??raw;
  const nextKey=`${style}:${layout}:${rectangleDecoration?'rectangle':'shaped'}:${photo?`photo:${fit}:${fit==='contain'?photoAspect.toFixed(3):''}`:generated?'still':`${sourceRevision}:${p.x},${p.y},${p.width},${p.height}`}`;
  // The image can stay cached while its position and perspective keep moving.
  if(textureSource!==source||textureKey!==nextKey){
    if(photo){textureCtx.fillStyle='#0a0d17';textureCtx.fillRect(0,0,tw,th);const fitted=fit==='contain'?(()=>{const f=photoFit(photo.image.width,photo.image.height,surfaceWidth,surfaceHeight);return {x:f.x/surfaceWidth*tw,y:f.y/surfaceHeight*th,width:f.width/surfaceWidth*tw,height:f.height/surfaceHeight*th};})():{x:0,y:0,width:tw,height:th};textureCtx.drawImage(photo.image,fitted.x,fitted.y,fitted.width,fitted.height);}
    else if(generated){textureCtx.clearRect(0,0,tw,th);textureCtx.drawImage(generated,0,0,tw,th);}
    else textureCtx.drawImage(raw,p.x,p.y,p.width,p.height,0,0,tw,th);
    if(!photo&&(!generated||style!==generatedStyle)){const pixels=textureCtx.getImageData(0,0,tw,th);stylePixels(pixels.data,style,tw);textureCtx.putImageData(pixels,0,0);}
    if(layout==='postcard'&&rectangleDecoration){
      textureCtx.fillStyle='#e9e7d6';textureCtx.fillRect(0,0,tw,7);textureCtx.fillRect(0,th-25,tw,25);textureCtx.fillRect(0,0,7,th);textureCtx.fillRect(tw-7,0,7,th);
      textureCtx.fillStyle='#234039';textureCtx.font='9px monospace';textureCtx.fillText(photo?'YOUR PICTURE / GHOSTFRAME':generated?'AN AI STILL / GHOSTFRAME':'A MOMENT / GHOSTFRAME',14,th-10);
    }else if(layout==='cinema'&&!photo){
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
  if(layout==='postcard'&&styled){ctx.fillStyle='#e9e7d6';ctx.fillRect(p.x-8,p.y-8,p.width+16,8);ctx.fillRect(p.x-8,p.y+p.height,p.width+16,27);ctx.fillRect(p.x-8,p.y,8,p.height);ctx.fillRect(p.x+p.width,p.y,8,p.height);ctx.fillStyle='#234039';ctx.font='10px monospace';ctx.fillText(generated?'AN AI STILL / GHOSTFRAME':'A MOMENT / GHOSTFRAME',p.x+5,p.y+p.height+17);}
  else {ctx.strokeRect(p.x,p.y,p.width,p.height);if(layout==='cinema'&&styled){ctx.fillStyle='#050b0bd9';ctx.fillRect(p.x,p.y,p.width,p.height*.09);ctx.fillRect(p.x,p.y+p.height*.91,p.width,p.height*.09);}}
  const len=15;ctx.lineWidth=4;for(const [x,y,dx,dy] of [[p.x,p.y,1,1],[p.x+p.width,p.y,-1,1],[p.x,p.y+p.height,1,-1],[p.x+p.width,p.y+p.height,-1,-1]]){ctx.beginPath();ctx.moveTo(x+dx*len,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*len);ctx.stroke();}ctx.restore();
}
void fetch('/api/config').then(r=>r.ok?r.json():null).then(config=>{aiEnabled=typeof config==='object'&&config!==null&&'aiEnabled' in config&&config.aiEnabled===true;}).catch(()=>{aiEnabled=false;});
requestAnimationFrame(render);

// Begin in the phone-friendly hand studio; both effects remain available.
if(matchMedia('(max-width: 760px)').matches)setMode('handframe');
syncPhotos();
