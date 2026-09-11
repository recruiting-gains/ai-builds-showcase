export type RecordingPhase = 'idle' | 'recording' | 'stopping' | 'ready' | 'error';
export interface RecordedClip { blob: Blob; url: string; file: File; durationMs: number }
export interface RecordingSnapshot { phase: RecordingPhase; elapsedMs: number; clip?: RecordedClip; message: string }
export const RECORDING_LIMITS = Object.freeze({ durationMs: 60_000, bytes: 48 * 1024 * 1024, finalizationMs: 5_000, framesPerSecond: 30 });
const MIME_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'] as const;
type Timer = ReturnType<typeof setTimeout>;

/** Small browser boundary for deterministic failure/recovery tests. No camera access is needed. */
export interface RecordingDependencies {
  available(canvas: HTMLCanvasElement): boolean;
  capture(canvas: HTMLCanvasElement, framesPerSecond: number): MediaStream;
  supportsMime(mime: string): boolean;
  createRecorder(stream: MediaStream, options: MediaRecorderOptions): MediaRecorder;
  now(): number;
  schedule(callback: () => void, delayMs: number): Timer;
  cancel(timer: Timer): void;
  createURL(blob: Blob): string;
  revokeURL(url: string): void;
  createFile(blob: Blob, filename: string): File;
}
const browserDependencies: RecordingDependencies = {
  available: canvas => typeof MediaRecorder === 'function' && typeof canvas.captureStream === 'function',
  capture: (canvas, framesPerSecond) => canvas.captureStream(framesPerSecond),
  supportsMime: mime => MediaRecorder.isTypeSupported(mime),
  createRecorder: (stream, options) => new MediaRecorder(stream, options),
  now: () => performance.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: timer => clearTimeout(timer),
  createURL: blob => URL.createObjectURL(blob),
  revokeURL: url => URL.revokeObjectURL(url),
  createFile: (blob, filename) => new File([blob], filename, { type: blob.type }),
};
interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  startedAt: number;
  stoppedAt?: number;
  chunks: Blob[];
  bytes: number;
  chunkType?: string;
  reason?: string;
  tick?: Timer;
  deadline?: Timer;
  finalization?: Timer;
}

/** Records the already-composited scene canvas only. DOM controls and microphone audio are excluded. */
export class CanvasRecorder {
  private readonly deps: RecordingDependencies;
  private phase: RecordingPhase = 'idle';
  private elapsedMs = 0;
  private clip?: RecordedClip;
  private message = 'Record up to 60 seconds. The clip stays on this device until you share it.';
  private session?: Session;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onChange: (snapshot: RecordingSnapshot) => void = () => {}, dependencies: Partial<RecordingDependencies> = {}) {
    this.deps = { ...browserDependencies, ...dependencies };
  }
  get supported(): boolean { return !this.disposed && this.preferredMime() !== undefined; }
  get snapshot(): RecordingSnapshot {
    const elapsedMs = this.session ? this.elapsed(this.session) : this.elapsedMs;
    return { phase: this.phase, elapsedMs, ...(this.clip ? { clip: this.clip } : {}), message: this.message };
  }
  start(): boolean {
    if (this.disposed || this.session || this.clip) return false;
    const mimeType = this.preferredMime();
    if (!mimeType) { this.fail('Recording is unavailable in this browser. Try opening this page in Safari or Chrome.'); return false; }
    let stream: MediaStream | undefined;
    let session: Session | undefined;
    try {
      stream = this.deps.capture(this.canvas, RECORDING_LIMITS.framesPerSecond);
      if (!stream.getVideoTracks().some(track => track.readyState === 'live') || stream.getAudioTracks().length) throw new Error('No canvas video track.');
      const recorder = this.deps.createRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
      session = { stream, recorder, startedAt: this.deps.now(), chunks: [], bytes: 0 };
      this.session = session;
      const active = session;
      recorder.ondataavailable = event => this.receive(active, event.data);
      recorder.onstop = () => this.finish(active);
      recorder.onerror = () => { if (this.current(active)) this.fail('The browser could not finish this recording. Try a shorter take.', active); };
      this.phase = 'recording'; this.elapsedMs = 0; this.message = 'Recording your camera view and effects. No microphone audio.';
      recorder.start(1000);
      if (!this.current(active) || this.phase !== 'recording') return false;
      active.deadline = this.deps.schedule(() => { if (this.current(active)) this.stop('The 60-second limit was reached. Your clip is ready to save.'); }, RECORDING_LIMITS.durationMs);
      this.scheduleTick(active);
      this.emit();
      return true;
    } catch {
      if (session && this.current(session)) this.fail('Recording could not start. Try again, or open this page in Safari or Chrome.', session);
      else {
        if (stream) this.releaseTracks(stream);
        this.fail('Recording could not start. Try again, or open this page in Safari or Chrome.');
      }
      return false;
    }
  }
  stop(reason?: string): void {
    const active = this.session;
    if (!active || this.phase !== 'recording' || this.disposed) return;
    active.stoppedAt = this.deps.now(); active.reason = reason;
    this.phase = 'stopping'; this.message = 'Finishing your clip…';
    this.cancel(active, 'tick'); this.cancel(active, 'deadline');
    active.finalization = this.deps.schedule(() => { if (this.current(active)) this.fail('The browser took too long to finish. Try a shorter recording.', active); }, RECORDING_LIMITS.finalizationMs);
    this.emit();
    try { if (active.recorder.state !== 'inactive') active.recorder.stop(); }
    catch { this.fail('The browser could not stop this recording. Please try again.', active); }
  }
  clear(): void {
    if (this.disposed) return;
    this.abandon(); this.releaseClip(); this.phase = 'idle'; this.elapsedMs = 0;
    this.message = 'Ready for another take. Record up to 60 seconds.'; this.emit();
  }
  dispose(): void {
    if (this.disposed) return;
    this.abandon(); this.releaseClip(); this.disposed = true; this.phase = 'idle'; this.elapsedMs = 0;
  }
  private preferredMime(): string | undefined {
    try {
      if (!this.deps.available(this.canvas)) return undefined;
      return MIME_TYPES.find(mime => { try { return this.deps.supportsMime(mime); } catch { return false; } });
    } catch { return undefined; }
  }
  private current(active: Session): boolean { return this.session === active && !this.disposed; }
  private elapsed(active: Session): number { return Math.max(0, (active.stoppedAt ?? this.deps.now()) - active.startedAt); }
  private emit(): void { try { this.onChange(this.snapshot); } catch { /* A view callback cannot prevent recording cleanup. */ } }
  private scheduleTick(active: Session): void {
    active.tick = this.deps.schedule(() => {
      if (!this.current(active) || this.phase !== 'recording') return;
      if (this.elapsed(active) >= RECORDING_LIMITS.durationMs) this.stop('The 60-second limit was reached. Your clip is ready to save.');
      else { this.emit(); this.scheduleTick(active); }
    }, 250);
  }
  private receive(active: Session, data: Blob): void {
    if (!this.current(active)) return;
    if (!Number.isFinite(data.size) || data.size < 0 || active.bytes + data.size > RECORDING_LIMITS.bytes) {
      // Never truncate a container or offer an incomplete file as a successful recording.
      this.fail('This clip exceeded the 48 MB limit. Please record a shorter take.', active); return;
    }
    if (!data.size) return;
    active.chunks.push(data); active.bytes += data.size;
    if (data.type) active.chunkType = data.type;
    if (active.bytes === RECORDING_LIMITS.bytes) this.stop('The size limit was reached. Your clip is ready to save.');
  }
  private finish(active: Session): void {
    if (!this.current(active)) return;
    this.elapsedMs = this.elapsed(active);
    const chunks = active.chunks, bytes = active.bytes;
    // Use the format actually emitted by the recorder, never a guessed .mp4 extension.
    const mime = active.chunkType || active.recorder.mimeType;
    const baseType = mime?.split(';')[0].trim().toLowerCase();
    const extension = baseType === 'video/mp4' ? 'mp4' : baseType === 'video/webm' ? 'webm' : undefined;
    const reason = active.reason;
    this.cleanup(active); this.session = undefined;
    if (!bytes || !extension) { this.fail(!bytes ? 'No video was captured. Record for a little longer and try again.' : 'The browser returned an unsupported video format. Please try another browser.'); return; }
    try {
      const blob = new Blob(chunks, { type: baseType });
      const file = this.deps.createFile(blob, `jedi-mindtrick-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`);
      const url = this.deps.createURL(blob);
      this.clip = { blob, url, file, durationMs: this.elapsedMs };
      this.phase = 'ready'; this.message = reason || 'Your clip is ready. Save or share it before recording again.'; this.emit();
    } catch { this.fail('The clip could not be prepared for saving. Try a shorter recording.'); }
  }
  private cancel(active: Session, key: 'tick' | 'deadline' | 'finalization'): void {
    const timer = active[key]; if (timer !== undefined) this.deps.cancel(timer); active[key] = undefined;
  }
  private cleanup(active: Session): void {
    this.cancel(active, 'tick'); this.cancel(active, 'deadline'); this.cancel(active, 'finalization');
    active.recorder.ondataavailable = null; active.recorder.onstop = null; active.recorder.onerror = null;
    try { if (active.recorder.state !== 'inactive') active.recorder.stop(); } catch { /* Tracks are still released. */ }
    this.releaseTracks(active.stream); active.chunks = [];
  }
  private releaseTracks(stream: MediaStream): void { for (const track of stream.getTracks()) { try { track.stop(); } catch { /* Release every owned track. */ } } }
  private abandon(): void { const active = this.session; if (active) { this.session = undefined; this.cleanup(active); } }
  private releaseClip(): void { if (this.clip) { try { this.deps.revokeURL(this.clip.url); } catch { /* Already-released URLs are harmless. */ } this.clip = undefined; } }
  private fail(message: string, active?: Session): void {
    if (active && !this.current(active)) return;
    if (active) { this.elapsedMs = this.elapsed(active); this.cleanup(active); this.session = undefined; }
    this.phase = 'error'; this.message = message; this.emit();
  }
}
