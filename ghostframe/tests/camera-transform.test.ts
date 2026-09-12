import test from 'node:test';
import assert from 'node:assert/strict';
import { handsForCameraDisplay } from '../src/vision/camera-transform';
import { scaleMask } from '../src/effects/invisible';
import { addTrackedHands } from '../src/effects/hand-mask';
import { PalmVisibility } from '../src/vision/palm-visibility';
import { palmPose } from './palm-visibility-fixtures';

test('selfie retains native landmarks; rear pre-reflection preserves depth, handedness and source data', () => {
  const hands = [palmPose(0, { x: .68, tilt: .2 })], before = structuredClone(hands);
  assert.equal(handsForCameraDisplay(hands, true), hands);
  const rear = handsForCameraDisplay(hands, false);
  assert.notEqual(rear, hands); assert.equal(rear[0].handedness, hands[0].handedness);
  rear[0].landmarks.forEach((point, index) => {
    assert.equal(point.x, 1 - hands[0].landmarks[index].x);
    assert.equal(point.y, hands[0].landmarks[index].y); assert.equal(point.z, hands[0].landmarks[index].z);
  });
  assert.deepEqual(hands, before);
  assert.deepEqual(handsForCameraDisplay([], false), []);
});

test('person mask and tracked fingertips align to the same display side for front and rear cameras', () => {
  const width = 384, height = 216, hand = palmPose(0, { x: .68 });
  for (const mirrored of [true, false]) {
    const cameraMask = new Float32Array(width * height), p = hand.landmarks[8];
    cameraMask[Math.floor(p.y * height) * width + Math.floor(p.x * width)] = .75;
    const person = scaleMask(cameraMask, width, height, width, height, mirrored);
    const hands = handsForCameraDisplay([hand], mirrored), mask = addTrackedHands(person, width, height, hands);
    const displayX = mirrored ? 1 - p.x : p.x;
    const at = (x: number) => Math.floor(p.y * height) * width + Math.floor(x * width);
    assert.equal(mask[at(displayX)], 1, `fingertip must track the ${mirrored ? 'mirrored selfie' : 'unmirrored rear'} video`);
    assert.equal(mask[at(1 - displayX)], 0, 'the opposite image side must remain unaffected');
    const personPixel = person.indexOf(.75);
    assert.ok(Math.abs(personPixel % width - displayX * width) <= 1, 'segmentation must use the same display reflection');
  }
});

test('rear reflection preserves continuous palm closure and reopening at several depth tilts', () => {
  for (const tilt of [-.4, 0, .4]) {
    const front = new PalmVisibility(), rear = new PalmVisibility();
    for (const [index, closure] of [0, .2, .5, .8, 1, .5, 0].entries()) {
      const hands = [palmPose(closure, { tilt })], timestamp = index * 50;
      const expected = front.update(hands, timestamp), actual = rear.update(handsForCameraDisplay(hands, false), timestamp);
      assert.notEqual(expected, null); assert.notEqual(actual, null);
      assert.ok(Math.abs(actual! - expected!) < 1e-12, 'reflection preserves closure within floating-point precision');
    }
  }
});
