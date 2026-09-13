import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand } from '../src/contracts';
import { CubeController } from '../src/cube/controller';

function hand(x: number, y: number, handedness: string, ratio = 0.9, aspect = 1): Hand {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  landmarks[0] = { x, y: y + 0.06, z: 0 };
  landmarks[9] = { x, y: y - 0.06, z: 0 };
  landmarks[8] = { x, y: y - 0.15, z: 0 };
  landmarks[4] = { x: x + ratio * 0.12 / aspect, y: y - 0.15, z: 0 };
  return { landmarks, handedness, score: 0.99 };
}
function pair(ratio = 0.9, aspect = 1): Hand[] {
  return [hand(0.25, 0.45, 'Left', ratio, aspect), hand(0.65, 0.55, 'Right', 0.9, aspect)];
}
const near = (actual: number, expected: number, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('raw landmarks map once to front/rear display positions in portrait and landscape', () => {
  for (const aspect of [9 / 16, 16 / 9]) for (const mirrored of [false, true]) {
    const controller = new CubeController(), input = pair(0.9, aspect), original = structuredClone(input);
    assert.deepEqual(controller.update(input, 0, aspect, mirrored), { changed: false });
    const pose = controller.poseAt(0)!;
    near(pose.x, mirrored ? 0.55 : 0.45);
    near(pose.y, 0.5);
    near(pose.size, Math.min(0.65, Math.max(0.15, Math.hypot(aspect * 0.4, 0.1) / Math.min(1, aspect) * 0.75)));
    assert.deepEqual(input, original, 'controller must not mutate raw camera landmarks');
  }
});

test('equivalent pixel separations produce equivalent cube size after portrait/landscape rotation', () => {
  const landscape = new CubeController(), portrait = new CubeController();
  const wide = [hand(0.4, 0.5, 'Left', 0.9, 16 / 9), hand(0.6, 0.5, 'Right', 0.9, 16 / 9)];
  const tall = [hand(0.5, 0.4, 'Left', 0.9, 9 / 16), hand(0.5, 0.6, 'Right', 0.9, 9 / 16)];
  landscape.update(wide, 0, 16 / 9, false);
  portrait.update(tall, 0, 9 / 16, false);
  near(landscape.poseAt(0)!.size, portrait.poseAt(0)!.size);
});

test('ten deliberate pinch/release gestures produce exactly ten changes, independent of detector order', () => {
  for (const aspect of [9 / 16, 16 / 9]) for (const mirror of [false, true]) {
    const controller = new CubeController(); let changes = 0, now = 0;
    const feed = (ratio: number) => {
      const hands = pair(ratio, aspect);
      if (now % 80 === 0) hands.reverse();
      changes += Number(controller.update(hands, now, aspect, mirror).changed); now += 40;
    };
    feed(0.9);
    for (let gesture = 0; gesture < 10; gesture++) {
      feed(0.1); feed(0.1); feed(0.1); feed(0.1); feed(0.9); feed(0.9);
    }
    assert.equal(changes, 10, `aspect=${aspect}, mirror=${mirror}`);
  }
});

test('a pinch hold never acts; its eventual release acts once without any capture action', () => {
  const controller = new CubeController(); controller.update(pair(), 0, 1, false);
  for (let now = 40; now <= 4000; now += 40) assert.deepEqual(controller.update(pair(0.1), now, 1, false), { changed: false });
  assert.deepEqual(controller.update(pair(), 4040, 1, false), { changed: true });
  for (let now = 4080; now <= 4400; now += 40) assert.deepEqual(controller.update(pair(), now, 1, false), { changed: false });
});

test('short pinches and threshold noise cannot produce an appearance event', () => {
  const controller = new CubeController(); controller.update(pair(), 0, 1, false);
  assert.equal(controller.update(pair(0.1), 40, 1, false).changed, false);
  assert.equal(controller.update(pair(), 80, 1, false).changed, false);
  assert.equal(controller.update(pair(0.4), 120, 1, false).changed, false);
  assert.equal(controller.update(pair(0.1), 160, 1, false).changed, false);
  assert.equal(controller.update(pair(0.4), 200, 1, false).changed, false);
  assert.equal(controller.update(pair(0.4), 240, 1, false).changed, false);
  assert.equal(controller.update(pair(0.4), 280, 1, false).changed, false);
  assert.equal(controller.update(pair(), 320, 1, false).changed, true);
});

test('loss cancels a pinch immediately but holds only its visual pose for at most 150 ms', () => {
  const controller = new CubeController(); controller.update(pair(), 0, 1, false);
  controller.update(pair(0.1), 40, 1, false);
  controller.update(pair(0.1), 80, 1, false);
  assert.equal(controller.update([], 120, 1, false).changed, false);
  assert.ok(controller.poseAt(230));
  assert.equal(controller.poseAt(231), null);
  for (const now of [240, 280, 320, 360]) assert.equal(controller.update(pair(0.1), now, 1, false).changed, false);
  assert.equal(controller.update(pair(), 400, 1, false).changed, false, 'reacquisition cannot release an old pinch');
  controller.update(pair(0.1), 440, 1, false); controller.update(pair(0.1), 520, 1, false);
  assert.equal(controller.update(pair(), 560, 1, false).changed, true);
});

test('paint-clock expiry cancels gestures even when no inference callbacks arrive', () => {
  const controller = new CubeController(); controller.update(pair(), 0, 1, false);
  controller.update(pair(0.1), 40, 1, false);
  assert.equal(controller.poseAt(250), null);
  assert.equal(controller.update(pair(), 80, 1, false).changed, false, 'late result older than paint freshness limit is rejected');
  assert.equal(controller.poseAt(250), null, 'a 170 ms-old result must not revive the expired visual pose');
  assert.equal(controller.update(pair(), 260, 1, false).changed, false);
});

test('duplicate, backwards and invalid timestamps cancel an active gesture and reject old results', () => {
  for (const badTimestamp of [80, 79, Number.NaN, Infinity]) {
    const controller = new CubeController(); controller.update(pair(), 0, 1, false);
    controller.update(pair(0.1), 40, 1, false); controller.update(pair(0.1), 80, 1, false);
    assert.equal(controller.update(pair(), badTimestamp, 1, false).changed, false);
    assert.equal(controller.update(pair(), 160, 1, false).changed, false);
  }
});

test('reset, aspect and camera switches cannot complete old pinches', () => {
  for (const change of ['reset', 'aspect', 'mirror'] as const) {
    const controller = new CubeController(); controller.update(pair(), 0, 1, false);
    controller.update(pair(0.1), 40, 1, false); controller.update(pair(0.1), 120, 1, false);
    if (change === 'reset') controller.reset();
    const aspect = change === 'aspect' ? 9 / 16 : 1;
    const mirror = change === 'mirror';
    assert.equal(controller.update(pair(0.1, aspect), 160, aspect, mirror).changed, false);
    assert.equal(controller.update(pair(0.9, aspect), 200, aspect, mirror).changed, false);
  }
});

test('ambiguous identity, crossed hands, missing landmarks and jumps do not release gestures', () => {
  const badInputs: Hand[][] = [];
  const duplicate = pair(); duplicate[1].handedness = 'Left'; badInputs.push(duplicate);
  badInputs.push([hand(0.65, 0.45, 'Left'), hand(0.25, 0.55, 'Right')]);
  badInputs.push([hand(0.9, 0.45, 'Left'), hand(0.65, 0.55, 'Right')]);
  badInputs.push([hand(0.5, 0.5, 'Left'), hand(0.51, 0.5, 'Right')]);
  const missing = pair(); missing[0].landmarks.pop(); badInputs.push(missing);
  const nonfinite = pair(); nonfinite[0].landmarks[9].x = NaN; badInputs.push(nonfinite);
  for (const input of badInputs) {
    const controller = new CubeController(); controller.update(pair(), 0, 1, false);
    controller.update(pair(0.1), 40, 1, false); controller.update(pair(0.1), 120, 1, false);
    assert.equal(controller.update(input, 160, 1, false).changed, false);
    assert.equal(controller.update(pair(), 200, 1, false).changed, false);
  }
});

test('fresh closed acquisition and simultaneous pinches require both hands open before arming', () => {
  const controller = new CubeController();
  for (const now of [0, 40, 80, 120, 160]) assert.equal(controller.update(pair(0.1), now, 1, false).changed, false);
  assert.equal(controller.update(pair(), 200, 1, false).changed, false);
  const both = [hand(0.25, 0.45, 'Left', 0.1), hand(0.65, 0.55, 'Right', 0.1)];
  assert.equal(controller.update(both, 240, 1, false).changed, false);
  assert.equal(controller.update(pair(), 360, 1, false).changed, false);
});

test('overlapping pinches cancel the pending gesture until both hands are open again', () => {
  for (const observeBothClosed of [true, false]) {
    const controller = new CubeController();
    controller.update(pair(), 0, 1, false);
    controller.update(pair(0.1), 40, 1, false);
    controller.update(pair(0.1), 120, 1, false);
    if (observeBothClosed) {
      const both = [hand(0.25, 0.45, 'Left', 0.1), hand(0.65, 0.55, 'Right', 0.1)];
      assert.equal(controller.update(both, 160, 1, false).changed, false);
    }
    const otherHeld = [hand(0.25, 0.45, 'Left'), hand(0.65, 0.55, 'Right', 0.1)];
    assert.equal(controller.update(otherHeld, 200, 1, false).changed, false, 'the first release must not act while the other hand pinches');
    assert.equal(controller.update(otherHeld, 280, 1, false).changed, false);
    assert.equal(controller.update(pair(), 320, 1, false).changed, false, 'both-open reacquisition only rearms');
    controller.update(pair(0.1), 360, 1, false);
    controller.update(pair(0.1), 440, 1, false);
    assert.equal(controller.update(pair(), 480, 1, false).changed, true, 'a new independent gesture still acts once');
  }
});

test('continuous position and size smooth monotonically with safe bounds', () => {
  const controller = new CubeController(); controller.update(pair(), 0, 1, false);
  const initial = controller.poseAt(0)!;
  const moved = [hand(0.3, 0.5, 'Left'), hand(0.85, 0.6, 'Right')];
  controller.update(moved, 40, 1, false);
  let pose = controller.poseAt(40)!;
  assert.ok(pose.x > initial.x && pose.x < 0.575);
  assert.ok(pose.size > initial.size && pose.size < Math.hypot(0.55, 0.1) * 0.75);
  for (let now = 80; now <= 800; now += 40) {
    controller.update(moved, now, 1, false);
    const next = controller.poseAt(now)!;
    assert.ok(next.x >= pose.x && next.x <= 0.575 + 1e-12);
    assert.ok(next.size >= pose.size && next.size >= 0.15 && next.size <= 0.65);
    pose = next;
  }
  for (const aspect of [0.2, 9 / 16, 1, 16 / 9, 5]) {
    controller.reset(); controller.update([hand(0.02, 0.4, 'Left', 0.1, aspect), hand(0.98, 0.6, 'Right', 0.1, aspect)], 0, aspect, false);
    assert.equal(controller.poseAt(0)!.size, 0.65);
  }
  controller.reset();
  controller.update([hand(0.4, 0.5, 'Left'), hand(0.51, 0.5, 'Right')], 0, 1, false);
  assert.equal(controller.poseAt(0)!.size, 0.15);
});
