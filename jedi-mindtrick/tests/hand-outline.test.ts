import test from 'node:test';
import assert from 'node:assert/strict';
import type { Point } from '../src/contracts';
import { HandOutlineTracker, type HandOutline } from '../src/handframe/hand-outline';
import { deriveFrame } from '../src/handframe/index';
import { validateOutline } from '../src/handframe/shapes';
import { handOutlineFixture, opposingLFixture, type OutlineFixture } from './hand-outline-fixtures';

const close = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const displayPoints = ({ rect, outline }: HandOutline) => outline.map(point => ({
  x: rect.x + point.x * rect.width, y: rect.y + point.y * rect.height,
}));
const area = (points: readonly Point[]) => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length]; return sum + point.x * next.y - point.y * next.x;
}, 0) / 2);
function bounded(result: HandOutline): void {
  const { rect, outline } = result;
  assert.ok(rect.width >= 0.08 && rect.height >= 0.06 && rect.x >= 0 && rect.y >= 0);
  assert.ok(rect.x + rect.width <= 1 && rect.y + rect.height <= 1);
  assert.equal(validateOutline(outline, 14), null);
  assert.ok(outline.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  close(Math.min(...outline.map(point => point.x)), 0); close(Math.max(...outline.map(point => point.x)), 1);
  close(Math.min(...outline.map(point => point.y)), 0); close(Math.max(...outline.map(point => point.y)), 1);
}

test('thumb/index joints directly make rectangle, triangle, rounded, and concave apertures', () => {
  const results = (['rectangle', 'triangle', 'rounded', 'heart'] as OutlineFixture[]).map(shape => {
    const hands = handOutlineFixture(shape), snapshot = structuredClone(hands);
    const result = new HandOutlineTracker().update(hands, 0)!;
    assert.ok(result, shape); bounded(result); assert.deepEqual(hands, snapshot);
    return result;
  });
  const [rectangle, triangle, rounded, heart] = results;
  assert.equal(rectangle.outline.length, 14);
  for (const result of [triangle, rounded, heart]) assert.equal(result.outline.length, 12, 'both pairs of joined fingertips should merge');
  close(area(displayPoints(rectangle)), 0.6 * 0.4);
  close(area(displayPoints(triangle)), 0.6 * 0.4 / 2);
  close(rounded.rect.x, 0.22); close(rounded.rect.width, 0.56);
  assert.ok(area(rounded.outline) > 0.7 && area(rounded.outline) < 0.9);
  const contour = displayPoints(heart);
  assert.ok(contour.some(point => Math.hypot(point.x - 0.5, point.y - 0.4) < 1e-9), 'heart must retain the measured inward index-tip notch');
  const turns = contour.map((point, index) => {
    const next = contour[(index + 1) % contour.length], after = contour[(index + 2) % contour.length];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  assert.ok(turns.some(turn => turn < -0.001), 'the measured concavity must not become a convex hull');
  assert.equal(new Set(results.map(result => JSON.stringify(result.outline))).size, 4);
});

test('joined tips use joint bounds even when the old tip-only rectangle rejects the aperture', () => {
  const hands = handOutlineFixture('rounded');
  assert.equal(deriveFrame(hands), null);
  const result = new HandOutlineTracker().update(hands, 0)!;
  close(result.rect.x, 0.22); close(result.rect.y, 0.25);
  close(result.rect.width, 0.56); close(result.rect.height, 0.45);
});

test('mirroring, detector reordering and handedness labels do not alter the contour', () => {
  const hands = handOutlineFixture('heart', { dx: 0.07, dy: -0.06 });
  const tracker = new HandOutlineTracker(), original = tracker.update(hands, 0)!;
  bounded(original); close(original.rect.x, 0.29); close(original.rect.y, 0.19);
  const reversed = hands.reverse().map(hand => ({ ...hand, handedness: 'unknown' }));
  assert.deepEqual(tracker.update(reversed, 33), original);
});

test('rapid translation and deformation follow in one sample while staying a measured valid contour', () => {
  const tracker = new HandOutlineTracker(); tracker.update(handOutlineFixture('rectangle'), 0);
  const target = handOutlineFixture('heart', { dx: 0.04, dy: -0.06 });
  const moved = tracker.update(target, 33)!;
  const direct = new HandOutlineTracker().update(target, 33)!;
  bounded(moved);
  // Every vertex moved by well above the deliberate-motion threshold.
  assert.deepEqual(moved, direct);
  const translated = handOutlineFixture('heart', { dx: 0.055, dy: -0.06 });
  const next = tracker.update(translated, 66)!;
  assert.deepEqual(next, new HandOutlineTracker().update(translated, 66));
});

test('small stationary landmark noise is attenuated without freezing deliberate changes', t => {
  const tracker = new HandOutlineTracker(), initial = tracker.update(handOutlineFixture('rounded'), 0)!;
  let squared = 0;
  for (let sample = 1; sample <= 60; sample++) {
    const noise = (sample % 2 ? 1 : -1) * 0.001;
    const result = tracker.update(handOutlineFixture('rounded', { dx: noise }), sample * 33)!;
    bounded(result); squared += (result.rect.x - initial.rect.x) ** 2;
  }
  const rms = Math.sqrt(squared / 60);
  assert.ok(rms < 0.0005, 'responsive filtering should still halve subpixel jitter');
  t.diagnostic(`Stationary translation input RMS=0.001; contour output RMS=${rms.toFixed(6)} normalized units`);
  const deliberate = handOutlineFixture('rounded', { dx: 0.03 });
  assert.deepEqual(tracker.update(deliberate, 2013), new HandOutlineTracker().update(deliberate, 2013));
});

test('asymmetric joining and unjoining keep anatomical smoothing correspondence and simple outlines', () => {
  const tracker = new HandOutlineTracker();
  let last = tracker.update(handOutlineFixture('rounded'), 0)!;
  const counts = new Set([last.outline.length]);
  for (let sample = 1; sample <= 12; sample++) {
    const gap = sample <= 6 ? sample * 0.012 : (12 - sample) * 0.012;
    const hands = handOutlineFixture('rounded');
    // Separate only the index pair; the joined thumb point remains the closing vertex.
    hands[0].landmarks[8].x += gap / 2; hands[1].landmarks[8].x -= gap / 2;
    const result = tracker.update(hands, sample * 33)!;
    assert.ok(result); bounded(result); counts.add(result.outline.length);
    const notch = displayPoints(result).filter(point => point.y < 0.26);
    assert.ok(notch.every(point => Math.abs(point.x - 0.5) <= gap / 2 + 0.015));
    close(result.rect.y, last.rect.y); last = result;
  }
  assert.deepEqual([...counts].sort(), [12, 13]);
});

test('slow deliberate movement settles faster than the previous contour filter', t => {
  const tracker = new HandOutlineTracker(); tracker.update(handOutlineFixture('rounded'), 0);
  let previous = 0, oldError = 0, newError = 0;
  for (let sample = 1; sample <= 30; sample++) {
    const target = sample * .0025;
    const motion = Math.abs(target - previous);
    previous += (target - previous) * (.24 + .76 * Math.max(0, Math.min(1, (motion - .002) / .010)));
    const current = tracker.update(handOutlineFixture('rounded', { dx: target }), sample * 33)!;
    oldError += target - previous;
    newError += target - (current.rect.x - .22);
  }
  assert.ok(newError < oldError * .5, 'the cumulative lag for slow movement must at least halve');
  t.diagnostic(`Mean slow-motion position error: previous=${oldError / 30}, current=${newError / 30}`);
});

test('crossing, offscreen, collapsed, low-confidence and malformed tracking hide and reset the aperture', () => {
  const invalid = [[], handOutlineFixture().slice(0, 1), [...handOutlineFixture(), handOutlineFixture()[0]]];
  const crossed = handOutlineFixture('rounded'); crossed[0].landmarks[6].x = 0.08; invalid.push(crossed);
  const offscreen = handOutlineFixture('rectangle', { dx: 0.4 }); invalid.push(offscreen);
  const weak = handOutlineFixture(); weak[0].score = 0.49; invalid.push(weak);
  const nan = handOutlineFixture(); nan[1].landmarks[7].x = Number.NaN; invalid.push(nan);
  const badZ = handOutlineFixture(); badZ[1].landmarks[7].z = Infinity; invalid.push(badZ);
  const count = handOutlineFixture(); count[0].landmarks.pop(); invalid.push(count);
  const sparse = handOutlineFixture(); delete sparse[0].landmarks[7]; invalid.push(sparse);
  const palm = handOutlineFixture(); palm[0].landmarks[9] = { ...palm[0].landmarks[0] }; invalid.push(palm);
  const collapsed = handOutlineFixture();
  for (const index of [5, 6, 7, 8]) collapsed[0].landmarks[index] = { ...collapsed[0].landmarks[5] };
  invalid.push(collapsed);
  for (const hands of invalid) {
    const tracker = new HandOutlineTracker(); tracker.update(handOutlineFixture(), 0);
    assert.equal(tracker.update(hands, 33), null);
    const recovered = tracker.update(handOutlineFixture('heart'), 66);
    assert.deepEqual(recovered, new HandOutlineTracker().update(handOutlineFixture('heart'), 66));
  }
});

test('near-coincident wrists, tiny apertures and negligible area are rejected', () => {
  const closeWrists = handOutlineFixture('rounded'); closeWrists[0].landmarks[0].x = 0.52; closeWrists[1].landmarks[0].x = 0.48;
  assert.equal(new HandOutlineTracker().update(closeWrists, 0), null);
  assert.equal(new HandOutlineTracker().update(handOutlineFixture('rounded', { scale: 0.08 }), 0), null);
  const flat = handOutlineFixture();
  for (const hand of flat) for (const index of [2, 3, 4, 5, 6, 7, 8]) hand.landmarks[index].y = 0.5;
  assert.equal(new HandOutlineTracker().update(flat, 0), null);
});

test('duplicates do not advance state and returned values cannot mutate the tracker', () => {
  const tracker = new HandOutlineTracker(), first = tracker.update(handOutlineFixture('rounded'), 10)!;
  const snapshot = structuredClone(first);
  first.rect.x = 0; first.outline[0].x = 0;
  assert.deepEqual(tracker.update(handOutlineFixture('heart'), 10), snapshot);
  tracker.reset();
  assert.deepEqual(tracker.update(handOutlineFixture('heart'), 20), new HandOutlineTracker().update(handOutlineFixture('heart'), 20));
});

test('reversed, stale or invalid time cancels; a large teleport hides once and then reacquires', () => {
  for (const timestamp of [9, 1011, -1, Number.NaN, Infinity]) {
    const tracker = new HandOutlineTracker(); tracker.update(handOutlineFixture(), 10);
    assert.equal(tracker.update(handOutlineFixture('rounded'), timestamp), null);
    assert.deepEqual(tracker.update(handOutlineFixture('rounded'), 2000), new HandOutlineTracker().update(handOutlineFixture('rounded'), 2000));
  }
  const tracker = new HandOutlineTracker();
  const before = handOutlineFixture('rounded', { scale: 0.45, dx: -0.3 });
  const after = handOutlineFixture('rounded', { scale: 0.45, dx: 0.3 });
  assert.ok(tracker.update(before, 0));
  assert.equal(tracker.update(after, 33), null);
  assert.deepEqual(tracker.update(after, 66), new HandOutlineTracker().update(after, 66));
});


test('either inverted L connects opposing fingertips while retaining every measured joint', () => {
  for (const inverted of ['left', 'right'] as const) {
    const hands = opposingLFixture(inverted), snapshot = structuredClone(hands);
    const result = new HandOutlineTracker().update(hands, 0)!;
    assert.ok(result, inverted); bounded(result); assert.deepEqual(hands, snapshot);
    close(result.rect.x, .2); close(result.rect.y, .25); close(result.rect.width, .6); close(result.rect.height, .4);
    const contour = displayPoints(result);
    assert.equal(contour.length, 14);
    for (const hand of hands) for (const index of [4, 3, 2, 5, 6, 7, 8]) {
      const source = hand.landmarks[index];
      assert.ok(contour.some(point => Math.hypot(point.x - (1 - source.x), point.y - source.y) < 1e-9), `measured joint ${index} must remain in the outline`);
    }
    const endpointEdges = contour.map((point, index) => [point, contour[(index + 1) % contour.length]])
      .filter(([a, b]) => Math.abs(a.x - b.x) > .3);
    assert.equal(endpointEdges.length, 2);
    assert.ok(endpointEdges.every(([a, b]) => Math.abs(a.y - b.y) < 1e-9), 'opposing fingertips connect along the opening instead of crossing it');
    close(area(contour), .6 * .4);
  }
});

test('opposing-L contours ignore detector order and anatomical handedness labels', () => {
  for (const inverted of ['left', 'right'] as const) {
    const hands = opposingLFixture(inverted, { dx: .025, dy: -.02, scale: .9 });
    const tracker = new HandOutlineTracker(), expected = tracker.update(hands, 0)!;
    assert.ok(expected); bounded(expected);
    for (let i = 1; i <= 6; i++) {
      const reordered = (i % 2 ? [...hands].reverse() : [...hands]).map(hand => ({ ...hand, handedness: i % 2 ? 'unknown' : 'Left' }));
      assert.deepEqual(tracker.update(reordered, i * 33), expected);
    }
  }
});

test('pairing transitions never smooth an old contour ordering into a different connection', () => {
  const tracker = new HandOutlineTracker(); assert.ok(tracker.update(handOutlineFixture(), 0));
  const poses = [opposingLFixture('right', { dx: .001 }), handOutlineFixture('rectangle', { dx: .002 }), opposingLFixture('left', { dx: .003 })];
  poses.forEach((hands, index) => {
    const timestamp = (index + 1) * 33, result = tracker.update(hands, timestamp)!;
    assert.ok(result); bounded(result);
    assert.deepEqual(result, new HandOutlineTracker().update(hands, timestamp), 'a changed endpoint pairing must start from its current measured joints');
  });
  const deliberate = opposingLFixture('left', { dx: .028 });
  assert.deepEqual(tracker.update(deliberate, 132), new HandOutlineTracker().update(deliberate, 132));
});

test('an internally crossed measured hand cannot be repaired by an alternate endpoint pairing', () => {
  for (const inverted of ['left', 'right'] as const) {
    const hands = opposingLFixture(inverted);
    // Index joint 6 passes through the same hand's thumb segment; all points remain finite and on screen.
    const crossingY = inverted === 'left' ? .90 - .67 : .67;
    hands[0].landmarks[6] = { x: .75, y: crossingY, z: 0 };
    const tracker = new HandOutlineTracker(); assert.ok(tracker.update(opposingLFixture(inverted), 0));
    assert.equal(tracker.update(hands, 33), null);
    assert.deepEqual(tracker.update(opposingLFixture(inverted), 66), new HandOutlineTracker().update(opposingLFixture(inverted), 66));
  }
});

test('overlapping hand chains invalidate both endpoint pairings and reacquire without stale geometry', () => {
  const invalid = opposingLFixture('right');
  for (const index of [4, 3, 2, 5, 6, 7, 8]) invalid[1].landmarks[index] = { ...invalid[0].landmarks[index] };
  const tracker = new HandOutlineTracker(); assert.ok(tracker.update(opposingLFixture('left'), 0));
  assert.equal(tracker.update(invalid, 33), null);
  assert.deepEqual(tracker.update(opposingLFixture('right'), 66), new HandOutlineTracker().update(opposingLFixture('right'), 66));
});

test('opposing-L low confidence, lost hand, malformed joints and closed fingers hide before recovery', () => {
  const weak = opposingLFixture(); weak[1].score = .49;
  const malformed = opposingLFixture(); malformed[0].landmarks[3].x = Infinity;
  const closed = opposingLFixture();
  for (const hand of closed) hand.landmarks[8] = { ...hand.landmarks[4] };
  for (const hands of [weak, malformed, closed, opposingLFixture().slice(0, 1)]) {
    const tracker = new HandOutlineTracker(); assert.ok(tracker.update(opposingLFixture(), 0));
    assert.equal(tracker.update(hands, 33), null);
    assert.deepEqual(tracker.update(opposingLFixture('left'), 66), new HandOutlineTracker().update(opposingLFixture('left'), 66));
  }
});
