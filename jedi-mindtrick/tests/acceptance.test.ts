import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { blendInvisible, portalMask, scaleMask, PalmHold } from '../src/effects/invisible.ts';
import { CameraPipeline } from '../src/vision/camera.ts';
import { validateRender, readBounded } from '../worker/validation.ts';
import type { Hand } from '../src/contracts.ts';

// Independent synthetic fixtures. These never activate a camera or an AI provider.
const source = new Uint8ClampedArray([
  200, 100, 60, 255,
  40, 80, 120, 128,
  120, 60, 20, 99,
]);
const background = new Uint8ClampedArray([
  20, 40, 60, 0,
  140, 180, 220, 255,
  20, 160, 220, 255,
]);

test('restoring visibility returns the original pixels without mutating either input', () => {
  const beforeSource = source.slice();
  const beforeBackground = background.slice();
  const output = blendInvisible(source, background, new Float32Array([1, 1, 1]), 0);
  assert.deepEqual(output, beforeSource);
  assert.notEqual(output, source);
  assert.deepEqual(source, beforeSource);
  assert.deepEqual(background, beforeBackground);
});

test('full invisibility replaces only the masked colors and retains source alpha', () => {
  assert.deepEqual(
    [...blendInvisible(source, background, new Float32Array([0, 1, 0]), 1)],
    [200, 100, 60, 255, 140, 180, 220, 128, 120, 60, 20, 99],
  );
});

test('a half fade gives a measured midpoint, with unmasked pixels unchanged', () => {
  assert.deepEqual(
    [...blendInvisible(source, background, new Float32Array([0, 1, 0]), 0.5)],
    [200, 100, 60, 255, 90, 130, 170, 128, 120, 60, 20, 99],
  );
});

test('uncertain mask edges blend while invalid mask values preserve visible source', () => {
  const output = blendInvisible(source, background, new Float32Array([0.5, Number.NaN, Number.POSITIVE_INFINITY]), 1);
  assert.deepEqual([...output], [110, 70, 60, 255, 40, 80, 120, 128, 120, 60, 20, 99]);
});

test('invalid compositor shape or non-finite fade fails instead of rendering corrupt pixels', () => {
  assert.throws(() => blendInvisible(source, background.slice(0, 8), new Float32Array(3), 1));
  assert.throws(() => blendInvisible(source, background, new Float32Array(2), 1));
  assert.throws(() => blendInvisible(source, background, new Float32Array(3), Number.NaN));
});

test('an off-edge portal is clipped and never changes the opposite side', () => {
  const mask = portalMask(4, 2, { x: -0.25, y: 0, width: 0.75, height: 1 });
  assert.deepEqual([...mask], [1, 1, 0, 0, 1, 1, 0, 0]);
  assert.deepEqual([...portalMask(4, 2, { x: 1.1, y: 0, width: 0.5, height: 1 })], Array(8).fill(0));
});

test('portal boundaries select pixel centers without an extra edge column', () => {
  const mask = portalMask(4, 2, { x: 0.375, y: 0, width: 0.5, height: 0.5 });
  assert.deepEqual([...mask], [0, 1, 1, 0, 0, 0, 0, 0]);
  assert.throws(() => portalMask(4, 2, { x: Number.NaN, y: 0, width: 1, height: 1 }));
  assert.throws(() => portalMask(4, 2, { x: 0, y: 0, width: 0, height: 1 }));
});

test('camera masks align with mirrored display coordinates after enlargement', () => {
  const cameraMask = new Float32Array([0, 1, 1, 0]);
  assert.deepEqual([...scaleMask(cameraMask, 2, 2, 4, 2, true)], [1, 1, 0, 0, 0, 0, 1, 1]);
  assert.deepEqual([...scaleMask(cameraMask, 2, 2, 4, 2, false)], [0, 0, 1, 1, 1, 1, 0, 0]);
  assert.deepEqual([...cameraMask], [0, 1, 1, 0]);
});

function openPalm(score = 0.95): Hand {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7 }));
  landmarks[0] = { x: 0.5, y: 0.95 };
  for (const tip of [8, 12, 16, 20]) {
    landmarks[tip - 2] = { x: 0.5, y: 0.7 };
    landmarks[tip] = { x: 0.5, y: 0.2 };
  }
  return { landmarks, score, handedness: 'Right' };
}

test('Invisible hold toggles once at 850ms, then requires release before another toggle', () => {
  const gesture = new PalmHold();
  const hands = [openPalm()];
  assert.equal(gesture.update(hands, 0), false);
  assert.equal(gesture.update(hands, 849), false);
  assert.equal(gesture.update(hands, 850), true);
  assert.equal(gesture.update(hands, 1000), false);
  assert.equal(gesture.update([], 1100), false);
  assert.equal(gesture.update(hands, 1200), false);
  assert.equal(gesture.update(hands, 2050), true);
});

test('lost or weak hand tracking breaks the hold rather than carrying time across it', () => {
  const gesture = new PalmHold();
  assert.equal(gesture.update([openPalm()], 0), false);
  assert.equal(gesture.update([openPalm(0.1)], 800), false);
  assert.equal(gesture.update([openPalm()], 850), false);
  assert.equal(gesture.update([], 1600), false);
  assert.equal(gesture.update([openPalm()], 1700), false);
  assert.equal(gesture.update([openPalm()], 2500), false);
  assert.equal(gesture.update([openPalm()], 2550), true);
});

test('a long observation gap cannot be treated as a continuously held palm', () => {
  const gesture = new PalmHold();
  assert.equal(gesture.update([openPalm()], 0), false);
  assert.equal(gesture.update([openPalm()], 5000), false);
});

test('a duplicate observation does not rearm an already fired held palm', () => {
  const gesture = new PalmHold();
  const hands = [openPalm()];
  gesture.update(hands, 0);
  assert.equal(gesture.update(hands, 850), true);
  assert.equal(gesture.update(hands, 850), false);
  assert.equal(gesture.update(hands, 900), false);
  assert.equal(gesture.update(hands, 1750), false);
});

function cameraFixture(permission: () => Promise<MediaStream>) {
  const globals = ['document', 'navigator', 'Worker', 'createImageBitmap', 'performance'] as const;
  const previous = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const video = { muted: false, playsInline: false, srcObject: null, readyState: 4, currentTime: 0,
    play: async () => {}, pause() {} };
  const clock = { now: 100 };
  const workers: Array<{ onmessage: ((event: { data: unknown }) => void) | null; terminated: boolean; messages: unknown[] }> = [];
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    messages: unknown[] = [];
    constructor() { workers.push(this); }
    postMessage(message: unknown) { this.messages.push(message); }
    terminate() { this.terminated = true; }
  }
  const values = {
    performance: { now: () => clock.now },
    document: { createElement: () => video },
    navigator: { mediaDevices: { getUserMedia: permission } },
    Worker: FakeWorker,
    createImageBitmap: async () => ({ close() {} }),
  };
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, value: values[name] });
  return { workers, video, clock, restore() {
    for (const name of globals) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  } };
}

function fakeStream() {
  let stopped = 0;
  const track = Object.assign(new EventTarget(), { stop: () => { stopped++; } });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, stopped: () => stopped };
}

test('stop during pending camera permission releases a late stream and never starts a worker', async () => {
  const { stream, stopped } = fakeStream();
  let grant!: (stream: MediaStream) => void;
  const f = cameraFixture(() => new Promise(resolve => { grant = resolve; }));
  const pipeline = new CameraPipeline(() => assert.fail('No frame should be delivered'), () => {});
  try {
    const starting = pipeline.start();
    pipeline.stop();
    grant(stream);
    await starting;
    assert.equal(stopped(), 1);
    assert.equal(f.workers.length, 0);
    assert.equal(pipeline.active, false);
    assert.equal(f.video.srcObject, null);
  } finally { pipeline.stop(); f.restore(); }
});

test('stop releases live resources and ignores a late inference result from the old worker', async () => {
  const { stream, stopped } = fakeStream();
  const f = cameraFixture(async () => stream);
  const frames: unknown[] = [];
  const pipeline = new CameraPipeline(frame => frames.push(frame), () => {});
  try {
    await pipeline.start();
    const worker = f.workers[0];
    assert.ok(worker);
    worker.onmessage!({ data: { type: 'ready' } });
    assert.equal(pipeline.active, true);
    await pipeline.infer(100, true);
    const sent = worker.messages.find(message => (message as { type: string }).type === 'frame') as { id: number };
    assert.ok(sent);
    pipeline.stop();
    worker.onmessage!({ data: { type: 'frame', id: sent.id, timestamp: 100, hands: [], inferenceMs: 2 } });
    assert.equal(frames.length, 0);
    assert.equal(worker.terminated, true);
    assert.equal(stopped(), 1);
    assert.equal(f.video.srcObject, null);
    assert.equal(pipeline.active, false);
  } finally { pipeline.stop(); f.restore(); }
});


test('hand-only tracking samples fresh frames at 33ms while segmentation keeps its 85ms budget', async () => {
  for (const segment of [false, true]) {
    const { stream } = fakeStream();const f = cameraFixture(async () => stream);
    const pipeline = new CameraPipeline(() => {}, () => {});
    try {
      await pipeline.start();const worker = f.workers[0];worker.onmessage!({data:{type:'ready'}});
      const sentFrames = () => worker.messages.filter(m => (m as {type:string}).type === 'frame') as Array<{id:number;timestamp:number;segment:boolean}>;
      await pipeline.infer(100, segment);const first = sentFrames()[0];
      worker.onmessage!({data:{...first,type:'frame',hands:[],inferenceMs:5}});
      f.video.currentTime = 1/30;
      await pipeline.infer(132, segment);assert.equal(sentFrames().length,1);
      await pipeline.infer(133, segment);assert.equal(sentFrames().length,segment?1:2);
      if(segment){await pipeline.infer(184, true);assert.equal(sentFrames().length,1);await pipeline.infer(185,true);assert.equal(sentFrames().length,2);}
      assert.ok(sentFrames().every(frame => frame.segment === segment));
    } finally {pipeline.stop();f.restore();}
  }
});

test('busy tracking drops pending frames and resumes from the newest video frame without a queue', async () => {
  const {stream}=fakeStream();const f=cameraFixture(async()=>stream);const pipeline=new CameraPipeline(()=>{},()=>{});
  try {
    await pipeline.start();const worker=f.workers[0];worker.onmessage!({data:{type:'ready'}});
    const sentFrames=()=>worker.messages.filter(m=>(m as {type:string}).type==='frame') as Array<{id:number;timestamp:number}>;
    await pipeline.infer(100,false);
    for(const now of [133,166,199,232]){f.video.currentTime=now/1000;await pipeline.infer(now,false);}
    assert.equal(sentFrames().length,1);
    f.clock.now=250;worker.onmessage!({data:{type:'frame',...sentFrames()[0],hands:[],inferenceMs:150}});
    f.video.currentTime=.265;await pipeline.infer(265,false);
    assert.equal(sentFrames().length,2);assert.equal(sentFrames()[1].timestamp,265);
  } finally {pipeline.stop();f.restore();}
});

test('unchanged video frames are not inferred again, and a restarted stream can start at the same video time', async () => {
  const {stream}=fakeStream();const f=cameraFixture(async()=>stream);const pipeline=new CameraPipeline(()=>{},()=>{});
  try {
    await pipeline.start();let worker=f.workers[0];worker.onmessage!({data:{type:'ready'}});
    await pipeline.infer(100,false);const first=worker.messages.find(m=>(m as {type:string}).type==='frame') as {id:number};
    worker.onmessage!({data:{type:'frame',id:first.id,timestamp:100,hands:[],inferenceMs:5}});
    await pipeline.infer(200,false);assert.equal(worker.messages.length,2);
    await pipeline.start();worker=f.workers[1];worker.onmessage!({data:{type:'ready'}});
    await pipeline.infer(201,false);assert.equal(worker.messages.length,2);
  } finally {pipeline.stop();f.restore();}
});

test('unresolved bitmap capture remains the single in-flight job and is released after stop', async () => {
  const {stream}=fakeStream();const f=cameraFixture(async()=>stream);const pipeline=new CameraPipeline(()=>{},()=>{});
  let resolveBitmap!:(bitmap:{close():void})=>void;let captures=0,closed=0;
  Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:()=>{captures++;return new Promise(resolve=>{resolveBitmap=resolve;});}});
  try {
    await pipeline.start();const worker=f.workers[0];worker.onmessage!({data:{type:'ready'}});
    const pending=pipeline.infer(100,false);f.video.currentTime=.1;await pipeline.infer(200,false);
    assert.equal(captures,1);pipeline.stop();resolveBitmap({close(){closed++;}});await pending;
    assert.equal(closed,1);assert.equal(worker.messages.length,1);
  } finally {pipeline.stop();f.restore();}
});

test('delayed inference is discarded using capture age and cannot make stale hands look fresh', async () => {
  const {stream}=fakeStream();const f=cameraFixture(async()=>stream);const frames:unknown[]=[];const pipeline=new CameraPipeline(frame=>frames.push(frame),()=>{});
  try {
    await pipeline.start();const worker=f.workers[0];worker.onmessage!({data:{type:'ready'}});
    await pipeline.infer(100,false);const first=worker.messages.find(m=>(m as {type:string}).type==='frame') as {id:number};
    f.clock.now=1101;worker.onmessage!({data:{type:'frame',id:first.id,timestamp:100,hands:[],inferenceMs:1001}});
    assert.equal(frames.length,0);f.video.currentTime=1.2;await pipeline.infer(1200,false);
    const next=worker.messages.at(-1) as {id:number};f.clock.now=1225;
    worker.onmessage!({data:{type:'frame',id:next.id,timestamp:1200,hands:[],inferenceMs:25}});
    assert.equal(frames.length,1);
  } finally {pipeline.stop();f.restore();}
});

function renderEnvelope() {
  // Only an image-signature fixture: these tests do not claim to decode this as an image.
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array(80).fill(0)]).toString('base64');
  return { requestId: 'c67ebf60-9c60-4eec-86e8-6c72f18e9c0d', createdAt: 1_789_056_000_000, style: 'ink', image };
}

test('render validation accepts the bounded envelope and rejects unknown instructions or styles', () => {
  const input = renderEnvelope();
  assert.deepEqual(validateRender(input, input.createdAt), input);
  assert.throws(() => validateRender({ ...input, prompt: 'Change the fixed server instruction' }, input.createdAt));
  assert.throws(() => validateRender({ ...input, style: 'constructor' }, input.createdAt));
  assert.throws(() => validateRender({ ...input, style: 'arbitrary-provider-name' }, input.createdAt));
});

test('invalid request identifiers, expired requests and non-image envelopes are rejected', () => {
  const input = renderEnvelope();
  assert.throws(() => validateRender({ ...input, requestId: 'retry-every-frame' }, input.createdAt));
  assert.throws(() => validateRender(input, input.createdAt + 120_001));
  assert.throws(() => validateRender({ ...input, createdAt: Number.NaN }, input.createdAt));
  assert.throws(() => validateRender({ ...input, image: Buffer.from('plain text '.repeat(20)).toString('base64') }, input.createdAt));
  assert.throws(() => validateRender({ ...input, image: 'A'.repeat(360_004) }, input.createdAt));
});

test('body limits count streamed bytes and cancel an oversized body without relying on Content-Length', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(9)); },
    cancel() { canceled = true; },
  });
  const request = new Request('https://example.invalid/api/render', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  await assert.rejects(() => readBounded(request, 8), /too large/);
  assert.equal(canceled, true);
});

test('body reader preserves UTF-8 across chunks and rejects oversized declared length', async () => {
  const encoded = new TextEncoder().encode('AéB');
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(encoded.slice(0, 2));
    controller.enqueue(encoded.slice(2));
    controller.close();
  } });
  const request = new Request('https://example.invalid/api/render', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  assert.equal(await readBounded(request, 4), 'AéB');
  const oversized = new Request('https://example.invalid/api/render', { method: 'POST', headers: { 'Content-Length': '999' }, body: '{}' });
  await assert.rejects(() => readBounded(oversized, 4), /too large/);
});

async function visionFixture(failDetection = false) {
  const messages: Array<Record<string, unknown>> = [];
  const inputObservations: unknown[] = [];
  const personMask = new Float32Array([0, 1]);
  const self = {
    onmessage: async (_event: { data: Record<string, unknown> }) => {},
    postMessage: (message: Record<string, unknown>) => messages.push(message),
  };
  const Vision = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    HandLandmarker: { createFromOptions: async () => ({ detectForVideo: (input: unknown) => {
      inputObservations.push(input);
      if (failDetection) throw new Error('injected model failure');
      return { landmarks: [], handedness: [] };
    } }) },
    ImageSegmenter: { createFromOptions: async () => ({ segmentForVideo: (input: unknown, _timestamp: number, callback: (result: unknown) => void) => {
      inputObservations.push(input);
      callback({ confidenceMasks: [{ width: 2, height: 1, getAsFloat32Array: () => personMask }] });
    } }) },
  };
  const script = readFileSync(new URL('../public/vision-worker.js', import.meta.url), 'utf8');
  runInNewContext(script, { self, Vision, importScripts() {}, performance: { now: () => 100 } });
  await self.onmessage({ data: { type: 'init' } });
  return { self, messages, inputObservations, personMask };
}

test('vision worker feeds the original bitmap to both models and copies mask memory before returning', async () => {
  const f = await visionFixture();
  let closed = 0;
  const bitmap = { close() { closed++; } };
  await f.self.onmessage({ data: { type: 'frame', id: 7, timestamp: 123, bitmap, segment: true } });
  assert.equal(f.inputObservations.length, 2);
  assert.ok(f.inputObservations.every(input => input === bitmap));
  const result = f.messages.find(message => message.type === 'frame')!;
  assert.equal(result.id, 7);
  assert.equal(result.timestamp, 123);
  f.personMask[0] = 1;
  assert.deepEqual([...result.mask as Float32Array], [0, 1]);
  assert.equal(closed, 1);
});

test('vision worker failure releases its bitmap and reports an error instead of a stale frame', async () => {
  const f = await visionFixture(true);
  let closed = 0;
  await f.self.onmessage({ data: { type: 'frame', id: 9, timestamp: 400, bitmap: { close() { closed++; } }, segment: true } });
  assert.equal(f.messages.filter(message => message.type === 'frame').length, 0);
  assert.equal(f.messages.filter(message => message.type === 'error').length, 1);
  assert.equal(closed, 1);
});
