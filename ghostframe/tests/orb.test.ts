import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand } from '../src/contracts';
import { ORB_FADE_MS, ORB_HOLD_MS, ORB_MAX_SIZE, ORB_MIN_SIZE, ORB_SIZE_GAIN, OrbController } from '../src/orb/controller';
import { demoHands } from '../src/orb/demo-hands';
import { HAND_LINKS } from '../src/orb/draw';

function hand(x: number, y: number, handedness: string, aspect = 1): Hand {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  landmarks[0] = { x, y: y + 0.06, z: 0 };
  landmarks[9] = { x, y: y - 0.06, z: 0 };
  return { landmarks, handedness, score: 0.99 };
}
function pair(aspect = 1): Hand[] {
  return [hand(0.25, 0.45, 'Left', aspect), hand(0.65, 0.55, 'Right', aspect)];
}
const near = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('two hands place a mirrored display orb without mutating landmarks', () => {
  const controller = new OrbController();
  const input = pair();
  const original = structuredClone(input);
  assert.deepEqual(controller.update(input, 0, 1, true), { accepted: true });
  const pose = controller.poseAt(0)!;
  near(pose.x, 0.55);
  near(pose.y, 0.5);
  near(pose.size, Math.min(ORB_MAX_SIZE, Math.max(ORB_MIN_SIZE, Math.hypot(0.4, 0.1) * ORB_SIZE_GAIN)));
  assert.equal(pose.state, 'tracking');
  assert.equal(pose.opacity, 1);
  assert.deepEqual(input, original);
});

test('portrait and landscape separations with the same pixel gap produce the same orb size', () => {
  const landscape = new OrbController();
  const portrait = new OrbController();
  landscape.update([hand(0.4, 0.5, 'Left', 16 / 9), hand(0.6, 0.5, 'Right', 16 / 9)], 0, 16 / 9, false);
  portrait.update([hand(0.5, 0.4, 'Left', 9 / 16), hand(0.5, 0.6, 'Right', 9 / 16)], 0, 9 / 16, false);
  near(landscape.poseAt(0)!.size, portrait.poseAt(0)!.size);
});

test('motion eases toward the new midpoint instead of jumping', () => {
  const controller = new OrbController();
  controller.update([hand(0.4, 0.5, 'Left'), hand(0.8, 0.5, 'Right')], 0, 1, false);
  near(controller.poseAt(0)!.x, 0.6);
  controller.update([hand(0.32, 0.5, 'Left'), hand(0.72, 0.5, 'Right')], 40, 1, false);
  const pose = controller.poseAt(40)!;
  assert.ok(pose.x < 0.6 && pose.x > 0.52, String(pose.x));
  assert.equal(pose.state, 'tracking');
});

test('one hand, identical labels, a jump, or malformed points hold the orb instead of retargeting it', () => {
  const controller = new OrbController();
  controller.update(pair(), 0, 1, false);
  const held = controller.poseAt(0)!;
  assert.deepEqual(controller.update([pair()[0]], 40, 1, false), { accepted: false });
  assert.deepEqual(controller.update([hand(0.2, 0.4, 'Left'), hand(0.8, 0.4, 'Left')], 80, 1, false), { accepted: false });
  const broken = pair();
  broken[1] = { ...broken[1], landmarks: broken[1].landmarks.slice(0, 5) };
  assert.deepEqual(controller.update(broken, 120, 1, false), { accepted: false });
  const pose = controller.poseAt(120)!;
  near(pose.x, held.x);
  near(pose.y, held.y);
  near(pose.size, held.size);
  assert.equal(pose.state, 'holding');
  const jumper = new OrbController();
  jumper.update(pair(), 0, 1, false);
  const beforeJump = jumper.poseAt(0)!;
  assert.deepEqual(jumper.update([hand(0.05, 0.1, 'Left'), hand(0.95, 0.9, 'Right')], 40, 1, false), { accepted: false });
  const afterJump = jumper.poseAt(40)!;
  near(afterJump.x, beforeJump.x);
  near(afterJump.size, beforeJump.size);
  assert.equal(afterJump.state, 'holding');
});

test('loss holds, fades, then clears, and both hands can bring the orb back', () => {
  const controller = new OrbController();
  controller.update(pair(), 0, 1, false);
  controller.update([], ORB_HOLD_MS, 1, false);
  assert.equal(controller.poseAt(ORB_HOLD_MS)!.state, 'holding');
  assert.equal(controller.poseAt(ORB_HOLD_MS + 1)!.state, 'fading');
  assert.ok(controller.poseAt(ORB_HOLD_MS + ORB_FADE_MS)!.opacity < 0.01);
  assert.equal(controller.poseAt(ORB_HOLD_MS + ORB_FADE_MS + 1), null);
  assert.deepEqual(controller.update(pair(), ORB_HOLD_MS + ORB_FADE_MS + 40, 1, false), { accepted: true });
  assert.equal(controller.poseAt(ORB_HOLD_MS + ORB_FADE_MS + 40)!.state, 'tracking');
});

test('a reversed clock or a new aspect clears the previous pose', () => {
  const controller = new OrbController();
  controller.update(pair(), 100, 16 / 9, false);
  assert.deepEqual(controller.update(pair(), 100, 16 / 9, false), { accepted: false });
  assert.equal(controller.poseAt(100), null);
  controller.update(pair(), 200, 16 / 9, false);
  const wide = controller.poseAt(200)!;
  assert.equal(wide.state, 'tracking');
  controller.update(pair(), 240, 9 / 16, false);
  const tall = controller.poseAt(240)!;
  assert.equal(tall.state, 'tracking');
  assert.notEqual(tall.size, wide.size);
});

test('simulated preview hands stay on screen and change the orb as time moves', () => {
  const resting = demoHands(0);
  const later = demoHands(900);
  assert.equal(resting.length, 2);
  assert.deepEqual(resting.map(item => item.handedness), ['Left', 'Right']);
  for (const hand of resting) {
    assert.equal(hand.landmarks.length, 21);
    assert.ok(hand.landmarks.every(point => point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1));
  }
  const first = new OrbController();
  const second = new OrbController();
  assert.equal(first.update(resting, 0, 9 / 16, false).accepted, true);
  assert.equal(second.update(later, 0, 9 / 16, false).accepted, true);
  assert.notEqual(first.poseAt(0)!.size, second.poseAt(0)!.size);
  let now = 0;
  const animated = new OrbController();
  for (; now <= 2000; now += 16) assert.equal(animated.update(demoHands(now), now, 16 / 9, false).accepted, true);
  assert.equal(animated.poseAt(now)!.state, 'tracking');
});

test('hand skeleton links every finger without repeating a joint pair', () => {
  assert.equal(new Set(HAND_LINKS.map(link => link.join('-'))).size, HAND_LINKS.length);
  assert.ok(HAND_LINKS.every(([start, end]) => start >= 0 && end <= 20 && start !== end));
  assert.equal(HAND_LINKS.filter(([start]) => start === 0).length, 5);
});
