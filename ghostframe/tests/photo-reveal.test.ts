import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand } from '../src/contracts';
import { PhotoReveal } from '../src/handframe/photo-reveal';
import { palmPose } from './palm-visibility-fixtures';
import { opposingLFixture } from './hand-outline-fixtures';
import { worldCyclePair, worldCyclePrayer } from './world-cycle-fixtures';

const one = (closure: number) => [palmPose(closure)];
const open = () => worldCyclePair(3.2);
const close = () => worldCyclePair(1.1);
const reflect = (hands: Hand[]) => hands.map(hand => ({ ...hand,
  landmarks: hand.landmarks.map(point => ({ ...point, x: 1 - point.x })),
}));

test('one open palm arms visibility, a fist hides, and reopening reveals immediately', () => {
  const reveal = new PhotoReveal();
  assert.equal(reveal.update(one(1), 0, 'one'), null);
  assert.equal(reveal.update(one(0), 16, 'one'), 1);
  assert.equal(reveal.update(one(1), 32, 'one'), 0);
  assert.equal(reveal.update(one(0), 48, 'one'), 1);
});

test('one-hand partial closure is continuous, bounded and responsive', () => {
  const reveal = new PhotoReveal();
  let previous = reveal.update(one(0), 0, 'one')!;
  for (const [index, closure] of [0.25, 0.5, 0.75].entries()) {
    const amount = reveal.update(one(closure), (index + 1) * 16, 'one');
    assert.ok(amount !== null && amount > 0 && amount < previous);
    previous = amount;
  }
  assert.equal(reveal.update(one(1), 64, 'one'), 0);
});

test('one-hand loss and invalid tracking discard arming rather than retaining an old photo', () => {
  for (const missing of [[], [{ ...palmPose(0), score: 0.59 }]]) {
    const reveal = new PhotoReveal();
    assert.equal(reveal.update(one(0), 0, 'one'), 1);
    assert.equal(reveal.update(missing, 16, 'one'), null);
    assert.equal(reveal.update(one(1), 32, 'one'), null);
    assert.equal(reveal.update(one(0), 48, 'one'), 1);
  }
});

test('one-hand reveal follows local curl in mirrored and rotated camera coordinates', () => {
  for (const mirrored of [false, true]) {
    for (const rotation of [-0.7, 0, 0.7]) {
      const reveal = new PhotoReveal();
      const pose = (closure: number) => {
        const hands = [palmPose(closure, { scale: 0.7, rotation, tilt: 0.3 })];
        return mirrored ? reflect(hands) : hands;
      };
      assert.equal(reveal.update(pose(0), 0, 'one'), 1);
      assert.equal(reveal.update(pose(1), 16, 'one'), 0);
    }
  }
});

test('two open hands reach full view and hands together hide in the same frame', () => {
  const reveal = new PhotoReveal();
  assert.equal(reveal.update(open(), 0, 'two'), 1);
  assert.equal(reveal.update(close(), 16, 'two'), 0);
  assert.equal(reveal.update(worldCyclePrayer(), 32, 'two'), 0);
  assert.equal(reveal.update(open(), 48, 'two'), 1);
});

test('two-hand separation produces progressively larger partial reveals', () => {
  const reveal = new PhotoReveal();
  let previous = reveal.update(close(), 0, 'two')!;
  for (const [index, separation] of [1.5, 1.8, 2.1, 2.4, 2.7].entries()) {
    const amount = reveal.update(worldCyclePair(separation), (index + 1) * 16, 'two');
    assert.ok(amount !== null && amount > previous && amount < 1);
    previous = amount;
  }
  assert.equal(reveal.update(open(), 96, 'two'), 1);
  const halfway = new PhotoReveal().update(worldCyclePair(2.1), 0, 'two');
  assert.ok(halfway !== null && halfway > 0.4 && halfway < 0.6);
});

test('small two-hand tremors are damped while large changes and endpoints respond immediately', () => {
  const reveal = new PhotoReveal();
  const initial = reveal.update(worldCyclePair(2.1), 0, 'two')!;
  const moved = reveal.update(worldCyclePair(2.12), 16, 'two')!;
  const raw = new PhotoReveal().update(worldCyclePair(2.12), 0, 'two')!;
  assert.ok(moved > initial && moved < raw);
  assert.equal(reveal.update(open(), 32, 'two'), 1);
  assert.equal(reveal.update(close(), 48, 'two'), 0);
});

test('repeated separation tremor does not make the whole picture pulse at raw amplitude', () => {
  const reveal = new PhotoReveal(), raw: number[] = [], displayed: number[] = [];
  for (let sample = 0; sample < 90; sample++) {
    const hands = worldCyclePair(sample % 2 ? 2.02 : 2.18);
    const amount = reveal.update(hands, sample * 33, 'two')!;
    if (sample > 10) {
      displayed.push(amount); raw.push(new PhotoReveal().update(hands, 0, 'two')!);
    }
  }
  const extent = (values: number[]) => Math.max(...values) - Math.min(...values);
  assert.ok(extent(displayed) < extent(raw) * .45);
  assert.equal(reveal.update(open(), 3000, 'two'), 1);
  assert.equal(reveal.update(close(), 3033, 'two'), 0);
});

test('two-hand reveal is independent of camera reflection, hand labels, order and scale', () => {
  for (const scale of [0.35, 0.75, 1.1]) {
    for (const mirrored of [false, true]) {
      const reveal = new PhotoReveal();
      const pair = (separation: number) => {
        const hands = worldCyclePair(separation, { scale, labels: false }).reverse();
        return mirrored ? reflect(hands) : hands;
      };
      assert.equal(reveal.update(pair(3.2), 0, 'two'), 1);
      assert.equal(reveal.update(pair(1.1), 16, 'two'), 0);
    }
  }
});

test('upside-down L poses and naturally curled other fingers can reveal the full photo', () => {
  for (const inverted of ['left', 'right'] as const) {
    assert.equal(new PhotoReveal().update(opposingLFixture(inverted), 0, 'two'), 1);
  }
  const hands = open();
  // Build articulated L hands: preserve each open thumb/index, curl the other
  // fingers locally. The remaining fingers never need to form a convex frame.
  for (const hand of hands) {
    for (const base of [9, 13, 17]) {
      for (let joint = 1; joint <= 3; joint++) hand.landmarks[base + joint] = {
        ...hand.landmarks[base], y: hand.landmarks[base].y + joint * 0.008,
        z: (hand.landmarks[base].z ?? 0) - joint * 0.01,
      };
    }
  }
  assert.equal(new PhotoReveal().update(hands, 0, 'two'), 1);
});

test('edge-on prayer palms remain valid with ambiguous handedness and overlapping wrists', () => {
  for (const scale of [0.35, 0.75, 1.1]) {
    for (const separation of [0, 0.04, -0.08]) {
      const hands = worldCyclePrayer(separation, scale);
      hands.forEach(hand => { hand.handedness = 'unknown'; });
      assert.equal(new PhotoReveal().update(hands, 0, 'two'), 0);
    }
  }
});

test('brief two-hand detector loss holds the measured picture; current closure still hides immediately', () => {
  const reveal = new PhotoReveal();
  assert.equal(reveal.update(open(), 0, 'two'), 1);
  assert.equal(reveal.update(open().slice(0, 1), 16, 'two'), 1);
  assert.equal(reveal.update([], 31, 'two'), 1);
  assert.equal(reveal.update(close(), 32, 'two'), 0);
  assert.equal(reveal.update([], 48, 'two'), 0);
  assert.equal(reveal.update(open(), 64, 'two'), 1);
});

test('missing detections cannot prolong the two-hand grace and reacquisition measures afresh', () => {
  const reveal = new PhotoReveal();
  assert.equal(reveal.update(open(), 0, 'two'), 1);
  for (const time of [33, 66, 100, 150]) assert.equal(reveal.update([], time, 'two'), 1);
  assert.equal(reveal.update([], 151, 'two'), null);
  assert.equal(reveal.update(open().slice(0, 1), 167, 'two'), null);
  const partial = reveal.update(worldCyclePair(2.1), 200, 'two');
  assert.equal(partial, new PhotoReveal().update(worldCyclePair(2.1), 0, 'two'));
});

test('switching mode or resetting cannot carry one-hand arming or two-hand smoothing', () => {
  const reveal = new PhotoReveal();
  assert.equal(reveal.update(one(0), 0, 'one'), 1);
  assert.equal(reveal.update(open(), 16, 'two'), 1);
  assert.equal(reveal.update(one(1), 32, 'one'), null);
  assert.equal(reveal.update(one(0), 48, 'one'), 1);
  reveal.reset();
  assert.equal(reveal.update(one(1), 64, 'one'), null);
  const amount = reveal.update(worldCyclePair(2.1), 80, 'two');
  assert.equal(amount, new PhotoReveal().update(worldCyclePair(2.1), 0, 'two'));
});

test('invalid, reversed and stale timestamps reset control while duplicate frames do not advance it', () => {
  for (const invalid of [NaN, Infinity, -1, 99, 1101]) {
    const reveal = new PhotoReveal();
    assert.equal(reveal.update(one(0), 100, 'one'), 1);
    assert.equal(reveal.update(one(1), invalid, 'one'), null);
    assert.equal(reveal.update(one(1), 1200, 'one'), null);
    assert.equal(reveal.update(one(0), 1216, 'one'), 1);
  }
  const reveal = new PhotoReveal();
  assert.equal(reveal.update(one(0), 0, 'one'), 1);
  assert.equal(reveal.update(one(1), 0, 'one'), null);
  assert.equal(reveal.update(one(1), 16, 'one'), 0);
  assert.equal(reveal.update(open(), 32, 'two'), 1);
  assert.equal(reveal.update(close(), 32, 'two'), null);
  assert.equal(reveal.update(close(), 1033, 'two'), null);
  assert.equal(reveal.update(close(), 1049, 'two'), 0);
});

test('malformed pairs, duplicate detections, weak scores and implausible thumb/index data cannot reveal', () => {
  const invalid: Hand[][] = [[...open(), open()[0]], [{ ...open()[0], score: .49 }]];
  const duplicated = open()[0]; invalid.push([duplicated, structuredClone(duplicated)]);
  for (const mutate of [
    (hands: Hand[]) => { hands[0].score = 0.49; },
    (hands: Hand[]) => { hands[0].score = 1.01; },
    (hands: Hand[]) => { hands[0].score = NaN; },
    (hands: Hand[]) => { hands[0].landmarks.pop(); },
    (hands: Hand[]) => { delete hands[0].landmarks[7]; },
    (hands: Hand[]) => { hands[0].landmarks[7].x = NaN; },
    (hands: Hand[]) => { hands[0].landmarks[7].z = Infinity; },
    (hands: Hand[]) => { hands[0].landmarks[7].x = 1.1; },
    (hands: Hand[]) => { hands[0].landmarks[9] = { ...hands[0].landmarks[0] }; },
    (hands: Hand[]) => { hands[0].landmarks[17] = { ...hands[0].landmarks[5] }; },
    (hands: Hand[]) => { hands[0].landmarks[3] = { ...hands[0].landmarks[2] }; },
    (hands: Hand[]) => { hands[0].landmarks[8] = { ...hands[0].landmarks[5] }; },
  ]) { const hands = open(); mutate(hands); invalid.push(hands); }
  for (const hands of invalid) {
    const reveal = new PhotoReveal();
    assert.equal(reveal.update(open(), 0, 'two'), 1);
    assert.equal(reveal.update(hands, 16, 'two'), null);
    assert.equal(reveal.update(close(), 32, 'two'), 0);
  }
  assert.equal(new PhotoReveal().update([palmPose(1, { x: 0.3 }), palmPose(1, { x: 0.7 })], 0, 'two'), null);
});

test('two-hand geometry tolerates absent optional depth and never mutates caller landmarks', () => {
  const hands = open().map(hand => ({ ...hand,
    landmarks: hand.landmarks.map(({ x, y }) => ({ x, y })),
  }));
  const before = structuredClone(hands);
  assert.equal(new PhotoReveal().update(hands, 0, 'two'), 1);
  assert.deepEqual(hands, before);
});

const atAspect = (hands: Hand[], aspect: number): Hand[] => hands.map(hand => ({ ...hand,
  landmarks: hand.landmarks.map(point => ({ ...point,
    x: .5 + (point.x - .5) * (16 / 9) / aspect, z: (point.z ?? 0) * (16 / 9) / aspect,
  })),
}));

test('the same physical palms reveal equally in portrait, square and landscape cameras', () => {
  for (const aspect of [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9]) {
    const reveal = new PhotoReveal();
    for (const [sample, separation] of [3.2, 1.1, 2.1, 2.4, 3.2].entries()) {
      const source = worldCyclePair(separation, { scale: .35 });
      const portrait = atAspect(source, aspect);
      assert.ok(portrait.every(hand => hand.landmarks.every(point => point.x >= 0 && point.x <= 1)));
      const amount = reveal.update(portrait, sample * 33, 'two', aspect);
      assert.notEqual(amount, null);
      if (sample === 0 || sample === 4) assert.equal(amount, 1);
      if (sample === 1) assert.equal(amount, 0);
    }
    const source = worldCyclePair(2.1, { scale: .35 });
    const expected = new PhotoReveal().update(source, 0, 'two')!;
    assert.ok(Math.abs(new PhotoReveal().update(atAspect(source, aspect), 0, 'two', aspect)! - expected) < 1e-10);
    const oneHand = new PhotoReveal();
    assert.equal(oneHand.update(atAspect([palmPose(0, { scale: .35 })], aspect), 0, 'one', aspect), 1);
    assert.equal(oneHand.update(atAspect([palmPose(1, { scale: .35 })], aspect), 33, 'one', aspect), 0);
  }
});

test('camera aspect changes discard held photo measurements and one-hand arming', () => {
  const reveal = new PhotoReveal();
  assert.equal(reveal.update(open(), 0, 'two'), 1);
  assert.equal(reveal.update([], 33, 'two', 9 / 16), null);
  assert.equal(reveal.update(one(0), 66, 'one'), 1);
  assert.equal(reveal.update(atAspect([palmPose(1, { scale: .35 })], 9 / 16), 99, 'one', 9 / 16), null);
  for (const invalid of [0, -1, NaN, Infinity]) {
    reveal.update(open(), 100, 'two');
    assert.equal(reveal.update(open(), 133, 'two', invalid), null);
  }
});
