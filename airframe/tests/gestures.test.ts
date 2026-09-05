import { afterEach, describe, expect, it, vi } from 'vitest';
import { GestureProcessor, pinchRatio, validLandmarks, type DetectedHand, type Landmark } from '../src/tracking/gestures';
import { HandController, type TrackingSample, type TrackingStatus } from '../src/tracking/controller';

function hand(gap = 0.12, handedness = 'Right'): DetectedHand {
  const landmarks: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.5, z: 0 }));
  landmarks[0] = { x: 0.4, y: 0.75, z: 0 };
  landmarks[9] = { x: 0.4, y: 0.55, z: 0 };
  landmarks[8] = { x: 0.45, y: 0.25, z: 0 };
  landmarks[4] = { x: 0.45 + gap, y: 0.25, z: 0 };
  return { landmarks, handedness, confidence: 0.96 };
}
const frame = (hands: DetectedHand[], time: number) => ({ hands, time, width: 640, height: 480, latencyMs: 12 });
const at = (processor: GestureProcessor, time: number, gap = 0.12) => processor.process(frame([hand(gap)], time));

describe('gesture safety and controls (synthetic landmarks, not a camera accuracy test)', () => {
  it('mirrors the index-tip pointer and landmarks without mutating input', () => {
    const input = hand(); const saved = JSON.stringify(input);
    const sample = new GestureProcessor().process(frame([input], 0))!;
    expect(sample.x).toBeCloseTo(0.55); expect(sample.y).toBeCloseTo(0.25);
    expect(sample.landmarks[8].x).toBeCloseTo(0.55); expect(sample.phase).toBe('move');
    expect(JSON.stringify(input)).toBe(saved);
  });
  it('requires opening before an initial pinch can grab', () => {
    const p = new GestureProcessor();
    expect(at(p, 0, 0.025)?.pinching).toBe(false);
    expect(at(p, 200, 0.025)?.phase).toBe('move');
    at(p, 220); at(p, 250, 0.025);
    expect(at(p, 331, 0.025)?.phase).toBe('down');
  });
  it('debounces transient pinches and emits one down/up per held gesture', () => {
    const p = new GestureProcessor(); at(p, 0);
    expect(at(p, 20, 0.025)?.phase).toBe('move');
    expect(at(p, 60)?.phase).toBe('move');
    at(p, 80, 0.025);
    expect(at(p, 161, 0.025)?.phase).toBe('down');
    expect(at(p, 250, 0.025)?.phase).toBe('move');
    expect(at(p, 270)?.pinching).toBe(true);
    expect(at(p, 336)?.phase).toBe('up');
    expect(at(p, 400)?.phase).toBe('move');
  });
  it('uses different close/release thresholds to prevent boundary flicker', () => {
    const p = new GestureProcessor(); at(p, 0); at(p, 20, 0.025); at(p, 101, 0.025);
    expect(at(p, 200, 0.0525)?.pinching).toBe(true);
    expect(at(p, 400, 0.0525)?.phase).toBe('move');
  });
  it('resets the release debounce after a short opening', () => {
    const p = new GestureProcessor(); at(p, 0); at(p, 20, 0.025); at(p, 101, 0.025);
    at(p, 120); at(p, 150, 0.025); at(p, 160);
    expect(at(p, 180)?.pinching).toBe(true);
    expect(at(p, 226)?.phase).toBe('up');
  });
  it('cancels on missing hand once and does not produce a release click', () => {
    const p = new GestureProcessor(); at(p, 0); at(p, 20, 0.025); const down = at(p, 101, 0.025)!;
    const lost = p.process(frame([], 120))!;
    expect(lost.phase).toBe('cancel'); expect(lost.pinching).toBe(false); expect(lost.landmarks).toEqual([]);
    expect(lost.x).toBe(down.x); expect(p.process(frame([], 140))).toBeNull();
    expect(at(p, 160, 0.025)?.phase).toBe('move'); expect(at(p, 260, 0.025)?.pinching).toBe(false);
  });
  it('preserves hand selection when model result order changes', () => {
    const p = new GestureProcessor(); const right = hand(); const left = hand(0.12, 'Left');
    left.landmarks = left.landmarks.map(point => ({ ...point, x: point.x - 0.2 }));
    p.process(frame([right], 0));
    expect(p.process(frame([left, right], 40))?.x).toBeCloseTo(0.55);
    expect(p.process(frame([left], 80))?.phase).toBe('cancel');
    expect(p.process(frame([left], 100))).toBeNull();
  });
  it('rejects a sudden wrist jump instead of teleporting a drag', () => {
    const p = new GestureProcessor(); at(p, 0);
    const jumped = hand(); jumped.landmarks = jumped.landmarks.map(point => ({ ...point, x: point.x + 0.3 }));
    expect(p.process(frame([jumped], 40))?.phase).toBe('cancel');
  });
  it('permits a new hand after lock expiration, but starts ungrabbed', () => {
    const p = new GestureProcessor(); at(p, 0); at(p, 20, 0.025); at(p, 101, 0.025);
    p.process(frame([], 200)); p.process(frame([], 700));
    const sample = p.process(frame([hand(0.025, 'Left')], 800))!;
    expect(sample.phase).toBe('move'); expect(sample.pinching).toBe(false);
  });
  it('rejects missing, NaN, infinite, out-of-frame and degenerate landmarks', () => {
    for (const bad of [NaN, Infinity, -0.1, 1.1]) {
      const p = new GestureProcessor(); at(p, 0); const input = hand(); input.landmarks[8].x = bad;
      expect(p.process(frame([input], 40))?.phase).toBe('cancel');
    }
    expect(validLandmarks(hand().landmarks.slice(0, 20))).toBe(false);
    const invalidZ = hand(); invalidZ.landmarks[3].z = NaN; expect(validLandmarks(invalidZ.landmarks)).toBe(false);
    const collapsed = hand(); collapsed.landmarks[9] = { ...collapsed.landmarks[0] };
    expect(pinchRatio(collapsed.landmarks, 640, 480)).toBe(Infinity);
  });
  it('uses pixel aspect ratio rather than mixing normalized x/y units', () => {
    const points = hand(0.045).landmarks;
    const scaled = points.map(point => ({ ...point, x: point.x / 2 }));
    expect(pinchRatio(points, 640, 480)).toBeCloseTo(pinchRatio(scaled, 1280, 480));
    expect(pinchRatio(points, 640, 480)).toBeGreaterThan(pinchRatio(points, 480, 480));
  });
  it('smooths small jitter, without changing a stationary pointer', () => {
    const p = new GestureProcessor(); at(p, 0); const moved = hand(); moved.landmarks[8].x += 0.02;
    const sample = p.process(frame([moved], 16))!;
    expect(sample.x).toBeGreaterThan(0.53); expect(sample.x).toBeLessThan(0.55);
    const stationary = new GestureProcessor(); at(stationary, 0); expect(at(stationary, 16)?.x).toBeCloseTo(0.55);
  });
  it('drops stale/out-of-order frames and low-score hands', () => {
    const p = new GestureProcessor(); at(p, 100);
    expect(at(p, 100, 0.025)).toBeNull(); expect(at(p, 99)).toBeNull(); expect(at(p, NaN)).toBeNull();
    const weak = hand(); weak.confidence = 0.4; expect(p.process(frame([weak], 140))?.phase).toBe('cancel');
  });
  it('resets cleanly, emits at most one cancel, and clamps sensitivity', () => {
    const p = new GestureProcessor(); p.setSensitivity(NaN); at(p, 0);
    expect(p.reset()?.phase).toBe('cancel'); expect(p.reset()).toBeNull();
    p.setSensitivity(100); expect(at(p, 0)?.phase).toBe('move');
    p.setSensitivity(-1); expect(at(p, 40)?.phase).toBe('move');
  });
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']; let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

function cameraHarness(options: { autoReady?: boolean; permission?: Promise<MediaStream> } = {}) {
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = Object.assign(new EventTarget(), { isSecureContext: true, location: { origin: 'https://example.test' } });
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  const video = { muted: false, playsInline: false, srcObject: null, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(),
    readyState: 4, currentTime: 1 } as unknown as HTMLVideoElement;
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void; onerror?: () => void;
    terminate = vi.fn();
    constructor() { workers.push(this); }
    postMessage(data: { type: string }) {
      if (data.type === 'init' && options.autoReady !== false) queueMicrotask(() => this.onmessage?.({ data: { type: 'ready', delegate: 'CPU' } } as MessageEvent));
    }
  }
  const gum = vi.fn().mockImplementation(() => options.permission ?? Promise.resolve(stream));
  let raf: FrameRequestCallback | undefined;
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: gum } });
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { raf = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const close = vi.fn(); vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close }));
  const statuses: TrackingStatus[] = []; const samples: TrackingSample[] = [];
  const controller = new HandController(video, sample => samples.push(sample), status => statuses.push(status));
  return { controller, statuses, samples, doc, win, track, stream, video, workers, gum, frame: (time: number) => raf?.(time), close };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('camera lifecycle (mocked camera and worker; no real camera access)', () => {
  it('does not request a camera until explicitly started, and never requests audio', async () => {
    const h = cameraHarness(); expect(h.gum).not.toHaveBeenCalled(); expect(h.workers).toHaveLength(0);
    await h.controller.start(); expect(h.gum).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    h.controller.stop(); expect(h.track.stop).toHaveBeenCalledTimes(1); expect(h.workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(h.video.srcObject).toBeNull(); expect(h.statuses.at(-1)?.state).toBe('stopped');
  });
  it('shows honest permission denial and terminates the worker', async () => {
    const permission = deferred<MediaStream>(); const h = cameraHarness({ permission: permission.promise });
    const start = h.controller.start(); await flush(); permission.reject(new DOMException('Denied', 'NotAllowedError')); await start;
    expect(h.statuses.at(-1)?.message).toContain('permission was not allowed'); expect(h.workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(h.video.srcObject).toBeNull();
  });
  it('stops a late camera permission result after user cancellation', async () => {
    const permission = deferred<MediaStream>(); const h = cameraHarness({ permission: permission.promise });
    const start = h.controller.start(); await flush(); h.controller.stop(); await start;
    permission.resolve(h.stream); await flush();
    expect(h.track.stop).toHaveBeenCalledTimes(1); expect(h.video.srcObject).toBeNull(); expect(h.statuses.at(-1)?.state).toBe('stopped');
  });
  it('handles start/start/stop without clearing the newer cancellation callback', async () => {
    const h = cameraHarness({ autoReady: false }); const first = h.controller.start(); const second = h.controller.start();
    await flush(); h.controller.stop(); await Promise.all([first, second]);
    expect(h.workers).toHaveLength(2); expect(h.workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    expect(h.gum).not.toHaveBeenCalled();
  });
  it('stops every track and pending inference when the tab is hidden', async () => {
    const h = cameraHarness(); await h.controller.start(); h.doc.hidden = true; h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.track.stop).toHaveBeenCalledTimes(1); expect(h.workers[0].terminate).toHaveBeenCalledTimes(1); expect(h.statuses.at(-1)?.state).toBe('stopped');
  });
  it('stops on pagehide and on inference errors', async () => {
    const h = cameraHarness(); await h.controller.start(); h.win.dispatchEvent(new Event('pagehide'));
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    await h.controller.start(); h.workers[1].onmessage?.({ data: { type: 'error', message: 'GPU failure' } } as MessageEvent);
    expect(h.track.stop).toHaveBeenCalledTimes(2); expect(h.statuses.at(-1)?.state).toBe('error'); expect(h.video.srcObject).toBeNull();
  });
  it('bounds capture to one in-flight bitmap and terminates stalled inference', async () => {
    vi.useFakeTimers(); const h = cameraHarness(); await h.controller.start();
    h.frame(100); await flush(); h.video.currentTime = 2; h.frame(150); await flush();
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10001); expect(h.track.stop).toHaveBeenCalledTimes(1); expect(h.statuses.at(-1)?.state).toBe('error');
  });
  it('closes a bitmap that resolves after Stop without handing it to a worker', async () => {
    const h = cameraHarness(); const bitmap = deferred<ImageBitmap>(); vi.mocked(createImageBitmap).mockReturnValue(bitmap.promise);
    await h.controller.start(); h.frame(100); h.controller.stop(); const close = vi.fn(); bitmap.resolve({ close } as unknown as ImageBitmap); await flush();
    expect(close).toHaveBeenCalledTimes(1); expect(h.video.srcObject).toBeNull();
  });
});
