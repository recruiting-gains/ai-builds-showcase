import test from 'node:test';
import assert from 'node:assert/strict';
import type { FrameRect, Hand, Point } from '../src/contracts';
import { PerspectiveTracker, projectFrame, type FramePose } from '../src/handframe/index';
import { handOutlineFixture } from './hand-outline-fixtures';

const rect: FrameRect = { x: 0.2, y: 0.25, width: 0.6, height: 0.4 };
const near = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * 16 / 9, a.y - b.y);
const edgeRatio = (pose: FramePose) => distance(pose.quad[0], pose.quad[3]) / distance(pose.quad[1], pose.quad[2]);
function validQuad(pose: FramePose, source = rect): void {
  const q = pose.quad;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1);
    assert.ok((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 1e-9, 'quad must be convex, nondegenerate, and clockwise');
  }
  near(q.reduce((sum, p) => sum + p.x, 0) / 4, source.x + source.width / 2);
  near(q.reduce((sum, p) => sum + p.y, 0) / 4, source.y + source.height / 2);
}

function hand(x: number, handedness: string): Hand {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y: 0.60, z: 0 }));
  landmarks[0] = { x, y: 0.68, z: 0 };
  landmarks[5] = { x: x - 0.05, y: 0.54, z: 0 };
  landmarks[9] = { x, y: 0.52, z: 0 };
  landmarks[17] = { x: x + 0.05, y: 0.58, z: 0 };
  landmarks[4] = { x: x + (x > 0.5 ? -0.09 : 0.09), y: 0.48, z: 0 };
  landmarks[8] = { x, y: 0.30, z: 0 };
  return { landmarks, score: 0.95, handedness };
}
const pair = () => [hand(0.75, 'Left'), hand(0.25, 'Right')];
function scalePalm(hand: Hand, factor: number): void {
  const origin = hand.landmarks[0];
  for (const index of [5, 9, 17]) {
    const point = hand.landmarks[index];
    point.x = origin.x + (point.x - origin.x) * factor;
    point.y = origin.y + (point.y - origin.y) * factor;
  }
}
function tilted(leftScale: number, rightScale: number): Hand[] {
  const hands = pair();
  scalePalm(hands[0], leftScale); scalePalm(hands[1], rightScale);
  return hands;
}

test('neutral projection preserves the rectangle and positive depth brings the displayed left edge forward', () => {
  assert.deepEqual(projectFrame(rect, 0, 0).quad, [
    { x: 0.2, y: 0.25 }, { x: 0.8, y: 0.25 }, { x: 0.8, y: 0.65 }, { x: 0.2, y: 0.65 },
  ]);
  const left = projectFrame(rect, 1, 0), right = projectFrame(rect, -1, 0);
  validQuad(left); validQuad(right);
  assert.ok(edgeRatio(left) > 2.2, 'maximum tilt should have an easily visible perspective difference');
  near(edgeRatio(left), 1 / edgeRatio(right));
  near(left.quad[0].y, right.quad[1].y);
});

test('projection remains centered and convex across depth, roll, and boundary rectangles', () => {
  for (const frame of [rect, { x: 0, y: 0, width: 1, height: 1 },
    { x: 0.01, y: 0.8, width: 0.85, height: 0.18 }, { x: 0.85, y: 0.01, width: 0.14, height: 0.9 }]) {
    for (const depth of [-10, -1, -0.5, 0, 0.5, 1, 10]) {
      for (const roll of [-10, -0.4, 0, 0.4, 10]) {
        const pose = projectFrame(frame, depth, roll);
        validQuad(pose, frame);
        assert.ok(Math.abs(pose.depth) <= 1 && Math.abs(pose.roll) <= 0.4);
      }
    }
  }
});

test('roll rotates in aspect-correct screen space without changing the left/right perspective ratio', () => {
  const pose = projectFrame(rect, 0, 0.2);
  const [a, b] = pose.quad;
  near(Math.atan2(b.y - a.y, (b.x - a.x) * 16 / 9), 0.2);
  near(edgeRatio(projectFrame(rect, 0.7, 0)), edgeRatio(projectFrame(rect, 0.7, 0.4)));
});

test('manual projection rejects nonfinite and degenerate inputs', () => {
  for (const frame of [{ ...rect, width: 0 }, { ...rect, height: 0.00001 },
    { ...rect, x: -0.01 }, { ...rect, width: 1 }, { ...rect, y: Number.NaN }]) {
    assert.throws(() => projectFrame(frame, 0, 0), RangeError);
  }
  assert.throws(() => projectFrame(rect, Number.NaN, 0), RangeError);
  assert.throws(() => projectFrame(rect, 0, Infinity), RangeError);
});

test('tracker calibrates unequal hands, ignores detector order/labels/z, and cancels common palm scaling', () => {
  const tracker = new PerspectiveTracker();
  const original = tilted(1.15, 0.9), snapshot = structuredClone(original);
  const baseline = tracker.update(original, rect, 0)!;
  near(baseline.depth, 0); near(baseline.roll, 0);
  assert.deepEqual(original, snapshot, 'inputs must remain untouched');
  const commonScale = tilted(1.15 * 1.2, 0.9 * 1.2).reverse();
  commonScale.forEach((h, i) => { h.handedness = 'unknown'; h.landmarks.forEach(p => { p.z = i ? -100 : 100; }); });
  const pose = tracker.update(commonScale, rect, 33)!;
  near(pose.depth, 0); near(pose.roll, 0);
  validQuad(pose);
});

test('relative approach and recession produce immediate, reversible tilt after calibration', () => {
  const tracker = new PerspectiveTracker(); tracker.update(pair(), rect, 0);
  const left = tracker.update(tilted(1.3, 0.8), rect, 33)!;
  assert.ok(left.depth > 0.9 && edgeRatio(left) > 2, 'nearer displayed left hand should tilt strongly in one update');
  const right = tracker.update(tilted(0.8, 1.3), rect, 66)!;
  near(right.depth, -left.depth);
  near(edgeRatio(right), 1 / edgeRatio(left));
  validQuad(left); validQuad(right);
  const neutral = tracker.update(pair(), rect, 99)!;
  near(neutral.depth, 0);
});

test('relative side-tip heights control roll and recenter makes the next valid pair neutral', () => {
  const tracker = new PerspectiveTracker(); tracker.update(pair(), rect, 0);
  const moved = tilted(1.2, 0.85);
  for (const index of [4, 8]) moved[1].landmarks[index].y += 0.16;
  const pose = tracker.update(moved, rect, 33)!;
  assert.ok(pose.depth > 0.5 && pose.roll > 0.1);
  validQuad(pose);
  tracker.recenter();
  const recentered = tracker.update(moved, rect, 66)!;
  near(recentered.depth, 0); near(recentered.roll, 0);
  const next = tracker.update(moved.reverse(), rect, 99)!;
  near(next.depth, 0); near(next.roll, 0);
});

test('small stationary palm and tip noise is attenuated while deliberate changes remain responsive', t => {
  const tracker = new PerspectiveTracker(); tracker.update(pair(), rect, 0);
  let depthSquared = 0, rollSquared = 0, rawDepthSquared = 0, rawRollSquared = 0;
  for (let sample = 1; sample <= 60; sample++) {
    const sign = sample % 2 ? 1 : -1;
    const hands = tilted(1 + sign * 0.002, 1);
    for (const index of [4, 8]) hands[1].landmarks[index].y += sign * 0.001;
    const pose = tracker.update(hands, rect, sample * 33)!;
    depthSquared += pose.depth ** 2; rollSquared += pose.roll ** 2;
    rawDepthSquared += (2 * Math.log(1 + sign * 0.002)) ** 2;
    rawRollSquared += Math.atan2(0.001, 0.41 * 16 / 9) ** 2;
  }
  assert.ok(depthSquared < rawDepthSquared * 0.05);
  assert.ok(rollSquared < rawRollSquared * 0.05);
  t.diagnostic(`Stationary noise RMS: depth=${Math.sqrt(depthSquared / 60).toFixed(6)}, raw=${Math.sqrt(rawDepthSquared / 60).toFixed(6)}; roll=${Math.sqrt(rollSquared / 60).toFixed(6)} radians`);
});

test('loss, crossed or malformed pairs, invalid rectangles, and explicit reset clear calibration', () => {
  const invalidHands: Hand[][] = [[], pair().slice(0, 1), [...pair(), pair()[0]]];
  const weak = pair(); weak[0].score = 0.49; invalidHands.push(weak);
  const flat = pair(); flat[0].landmarks[9] = { ...flat[0].landmarks[0] }; invalidHands.push(flat);
  const malformed = pair(); malformed[0].landmarks[5].x = Number.NaN; invalidHands.push(malformed);
  const crossed = pair();
  for (const index of [4, 8]) { crossed[0].landmarks[index].x = 0.2; crossed[1].landmarks[index].x = 0.8; }
  invalidHands.push(crossed);
  for (const hands of invalidHands) {
    const tracker = new PerspectiveTracker(); tracker.update(pair(), rect, 0);
    assert.ok(tracker.update(tilted(1.3, 0.8), rect, 33)!.depth > 0.9);
    assert.equal(tracker.update(hands, rect, 66), null);
    near(tracker.update(tilted(1.3, 0.8), rect, 99)!.depth, 0);
  }
  const tracker = new PerspectiveTracker(); tracker.update(pair(), rect, 0);
  assert.equal(tracker.update(pair(), null, 33), null);
  assert.equal(tracker.update(pair(), { ...rect, width: 0 }, 66), null);
  tracker.update(pair(), rect, 99); tracker.reset();
  near(tracker.update(tilted(1.3, 0.8), rect, 132)!.depth, 0);
});

test('stale, backwards, and invalid timestamps cancel; duplicate timestamps never advance smoothing', () => {
  for (const time of [-1, Number.NaN, Infinity, 32, 1034]) {
    const tracker = new PerspectiveTracker(); tracker.update(pair(), rect, 0);
    tracker.update(tilted(1.3, 0.8), rect, 33);
    assert.equal(tracker.update(pair(), rect, time), null);
    const fresh = tracker.update(tilted(1.3, 0.8), rect, 2000)!;
    near(fresh.depth, 0); near(fresh.roll, 0);
  }
  const tracker = new PerspectiveTracker(); tracker.update(pair(), rect, 0);
  const pose = tracker.update(tilted(1.01, 1), rect, 33);
  assert.deepEqual(tracker.update(tilted(1.3, 0.8), rect, 33), pose);
});

test('joined-tip mode accepts apertures rejected by the legacy tip gap and uses stable wrist roll', () => {
  const hands = handOutlineFixture('rounded');
  assert.equal(new PerspectiveTracker().update(hands, rect, 0), null);
  const tracker = new PerspectiveTracker();
  const neutral = tracker.update(hands, rect, 0, true)!;
  near(neutral.depth, 0); near(neutral.roll, 0);
  const moved = structuredClone(hands);
  // Finger-tip centers stay coincident while a whole hand tilts the aperture.
  moved[1].landmarks[0].y += 0.10;
  moved[1].landmarks[9].y += 0.10;
  const pose = tracker.update(moved, rect, 33, true)!;
  assert.ok(pose && Number.isFinite(pose.depth) && pose.roll > 0.05);
  validQuad(pose);
  assert.deepEqual(tracker.update([...moved].reverse(), rect, 33, true), pose);
});

test('joined-tip perspective retains palm, confidence, wrist separation and reset checks', () => {
  const tracker = new PerspectiveTracker(); tracker.update(handOutlineFixture('rounded'), rect, 0, true);
  const closeWrists = handOutlineFixture('rounded');
  closeWrists[0].landmarks[0].x = 0.52; closeWrists[1].landmarks[0].x = 0.48;
  assert.equal(tracker.update(closeWrists, rect, 33, true), null);
  const weak = handOutlineFixture('rounded'); weak[1].score = 0.49;
  assert.equal(tracker.update(weak, rect, 66, true), null);
  const flat = handOutlineFixture('rounded'); flat[0].landmarks[9] = { ...flat[0].landmarks[0] };
  assert.equal(tracker.update(flat, rect, 99, true), null);
  assert.ok(tracker.update(handOutlineFixture('rounded'), rect, 132, true));
  assert.equal(tracker.update(handOutlineFixture('rounded'), rect, 131, true), null);
  assert.equal(tracker.update([], rect, 165, true), null);
});

test('switching perspective reference mode recalibrates instead of carrying incompatible roll', () => {
  const tracker = new PerspectiveTracker(), hands = pair();
  tracker.update(hands, rect, 0);
  for (const index of [4, 8]) hands[1].landmarks[index].y += 0.15;
  assert.ok(tracker.update(hands, rect, 33)!.roll > 0.1);
  const automatic = tracker.update(hands, rect, 66, true)!;
  near(automatic.depth, 0); near(automatic.roll, 0);
  const legacy = tracker.update(hands, rect, 99)!;
  near(legacy.depth, 0); near(legacy.roll, 0);
});

test('missing palm landmarks cancel safely and valid hands reacquire at neutral', () => {
  for (const missing of [0, 9]) {
    const tracker = new PerspectiveTracker(), hands = handOutlineFixture('heart');
    tracker.update(hands, rect, 0, true);
    delete hands[0].landmarks[missing];
    assert.equal(tracker.update(hands, null, 33, true), null);
    assert.equal(tracker.update(hands, rect, 66, true), null);
    near(tracker.update(handOutlineFixture('heart'), rect, 99, true)!.depth, 0);
  }
});
