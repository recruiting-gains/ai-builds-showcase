import type { VisionFrame, VisionMessage } from '../contracts';

export type CameraFacing = 'user' | 'environment';

function errorField(error: unknown, field: 'name' | 'constraint'): string {
  if (!error || typeof error !== 'object' || !(field in error)) return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

function unavailable(facing: CameraFacing): string {
  return facing === 'environment'
    ? 'The rear camera is not available. Choose Front / Selfie or connect another camera, then try again.'
    : 'The front camera is not available. Choose Rear or connect another camera, then try again.';
}

export class CameraPipeline {
  readonly video = document.createElement('video');
  private worker: Worker | null = null; private stream: MediaStream | null = null;
  private generation = 0; private busy = false; private ready = false;
  private sentAt = 0; private lastSent = -Infinity; private lastVideoTime = -1; private id = 0;
  private segment = true;
  private selectedFacing: CameraFacing = 'user';
  // getUserMedia has no abort signal. Serialize permission requests so a stale
  // request releases its tracks before a replacement can open another camera.
  private captureQueue: Promise<void> | null = null;
  private trackCleanup: (() => void)[] = [];
  private watchdog: ReturnType<typeof setInterval> | null = null;
  constructor(private onFrame: (frame: VisionFrame) => void, private onStatus: (message: string, active: boolean) => void) {
    this.video.muted = true; this.video.playsInline = true;
  }
  get active() { return !!this.stream && this.ready; }
  get facing(): CameraFacing { return this.selectedFacing; }
  get mirrored() { return this.facing === 'user'; }
  async start(facing: CameraFacing = 'user') {
    this.stop(); const generation = this.generation;
    this.selectedFacing = facing;
    this.onStatus('Waiting for camera permission…', false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS and a supported browser.');
      if (facing === 'environment' && navigator.mediaDevices.getSupportedConstraints?.().facingMode === false) throw new Error('This browser cannot select a rear camera. Choose Front / Selfie or try another supported browser.');
      const stream = await this.acquire(facing, generation);
      if (!stream || generation !== this.generation) return;
      this.video.srcObject = stream;
      stream.getVideoTracks().forEach(track => {
        const ended = () => { if (generation === this.generation) this.fail('Camera disconnected. Connect it and try again.'); };
        track.addEventListener('ended', ended);
        this.trackCleanup.push(() => track.removeEventListener('ended', ended));
      });
      await this.video.play();
      if (generation !== this.generation) return;
      this.onStatus('Loading local vision models…', false);
      const worker = new Worker('/vision-worker.js'); this.worker = worker;
      const startedAt = performance.now();
      this.watchdog = setInterval(() => {
        if (generation !== this.generation) return;
        if ((!this.ready && performance.now() - startedAt > 30000) || (this.busy && performance.now() - this.sentAt > 10000)) this.fail('Tracking timed out. Restart the camera to recover.');
      }, 500);
      worker.onmessage = ({ data }: MessageEvent<VisionMessage>) => {
        if (generation !== this.generation) return;
        if (data.type === 'ready' && !this.ready) { this.ready = true; this.onStatus('Camera on · processing on this device', true); }
        if (data.type === 'frame' && this.busy && data.id === this.id) {
          this.busy = false;
          const age = performance.now() - data.timestamp;
          if (Number.isFinite(age) && age >= 0 && age <= 1000) this.onFrame(data);
          // When inference was slower than a display tick, take the latest decoded
          // frame immediately. The same busy/cadence guards prevent any backlog.
          if (generation === this.generation) void this.infer(performance.now(), this.segment);
        }
        if (data.type === 'error') this.fail(data.message);
      };
      worker.onerror = () => { if (generation === this.generation) this.fail('The vision worker could not load. Restart to try again.'); };
      worker.postMessage({ type: 'init' });
    } catch (error) {
      if (generation !== this.generation) return;
      const name = errorField(error, 'name');
      this.fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'Camera access was declined. Allow it in your browser, then try again.'
        : name === 'NotFoundError' ? (facing === 'environment' ? unavailable(facing) : 'No camera found. Connect one, then try again.')
        : name === 'OverconstrainedError' ? unavailable(facing)
        : name === 'NotReadableError' ? 'The camera is busy or could not be read. Close other camera apps, then try again.'
        : error instanceof Error ? error.message : 'Camera could not start. Try again.');
    }
  }
  private acquire(facing: CameraFacing, generation: number): Promise<MediaStream | null> {
    const acquire = async () => {
      if (generation !== this.generation) return null;
      const direction = facing === 'environment' ? { exact: facing } : { ideal: facing };
      const capture = (relaxed = false) => navigator.mediaDevices.getUserMedia({
        video: relaxed ? { facingMode: direction } : {
          width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: direction, frameRate: { ideal: 60 },
        }, audio: false,
      });
      let stream: MediaStream;
      try { stream = await capture(); }
      catch (error) {
        if (generation !== this.generation) return null;
        // Only a concrete size/rate constraint failure gets one correction.
        // Never relax the requested rear camera into an arbitrary camera.
        if (errorField(error, 'name') !== 'OverconstrainedError' || !['width', 'height', 'frameRate'].includes(errorField(error, 'constraint'))) throw error;
        stream = await capture(true);
      }
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return null; }
      try {
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error('No camera video was returned. Choose another camera, then try again.');
        const actual = track.getSettings?.().facingMode;
        if (actual && actual !== facing) throw new Error(unavailable(facing));
        this.selectedFacing = actual === 'user' || actual === 'environment' ? actual : facing;
        this.stream = stream;
        return stream;
      } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
    };
    // Preserve the initial permission request in the caller's user gesture.
    // Only an already-pending request needs to wait for camera ownership.
    const request = this.captureQueue ? this.captureQueue.then(acquire) : acquire();
    const queue = request.then(() => {}, () => {});
    this.captureQueue = queue;
    void queue.then(() => { if (this.captureQueue === queue) this.captureQueue = null; });
    return request;
  }
  async infer(now: number, segment: boolean) {
    // Hands always use fresh camera frames; the worker budgets segmentation separately.
    this.segment = segment;
    const interval = 16;
    if (!Number.isFinite(now) || now < 0 || !this.active || this.busy || now - this.lastSent < interval || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime || !this.video.videoWidth || !this.video.videoHeight) return;
    this.busy = true; this.sentAt = this.lastSent = now; this.lastVideoTime = this.video.currentTime;
    const generation = this.generation, id = ++this.id;
    let bitmap: ImageBitmap | null = null;
    try {
      // The model must see undistorted hands. Portrait phone cameras are not
      // 16:9: forcing 512x288 makes a tall frame more than three times wider.
      // Resize the complete image uniformly; normalized x/y still map onto
      // the same complete camera image used by the compositor.
      const scale = Math.min(1, 512 / Math.max(this.video.videoWidth, this.video.videoHeight));
      bitmap = await createImageBitmap(this.video, {
        resizeWidth: Math.max(1, Math.round(this.video.videoWidth * scale)),
        resizeHeight: Math.max(1, Math.round(this.video.videoHeight * scale)),
      });
      if (generation !== this.generation || !this.worker) { bitmap.close(); return; }
      this.worker.postMessage({ type: 'frame', id, timestamp: now, bitmap, segment }, [bitmap]);
      bitmap = null; // Ownership moved to the worker.
    } catch {
      bitmap?.close();
      if (generation === this.generation) this.fail('This browser could not read a camera frame. Try another supported browser.');
    }
  }
  stop() {
    this.generation++; this.ready = this.busy = false; this.lastSent = -Infinity; this.lastVideoTime = -1; this.segment = true;
    this.trackCleanup.forEach(cleanup => cleanup()); this.trackCleanup = [];
    this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null;
    if (this.watchdog) clearInterval(this.watchdog); this.watchdog = null;
  }
  private fail(message: string) { this.stop(); this.onStatus(message, false); }
}
