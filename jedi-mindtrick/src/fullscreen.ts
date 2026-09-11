/** One camera canvas, expanded in place. Native fullscreen is optional in embedded browsers. */
export function installFullscreen(viewport: HTMLElement, opener: HTMLButtonElement, onChange: (active: boolean) => void) {
  const exitButton = viewport.querySelector<HTMLButtonElement>('#exit-screen')!;
  const fillButton = viewport.querySelector<HTMLButtonElement>('#fill-screen')!;
  const notice = viewport.querySelector<HTMLElement>('#screen-notice')!;
  const scene = viewport.querySelector<HTMLCanvasElement>('#scene')!;
  let active = false, native = false, generation = 0;
  let previousFocus: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inertState = new Map<HTMLElement, boolean>();

  function reveal() {
    if (!active) return;
    viewport.classList.remove('screen-quiet');
    clearTimeout(timer);
    timer = setTimeout(() => viewport.classList.add('screen-quiet'), 2600);
  }
  function restore() {
    if (!active) return;
    active = false; native = false; generation++;
    clearTimeout(timer);
    viewport.classList.remove('focus-view', 'screen-quiet', 'fill-view');
    document.body.classList.remove('camera-focus');
    opener.setAttribute('aria-expanded', 'false');
    fillButton.setAttribute('aria-pressed', 'false');
    fillButton.textContent = 'Fill view';
    for (const [element, inert] of inertState) element.inert = inert;
    inertState.clear();
    onChange(false);
    (previousFocus?.isConnected ? previousFocus : opener).focus({ preventScroll: true });
  }
  async function exit() {
    if (document.fullscreenElement === viewport) {
      try { await document.exitFullscreen(); }
      catch { notice.textContent = 'Use Esc to leave full screen.'; reveal(); return; }
    }
    restore();
  }
  async function enter() {
    if (active) return;
    active = true;
    const ticket = ++generation;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : opener;
    // Make the page controls unreachable to keyboard navigation while expanded.
    for (let element: HTMLElement = viewport; element.parentElement; element = element.parentElement) {
      for (const sibling of element.parentElement.children) {
        if (sibling !== element && sibling instanceof HTMLElement) { inertState.set(sibling, sibling.inert); sibling.inert = true; }
      }
      if (element.parentElement === document.body) break;
    }
    viewport.classList.add('focus-view'); document.body.classList.add('camera-focus');
    opener.setAttribute('aria-expanded', 'true'); notice.textContent = 'Esc to return · Move or tap to show controls';
    onChange(true); scene.focus({ preventScroll: true }); reveal();
    try {
      if (typeof viewport.requestFullscreen !== 'function') throw new Error('Unavailable');
      await viewport.requestFullscreen();
      if (ticket !== generation) { if (!active && document.fullscreenElement === viewport) await document.exitFullscreen(); return; }
      native = document.fullscreenElement === viewport;
    } catch {
      if (ticket === generation && active) { notice.textContent = 'Expanded camera view · Esc to return'; reveal(); }
    }
  }
  opener.addEventListener('click', () => void enter());
  exitButton.addEventListener('click', () => void exit());
  fillButton.addEventListener('click', () => {
    const fill = viewport.classList.toggle('fill-view');
    fillButton.setAttribute('aria-pressed', String(fill)); fillButton.textContent = fill ? 'Fit whole view' : 'Fill view'; reveal();
  });
  for (const event of ['pointermove', 'pointerdown', 'focusin']) viewport.addEventListener(event, reveal);
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === viewport) native = true;
    else if (native) restore();
  });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); void exit(); }
    if (event.key === 'Tab') {
      const candidates: HTMLElement[] = [scene, ...viewport.querySelectorAll<HTMLButtonElement>('.screen-actions button')].filter(e => !e.hidden && (!(e instanceof HTMLButtonElement) || !e.disabled));
      const index = candidates.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); candidates.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === candidates.length - 1 || index < 0)) { event.preventDefault(); candidates[0]?.focus(); }
    }
  });
  return { get active() { return active; }, reveal, exit };
}
