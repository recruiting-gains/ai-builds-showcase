import { GestureProcessor, type DetectedHand, type TrackingSample } from './gestures';
export type { TrackingSample } from './gestures';
export type TrackingStatus = { state: 'loading' | 'ready' | 'tracking' | 'lost' | 'stopped' | 'error'; message: string };

type WorkerResult = { type: 'result'; hands: DetectedHand[]; time: number; width: number; height: number; latencyMs: number };
type WorkerEvent = WorkerResult | { type: 'ready'; delegate: string } | { type: 'error'; message: string };
const abort = () => new DOMException('Camera start cancelled.', 'AbortError');

/** Owns the camera lifetime. Call start ONLY from an explicit user action. */
export class HandController {
  private readonly gestures = new GestureProcessor();
  private worker?: Worker;
  private stream?: MediaStream;
  private generation = 0;
  private running = false;
  private inFlight = false;
  private raf = 0;
  private frameTimeout?: ReturnType<typeof setTimeout>;
  private cancelPending?: () => void;
  private lastVideoTime = -1;
  private lastCapture = 0;
  private lastStatus = '';
  private readonly handleHidden = () => { if (document.hidden) this.stop(); };
  private readonly handlePageHide = () => this.stop();

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onSample: (sample: TrackingSample) => void,
    private readonly onStatus: (status: TrackingStatus) => void,
  ) {
    // No permission prompt, model load or camera access occurs in the constructor.
    this.video.muted = true;
    this.video.playsInline = true;
  }

  setSensitivity(value: number): void { this.gestures.setSensitivity(value); }

  private status(state: TrackingStatus['state'], message: string) {
    const key = `${state}:${message}`;
    if (key !== this.lastStatus) { this.lastStatus = key; this.onStatus({ state, message }); }
  }

  private releaseResources() {
    this.running = false;
    this.cancelPending?.(); this.cancelPending = undefined;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.frameTimeout);
    this.worker?.terminate(); this.worker = undefined;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
    this.video.pause(); this.video.srcObject = null;
    this.inFlight = false; this.lastVideoTime = -1; this.lastCapture = 0;
    document.removeEventListener('visibilitychange', this.handleHidden);
    window.removeEventListener('pagehide', this.handlePageHide);
    const cancelled = this.gestures.reset();
    if (cancelled) this.onSample(cancelled);
  }

  stop(): void {
    ++this.generation;
    this.releaseResources();
    this.status('stopped', 'Camera off. Mouse and touch still work.');
  }

  private fail(message: string) {
    ++this.generation;
    this.releaseResources();
    this.status('error', message);
  }

  private async cancellable<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelThis: () => void;
    const cancelled = new Promise<T>((_, reject) => {
      cancelThis = () => reject(abort());
      this.cancelPending = cancelThis;
      timer = setTimeout(() => reject(new Error('Camera setup timed out. Please try again.')), timeoutMs);
    });
    try { return await Promise.race([promise, cancelled]); }
    finally { clearTimeout(timer); if (this.cancelPending === cancelThis!) this.cancelPending = undefined; }
  }

  async start(): Promise<void> {
    // Restart is safe even if a previous permission dialog or model load is pending.
    this.stop();
    const token = this.generation;
    const current = () => token === this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
      this.status('error', 'Camera tracking needs a supported browser over HTTPS. You can still explore with mouse or touch.');
      return;
    }
    if (document.hidden) { this.status('stopped', 'Return to this tab, then turn the camera on.'); return; }
    document.addEventListener('visibilitychange', this.handleHidden);
    window.addEventListener('pagehide', this.handlePageHide);
    this.status('loading', 'Loading hand tracking on your device…');
    try {
      const worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      const ready = new Promise<void>((resolve, reject) => {
        worker.onmessage = ({ data }: MessageEvent<WorkerEvent>) => {
          if (!current()) return;
          if (data.type === 'ready') resolve();
          else if (data.type === 'error') reject(new Error(data.message));
        };
        worker.onerror = () => reject(new Error('This browser could not start hand tracking.'));
      });
      worker.postMessage({ type: 'init', origin: window.location.origin });
      await this.cancellable(ready, 45000);
      if (!current()) return;
      this.status('ready', 'Allow camera access to control this workspace. No microphone is requested.');
      const streamPromise = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 } },
      }).then(stream => {
        // Permission can resolve after Stop, a hidden tab, or a startup timeout.
        if (!current()) { stream.getTracks().forEach(track => track.stop()); throw abort(); }
        return stream;
      });
      const stream = await this.cancellable(streamPromise, 45000);
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.cancellable(this.video.play(), 12000);
      if (!current()) return;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (current()) this.fail('Camera disconnected. Reconnect it and turn tracking on again.');
      }, { once: true }));
      worker.onmessage = ({ data }: MessageEvent<WorkerEvent>) => {
        if (!current()) return;
        if (data.type === 'error') { this.fail('Hand tracking stopped. Turn the camera on again, or use mouse and touch.'); return; }
        if (data.type !== 'result') return;
        clearTimeout(this.frameTimeout); this.inFlight = false;
        const sample = this.gestures.process(data);
        if (sample) this.onSample(sample);
        if (!sample || sample.phase === 'cancel') this.status('lost', 'Show one open hand to the camera.');
        else this.status('tracking', sample.pinching ? 'Pinch held. Move your hand to drag.' : 'Hand found. Point to aim; pinch to grab.');
      };
      worker.onerror = () => { if (current()) this.fail('Hand tracking stopped. You can still use mouse and touch.'); };
      this.running = true;
      this.status('lost', 'Camera on. Show one open hand to begin.');
      this.raf = requestAnimationFrame(time => void this.capture(time, token));
    } catch (error) {
      if (!current()) return;
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError') return;
      let message = 'Camera tracking could not start. Try a current Chrome, Edge or Safari browser; mouse and touch still work.';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') message = 'Camera permission was not allowed. Enable it in browser settings, or explore with mouse and touch.';
      if (name === 'NotFoundError') message = 'No camera was found. Connect a webcam, or explore with mouse and touch.';
      if (name === 'NotReadableError') message = 'The camera is busy or unavailable. Close other camera apps and try again.';
      this.fail(message);
    }
  }

  private async capture(time: number, token: number): Promise<void> {
    if (!this.running || token !== this.generation) return;
    this.raf = requestAnimationFrame(next => void this.capture(next, token));
    if (this.inFlight || time - this.lastCapture < 40 || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    // One ImageBitmap maximum: set before the asynchronous copy, release on result.
    this.inFlight = true; this.lastVideoTime = this.video.currentTime; this.lastCapture = time;
    try {
      const bitmap = await createImageBitmap(this.video);
      if (!this.running || token !== this.generation || !this.worker) { bitmap.close(); return; }
      this.frameTimeout = setTimeout(() => { if (token === this.generation) this.fail('Tracking took too long and was stopped safely. Try again, or use mouse and touch.'); }, 10000);
      this.worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]);
    } catch {
      if (token === this.generation) this.fail('Camera frames could not be read. Turn tracking on again, or use mouse and touch.');
    }
  }
}
