/** One camera canvas, expanded in place. Native fullscreen is optional in embedded browsers. */
export function installFullscreen(viewport: HTMLElement, opener: HTMLButtonElement, onChange: (active: boolean) => void) {
  const exitButton = viewport.querySelector<HTMLButtonElement>('#exit-screen')!;
  const fillButton = viewport.querySelector<HTMLButtonElement>('#fill-screen')!;
  const notice = viewport.querySelector<HTMLElement>('#screen-notice')!;
  const scene = viewport.querySelector<HTMLCanvasElement>('#scene')!;
  let active = false, native = false, generation = 0;
  let pendingNative: number | null = null, nativeExits = 0;
  let previousFocus: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined, nativeTimer: ReturnType<typeof setTimeout> | undefined;
  const inertState = new Map<HTMLElement, boolean>();
  const hiddenState = new Map<HTMLElement, string | null>();
  const legacyDocument = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };
  const legacyViewport = viewport as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

  function nativeElement(): Element | null {
    try { return document.fullscreenElement || legacyDocument.webkitFullscreenElement || null; }
    catch { return null; }
  }
  function focus(element: HTMLElement) {
    try { element.focus({ preventScroll: true }); }
    catch { try { element.focus(); } catch { /* A host focus implementation cannot block the view. */ } }
  }
  function fallbackNotice() { notice.textContent = 'Expanded camera view · Esc or Exit to return'; }

  async function leaveNative() {
    if (nativeElement() !== viewport) return;
    nativeExits++;
    try {
      const leave = document.exitFullscreen ?? legacyDocument.webkitExitFullscreen;
      if (typeof leave === 'function') await leave.call(document);
    } catch { /* The tab has already restored. Browser fullscreen remains under browser control. */ }
    finally { nativeExits--; }
  }

  function reveal() {
    if (!active) return;
    viewport.classList.remove('screen-quiet');
    clearTimeout(timer);
    timer = setTimeout(() => viewport.classList.add('screen-quiet'), 2600);
  }
  function restore() {
    if (!active) return;
    active = false; native = false; generation++;
    pendingNative = null; clearTimeout(timer); clearTimeout(nativeTimer);
    viewport.classList.remove('focus-view', 'screen-quiet', 'fill-view');
    document.body.classList.remove('camera-focus');
    opener.setAttribute('aria-expanded', 'false');
    fillButton.setAttribute('aria-pressed', 'false');
    fillButton.textContent = 'Fill view';
    for (const [element, inert] of inertState) { try { element.inert = inert; } catch { /* Optional host API. */ } }
    inertState.clear();
    for (const [element, hidden] of hiddenState) {
      if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
    }
    hiddenState.clear();
    onChange(false);
    const target=previousFocus?.isConnected ? previousFocus : opener, ticket=generation;
    focus(target);
    // Native exit may restore the canvas focus after our synchronous restore.
    // Correct that one browser event without stealing focus from another control.
    requestAnimationFrame(()=>{if(!active&&ticket===generation&&viewport.contains(document.activeElement))focus(target);});
  }
  function exit() {
    // Never wait for an embedded browser's native Promise to restore the page.
    restore();
    const ticket=generation;
    void leaveNative().then(()=>{if(!active&&ticket===generation&&viewport.contains(document.activeElement))focus(previousFocus?.isConnected?previousFocus:opener);});
  }
  function settleNative(ticket: number, accepted = true) {
    if (ticket !== generation || !active) { if (!active) void leaveNative(); return; }
    pendingNative = null; clearTimeout(nativeTimer);
    native = accepted && nativeElement() === viewport;
    if (native) notice.textContent = 'Esc to return · Move or tap to show controls';
    else fallbackNotice();
  }
  function enter() {
    if (active) return;
    active = true;
    const ticket = ++generation;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : opener;
    // This is the primary behavior, applied before any optional host API.
    viewport.classList.add('focus-view'); document.body.classList.add('camera-focus');
    opener.setAttribute('aria-expanded', 'true'); fallbackNotice();
    // Make the page controls unreachable to keyboard navigation while expanded.
    for (let element: HTMLElement = viewport; element.parentElement; element = element.parentElement) {
      for (const sibling of element.parentElement.children) {
        if (sibling !== element && sibling instanceof HTMLElement) {
          try {
            if (typeof sibling.inert === 'boolean') { inertState.set(sibling, sibling.inert); sibling.inert = true; continue; }
          } catch { /* Older embedded hosts may expose a throwing inert accessor. */ }
          hiddenState.set(sibling, sibling.getAttribute('aria-hidden')); sibling.setAttribute('aria-hidden', 'true');
        }
      }
      if (element.parentElement === document.body) break;
    }
    onChange(true); focus(scene); reveal();
    pendingNative = ticket;
    // A stalled request cannot stall the usable tab view or its Exit button.
    nativeTimer = setTimeout(() => settleNative(ticket), 1500);
    try {
      const request = viewport.requestFullscreen ?? legacyViewport.webkitRequestFullscreen;
      if (typeof request !== 'function') { settleNative(ticket); return; }
      const result = request.call(viewport);
      if (result && typeof result.then === 'function') void Promise.resolve(result).then(() => settleNative(ticket), () => settleNative(ticket, false));
      else requestAnimationFrame(() => settleNative(ticket)); // Legacy WebKit returns void.
    } catch {
      settleNative(ticket, false);
    }
  }
  opener.addEventListener('click', () => void enter());
  exitButton.addEventListener('click', () => void exit());
  fillButton.addEventListener('click', () => {
    const fill = viewport.classList.toggle('fill-view');
    fillButton.setAttribute('aria-pressed', String(fill)); fillButton.textContent = fill ? 'Fit whole view' : 'Fill view'; reveal();
  });
  for (const event of ['pointermove', 'pointerdown', 'focusin']) viewport.addEventListener(event, reveal);
  function nativeChanged() {
    if (!active) { void leaveNative(); return; }
    // Hosts can briefly report entry then cancellation before the Promise settles.
    // Such events must not undo the already working tab expansion.
    if (pendingNative !== null) return;
    if (nativeElement() === viewport) native = true;
    else if (native) {
      native = false;
      if (nativeExits === 0) restore(); // A confirmed native session was left by the user/browser.
      else fallbackNotice(); // An older asynchronous exit must not cancel a newer tab entry.
    }
  }
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, nativeChanged);
  for (const event of ['fullscreenerror', 'webkitfullscreenerror']) document.addEventListener(event, () => {
    if (active && pendingNative !== null) settleNative(pendingNative, false);
  });
  document.addEventListener('focusin', event => {
    if (active && event.target instanceof Node && !viewport.contains(event.target)) focus(scene);
  });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); void exit(); }
    if (event.key === 'Tab') {
      const candidates: HTMLElement[] = [scene, ...viewport.querySelectorAll<HTMLElement>('.screen-actions button, .recording-ui button, .recording-ui a[href], .recording-ui video[controls]')].filter(e => !e.closest('[hidden]') && e.getClientRects().length > 0 && (!(e instanceof HTMLButtonElement) || !e.disabled));
      const index = candidates.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); const last = candidates.at(-1); if (last) focus(last); }
      else if (!event.shiftKey && (index === candidates.length - 1 || index < 0)) { event.preventDefault(); if (candidates[0]) focus(candidates[0]); }
    }
  });
  return { get active() { return active; }, reveal, exit };
}
