import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

async function setup(fail: 'none' | 'gpu-init' | 'gpu-frame' | 'all' = 'none') {
  const attempts: string[] = [], messages: any[] = [], masks: number[] = [];
  let gpuClosed = 0;
  const self = { onmessage: async (_event: any) => {}, postMessage: (message: any) => messages.push(message) };
  const Vision = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    HandLandmarker: { createFromOptions: async (_files: unknown, options: any) => {
      const gpu = options.baseOptions.delegate === 'GPU'; attempts.push(options.baseOptions.delegate);
      if (gpu && fail === 'gpu-init') throw new Error('unsupported GPU');
      return { detectForVideo() { if (fail === 'all' || (gpu && fail === 'gpu-frame')) throw new Error('lost context'); return { landmarks: [], handedness: [] }; }, close() { if (gpu) gpuClosed++; } };
    } },
    ImageSegmenter: { createFromOptions: async () => ({ segmentForVideo(_bitmap: unknown, timestamp: number, callback: any) {
      masks.push(timestamp); callback({ confidenceMasks: [{ width: 1, height: 1, getAsFloat32Array: () => new Float32Array([1]) }] });
    } }) },
  };
  runInNewContext(readFileSync(new URL('../public/vision-worker.js', import.meta.url), 'utf8'), { self, Vision, importScripts() {}, OffscreenCanvas: class {}, performance: { now: () => 100 } });
  await self.onmessage({ data: { type: 'init' } });
  let closed = 0;
  const frame = (timestamp: number, segment = true) => self.onmessage({ data: { type: 'frame', id: timestamp, timestamp, segment, bitmap: { close() { closed++; } } } });
  return { attempts, messages, masks, frame, closed: () => closed, gpuClosed: () => gpuClosed };
}
test('GPU initialization failure falls back once to CPU and returns usable results', async () => {
  const f = await setup('gpu-init'); await f.frame(100); await f.frame(120);
  assert.deepEqual(f.attempts, ['GPU', 'CPU']); assert.equal(f.messages.at(-1).handBackend, 'CPU'); assert.equal(f.closed(), 2);
});
test('a lost GPU retries the current bitmap once on CPU and closes resources', async () => {
  const f = await setup('gpu-frame'); await f.frame(100); await f.frame(116);
  assert.deepEqual(f.attempts, ['GPU', 'CPU']); assert.equal(f.gpuClosed(), 1);
  assert.equal(f.messages.filter(m => m.type === 'frame').length, 2); assert.equal(f.closed(), 2);
});
test('CPU failure after GPU failure stops with an error instead of retrying indefinitely', async () => {
  const f = await setup('all'); await f.frame(100);
  assert.deepEqual(f.attempts, ['GPU', 'CPU']); assert.equal(f.messages.at(-1).type, 'error'); assert.equal(f.closed(), 1);
});
test('hands update every fresh request while segmentation uses its separate 50ms budget', async () => {
  const f = await setup(); for (const time of [100, 116, 132, 150, 166, 200]) await f.frame(time);
  assert.equal(f.messages.filter(m => m.type === 'frame').length, 6); assert.deepEqual(f.masks, [100, 150, 200]);
  assert.equal(f.messages.at(-1).handBackend, 'GPU');
  await f.frame(216, false); await f.frame(232, true); assert.equal(f.masks.at(-1), 232, 'returning to Invisible immediately produces a fresh mask');
});
