import './style.css';
import { createScene } from './scene';
import { HandController, type TrackingSample, type TrackingStatus } from './tracking/controller';
import { validateLayout } from './shared/workspaces';

type Card = { id: string; title: string; eyebrow: string; body: string; accent: 'mint' | 'amber' | 'blue'; x: number; y: number };
type Preset = { id: string; name: string; subtitle: string; cards: Card[] };
type SavedLayout = { version: 1; presetId: string; cards: { id: string; x: number; y: number }[] };
const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', camera: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
    cursor: '<path d="m5 3 5 17 3-7 7-3L5 3Z"/>', stop: '<rect x="5" y="5" width="14" height="14" rx="3"/>', reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>', save: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    hand: '<path d="M8 13V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z"/>',
    sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-1 .4-1 1.2-1 2.2M12 17h.01"/>', expand: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>', check: '<path d="m5 12 4 4 10-10"/>', github: '<path d="M9 19c-4 1-4-2-6-2m12 4v-3c0-1-.3-2-1-2 4-.5 6-2 6-6 0-1-.5-3-1.5-4 .3-1 .3-2-.2-3-2 0-3 1-3 1a13 13 0 0 0-7 0S7 3 5 3c-.5 1-.5 2-.2 3C3.5 7 3 9 3 10c0 4 2 5.5 6 6-.7.5-1 1-1 2v3"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
};
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<header class="topbar"><a class="brand" href="/" aria-label="Airframe home"><img src="/favicon.svg" alt="" width="34" height="34"/><span>airframe<span class="brand-dot">.</span></span></a><span class="nav-label">AN EXPERIMENT IN HUMAN–COMPUTER INTERACTION</span><nav><button id="guide-button" class="nav-button">${icon('help',16)} How it works</button><a href="https://github.com/recruiting-gains/ai-builds-showcase/tree/main/airframe" target="_blank" rel="noopener noreferrer" class="github-link" aria-label="Airframe source on GitHub">${icon('github',19)}<span>Source</span></a></nav></header>
<main>
 <section class="intro"><div><div class="eyebrow"><span class="tiny-orb"></span> YOUR HANDS ARE THE INTERFACE</div><h1>Reach into your <span>workspace.</span></h1><p>Point. Pinch. Move. A little science fiction, right in your browser.</p></div><div class="intro-aside"><span class="version">EXPERIMENT 01 / GESTURE SPACE</span><p>No gloves. No installation.<br>Just a camera and a little curiosity.</p></div></section>
 <section class="workspace-layout" aria-label="Airframe control room">
  <div class="workspace-shell"><div class="workspace-toolbar"><div class="workspace-title">${icon('grid',16)}<label class="sr-only" for="preset">Workspace preset</label><select id="preset" aria-label="Workspace preset" disabled><option>Loading workspace…</option></select></div><span id="mode-label" class="mode-pill"><span></span> MOUSE READY</span></div>
   <div id="workspace" class="workspace" role="region" aria-label="Gesture workspace" tabindex="-1"><canvas id="scene" aria-hidden="true"></canvas><div class="stage-vignette"></div><div class="coordinate top-left">AIRFRAME / SPATIAL CANVAS</div><div class="coordinate top-right">LOCAL INTERACTION</div><div class="orb-label" aria-hidden="true"><span>◈</span> THE POSSIBILITY SPACE</div><div id="cards" class="cards"></div><div id="drop-zone" class="drop-zone"><span>${icon('expand',19)}</span><span>Drop a panel here<small>MAKE YOUR FIRST MOVE</small></span></div><div id="air-cursor" class="air-cursor" hidden><span></span><i></i></div><div class="stage-floor-label"><span id="stage-hint">Drag a panel with your mouse, or enable the camera.</span><span class="keycap">ESC <span>release</span></span></div></div>
   <div class="workspace-footer"><div class="selection-label"><span class="signal-dot"></span><span id="selection-label">Your workspace is ready to explore.</span></div><div><button id="reset" class="icon-button" title="Reset workspace" aria-label="Reset workspace">${icon('reset',17)}</button><button id="save" class="icon-button" title="Save layout" aria-label="Save layout">${icon('save',18)}</button></div></div>
  </div>
  <aside class="control-panel"><div class="panel-heading"><span class="eyebrow">YOUR INPUT</span><span class="device-label">01 / CAMERA</span></div><div class="camera-view"><video id="camera" muted playsinline aria-label="Local mirrored camera preview"></video><canvas id="hand-overlay" aria-hidden="true"></canvas><div id="camera-placeholder"><div class="hand-halo">${icon('hand',43)}</div><strong>The magic starts here.</strong><span>Your camera stays off<br>until you choose to enable it.</span></div><span class="camera-badge" id="camera-badge">CAMERA OFF</span><div class="view-corner corner-a"></div><div class="view-corner corner-b"></div></div>
   <button id="enable-camera" class="primary">${icon('camera',18)}<span>Enable camera</span>${icon('arrow',18)}</button><button id="stop-camera" class="stop-button" hidden>${icon('stop',17)} Stop camera</button><button id="demo" class="secondary">${icon('cursor',17)} Explore with mouse</button>
   <p id="tracking-message" class="tracking-message" role="status">Camera optional. Mouse and keyboard work too.</p><div class="privacy-note">${icon('lock',15)}<span>Hand tracking runs on your device.<br><strong>No video is uploaded or recorded.</strong></span></div>
   <div class="telemetry"><div><span>TRACKING</span><strong id="tracking-state">Not started</strong></div><div><span>DETECTION TIME</span><strong id="latency">—</strong></div></div>
   <div class="sensitivity"><label for="sensitivity">Pinch sensitivity <span id="sensitivity-value">Balanced</span></label><input id="sensitivity" type="range" min="0.7" max="1.4" step="0.1" value="1"/><div><span>Deliberate</span><span>Lighter pinch</span></div></div>
  </aside>
 </section>
 <section class="bottom-grid"><div class="gesture-guide"><div class="section-eyebrow">THREE MOVES. A NEW WAY IN.</div><div class="gesture-steps"><div><span class="gesture-number">01</span><span class="gesture-symbol">${icon('cursor',23)}</span><div><h2>Point to aim</h2><p>Move one hand to guide the cursor.</p></div></div><div><span class="gesture-number">02</span><span class="gesture-symbol pinch-symbol">◌</span><div><h2>Pinch to select</h2><p>Bring thumb and index finger together.</p></div></div><div><span class="gesture-number">03</span><span class="gesture-symbol">${icon('expand',23)}</span><div><h2>Hold to move</h2><p>Keep pinching. Move. Release to drop.</p></div></div></div></div><div class="practice-card"><span class="section-eyebrow">YOUR FIRST SMALL WIN</span><div><span id="practice-icon">${icon('sparkle',23)}</span><p id="practice-message">Move a panel into the glowing target.</p><span id="practice-progress">0 / 1</span></div></div></section>
 <p class="boundary-note">This experiment controls panels inside this website—not your computer’s system mouse. Use good light and keep one hand in view. Tracking can make mistakes.</p>
</main><footer class="site-footer"><span>BUILT BY CRUZ <span class="footer-cross">×</span> AI BUILDS SHOWCASE</span><span>Human intention. A different interface.</span><button id="privacy-button" class="text-link">Privacy & limits ${icon('arrow',12)}</button></footer>
<div id="toast" class="toast" role="status" hidden></div>
<dialog id="guide-dialog" aria-labelledby="guide-title"><button class="dialog-close" aria-label="Close guide">×</button><div class="eyebrow">WELCOME TO AIRFRAME</div><h2 id="guide-title">Your hands. Your space.</h2><p>This is a browser-based gesture experiment—not a replacement for your computer’s mouse.</p><ol><li><strong>Choose your way in.</strong> Explore with mouse, or enable your camera and approve your browser’s camera request.</li><li><strong>Find your hand.</strong> Use even light, one hand, and a little space between you and the camera. The preview is mirrored, like a mirror.</li><li><strong>Point and pinch.</strong> Move your index fingertip to aim. Bring thumb and index together over a panel to grab it. Keep pinching to move; open your fingers to release.</li><li><strong>Start small.</strong> Drag a panel onto the glowing target. Choose another workspace or save your panel positions when you like the layout.</li></ol><div class="dialog-note"><strong>Always in control</strong><p>Escape releases a panel. Stop camera turns off the video stream. Switching away from the page stops the camera. All features also work with a mouse or touch.</p><p>Keyboard: Tab to a panel, then use arrow keys to move it. Hold Shift for a larger step. Enter selects. Reset restores the current workspace.</p></div><p class="dialog-fine">Hand detection uses Google MediaPipe, running locally. The first start downloads the model and runtime from this site. No microphone, recording, camera uploads, accounts, or cloud AI calls. Only panel coordinates and preset IDs are sent for layout validation; no video or hand positions. Your latest saved layout is stored in this browser.</p><button id="guide-done" class="primary">Let’s try it ${icon('arrow',18)}</button></dialog>`;

function el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
const workspace = el('workspace'), cardsRoot = el('cards'), cursor = el('air-cursor');
const video = el<HTMLVideoElement>('camera'), overlay = el<HTMLCanvasElement>('hand-overlay');
const cameraButton = el<HTMLButtonElement>('enable-camera'), stopButton = el<HTMLButtonElement>('stop-camera');
const scene = createScene(el<HTMLCanvasElement>('scene'), () => workspace.classList.add('no-webgl'));
const controller = new HandController(video, onTracking, onTrackingStatus);
let presets: Preset[] = [], active: Preset | null = null, cards: Card[] = [], selected: string | null = null;
let mode: 'mouse' | 'camera' = 'mouse', starting = false, completed = false, toastTimer = 0;
let drag: { id: string; offsetX: number; offsetY: number; startX: number; startY: number; source: 'mouse' | 'camera'; pointerId?: number } | null = null;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
function notify(text: string) { el('toast').textContent = text; el('toast').hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el('toast').hidden = true; }, 4200); }
function safeText(tag: string, cls: string, text: string) { const node = document.createElement(tag); node.className = cls; node.textContent = text; return node; }
function bounds(node: HTMLElement) { return { w: Math.max(1, workspace.clientWidth - node.offsetWidth - 28), h: Math.max(1, workspace.clientHeight - node.offsetHeight - 104) }; }
function place(card: Card) { const node = document.getElementById(`card-${card.id}`); if (!node) return; const b = bounds(node); node.style.left = `${14 + card.x * b.w}px`; node.style.top = `${46 + card.y * b.h}px`; }
function renderCards() {
  cardsRoot.replaceChildren();
  cards.forEach((card, i) => {
    const node = document.createElement('article'); node.id = `card-${card.id}`; node.className = `floating-card ${card.accent}`; node.dataset.cardId = card.id;
    const handle = document.createElement('button'); handle.className = 'card-handle'; handle.type = 'button'; handle.setAttribute('aria-label', `${card.title}: drag or use arrow keys to move`); handle.setAttribute('aria-describedby', 'stage-hint');
    handle.append(safeText('span', 'card-eyebrow', card.eyebrow), safeText('span', 'drag-dots', '⠿'));
    const title = safeText('h2', 'card-title', card.title), body = safeText('p', 'card-body', card.body);
    const art = document.createElement('div'); art.className = `card-art art-${i}`; art.setAttribute('aria-hidden', 'true'); art.innerHTML = '<i></i><i></i><i></i><i></i><i></i><span></span>';
    const foot = document.createElement('div'); foot.className = 'card-foot'; foot.append(safeText('span', '', `0${i + 1} / FLOATING PANEL`), safeText('span', '', '↗'));
    node.append(handle, title, body, art, foot); cardsRoot.append(node);
    node.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); beginDrag(card.id, e.clientX, e.clientY, 'mouse', e.pointerId); handle.focus({ preventScroll: true }); workspace.setPointerCapture(e.pointerId); });
    handle.addEventListener('keydown', e => {
      const step = e.shiftKey ? .07 : .02;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); selectCard(card.id); if (e.key === 'ArrowLeft') card.x = clamp(card.x - step); if (e.key === 'ArrowRight') card.x = clamp(card.x + step); if (e.key === 'ArrowUp') card.y = clamp(card.y - step); if (e.key === 'ArrowDown') card.y = clamp(card.y + step); place(card); checkTarget(card.id); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(card.id); }
    });
    place(card);
  });
}
function selectCard(id: string) {
  selected = id;
  cardsRoot.querySelectorAll<HTMLElement>('.floating-card').forEach(n => { const on = n.dataset.cardId === id; n.classList.toggle('selected', on); n.style.zIndex = on ? '6' : '3'; });
  const card = cards.find(c => c.id === id); if (card) el('selection-label').textContent = `${card.title} selected. Move it anywhere in the workspace.`;
}
function beginDrag(id: string, clientX: number, clientY: number, source: 'mouse' | 'camera', pointerId?: number) {
  if (!active) return; releaseDrag(true); selectCard(id);
  const r = document.getElementById(`card-${id}`)!.getBoundingClientRect();
  drag = { id, offsetX: clientX - r.left, offsetY: clientY - r.top, startX: clientX, startY: clientY, source, pointerId };
  document.getElementById(`card-${id}`)!.classList.add('grabbing'); workspace.classList.add('is-dragging');
}
function moveDrag(clientX: number, clientY: number) {
  if (!drag) return; const card = cards.find(c => c.id === drag!.id); const node = document.getElementById(`card-${drag.id}`); if (!card || !node) return;
  const r = workspace.getBoundingClientRect(), b = bounds(node);
  card.x = clamp((clientX - r.left - drag.offsetX - 14) / b.w); card.y = clamp((clientY - r.top - drag.offsetY - 46) / b.h); place(card);
}
function releaseDrag(cancelled = false) {
  if (!drag) return; const id = drag.id, pointerId = drag.pointerId; drag = null;
  document.getElementById(`card-${id}`)?.classList.remove('grabbing'); workspace.classList.remove('is-dragging');
  if (pointerId !== undefined && workspace.hasPointerCapture(pointerId)) workspace.releasePointerCapture(pointerId);
  if (!cancelled) checkTarget(id);
}
function checkTarget(id: string) {
  if (completed) return;
  const node = document.getElementById(`card-${id}`); if (!node) return;
  const a = node.getBoundingClientRect(), b = el('drop-zone').getBoundingClientRect();
  if (a.right > b.left + 20 && a.left < b.right - 20 && a.bottom > b.top + 15 && a.top < b.bottom - 15) {
    completed = true; el('drop-zone').classList.add('complete'); el('practice-progress').textContent = '1 / 1'; el('practice-message').textContent = 'You made your first move. Now make it yours.'; el('practice-icon').innerHTML = icon('check',23); notify(mode === 'camera' ? 'First gesture complete. You moved a panel with your hand.' : 'First move complete. Try the camera whenever you’re ready.');
  }
}
workspace.addEventListener('pointermove', e => { if (drag?.source === 'mouse') moveDrag(e.clientX,e.clientY); const r = workspace.getBoundingClientRect(); scene.aim((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height); });
workspace.addEventListener('pointerup', () => { if (drag?.source === 'mouse') releaseDrag(); });
workspace.addEventListener('pointercancel', () => releaseDrag(true));
workspace.addEventListener('lostpointercapture', () => { if (drag?.source === 'mouse') releaseDrag(true); });
const resize = new ResizeObserver(() => { releaseDrag(true); cards.forEach(place); }); resize.observe(workspace);
function loadPreset(id: string, positions?: SavedLayout['cards']) {
  const next = presets.find(p => p.id === id); if (!next) return;
  releaseDrag(true); active = next; selected = null; cards = next.cards.map(c => { const p = positions?.find(x => x.id === c.id); return { ...c, ...(p ? { x: clamp(p.x), y: clamp(p.y) } : {}) }; });
  el<HTMLSelectElement>('preset').value = id; renderCards(); el('selection-label').textContent = `${next.name}. ${next.subtitle}`;
}
el<HTMLSelectElement>('preset').addEventListener('change', e => loadPreset((e.target as HTMLSelectElement).value));
el('reset').addEventListener('click', () => { if (active) { loadPreset(active.id); notify('Workspace reset. Saved layout is unchanged.'); } });
el('save').addEventListener('click', async () => {
  if (!active) return; const button = el<HTMLButtonElement>('save'); button.disabled = true;
  try {
    const layout = { version: 1, presetId: active.id, cards: cards.map(({id,x,y})=>({id,x,y})) };
    const response = await fetch('/api/layout/validate',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(layout), signal:AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Layout validation failed. Please try again.');
    const data = await response.json() as SavedLayout | {layout:SavedLayout}; const checked = 'layout' in data ? data.layout : data;
    const validation = validateLayout(checked);
    if (!validation.valid || validation.layout.presetId !== active.id) throw new Error('The layout response was not valid.');
    localStorage.setItem('airframe.layout.v1',JSON.stringify(validation.layout));
    notify('Layout saved in this browser. It will return on your next visit.');
  } catch(e) { notify(e instanceof Error ? e.message : 'Could not save your layout.'); }
  finally { button.disabled = false; }
});

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
function drawHand(landmarks: TrackingSample['landmarks']) {
  const w = overlay.clientWidth, h = overlay.clientHeight; if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
  const ctx = overlay.getContext('2d'); if (!ctx) return; ctx.clearRect(0,0,w,h);
  const videoAspect = (video.videoWidth || 4) / (video.videoHeight || 3), displayAspect = w/h;
  const drawnW = videoAspect > displayAspect ? h*videoAspect : w, drawnH = videoAspect > displayAspect ? h : w/videoAspect;
  // Controller landmarks are already mirrored to match the camera preview.
  const project = (i:number) => ({x:landmarks[i].x*drawnW-(drawnW-w)/2,y:landmarks[i].y*drawnH-(drawnH-h)/2});
  ctx.strokeStyle='#7affd3'; ctx.lineWidth=1.5;
  for (const [a,b] of connections) { if (!landmarks[a] || !landmarks[b]) continue; const p=project(a),q=project(b); ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke(); }
  landmarks.forEach((_,i)=>{const p=project(i);ctx.fillStyle=i===4||i===8?'#ffd08a':'#c4ffed';ctx.beginPath();ctx.arc(p.x,p.y,i===4||i===8?3:1.8,0,Math.PI*2);ctx.fill();});
}
function onTracking(sample: TrackingSample) {
  if (mode !== 'camera') return;
  if (sample.phase === 'cancel') { releaseDrag(true); cursor.hidden = true; return; }
  const r = workspace.getBoundingClientRect(); const clientX = r.left + clamp(sample.x)*r.width, clientY = r.top + clamp(sample.y)*r.height;
  cursor.hidden=false;cursor.style.left=`${clamp(sample.x)*100}%`;cursor.style.top=`${clamp(sample.y)*100}%`;cursor.classList.toggle('pinching',sample.pinching);scene.aim(sample.x,sample.y);drawHand(sample.landmarks);
  el('latency').textContent=`${Math.round(sample.latencyMs)} ms`;
  if (sample.phase === 'down') { const target=document.elementFromPoint(clientX,clientY)?.closest<HTMLElement>('[data-card-id]'); if(target?.dataset.cardId && workspace.contains(target)) beginDrag(target.dataset.cardId,clientX,clientY,'camera'); }
  if (drag?.source==='camera') moveDrag(clientX,clientY);
  if (sample.phase==='up') releaseDrag();
}
function onTrackingStatus(status: TrackingStatus) {
  el('tracking-message').textContent=status.message;
  el('tracking-state').textContent=({loading:'Loading model',ready:'Permission requested',tracking:'Hand detected',lost:'Hand not visible',stopped:'Not started',error:'Unavailable'})[status.state];
  const live=['tracking','lost'].includes(status.state), busy=['loading','ready'].includes(status.state);
  el('camera-placeholder').hidden=live; video.classList.toggle('is-live',live); el('camera-badge').textContent=live?'CAMERA ON · LOCAL':busy?'WAITING · CAMERA OFF':'CAMERA OFF';
  if (busy) { starting=true;mode='camera';cameraButton.disabled=true;cameraButton.hidden=false;stopButton.hidden=false;cameraButton.querySelector('span')!.textContent=status.state==='loading'?'Loading tracking…':'Awaiting permission';el('mode-label').innerHTML='<span></span> CAMERA SETUP'; }
  if (live) { mode='camera'; el('mode-label').innerHTML='<span></span> CAMERA CONTROL'; el('mode-label').classList.add('live'); cameraButton.hidden=true;stopButton.hidden=false; }
  if (['lost','error','stopped'].includes(status.state)) { releaseDrag(true);cursor.hidden=true;overlay.getContext('2d')?.clearRect(0,0,overlay.width,overlay.height); }
  if (status.state==='error'||status.state==='stopped') { mode='mouse';starting=false;cameraButton.disabled=false;cameraButton.hidden=false;stopButton.hidden=true;cameraButton.querySelector('span')!.textContent='Enable camera';el('mode-label').innerHTML='<span></span> MOUSE READY';el('mode-label').classList.remove('live');el('latency').textContent='—'; }
}
cameraButton.addEventListener('click', async()=>{ if(starting)return;starting=true;mode='camera';cameraButton.disabled=true;cameraButton.querySelector('span')!.textContent='Starting…';stopButton.hidden=false;el('stage-hint').textContent='Point to aim. Pinch over a panel. Hold to move, then release.';try{await controller.start();}catch(e){onTrackingStatus({state:'error',message:e instanceof Error?e.message:'Camera could not start. Try mouse mode.'});} });
stopButton.addEventListener('click',()=>{controller.stop();releaseDrag(true);notify('Camera stopped. Mouse and keyboard are ready.');});
el('demo').addEventListener('click',()=>{controller.stop();mode='mouse';workspace.focus();el('mode-label').innerHTML='<span></span> MOUSE EXPLORATION';el('stage-hint').textContent='Drag a panel. Keyboard: Tab to a panel and use arrow keys.';notify('Mouse mode. No camera or hand tracking is running.');});
el<HTMLInputElement>('sensitivity').addEventListener('input',e=>{const n=Number((e.target as HTMLInputElement).value);controller.setSensitivity(n);el('sensitivity-value').textContent=n<1?'Deliberate':n>1?'Light':'Balanced';});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){releaseDrag(true);cursor.classList.remove('pinching');if(mode==='camera'){controller.stop();notify('Camera stopped with Escape.');}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseDrag(true);controller.stop();}});
window.addEventListener('pagehide',()=>{controller.stop();releaseDrag(true);});
const dialog=el<HTMLDialogElement>('guide-dialog');let dialogOpener:HTMLElement|null=null;
function openGuide(opener:HTMLElement){dialogOpener=opener;releaseDrag(true);if(mode==='camera')controller.stop();dialog.showModal();}
el('guide-button').addEventListener('click',()=>openGuide(el('guide-button')));el('privacy-button').addEventListener('click',()=>openGuide(el('privacy-button')));
function closeGuide(){dialog.close();dialogOpener?.focus();}
dialog.querySelector('.dialog-close')!.addEventListener('click',closeGuide);el('guide-done').addEventListener('click',closeGuide);
async function bootstrap(){
  try{const response=await fetch('/api/presets',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Could not load workspace presets.');const data=await response.json() as {presets:Preset[]};if(!Array.isArray(data.presets)||!data.presets.length)throw new Error('No workspace presets were found.');presets=data.presets;const select=el<HTMLSelectElement>('preset');select.replaceChildren(...presets.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));select.disabled=false;loadPreset(presets[0].id);
    try{const raw=localStorage.getItem('airframe.layout.v1');if(raw&&raw.length<8192){const saved=validateLayout(JSON.parse(raw));if(saved.valid)loadPreset(saved.layout.presetId,saved.layout.cards);}}catch{/* A damaged local layout never prevents startup. */}
  }catch(e){el('selection-label').textContent='The workspace could not load. Please reload to retry.';notify(e instanceof Error?e.message:'Workspace unavailable.');}
}
void bootstrap();
