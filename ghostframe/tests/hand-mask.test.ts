import test from 'node:test';
import assert from 'node:assert/strict';
import { addTrackedHands } from '../src/effects/hand-mask';
import { blendInvisible } from '../src/effects/invisible';
import { palmPose } from './palm-visibility-fixtures';

const width = 384, height = 216;
test('tracked fingers, palm and wrist supplement an empty segmentation mask in mirrored coordinates', () => {
  const hand = palmPose(0, { x: .68 }), person = new Float32Array(width * height);
  const mask = addTrackedHands(person, width, height, [hand]);
  const at = (x: number, y: number) => mask[Math.floor(y * height) * width + Math.floor(x * width)];
  for (const index of [0, 4, 8, 12, 16, 20]) {
    const p = hand.landmarks[index]; assert.equal(at(1 - p.x, p.y), 1);
  }
  assert.equal(at(.32, .88), 1, 'the short forearm extension joins the wrist to the person region');
  assert.equal(at(.9, .15), 0); assert.equal(at(.68, .5), 0, 'unmirrored opposite region must remain unchanged');
  assert.ok(person.every(value => value === 0));
});
test('fading tracked fingers to hidden replaces their pixels and reopening restores exact source pixels', () => {
  const hand = palmPose(.8), mask = addTrackedHands(new Float32Array(width * height), width, height, [hand]);
  const source = new Uint8ClampedArray(width * height * 4).fill(180), background = new Uint8ClampedArray(source.length).fill(60);
  const p = hand.landmarks[8], pixel = (Math.floor(p.y * height) * width + Math.floor((1 - p.x) * width)) * 4;
  assert.equal(blendInvisible(source, background, mask, 1)[pixel], 60);
  assert.equal(blendInvisible(source, background, mask, .5)[pixel], 120);
  assert.deepEqual(blendInvisible(source, background, mask, 0), source);
});
test('invalid or absent hands do not retain old supplements and cannot alter a valid person mask', () => {
  const person = new Float32Array(width * height); person[0] = .8;
  const missing = palmPose(0); delete missing.landmarks[9];
  const bad = palmPose(0); bad.landmarks[8].x = Infinity;
  const weak = palmPose(0, { score: .1 });
  const outlier = palmPose(0); outlier.landmarks[8].x = .01;
  for (const hands of [[], [missing], [bad], [weak], [outlier]]) assert.deepEqual(addTrackedHands(person, width, height, hands), person);
  assert.throws(() => addTrackedHands(person, 0, height, []));
});
test('hand coverage follows scale and stays bounded when a wrist extension crosses the image edge', () => {
  const hand = palmPose(.9, { y: .75, scale: 1.3 });
  const result = addTrackedHands(new Float32Array(width * height), width, height, [hand]);
  assert.equal(result.length, width * height); assert.ok(result.some(v => v === 1));
  assert.ok(result.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
});
