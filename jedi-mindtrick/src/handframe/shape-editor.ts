import type { Point } from '../contracts';
import { validateCustomShape } from './shapes';

/** Small local polygon editor. Its draft cannot replace the active shape until valid. */
export function installShapeEditor(container: HTMLElement, apply: (points: Point[]) => void) {
  container.innerHTML = `<p class="hint">Click around the outline to add 3–12 points. Drag a point to reshape it. Connect the last point back to the first without crossing lines.</p>
    <svg id="shape-board" viewBox="0 0 240 180" role="img" aria-label="Custom shape drawing area"></svg>
    <p id="shape-message" class="hint" role="status"></p>
    <div class="shape-edit-row"><label for="shape-point">Selected point</label><select id="shape-point" aria-describedby="point-help"></select><button id="remove-point" type="button">Remove</button></div>
    <p id="point-help" class="hint">Keyboard: select a point, then use the arrow buttons to move it. Shift moves farther.</p>
    <div class="point-arrows" role="group" aria-label="Move selected point"><button data-point-move="-1,0" aria-label="Move point left">←</button><button data-point-move="0,-1" aria-label="Move point up">↑</button><button data-point-move="0,1" aria-label="Move point down">↓</button><button data-point-move="1,0" aria-label="Move point right">→</button><button id="add-point">Add point</button></div>
    <div class="shape-edit-actions"><button id="clear-shape" type="button">Start over</button><button id="apply-shape" type="button">Use shape</button><button id="cancel-shape" type="button">Cancel</button></div>`;
  const board = container.querySelector<SVGSVGElement>('#shape-board')!;
  const selector = container.querySelector<HTMLSelectElement>('#shape-point')!;
  const message = container.querySelector<HTMLElement>('#shape-message')!;
  const applyButton = container.querySelector<HTMLButtonElement>('#apply-shape')!;
  let points: Point[] = [], selected = -1, pointer: number | null = null, opener: HTMLElement | null = null;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  function draw() {
    board.innerHTML = `<defs><pattern id="shape-grid" width="24" height="18" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 18" fill="none" stroke="#345048" stroke-width="1"/></pattern></defs><rect width="240" height="180" fill="url(#shape-grid)"/><polygon points="${points.map(p => `${p.x * 240},${p.y * 180}`).join(' ')}" fill="#c8f5a433" stroke="#d8f5bd" stroke-width="2"/>${points.map((p, i) => `<circle data-point="${i}" cx="${p.x * 240}" cy="${p.y * 180}" r="${i === selected ? 7 : 5}" fill="${i === selected ? '#fff5d4' : '#b8deb0'}" stroke="#15251d" stroke-width="2"/><text x="${Math.max(10, Math.min(228, p.x * 240 + 9))}" y="${Math.max(13, p.y * 180 - 9)}" fill="#eef8e9" font-size="10" pointer-events="none">${i + 1}</text>`).join('')}`;
    selector.innerHTML = points.length ? points.map((_, i) => `<option value="${i}">Point ${i + 1}</option>`).join('') : '<option value="-1">No points yet</option>';
    selector.value = String(selected);
    const error = validateCustomShape(points);
    message.textContent = error || `${points.length} points · Ready to use`;
    applyButton.disabled = !!error;
    container.querySelector<HTMLButtonElement>('#remove-point')!.disabled = selected < 0;
    container.querySelector<HTMLButtonElement>('#add-point')!.disabled = points.length >= 12;
    container.querySelectorAll<HTMLButtonElement>('[data-point-move]').forEach(b => b.disabled = selected < 0);
  }
  function add(point?: Point) {
    if (points.length >= 12) { message.textContent = 'Twelve points is the limit. Move or remove an existing point.'; return false; }
    const next = points.length ? points[(selected + 1) % points.length] : null, current = points[selected];
    const value = point || (next && current ? { x: (next.x + current.x) / 2, y: (next.y + current.y) / 2 } : { x: .5, y: .5 });
    const position = point ? points.length : selected + 1;
    points.splice(position, 0, value); selected = position; draw(); return true;
  }
  function location(event: PointerEvent) {
    const rect = board.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  }
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null || container.hidden) return;
    const target = event.target as Element, index = target.getAttribute('data-point');
    if (index === null) { if(!add(location(event)))return; }
    else { selected = Number(index); draw(); }
    if (selected >= 0) { pointer = event.pointerId; board.setPointerCapture(pointer); }
    event.preventDefault();
  });
  board.addEventListener('pointermove', event => { if (pointer === event.pointerId && selected >= 0) { points[selected] = location(event); draw(); } });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) board.addEventListener(type, event => { if((event as PointerEvent).pointerId===pointer)pointer = null; });
  selector.addEventListener('change', () => { selected = Number(selector.value); draw(); });
  container.querySelectorAll<HTMLButtonElement>('[data-point-move]').forEach(button => button.addEventListener('click', event => {
    if (selected < 0) return;
    const [x, y] = button.dataset.pointMove!.split(',').map(Number), amount = event.shiftKey ? .1 : .02;
    points[selected] = { x: clamp(points[selected].x + x * amount), y: clamp(points[selected].y + y * amount) }; draw();
  }));
  container.querySelector('#remove-point')!.addEventListener('click', () => { if (selected >= 0) points.splice(selected, 1); selected = Math.min(selected, points.length - 1); draw(); });
  container.querySelector('#add-point')!.addEventListener('click', () => add());
  container.querySelector('#clear-shape')!.addEventListener('click', () => { points = []; selected = -1; draw(); });
  const releasePointer = () => { if(pointer!==null&&board.hasPointerCapture(pointer))board.releasePointerCapture(pointer);pointer=null; };
  const close = () => { releasePointer(); if(container.hidden)return; container.hidden = true; opener?.setAttribute('aria-expanded', 'false'); opener?.focus({ preventScroll: true }); };
  applyButton.addEventListener('click', () => { if (!validateCustomShape(points)) { apply(points.map(p => ({ ...p }))); close(); } });
  container.querySelector('#cancel-shape')!.addEventListener('click', close);
  container.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  return { open(initial: readonly Point[], trigger: HTMLElement) { releasePointer(); opener = trigger; points = initial.map(p => ({ ...p })); selected = points.length ? 0 : -1; container.hidden = false; trigger.setAttribute('aria-expanded', 'true'); draw(); selector.focus({ preventScroll: true }); }, close };
}
