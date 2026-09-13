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

test('either hand carries the acquired cube without a transition jump in every camera orientation', () => {
  for (const aspect of [9 / 16, 16 / 9]) for (const mirrored of [false, true]) for (const survivor of [0, 1]) {
    const controller = new CubeController(), input = pair(0.9, aspect);
    controller.update(input, 0, aspect, mirrored);
    const sized = controller.poseAt(0)!;
    assert.equal(sized.interaction, 'sizing');
    assert.equal(controller.update([input[survivor]], 40, aspect, mirrored).changed, false);
    const carried = controller.poseAt(40)!;
    assert.equal(carried.interaction, 'holding');
    near(carried.x, sized.x); near(carried.y, sized.y); near(carried.size, sized.size);

    const moved = structuredClone(input[survivor]);
    moved.landmarks.forEach(point => { point.x += 0.06; point.y += 0.03; });
    const destinationX = sized.x + (mirrored ? -0.06 : 0.06);
    controller.update([moved], 80, aspect, mirrored);
    const following = controller.poseAt(80)!;
    assert.ok(Math.abs(following.x - destinationX) < Math.abs(sized.x - destinationX));
    assert.ok(Math.abs(following.x - destinationX) > 0, 'movement is smoothed');
    assert.ok(following.y > sized.y && following.y < sized.y + 0.03);
    for (let now = 120; now <= 800; now += 40) {
      assert.equal(controller.update([moved], now, aspect, mirrored).changed, false);
      near(controller.poseAt(now)!.size, sized.size);
    }
    near(controller.poseAt(800)!.x, destinationX, 1e-8);
    near(controller.poseAt(800)!.y, sized.y + 0.03, 1e-8);
  }
});

test('spread hands to resize, keep that size with one hand, and resume smooth sizing on pair return', () => {
  const controller = new CubeController();
  controller.update(pair(), 0, 1, false);
  const initial = controller.poseAt(0)!;
  const spread = [hand(0.2, 0.45, 'Left'), hand(0.75, 0.55, 'Right')];
  for (let now = 40; now <= 240; now += 40) controller.update(spread, now, 1, false);
  const enlarged = controller.poseAt(240)!;
  assert.ok(enlarged.size > initial.size);
  controller.update([spread[0]], 280, 1, false);
  const held = controller.poseAt(280)!;
  near(held.size, enlarged.size); near(held.x, enlarged.x); near(held.y, enlarged.y);
  controller.update([hand(0.22, 0.48, 'Left')], 320, 1, false);
  near(controller.poseAt(320)!.size, enlarged.size);
  const wider = [hand(0.22, 0.48, 'Left'), hand(0.85, 0.58, 'Right')];
  assert.equal(controller.update(wider, 360, 1, false).changed, false);
  const returned = controller.poseAt(360)!;
  assert.equal(returned.interaction, 'sizing');
  assert.ok(returned.size > held.size && returned.size < Math.hypot(0.63, 0.1) * 0.75);
});

test('one hand alone cannot create a cube before a pair or after reset', () => {
  for (const survivor of [0, 1]) {
    const controller = new CubeController(), input = pair();
    for (let now = 0; now <= 200; now += 40) {
      assert.equal(controller.update([input[survivor]], now, 1, false).changed, false);
      assert.equal(controller.poseAt(now), null);
    }
    controller.update(input, 240, 1, false);
    controller.update([input[survivor]], 280, 1, false);
    assert.equal(controller.poseAt(280)!.interaction, 'holding');
    controller.reset();
    controller.update([input[survivor]], 320, 1, false);
    assert.equal(controller.poseAt(320), null);
  }
});

test('losing a carried cube breaks single-hand acquisition without extending the 150 ms visual hold', () => {
  const controller = new CubeController(), input = pair();
  controller.update(input, 0, 1, false);
  controller.update([input[0]], 40, 1, false);
  controller.update([], 80, 1, false);
  controller.update([input[0]], 120, 1, false);
  assert.ok(controller.poseAt(190));
  assert.equal(controller.poseAt(191), null);
  assert.equal(controller.update([input[0]], 200, 1, false).changed, false);
  assert.equal(controller.poseAt(200), null);
  controller.update(input, 240, 1, false);
  assert.equal(controller.poseAt(240)!.interaction, 'sizing');
  controller.update([input[0]], 280, 1, false);
  assert.equal(controller.poseAt(280)!.interaction, 'holding');
});

test('pair/single transitions cancel unfinished pinches and each stable mode can rearm', () => {
  const controller = new CubeController();
  controller.update(pair(), 0, 1, false);
  controller.update(pair(0.1), 40, 1, false);
  controller.update(pair(0.1), 120, 1, false);
  assert.equal(controller.update([pair(0.1)[0]], 160, 1, false).changed, false);
  assert.equal(controller.update([pair()[0]], 200, 1, false).changed, false, 'single-hand release cannot finish a pair gesture');
  controller.update([pair(0.1)[0]], 240, 1, false);
  controller.update([pair(0.1)[0]], 320, 1, false);
  assert.equal(controller.update(pair(0.1), 360, 1, false).changed, false);
  assert.equal(controller.update(pair(), 400, 1, false).changed, false, 'pair release cannot finish a carry gesture');
  controller.update(pair(0.1), 440, 1, false);
  controller.update(pair(0.1), 520, 1, false);
  assert.equal(controller.update(pair(), 560, 1, false).changed, true);
  controller.update([pair()[0]], 600, 1, false);
  controller.update([pair(0.1)[0]], 640, 1, false);
  controller.update([pair(0.1)[0]], 720, 1, false);
  assert.equal(controller.update([pair()[0]], 760, 1, false).changed, true);
});

test('ten single-hand pinch/release gestures act ten times while size stays locked', () => {
  for (const survivor of [0, 1]) {
    const controller = new CubeController();
    controller.update(pair(), 0, 1, false);
    controller.update([pair()[survivor]], 40, 1, false);
    const size = controller.poseAt(40)!.size;
    let now = 80, changes = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      for (const ratio of [0.1, 0.1, 0.1, 0.1, 0.9]) {
        const visible = hand(survivor ? 0.65 : 0.25, survivor ? 0.55 : 0.45, survivor ? 'Right' : 'Left', ratio);
        changes += Number(controller.update([visible], now, 1, false).changed);
        near(controller.poseAt(now)!.size, size);
        now += 40;
      }
    }
    assert.equal(changes, 10);
  }
});

test('carry resets safely on stale samples, camera/aspect change, ambiguity, identity switch or teleport', () => {
  for (const failure of ['gap', 'duplicate', 'reversed', 'aspect', 'mirror', 'ambiguous', 'identity', 'teleport', 'stall'] as const) {
    const controller = new CubeController(), input = pair();
    controller.update(input, 0, 1, false);
    controller.update([input[0]], 40, 1, false);
    controller.update([pair(0.1)[0]], 80, 1, false);
    let timestamp = 120, aspect = 1, mirrored = false, visible = [input[0]];
    if (failure === 'gap') timestamp = 240;
    if (failure === 'duplicate') timestamp = 80;
    if (failure === 'reversed') timestamp = 79;
    if (failure === 'aspect') aspect = 9 / 16;
    if (failure === 'mirror') mirrored = true;
    if (failure === 'ambiguous') visible = [hand(0.25, 0.45, 'Left'), hand(0.65, 0.55, 'Left')];
    if (failure === 'identity') visible = [input[1]];
    if (failure === 'teleport') visible = [hand(0.9, 0.45, 'Left')];
    if (failure === 'stall') { controller.poseAt(240); timestamp = 260; }
    assert.equal(controller.update(visible, timestamp, aspect, mirrored).changed, false, failure);
    assert.equal(controller.poseAt(Math.max(240, timestamp)), null, failure);
    const next = Math.max(280, timestamp + 40);
    assert.equal(controller.update([input[0]], next, aspect, mirrored).changed, false, failure);
    assert.equal(controller.poseAt(next), null, `${failure}: a single hand must not restore acquisition`);
  }
});

test('returning crossed hands cannot resize or finish a carried pinch', () => {
  const controller = new CubeController();
  controller.update(pair(), 0, 1, false);
  controller.update([pair()[0]], 40, 1, false);
  controller.update([pair(0.1)[0]], 80, 1, false);
  const crossed = [hand(0.25, 0.45, 'Left'), hand(0.1, 0.65, 'Right')];
  assert.equal(controller.update(crossed, 160, 1, false).changed, false);
  assert.equal(controller.poseAt(160), null);
});
