import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CameraPipeline } from '../src/vision/camera';
import type { VisionFrame, VisionMessage } from '../src/contracts';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
function failure(name: string, constraint?: string) { return Object.assign(new Error(name), { name, constraint }); }

class Track {
  stopped = 0;
  listeners = new Set<() => void>();
  getSettings: (() => MediaTrackSettings) | undefined;
  constructor(facing?: string) { this.getSettings = () => facing ? { facingMode: facing } : {}; }
  stop() { this.stopped++; }
  addEventListener(_name: string, callback: () => void) { this.listeners.add(callback); }
  removeEventListener(_name: string, callback: () => void) { this.listeners.delete(callback); }
  end() { for (const callback of this.listeners) callback(); }
}
function stream(facing?: string) {
  const track = new Track(facing), extra = new Track();
  return { track, extra, media: { getTracks: () => [track, extra], getVideoTracks: () => [track] } as unknown as MediaStream };
}
function bitmap() { return { closed: 0, close() { this.closed++; } }; }

function setup(t: TestContext) {
  const statuses: { message: string; active: boolean }[] = [], frames: VisionFrame[] = [];
  const requests: MediaStreamConstraints[] = [], workers: FakeWorker[] = [], captures: number[] = [], captureSizes: ImageBitmapOptions[] = [];
  const timers = new Map<number, () => void>();
  const restoreGlobals: (() => void)[] = [];
  let now = 100, timerId = 0;
  let media: (constraints: MediaStreamConstraints) => Promise<MediaStream> = async () => stream('user').media;
  let makeBitmap: () => Promise<ReturnType<typeof bitmap>> = async () => bitmap();
  let play: () => Promise<void> = async () => {};
  const video = {
    muted: false, playsInline: false, srcObject: null as MediaStream | null,
    readyState: 2, currentTime: 1, videoWidth: 720, videoHeight: 1280,
    play: () => play(), pauseCalls: 0, pause() { this.pauseCalls++; },
  };
  type Sent = { type: string; id?: number; timestamp?: number; bitmap?: unknown; segment?: boolean };
  class FakeWorker {
    onmessage: ((event: MessageEvent<VisionMessage>) => void) | null = null;
    onerror: (() => void) | null = null;
    sent: Sent[] = []; transfers: unknown[][] = []; terminated = 0; rejectFrames = false;
    constructor(readonly url: string) { workers.push(this); }
    postMessage(message: Sent, transfer: unknown[] = []) {
      if (this.rejectFrames && message.type === 'frame') throw new Error('transfer failed');
      this.sent.push(message); this.transfers.push(transfer);
    }
    terminate() { this.terminated++; }
    emit(data: VisionMessage) { this.onmessage?.({ data } as MessageEvent<VisionMessage>); }
    reply(timestamp = now, id = this.sent.at(-1)!.id!) {
      this.emit({ type: 'frame', id, timestamp, hands: [], inferenceMs: 5 });
    }
  }
  const mediaDevices = {
    getUserMedia: (constraints: MediaStreamConstraints) => { requests.push(constraints); return media(constraints); },
    getSupportedConstraints: () => ({ facingMode: true }),
  };
  function global(name: string, value: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    restoreGlobals.push(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  global('document', { createElement: (name: string) => { assert.equal(name, 'video'); return video; } });
  global('navigator', { mediaDevices });
  global('Worker', FakeWorker);
  global('performance', { now: () => now });
  global('setInterval', (callback: () => void) => { timers.set(++timerId, callback); return timerId; });
  global('clearInterval', (id: number) => timers.delete(id));
  global('createImageBitmap', (source: unknown, options: ImageBitmapOptions) => {
    assert.equal(source, video);
    captureSizes.push(options);
    captures.push(video.currentTime); return makeBitmap();
  });
  const pipeline = new CameraPipeline(frame => frames.push(frame), (message, active) => statuses.push({ message, active }));
  t.after(() => { pipeline.stop(); restoreGlobals.reverse().forEach(restore => restore()); });
  return {
    pipeline, video, statuses, frames, requests, workers, captures, captureSizes, timers, mediaDevices,
    setMedia: (next: typeof media) => { media = next; }, setBitmap: (next: typeof makeBitmap) => { makeBitmap = next; },
    setPlay: (next: typeof play) => { play = next; }, time: (value: number) => { now = value; },
    tick: () => { for (const callback of [...timers.values()]) callback(); },
  };
}

test('selfie is the default; switching stops the old stream and keeps the requested facing after stop', async t => {
  const f = setup(t), front = stream('user'), rear = stream('environment');
  f.setMedia(async () => f.requests.length === 1 ? front.media : rear.media);
  await f.pipeline.start();
  assert.equal(f.video.muted, true); assert.equal(f.video.playsInline, true);
  assert.equal(f.pipeline.active, false); assert.equal(f.pipeline.facing, 'user'); assert.equal(f.pipeline.mirrored, true);
  assert.deepEqual((f.requests[0].video as MediaTrackConstraints).facingMode, { ideal: 'user' });
  assert.equal(f.requests[0].audio, false);
  const oldWorker = f.workers[0], oldMessage = oldWorker.onmessage!, oldEnd = [...front.track.listeners][0];
  oldWorker.emit({ type: 'ready' }); assert.equal(f.pipeline.active, true);
  const switchCamera = f.pipeline.start('environment');
  assert.equal(front.track.stopped, 1); assert.equal(front.extra.stopped, 1); assert.equal(oldWorker.terminated, 1);
  assert.equal(front.track.listeners.size, 0); assert.equal(f.video.srcObject, null);
  await switchCamera;
  assert.deepEqual((f.requests[1].video as MediaTrackConstraints).facingMode, { exact: 'environment' });
  f.workers[1].emit({ type: 'ready' });
  assert.equal(f.pipeline.facing, 'environment'); assert.equal(f.pipeline.mirrored, false);
  oldEnd(); oldMessage({ data: { type: 'error', message: 'stale failure' } } as MessageEvent<VisionMessage>);
  assert.equal(f.pipeline.active, true); assert.equal(rear.track.stopped, 0);
  f.pipeline.stop(); f.pipeline.stop();
  assert.equal(rear.track.stopped, 1); assert.equal(rear.extra.stopped, 1);
  assert.equal(f.workers[1].terminated, 1); assert.equal(f.timers.size, 0); assert.equal(f.video.srcObject, null);
  assert.equal(f.pipeline.facing, 'environment'); assert.equal(f.pipeline.mirrored, false);
});

test('overlapping permission requests acquire only the latest selection and never retain two streams', async t => {
  const f = setup(t), pending = deferred<MediaStream>(), old = stream('user'), latest = stream('user');
  f.setMedia(async () => {
    if (f.requests.length === 1) return pending.promise;
    assert.equal(old.track.stopped, 1, 'stale camera must release before the next request');
    return latest.media;
  });
  const first = f.pipeline.start(); await settle();
  const skipped = f.pipeline.start('environment'), last = f.pipeline.start('user'); await settle();
  assert.equal(f.requests.length, 1, 'permission acquisition must not overlap');
  pending.resolve(old.media); await Promise.all([first, skipped, last]);
  assert.equal(f.requests.length, 2); assert.equal(old.track.stopped, 1); assert.equal(old.extra.stopped, 1);
  assert.equal(f.workers.length, 1); assert.equal(f.video.srcObject, latest.media);
  f.workers[0].emit({ type: 'ready' }); assert.equal(f.pipeline.active, true);
});

test('stopping during permission or video playback cancels late starts without a new worker or status', async t => {
  const f = setup(t), permission = deferred<MediaStream>(), capture = stream('user');
  f.setMedia(() => permission.promise);
  const start = f.pipeline.start(); await settle(); f.pipeline.stop();
  const statusCount = f.statuses.length; permission.resolve(capture.media); await start;
  assert.equal(capture.track.stopped, 1); assert.equal(f.workers.length, 0); assert.equal(f.statuses.length, statusCount);
  const playing = deferred<void>(), next = stream('user');
  f.setMedia(async () => next.media); f.setPlay(() => playing.promise);
  const second = f.pipeline.start(); await settle(); assert.equal(f.video.srcObject, next.media);
  f.pipeline.stop(); playing.resolve(); await second;
  assert.equal(next.track.stopped, 1); assert.equal(f.workers.length, 0); assert.equal(f.video.srcObject, null);
});

test('a stale rejected permission request cannot fail a newer camera start', async t => {
  const f = setup(t), pending = deferred<MediaStream>(), rear = stream('environment');
  f.setMedia(() => f.requests.length === 1 ? pending.promise : Promise.resolve(rear.media));
  const first = f.pipeline.start(); await settle(); const second = f.pipeline.start('environment');
  pending.reject(failure('NotAllowedError')); await Promise.all([first, second]);
  f.workers[0].emit({ type: 'ready' }); assert.equal(f.pipeline.active, true);
  assert.ok(f.statuses.every(status => !status.message.includes('declined')));
});

for (const [name, readable] of [['NotAllowedError', /declined/], ['NotFoundError', /No camera found/], ['NotReadableError', /busy/]] as const) {
  test(`${name} remains a readable, retryable error without retrying permission automatically`, async t => {
    const f = setup(t); f.setMedia(async () => { throw failure(name); });
    await f.pipeline.start();
    assert.equal(f.requests.length, 1); assert.equal(f.pipeline.active, false); assert.equal(f.workers.length, 0);
    assert.match(f.statuses.at(-1)!.message, readable); assert.equal(f.statuses.at(-1)!.active, false);
    f.setMedia(async () => stream('user').media); await f.pipeline.start();
    f.workers[0].emit({ type: 'ready' }); assert.equal(f.pipeline.active, true);
  });
}

test('missing browser capture support fails without a worker or capture request', async t => {
  const f = setup(t);
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  await f.pipeline.start();
  assert.match(f.statuses.at(-1)!.message, /HTTPS and a supported browser/);
  assert.equal(f.requests.length, 0); assert.equal(f.workers.length, 0);
});

test('unavailable rear selection never retries with an arbitrary camera', async t => {
  const f = setup(t); f.setMedia(async () => { throw failure('OverconstrainedError', 'facingMode'); });
  await f.pipeline.start('environment');
  assert.equal(f.requests.length, 1); assert.match(f.statuses.at(-1)!.message, /rear camera is not available.*Front \/ Selfie/);
  assert.equal(f.pipeline.active, false); assert.equal(f.pipeline.facing, 'environment');
  f.mediaDevices.getSupportedConstraints = () => ({ facingMode: false });
  await f.pipeline.start('environment'); assert.equal(f.requests.length, 1);
  assert.match(f.statuses.at(-1)!.message, /cannot select a rear camera/);
});

test('known opposite-facing tracks are released, while missing settings use the requested fallback', async t => {
  const f = setup(t), wrong = stream('user'); f.setMedia(async () => wrong.media);
  await f.pipeline.start('environment');
  assert.equal(wrong.track.stopped, 1); assert.equal(wrong.extra.stopped, 1); assert.equal(f.workers.length, 0);
  assert.match(f.statuses.at(-1)!.message, /rear camera is not available/);
  const unknown = stream(); unknown.track.getSettings = undefined; f.setMedia(async () => unknown.media);
  await f.pipeline.start('environment'); f.workers[0].emit({ type: 'ready' });
  assert.equal(f.pipeline.facing, 'environment'); assert.equal(f.pipeline.mirrored, false);
});

test('one concrete size constraint correction preserves exact rear facing and cannot loop', async t => {
  const f = setup(t); f.setMedia(async () => { throw failure('OverconstrainedError', 'width'); });
  await f.pipeline.start('environment');
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests[1], { video: { facingMode: { exact: 'environment' } }, audio: false });
  assert.match(f.statuses.at(-1)!.message, /rear camera is not available/);
});

test('a successful size correction starts the requested camera without changing aspect mapping', async t => {
  const f = setup(t), rear = stream('environment');
  f.setMedia(async () => { if (f.requests.length === 1) throw failure('OverconstrainedError', 'frameRate'); return rear.media; });
  await f.pipeline.start('environment'); f.workers[0].emit({ type: 'ready' });
  await f.pipeline.infer(100, true);
  assert.equal(f.requests.length, 2); assert.equal(f.captures.length, 1); assert.equal(f.pipeline.active, true);
});

test('capture without a video track and rejected playback both release every resource', async t => {
  const f = setup(t), missing = stream('user');
  missing.media.getVideoTracks = () => []; f.setMedia(async () => missing.media);
  await f.pipeline.start(); assert.equal(missing.track.stopped, 1); assert.match(f.statuses.at(-1)!.message, /No camera video/);
  const blocked = stream('user'); f.setMedia(async () => blocked.media); f.setPlay(async () => { throw new Error('Playback unavailable. Try again.'); });
  await f.pipeline.start(); assert.equal(blocked.track.stopped, 1); assert.equal(blocked.track.listeners.size, 0);
  assert.equal(f.workers.length, 0); assert.equal(f.video.srcObject, null);
});

test('busy inference keeps one bitmap in flight and immediately samples only the latest decoded frame', async t => {
  const f = setup(t); await f.pipeline.start(); const worker = f.workers[0]; worker.emit({ type: 'ready' });
  const pending = deferred<ReturnType<typeof bitmap>>(), firstBitmap = bitmap(); f.setBitmap(() => pending.promise);
  const first = f.pipeline.infer(100, true);
  for (let time = 116; time <= 148; time += 16) { f.video.currentTime++; await f.pipeline.infer(time, false); }
  assert.deepEqual(f.captures, [1]); assert.equal(worker.sent.length, 1);
  pending.resolve(firstBitmap); await first;
  assert.deepEqual(worker.transfers[1], [firstBitmap]); assert.equal(firstBitmap.closed, 0);
  f.setBitmap(async () => bitmap()); f.time(164); worker.reply(100, 1); await settle();
  assert.deepEqual(f.captures, [1, 4], 'intermediate decoded frames must never become a queue');
  assert.equal(worker.sent.at(-1)!.segment, false); assert.equal(f.frames.length, 1);
  worker.reply(100, 1); await settle(); assert.equal(f.frames.length, 1, 'duplicate worker results are ignored');
  worker.reply(164, 2); await settle(); assert.equal(f.frames.length, 2); assert.equal(f.captures.length, 2);
  await f.pipeline.infer(200, true); assert.equal(f.captures.length, 2, 'unchanged decoded video is not reprocessed');
});

test('stale results release backpressure without reaching consumers and future timestamps are rejected', async t => {
  const f = setup(t); await f.pipeline.start(); const worker = f.workers[0]; worker.emit({ type: 'ready' });
  await f.pipeline.infer(100, true); f.time(1200); worker.reply(100, 1); await settle();
  assert.equal(f.frames.length, 0);
  f.video.currentTime = 2; await f.pipeline.infer(1200, true); worker.reply(1201, 2); await settle();
  assert.equal(f.frames.length, 0);
  f.video.currentTime = 3; await f.pipeline.infer(1232, true); f.time(1232); worker.reply(1232, 3); await settle();
  assert.equal(f.frames.length, 1);
});

test('stopping with a pending bitmap closes it and ignores any late worker result', async t => {
  const f = setup(t); await f.pipeline.start(); const worker = f.workers[0]; worker.emit({ type: 'ready' });
  const message = worker.onmessage!, pending = deferred<ReturnType<typeof bitmap>>(), image = bitmap();
  f.setBitmap(() => pending.promise); const infer = f.pipeline.infer(100, true); f.pipeline.stop();
  pending.resolve(image); await infer;
  message({ data: { type: 'frame', id: 1, timestamp: 100, hands: [], inferenceMs: 2 } } as unknown as MessageEvent<VisionMessage>);
  assert.equal(image.closed, 1); assert.equal(worker.sent.length, 1); assert.equal(f.frames.length, 0); assert.equal(f.timers.size, 0);
});

test('failed bitmap transfer closes local bitmap ownership and stops the camera', async t => {
  const f = setup(t), capture = stream('user'), image = bitmap(); f.setMedia(async () => capture.media); f.setBitmap(async () => image);
  await f.pipeline.start(); const worker = f.workers[0]; worker.emit({ type: 'ready' }); worker.rejectFrames = true;
  await f.pipeline.infer(100, true);
  assert.equal(image.closed, 1); assert.equal(capture.track.stopped, 1); assert.equal(worker.terminated, 1);
  assert.match(f.statuses.at(-1)!.message, /could not read a camera frame/);
});

test('worker failure, disconnected tracks and both watchdog deadlines stop tracking and release resources', async t => {
  const f = setup(t);
  for (const reason of ['worker', 'ended', 'loading-timeout', 'frame-timeout'] as const) {
    const capture = stream('user'); f.setMedia(async () => capture.media); f.time(100); await f.pipeline.start();
    const worker = f.workers.at(-1)!;
    if (reason === 'worker') worker.onerror!();
    if (reason === 'ended') capture.track.end();
    if (reason === 'loading-timeout') { f.time(30101); f.tick(); }
    if (reason === 'frame-timeout') { worker.emit({ type: 'ready' }); await f.pipeline.infer(100, true); f.time(10101); f.tick(); }
    assert.equal(f.pipeline.active, false, reason); assert.equal(capture.track.stopped, 1, reason);
    assert.equal(capture.track.listeners.size, 0, reason); assert.equal(worker.terminated, 1, reason); assert.equal(f.timers.size, 0, reason);
  }
});

for (const [width, height, expectedWidth, expectedHeight] of [
  [720, 1280, 288, 512], [1280, 720, 512, 288], [1080, 1440, 384, 512],
  [1024, 1024, 512, 512], [320, 240, 320, 240],
]) {
  test(`inference preserves the full ${width}x${height} camera aspect without enlarging small frames`, async t => {
    const f = setup(t); f.video.videoWidth = width; f.video.videoHeight = height;
    await f.pipeline.start(); f.workers[0].emit({ type: 'ready' });
    await f.pipeline.infer(100, false);
    assert.deepEqual(f.captureSizes, [{ resizeWidth: expectedWidth, resizeHeight: expectedHeight }]);
    assert.ok(Math.abs(expectedWidth / expectedHeight - width / height) < .002);
  });
}

test('rotation uses current decoded dimensions and waits for usable metadata', async t => {
  const f = setup(t); await f.pipeline.start(); const worker = f.workers[0]; worker.emit({ type: 'ready' });
  f.video.videoWidth = 0;
  await f.pipeline.infer(100, false); assert.equal(f.captures.length, 0);
  f.video.videoWidth = 720;
  await f.pipeline.infer(116, false); f.time(116); worker.reply(116, 1); await settle();
  f.video.videoWidth = 1280; f.video.videoHeight = 720; f.video.currentTime++;
  await f.pipeline.infer(148, false);
  assert.deepEqual(f.captureSizes, [{ resizeWidth: 288, resizeHeight: 512 }, { resizeWidth: 512, resizeHeight: 288 }]);
});
