import type { VisionFrame, VisionMessage } from '../contracts';

export class CameraPipeline {
  readonly video = document.createElement('video');
  private worker: Worker | null = null; private stream: MediaStream | null = null;
  private generation = 0; private busy = false; private ready = false;
  private sentAt = 0; private lastSent = 0; private id = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  constructor(private onFrame: (frame: VisionFrame) => void, private onStatus: (message: string, active: boolean) => void) {
    this.video.muted = true; this.video.playsInline = true;
  }
  get active() { return !!this.stream && this.ready; }
  async start() {
    this.stop(); const generation = this.generation;
    this.onStatus('Waiting for camera permission…', false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS and a supported browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      stream.getVideoTracks().forEach(t => t.addEventListener('ended', () => { if (generation === this.generation) this.fail('Camera disconnected. Connect it and try again.'); }));
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
        if (data.type === 'ready') { this.ready = true; this.onStatus('Camera on · processing on this device', true); }
        if (data.type === 'frame' && data.id === this.id) { this.busy = false; this.onFrame(data); }
        if (data.type === 'error') this.fail(data.message);
      };
      worker.onerror = () => { if (generation === this.generation) this.fail('The vision worker could not load. Restart to try again.'); };
      worker.postMessage({ type: 'init' });
    } catch (error) {
      if (generation !== this.generation) return;
      const name = error instanceof DOMException ? error.name : '';
      this.fail(name === 'NotAllowedError' ? 'Camera access was declined. Allow it in your browser, then try again.' : name === 'NotFoundError' ? 'No camera found. Connect one, then try again.' : error instanceof Error ? error.message : 'Camera could not start. Try again.');
    }
  }
  async infer(now: number, segment: boolean) {
    if (!this.active || this.busy || now - this.lastSent < 85 || this.video.readyState < 2) return;
    this.busy = true; this.sentAt = this.lastSent = now;
    const generation = this.generation, id = ++this.id;
    try {
      const bitmap = await createImageBitmap(this.video, { resizeWidth: 512, resizeHeight: 288 });
      if (generation !== this.generation || !this.worker) { bitmap.close(); return; }
      this.worker.postMessage({ type: 'frame', id, timestamp: now, bitmap, segment }, [bitmap]);
    } catch { if (generation === this.generation) this.fail('This browser could not read a camera frame. Try another supported browser.'); }
  }
  stop() {
    this.generation++; this.ready = this.busy = false;
    this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null;
    if (this.watchdog) clearInterval(this.watchdog); this.watchdog = null;
  }
  private fail(message: string) { this.stop(); this.onStatus(message, false); }
}
