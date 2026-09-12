import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand } from '../src/contracts';
import { PalmVisibility } from '../src/vision/palm-visibility';

import { palmPose, type PoseOptions } from './palm-visibility-fixtures';

function trace(options: PoseOptions = {}): number[] {
  const control = new PalmVisibility();
  return [0, 0.2, 0.4, 0.6, 0.8, 1, 0.8, 0.6, 0.4, 0.2, 0].map((closure, index) => {
    const result = control.update([palmPose(closure, options)], index * 85);
    assert.notEqual(result, null); return result!;
  });
}

const cameraAspect = (hand: Hand, aspect: number): Hand => ({ ...hand,
  landmarks: hand.landmarks.map(point => ({ ...point,
    x: .5 + (point.x - .5) * (16 / 9) / aspect, z: (point.z ?? 0) * (16 / 9) / aspect,
  })),
});

test('physical palm closure is equivalent in portrait and landscape camera coordinates', () => {
  for (const aspect of [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9]) {
    const control = new PalmVisibility(), reference = new PalmVisibility();
    for (const [sample, closure] of [0, .2, .4, .6, .8, 1, .5, 0].entries()) {
      const hand = palmPose(closure, { scale: .35, rotation: .25, tilt: .2 });
      const input = cameraAspect(hand, aspect);
      assert.ok(input.landmarks.every(point => point.x >= 0 && point.x <= 1));
      const actual = control.update([input], sample * 33, aspect);
      const expected = reference.update([hand], sample * 33);
      assert.notEqual(actual, null); assert.notEqual(expected, null);
      assert.ok(Math.abs(actual! - expected!) < 1e-10);
    }
  }
});

test('camera orientation changes require a fresh open palm and invalid aspect fails closed', () => {
  const control = new PalmVisibility();
  assert.equal(control.update([palmPose(0, { scale: .35 })], 0), 0);
  assert.equal(control.update([cameraAspect(palmPose(1, { scale: .35 }), 9 / 16)], 33, 9 / 16), null);
  assert.equal(control.update([cameraAspect(palmPose(0, { scale: .35 }), 9 / 16)], 66, 9 / 16), 0);
  assert.equal(control.update([cameraAspect(palmPose(1, { scale: .35 }), 9 / 16)], 99, 9 / 16), 1);
  for (const invalid of [0, -1, NaN, Infinity]) {
    control.update([palmPose(0)], 100);
    assert.equal(control.update([palmPose(0)], 133, invalid), null);
    assert.equal(control.update([palmPose(1)], 166), null);
  }
});

test('open arms visible, gradual closure hides monotonically, and reopening restores without toggles', t => {
  const values = trace();
  assert.equal(values[0], 0); assert.equal(values[5], 1); assert.equal(values.at(-1), 0);
  for (let index = 1; index <= 5; index++) assert.ok(values[index] >= values[index - 1]);
  for (let index = 6; index < values.length; index++) assert.ok(values[index] <= values[index - 1]);
  assert.ok(new Set(values.slice(1, 5)).size >= 3, 'partial closure must have several distinct fade amounts');
  assert.ok(values[2] > 0.05 && values[2] < 0.7);
  assert.ok(values[3] > values[2] && values[3] < 1);
  assert.ok(values.every(value => value >= 0 && value <= 1));
  t.diagnostic(`Continuous open/close/reopen fade: ${values.map(value => value.toFixed(3)).join(', ')}`);
});

test('a closed or partial hand cannot start control before a clearly open palm', () => {
  const control = new PalmVisibility();
  assert.equal(control.update([palmPose(1)], 0), null);
  assert.equal(control.update([palmPose(0.6)], 85), null);
  assert.equal(control.update([palmPose(0)], 170), 0);
  assert.equal(control.update([palmPose(1)], 255), 1);
  assert.equal(control.update([palmPose(1)], 340), 1);
  assert.equal(control.update([palmPose(0)], 425), 0);
  assert.equal(control.update([palmPose(0)], 510), 0);
});

test('early closure starts fading without waiting for a half-closed hand', () => {
  const control = new PalmVisibility(); control.update([palmPose(0)], 0);
  const fade = control.update([palmPose(.25)], 33)!;
  assert.ok(fade > 0 && fade < .25);
});

test('finger geometry is invariant to scale, image rotation, translation and moderate 3D tilt', () => {
  const original = trace();
  for (const options of [{ scale: 0.6, x: 0.35 }, { scale: 1.2, y: 0.58 },
    { rotation: 0.7 }, { rotation: -1.1 }, { tilt: 0.4 }, { rotation: 0.5, tilt: -0.4, scale: 0.8 }]) {
    const changed = trace(options);
    changed.forEach((value, index) => assert.ok(Math.abs(value - original[index]) < 1e-10));
  }
});

test('detector reordering retains the controlling wrist and another hand does not toggle it', () => {
  const control = new PalmVisibility();
  const right = (closure: number) => palmPose(closure, { x: 0.7, label: 'Right' });
  const left = (closure: number) => palmPose(closure, { x: 0.3, label: 'Left' });
  assert.equal(control.update([left(1), right(0)], 0), 0);
  const partial = control.update([right(0.6), left(0)], 85)!;
  assert.ok(partial > 0.4 && partial < 1);
  assert.equal(control.update([left(0), right(1)], 170), 1);
  assert.equal(control.update([right(0), left(1)], 255), 0);
});

test('small joint noise is bounded and exact visible/hidden endpoints remain stable', t => {
  const control = new PalmVisibility(); control.update([palmPose(0)], 0);
  let last = control.update([palmPose(0.55)], 85)!, largestStep = 0;
  for (let sample = 1; sample <= 40; sample++) {
    const hand = palmPose(0.55);
    for (const tip of [8, 12, 16, 20]) hand.landmarks[tip].y += (sample % 2 ? 1 : -1) * 0.0007;
    const result = control.update([hand], (sample + 1) * 85)!;
    assert.notEqual(result, null); largestStep = Math.max(largestStep, Math.abs(result - last)); last = result;
  }
  assert.ok(largestStep < 0.01);
  const open = palmPose(0), fist = palmPose(1);
  for (const hand of [open, fist]) for (const tip of [8, 12, 16, 20]) hand.landmarks[tip].x += 0.0005;
  assert.equal(control.update([open], 3570), 0);
  assert.equal(control.update([fist], 3655), 1);
  t.diagnostic(`Largest per-sample fade change under ±0.0007 joint noise: ${largestStep.toFixed(5)}`);
});

test('loss preserves the caller target through null and a reacquired fist cannot inherit control', () => {
  const control = new PalmVisibility(); control.update([palmPose(0)], 0);
  assert.equal(control.update([palmPose(1)], 85), 1);
  assert.equal(control.update([], 170), null);
  assert.equal(control.update([palmPose(1)], 255), null);
  assert.equal(control.update([palmPose(1, { label: 'Left', x: 0.7 })], 340), null);
  assert.equal(control.update([palmPose(0, { label: 'Left', x: 0.7 })], 425), 0);
  assert.equal(control.update([palmPose(1, { label: 'Left', x: 0.7 })], 510), 1);
});

test('weak, malformed, tiny, degenerate and edge-on palms disarm without emitting a new target', () => {
  const invalid: Hand[][] = [[palmPose(0, { score: 0.59 })], [palmPose(0, { scale: 0.1 })],
    [palmPose(0, { tilt: Math.PI / 2 })], [palmPose(0, { x: 1 })]];
  const nan = palmPose(0); nan.landmarks[8].x = Number.NaN; invalid.push([nan]);
  const z = palmPose(0); z.landmarks[7].z = Infinity; invalid.push([z]);
  const missing = palmPose(0); missing.landmarks.pop(); invalid.push([missing]);
  const sparse = palmPose(0); delete sparse.landmarks[6]; invalid.push([sparse]);
  const collapsed = palmPose(0); collapsed.landmarks[10] = { ...collapsed.landmarks[9] }; invalid.push([collapsed]);
  const flat = palmPose(0); flat.landmarks[9] = { ...flat.landmarks[0] }; invalid.push([flat]);
  invalid.push([palmPose(0), palmPose(0), palmPose(0)]);
  for (const hands of invalid) {
    const control = new PalmVisibility(); control.update([palmPose(0)], 0);
    assert.equal(control.update(hands, 85), null);
    assert.equal(control.update([palmPose(1)], 170), null);
    assert.equal(control.update([palmPose(0)], 255), 0);
  }
});

test('a jumping wrist or ambiguous nearby hands cannot silently transfer a closed-hand target', () => {
  const control = new PalmVisibility(); control.update([palmPose(0, { x: 0.25 })], 0);
  assert.equal(control.update([palmPose(1, { x: 0.75 })], 85), null);
  assert.equal(control.update([palmPose(1, { x: 0.75 })], 170), null);
  assert.equal(control.update([palmPose(0, { x: 0.75 })], 255), 0);
  control.reset(); control.update([palmPose(0, { label: 'unknown' })], 0);
  assert.equal(control.update([palmPose(1, { x: 0.49, label: 'unknown' }), palmPose(0, { x: 0.51, label: 'unknown' })], 85), null);
});

test('duplicates do not update fade; stale, backwards and invalid times require a new open palm', () => {
  const control = new PalmVisibility(); assert.equal(control.update([palmPose(0)], 10), 0);
  assert.equal(control.update([palmPose(1)], 10), null);
  assert.equal(control.update([palmPose(1)], 95), 1);
  const malformed = palmPose(0); malformed.landmarks[8].x = Number.NaN;
  assert.equal(control.update([malformed], 95), null);
  assert.equal(control.update([palmPose(1)], 180), null, 'invalid duplicate data must still disarm');
  for (const time of [94, 1096, -1, Number.NaN, Infinity]) {
    const instance = new PalmVisibility(); instance.update([palmPose(0)], 10); instance.update([palmPose(1)], 95);
    assert.equal(instance.update([palmPose(0)], time), null);
    assert.equal(instance.update([palmPose(1)], 2000), null);
    assert.equal(instance.update([palmPose(0)], 2085), 0);
  }
});

test('input landmarks are unchanged and reset removes previous ownership', () => {
  const hands = [palmPose(0)], snapshot = structuredClone(hands), control = new PalmVisibility();
  assert.equal(control.update(hands, 0), 0); assert.deepEqual(hands, snapshot);
  control.reset(); assert.equal(control.update([palmPose(1)], 85), null);
  const noDepth = palmPose(0); noDepth.landmarks.forEach(point => { delete point.z; });
  assert.equal(control.update([noDepth], 170), 0, 'valid 2D open palms can arm without optional z values');
});
