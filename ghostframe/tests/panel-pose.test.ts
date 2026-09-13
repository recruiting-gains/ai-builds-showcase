import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand, Point } from '../src/contracts';
import { PanelPoseTracker, type PanelPose } from '../src/handframe/panel-pose';
import { surfaceMap } from '../src/handframe/surface';
import { handsForCameraDisplay } from '../src/vision/camera-transform';

function hand(side: 'left' | 'right', thumb: Point, index: Point): Hand {
  const x = side === 'left' ? .1 : .9;
  const landmarks = Array.from({ length: 21 }, () => ({ x: 1 - x, y: .55, z: 0 }));
  landmarks[0] = { x: 1 - x, y: .75, z: 0 };
  landmarks[9] = { x: 1 - x, y: .60, z: 0 };
  landmarks[4] = { x: 1 - thumb.x, y: thumb.y, z: 0 };
  landmarks[8] = { x: 1 - index.x, y: index.y, z: 0 };
  return { landmarks, score: .99, handedness: side };
}
const pair = () => [hand('left', { x: .22, y: .66 }, { x: .22, y: .28 }),
  hand('right', { x: .64, y: .66 }, { x: .64, y: .28 })];
const translated = (dx: number, dy = 0) => pair().map(value => ({ ...value,
  landmarks: value.landmarks.map(point => ({ ...point, x: point.x - dx, y: point.y + dy })) }));
const near = (a: number, b: number, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`);
function convex(result: PanelPose): void {
  assert.equal(result.pose.quad.length, 4);
  assert.doesNotThrow(() => surfaceMap(result.pose.quad));
  const { x, y, width, height } = result.rect;
  assert.ok(x >= 0 && y >= 0 && x + width <= 1 && y + height <= 1);
  near(x, Math.min(...result.pose.quad.map(point => point.x)));
  near(y, Math.min(...result.pose.quad.map(point => point.y)));
  near(width, Math.max(...result.pose.quad.map(point => point.x)) - x);
  near(height, Math.max(...result.pose.quad.map(point => point.y)) - y);
}

test('flat panel has exactly four measured straight corners and matching bounds', () => {
  const input = pair(), snapshot = structuredClone(input);
  const result = new PanelPoseTracker().update(input, 0)!;
  convex(result);
  const expected = [{ x: .22, y: .28 }, { x: .64, y: .28 }, { x: .64, y: .66 }, { x: .22, y: .66 }];
  result.pose.quad.forEach((point, index) => { near(point.x, expected[index].x); near(point.y, expected[index].y); });
  assert.equal(result.pose.depth, 0);
  assert.deepEqual(input, snapshot);
});

test('inward knuckle bends cannot create edge notches or change the panel', () => {
  const tracker = new PanelPoseTracker(), original = tracker.update(pair(), 0)!;
  const bent = pair();
  for (const value of bent) for (const index of [2, 3, 5, 6, 7]) {
    value.landmarks[index] = { x: index % 2 ? .45 : .56, y: index % 2 ? .56 : .36, z: 0 };
  }
  assert.deepEqual(tracker.update(bent, 33), original);
  assert.deepEqual(new PanelPoseTracker().update(bent, 0), original);
});

test('detector order, handedness labels and either inverted L preserve the same four corners', () => {
  const original = new PanelPoseTracker().update(pair(), 0);
  for (const side of [0, 1]) {
    const input = pair();
    [input[side].landmarks[4], input[side].landmarks[8]] = [input[side].landmarks[8], input[side].landmarks[4]];
    input.reverse(); input.forEach(value => { value.handedness = 'unknown'; });
    assert.deepEqual(new PanelPoseTracker().update(input, 0), original);
  }
});

test('front/rear camera canonical transforms reflect exactly once in portrait and landscape', () => {
  for (const aspect of [9 / 16, 16 / 9]) for (const mirrored of [false, true]) {
    const result = new PanelPoseTracker().update(handsForCameraDisplay(pair(), mirrored), 0, aspect)!;
    convex(result);
    near(result.rect.x, mirrored ? .22 : .36);
    near(result.rect.width, .42);
    near(result.rect.y, .28); near(result.rect.height, .38);
  }
});

test('asymmetric fingertip corners define a flat projective surface with aspect-aware roll', () => {
  const input = [hand('left', { x: .2, y: .7 }, { x: .15, y: .3 }),
    hand('right', { x: .8, y: .55 }, { x: .7, y: .1 })];
  for (const aspect of [9 / 16, 16 / 9]) {
    const result = new PanelPoseTracker().update(input, 0, aspect)!; convex(result);
    const map = surfaceMap(result.pose.quad);
    near(map(0, 0).x, .15); near(map(1, 0).y, .1); near(map(1, 1).x, .8); near(map(0, 1).y, .7);
    near(result.pose.roll, Math.atan2(.325 - .5, (.75 - .175) * aspect));
    assert.ok(map(.85, .5).y < map(.15, .5).y, 'the texture plane tilts with the corners');
  }
});

test('joined/collapsed or crossed fingertips hide rather than invent a corner or notch', () => {
  const invalid: Hand[][] = [];
  for (const tip of [4, 8]) {
    const joined = pair(); joined[1].landmarks[tip] = { ...joined[0].landmarks[tip] }; invalid.push(joined);
  }
  const closed = pair(); closed[0].landmarks[4] = { ...closed[0].landmarks[8] }; invalid.push(closed);
  const crossed = pair(); crossed[0].landmarks[8].x = .25; crossed[1].landmarks[8].x = .75; invalid.push(crossed);
  const swapped = pair();
  for (const tip of [4, 8]) [swapped[0].landmarks[tip], swapped[1].landmarks[tip]] = [swapped[1].landmarks[tip], swapped[0].landmarks[tip]];
  invalid.push(swapped);
  for (const input of invalid) {
    const tracker = new PanelPoseTracker(); tracker.update(pair(), 0);
    assert.equal(tracker.update(input, 33), null);
    assert.equal(tracker.update([], 66), null);
    assert.deepEqual(tracker.update(pair(), 99), new PanelPoseTracker().update(pair(), 99));
  }
});

test('small fingertip gaps stay convex with four vertices until the edge becomes degenerate', () => {
  const tracker = new PanelPoseTracker();
  for (const [index, width] of [.42, .30, .20, .10, .04].entries()) {
    const input = pair(); input[1].landmarks[8].x = 1 - (.22 + width);
    const result = tracker.update(input, index * 33)!;
    assert.ok(result); convex(result);
  }
  const joined = pair(); joined[1].landmarks[8] = { ...joined[0].landmarks[8] };
  assert.equal(tracker.update(joined, 165), null);
});

test('malformed, offscreen, weak or degenerate tracked hands cancel without missing-hand grace', () => {
  const invalid: Hand[][] = [];
  const sparse = pair(); delete sparse[0].landmarks[6]; invalid.push(sparse);
  const bad = pair(); bad[0].landmarks[5].x = NaN; invalid.push(bad);
  const badZ = pair(); badZ[0].landmarks[5].z = Infinity; invalid.push(badZ);
  const offscreen = pair(); offscreen[0].landmarks[7].x = -0.001; invalid.push(offscreen);
  const weak = pair(); weak[0].score = .49; invalid.push(weak);
  const palm = pair(); palm[0].landmarks[9] = { ...palm[0].landmarks[0] }; invalid.push(palm);
  const wrists = pair(); wrists[0].landmarks[0].x = .51; wrists[1].landmarks[0].x = .49; invalid.push(wrists);
  invalid.push([...pair(), pair()[0]], [bad[0]]);
  for (const input of invalid) {
    const tracker = new PanelPoseTracker(); tracker.update(pair(), 0);
    assert.equal(tracker.update(input, 33), null);
    assert.equal(tracker.update([], 66), null);
  }
});

test('brief valid omissions freeze at most 150 ms without extrapolation or renewing the deadline', () => {
  const tracker = new PanelPoseTracker(), initial = tracker.update(pair(), 0)!;
  for (const timestamp of [33, 66, 100, 150]) assert.deepEqual(tracker.update(timestamp % 2 ? [pair()[0]] : [], timestamp), initial);
  assert.equal(tracker.update([], 151), null);
  assert.equal(tracker.update([pair()[0]], 160), null);
  assert.deepEqual(tracker.update(pair(), 180), initial);
  tracker.reset(); assert.equal(tracker.update([], 200), null);
});

test('reacquisition within grace uses fresh corners and begins a new measured expiry', () => {
  const tracker = new PanelPoseTracker(); tracker.update(pair(), 0);
  tracker.update([], 50);
  const recovered = tracker.update(translated(.04), 100)!;
  near(recovered.rect.x, .26);
  assert.deepEqual(tracker.update([], 250), recovered);
  assert.equal(tracker.update([], 251), null);
});

test('timestamp reversal, stale gap, invalid time and aspect changes cannot retain an old panel', () => {
  for (const timestamp of [99, 1101, -1, NaN, Infinity]) {
    const tracker = new PanelPoseTracker(); tracker.update(pair(), 100);
    assert.equal(tracker.update(pair(), timestamp), null);
    assert.equal(tracker.update([], 1200), null);
  }
  const tracker = new PanelPoseTracker(); tracker.update(pair(), 0, 16 / 9);
  assert.equal(tracker.update([], 33, 9 / 16), null);
  assert.deepEqual(tracker.update(pair(), 66, 9 / 16), new PanelPoseTracker().update(pair(), 66, 9 / 16));
  for (const aspect of [0, NaN, Infinity]) assert.equal(tracker.update(pair(), 99, aspect), null);
});

test('large teleports clear once and then reacquire without phantom smoothing', () => {
  const translate = (dx: number) => pair().map(value => ({ ...value,
    landmarks: value.landmarks.map(point => ({ ...point, x: .5 + (point.x - .5) * .45 - dx })) }));
  const tracker = new PanelPoseTracker(); assert.ok(tracker.update(translate(-.25), 0));
  assert.equal(tracker.update(translate(.25), 33), null);
  assert.deepEqual(tracker.update(translate(.25), 66), new PanelPoseTracker().update(translate(.25), 66));
});

test('small jitter is damped while deliberate translation and scaling follow promptly', () => {
  const tracker = new PanelPoseTracker(), initial = tracker.update(pair(), 0)!;
  let squared = 0;
  for (let frame = 1; frame <= 90; frame++) {
    const result = tracker.update(translated(frame % 2 ? .001 : -.001), frame * 33)!;
    convex(result); squared += (result.rect.x - initial.rect.x) ** 2;
  }
  assert.ok(Math.sqrt(squared / 90) < .00035);
  const moved = tracker.update(translated(.05), 3003)!;
  near(moved.rect.x, initial.rect.x + .05);
  const resized = translated(.05).map(value => ({ ...value, landmarks: value.landmarks.map(point => ({
    ...point, x: .5 + (point.x - .5) * 1.1, y: .5 + (point.y - .5) * 1.1,
  })) }));
  const size = tracker.update(resized, 3036)!;
  near(size.rect.width, .42 * 1.1); near(size.rect.height, .38 * 1.1); convex(size);
});

test('small-motion damping depends on elapsed time and duplicate paint-rate calls cannot advance it', () => {
  const run = (step: number, frames: number) => {
    const tracker = new PanelPoseTracker(); const original = tracker.update(pair(), 0)!;
    assert.deepEqual(tracker.update(translated(.05), 0), original);
    let result = original;
    for (let frame = 1; frame <= frames; frame++) result = tracker.update(translated(.001), step * frame)!;
    return result;
  };
  const slow = run(33, 3), fast = run(16.5, 6);
  slow.pose.quad.forEach((point, index) => { near(point.x, fast.pose.quad[index].x); near(point.y, fast.pose.quad[index].y); });
  const tracker = new PanelPoseTracker(), returned = tracker.update(pair(), 0)!;
  returned.rect.x = .9; returned.pose.quad[0].x = .9;
  assert.deepEqual(tracker.update(pair(), 0), new PanelPoseTracker().update(pair(), 0));
});
