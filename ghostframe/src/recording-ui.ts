import { CanvasRecorder } from './recording';

/** One local clip at a time. Sharing is always invoked by a fresh button tap. */
export function installRecording(canvas: HTMLCanvasElement, dock: HTMLElement, isLive: () => boolean) {
  dock.classList.add('recording-ui');
  dock.innerHTML = `<div class="recording-row"><button id="record-video" class="record-button" disabled><span aria-hidden="true">●</span> Record</button><span id="record-timer" aria-label="Recording duration" hidden>0:00 / 1:00</span><span class="record-label">Keep your creation</span></div>
    <p id="record-status" role="status">Start your camera to record your effects. Up to 1 minute · no sound.</p>
    <div id="record-result" hidden><video id="record-preview" controls playsinline preload="metadata" aria-label="Your GhostFrame recording"></video><div class="recording-row"><button id="save-video" class="save-button">Save video</button><a id="download-video">Download</a><button id="discard-video">Discard clip</button></div><p class="record-hint">On iPhone, tap Save video, then choose Save Video in the share menu. If it is unavailable, use Download to save to Files. Save before closing this page.</p></div>`;
  const button = dock.querySelector<HTMLButtonElement>('#record-video')!;
  const timer = dock.querySelector<HTMLElement>('#record-timer')!;
  const status = dock.querySelector<HTMLElement>('#record-status')!;
  const result = dock.querySelector<HTMLElement>('#record-result')!;
  const preview = dock.querySelector<HTMLVideoElement>('#record-preview')!;
  const save = dock.querySelector<HTMLButtonElement>('#save-video')!;
  const download = dock.querySelector<HTMLAnchorElement>('#download-video')!;
  const discard = dock.querySelector<HTMLButtonElement>('#discard-video')!;
  let recorder: CanvasRecorder;
  let busy = false, currentURL = '';
  const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  function sync() {
    if (!recorder) return;
    const state = recorder.snapshot;
    const recording = state.phase === 'recording', stopping = state.phase === 'stopping';
    dock.dataset.phase = state.phase;
    dock.classList.toggle('is-recording', recording || stopping);
    button.disabled = busy || stopping || !!state.clip || (!recording && (!isLive() || !recorder.supported));
    button.innerHTML = recording ? '<span aria-hidden="true">■</span> Stop recording' : stopping ? 'Finishing…' : '<span aria-hidden="true">●</span> Record';
    timer.hidden = !recording && !stopping;
    timer.textContent = `${clock(state.elapsedMs)} / 1:00`;
    result.hidden = !state.clip;
    save.disabled = discard.disabled = busy;
    if (!busy) { const message = !recorder.supported ? 'Recording is unavailable in this browser. Open this link in Safari or Chrome, or use your phone’s screen recorder.' : (!isLive() && state.phase === 'idle' ? 'Start your camera to record your effects. Up to 1 minute · no sound.' : state.message || 'Ready to record your camera and effects. Up to 1 minute · no sound.');
      if (status.textContent !== message) status.textContent = message;
    }
    if (state.clip && state.clip.url !== currentURL) {
      currentURL = state.clip.url;
      preview.src = currentURL;
      download.href = currentURL;
      download.download = state.clip.file.name;
    } else if (!state.clip && currentURL) {
      preview.pause(); preview.removeAttribute('src'); preview.load();
      currentURL = ''; download.removeAttribute('href'); download.removeAttribute('download');
    }
  }
  recorder = new CanvasRecorder(canvas, sync);
  button.addEventListener('click', () => {
    if (recorder.snapshot.phase === 'recording') recorder.stop();
    else if (isLive()) recorder.start();
    sync();
  });
  discard.addEventListener('click', () => {
    preview.pause(); recorder.clear(); sync(); button.focus();
  });
  save.addEventListener('click', async () => {
    const clip = recorder.snapshot.clip;
    if (!clip || busy) return;
    let canShare = false;
    try { canShare = !!navigator.share && !!navigator.canShare?.({ files: [clip.file] }); } catch { /* Download remains available. */ }
    if (!canShare) {
      download.click();
      status.textContent = 'Download requested. Check your browser’s Downloads or Files. Your clip stays here until you discard it or close the page.';
      return;
    }
    busy = true; sync();
    status.textContent = 'Choose Save Video or another destination in your phone’s share menu.';
    try {
      // No await before this call: iPhone sharing needs this button's activation.
      await navigator.share({ files: [clip.file], title: 'My GhostFrame' });
      status.textContent = 'Share menu closed. Check the destination you chose; your clip is still here.';
    } catch (error) {
      status.textContent = error instanceof DOMException && error.name === 'AbortError'
        ? 'Save cancelled. Your clip is still here—tap Save video to try again.'
        : 'The share menu could not save this clip. Try again or use Download.';
    } finally { busy = false; save.disabled = discard.disabled = false; }
  });
  download.addEventListener('click', () => { status.textContent = 'Download requested. Check your browser’s Downloads or Files.'; });
  const unload = (event: BeforeUnloadEvent) => {
    if (recorder.snapshot.clip || ['recording','stopping'].includes(recorder.snapshot.phase)) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', unload);
  sync();
  return {
    refresh: sync,
    stop: (reason = 'Camera stopped. Your clip is ready to save.') => recorder.stop(reason),
    get recording() { return ['recording','stopping'].includes(recorder.snapshot.phase); },
  };
}
