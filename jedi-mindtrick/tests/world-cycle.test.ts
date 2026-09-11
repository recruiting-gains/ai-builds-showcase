import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand } from '../src/contracts';
import { WorldCycle } from '../src/handframe/world-cycle';
import { worldCyclePair, worldCycleOutline, worldCyclePrayer } from './world-cycle-fixtures';
import type { OutlineFixture } from './hand-outline-fixtures';

const open = () => worldCyclePair(3.2);
const close = () => worldCyclePair(1.1);
function arm(tracker: WorldCycle, time = 0): void {
  assert.equal(tracker.update(open(), time), false);
  assert.equal(tracker.update(open(), time + 100), false);
}
function shut(tracker: WorldCycle, time = 200): void {
  assert.equal(tracker.update(close(), time), false);
  assert.equal(tracker.update(close(), time + 140), false);
}
function reopen(tracker: WorldCycle, time = 400): void {
  assert.equal(tracker.update(open(), time), false);
  assert.equal(tracker.update(open(), time + 99), false);
  assert.equal(tracker.update(open(), time + 100), true);
}

test('first opening only establishes a session, whether starting closed or already open', () => {
  for (const initiallyTogether of [false, true]) {
    const tracker = new WorldCycle();
    if (initiallyTogether) {
      assert.equal(tracker.update(close(), 0), false);
      assert.equal(tracker.update(close(), 200), false);
    }
    arm(tracker, 300);
    for (let time = 500; time <= 1500; time += 100) assert.equal(tracker.update(open(), time), false);
    shut(tracker, 1600); reopen(tracker, 1800);
  }
});

test('a sustained close/reopen emits once; holding endpoints cannot repeat it', () => {
  const tracker = new WorldCycle(); arm(tracker); shut(tracker);
  for (let time = 350; time <= 750; time += 100) assert.equal(tracker.update(close(), time), false);
  reopen(tracker, 800);
  for (let time = 950; time <= 1950; time += 100) assert.equal(tracker.update(open(), time), false);
  shut(tracker, 2100); reopen(tracker, 2300);
});

test('close dwell boundary is enforced and short accidental proximity cannot cycle', () => {
  const tracker = new WorldCycle(); arm(tracker);
  assert.equal(tracker.update(close(), 200), false);
  assert.equal(tracker.update(close(), 339), false);
  assert.equal(tracker.update(open(), 340), false);
  assert.equal(tracker.update(open(), 440), false);
  shut(tracker, 500); reopen(tracker, 700);
});

test('threshold hysteresis tolerates small jitter but rejects incomplete closes and opens', () => {
  const tracker = new WorldCycle(); arm(tracker);
  // A neutral band cannot start closing, even when held longer than the dwell.
  for (const time of [200, 400, 600]) assert.equal(tracker.update(worldCyclePair(1.55), time), false);
  assert.equal(tracker.update(open(), 700), false);
  assert.equal(tracker.update(open(), 800), false);
  assert.equal(tracker.update(worldCyclePair(1.4), 900), false);
  assert.equal(tracker.update(worldCyclePair(1.6), 1040), false);
  // Palm centers sit about 0.074 palm lengths inside the wrists in this fixture.
  for (const time of [1100, 1300]) assert.equal(tracker.update(worldCyclePair(2.3), time), false);
  assert.equal(tracker.update(worldCyclePair(2.45), 1400), false);
  assert.equal(tracker.update(worldCyclePair(2.25), 1500), true);
});

test('fingertip contact in triangles, rounded openings and hearts never counts as bringing palms together', () => {
  const tracker = new WorldCycle();
  // Arm on the fixture itself to avoid inventing a teleport between fixtures.
  assert.equal(tracker.update(worldCycleOutline('triangle'), 0), false);
  assert.equal(tracker.update(worldCycleOutline('triangle'), 100), false);
  for (let sample = 2; sample <= 18; sample++) {
    const shape = (['triangle', 'rounded', 'heart'] as OutlineFixture[])[sample % 3];
    const hands = worldCycleOutline(shape);
    assert.equal(hands[0].landmarks[4].x, hands[1].landmarks[4].x);
    assert.equal(hands[0].landmarks[8].x, hands[1].landmarks[8].x);
    assert.equal(tracker.update(hands, sample * 100), false);
  }
  const spaced = (ratio: number) => worldCycleOutline('triangle').map((hand, index) => {
    const nextWristX = 0.5 + (index === 0 ? 1 : -1) * ratio * 0.25 / (16 / 9) / 2;
    const dx = nextWristX - hand.landmarks[0].x;
    return { ...hand, landmarks: hand.landmarks.map(point => ({ ...point, x: point.x + dx })) };
  });
  // A real close/reopen must still work after those shapes. Otherwise an
  // always-invalid fixture could falsely make the all-false assertions pass.
  assert.equal(tracker.update(spaced(3), 1900), false);
  assert.equal(tracker.update(spaced(1.1), 2000), false);
  assert.equal(tracker.update(spaced(1.1), 2140), false);
  assert.equal(tracker.update(spaced(3), 2200), false);
  assert.equal(tracker.update(spaced(3), 2300), true);
});

test('ordinary translations, scale and finger articulation cannot manufacture a cycle', () => {
  for (const scale of [0.35, 0.75, 1.1]) {
    const tracker = new WorldCycle();
    for (let sample = 0; sample <= 20; sample++) {
      const hands = worldCyclePair(3.2, { scale, x: 0.5 + 0.05 * Math.sin(sample / 4) });
      // Touch only the two index tips. Palm separation remains unchanged.
      hands[0].landmarks[8].x = hands[1].landmarks[8].x = 0.5;
      assert.equal(tracker.update(hands, sample * 100), false);
    }
  }
});

test('palm-size depth changes at fixed wrists cannot close or reopen a cycle', () => {
  const atDepth = (hands: Hand[], factor: number) => hands.map(hand => {
    const wrist = hand.landmarks[0];
    return { ...hand, landmarks: hand.landmarks.map(point => ({
      x: wrist.x + (point.x - wrist.x) * factor, y: wrist.y + (point.y - wrist.y) * factor,
      z: (point.z ?? 0) * factor,
    })) };
  });
  const tracker = new WorldCycle();
  const initial = worldCyclePair(3.2, { scale: 0.35 });
  assert.equal(tracker.update(initial, 0), false);
  assert.equal(tracker.update(initial, 100), false);
  // Apparent size doubles while wrists remain still: normalized distance
  // becomes close, but this is not an observed hands-together movement.
  assert.equal(tracker.update(atDepth(initial, 2.4), 200), false);
  assert.equal(tracker.update(atDepth(initial, 2.4), 400), false);
  assert.equal(tracker.update(initial, 500), false);
  assert.equal(tracker.update(initial, 700), false);
  const slightContraction = atDepth(worldCyclePair(3.2 * 0.85, { scale: 0.35 }), 2.4);
  assert.equal(tracker.update(slightContraction, 800), false);
  assert.equal(tracker.update(slightContraction, 1000), false);
  assert.equal(tracker.update(initial, 1100), false);
  assert.equal(tracker.update(initial, 1300), false);

  // Conversely, shrinking palms in a genuinely closed state is not reopening.
  const next = new WorldCycle(); arm(next); shut(next);
  const apparentlyOpen = atDepth(close(), 0.4);
  assert.equal(next.update(apparentlyOpen, 400), false);
  assert.equal(next.update(apparentlyOpen, 600), false);
  reopen(next, 700);
});

test('the same geometric gesture works at different hand scales and does not mutate input', () => {
  for (const scale of [0.35, 0.75, 1.1]) {
    const tracker = new WorldCycle(), events: boolean[] = [];
    for (const [separation, time] of [[3.2, 0], [3.2, 100], [1.1, 200], [1.1, 340], [3.2, 400], [3.2, 500]]) {
      const hands = worldCyclePair(separation, { scale }), snapshot = structuredClone(hands);
      events.push(tracker.update(hands, time)); assert.deepEqual(hands, snapshot);
    }
    assert.deepEqual(events, [false, false, false, false, false, true]);
  }
});

test('detector reordering and temporary unknown labels preserve the tracked pair', () => {
  for (const labels of [true, false]) {
    const tracker = new WorldCycle(); arm(tracker);
    const together = worldCyclePair(1.1, { labels });
    assert.equal(tracker.update(together.reverse(), 200), false);
    assert.equal(tracker.update(together.reverse(), 340), false);
    assert.equal(tracker.update(open().reverse(), 400), false);
    assert.equal(tracker.update(open(), 500), true);
  }
});

test('unrelated tracking loss or malformed input cancels a pending cycle and requires an open re-arm', () => {
  const invalid: Hand[][] = [[], open().slice(0, 1), [...open(), open()[0]]];
  for (const change of [
    (hands: Hand[]) => { hands[0].score = 0.49; },
    (hands: Hand[]) => { hands[0].score = 1.01; },
    (hands: Hand[]) => { hands[0].score = NaN; },
    (hands: Hand[]) => { hands[0].landmarks.pop(); },
    (hands: Hand[]) => { delete hands[0].landmarks[7]; },
    (hands: Hand[]) => { hands[0].landmarks[7].x = NaN; },
    (hands: Hand[]) => { hands[0].landmarks[7].z = Infinity; },
    (hands: Hand[]) => { hands[0].landmarks[7].x = 1.1; },
    (hands: Hand[]) => { hands[0].landmarks[9] = { ...hands[0].landmarks[0] }; },
    (hands: Hand[]) => { hands[0].landmarks[20] = { x: 0.99, y: 0.01 }; },
    (hands: Hand[]) => { hands[0].landmarks[17] = { ...hands[0].landmarks[5] }; },
  ]) { const hands = close(); change(hands); invalid.push(hands); }
  for (const hands of invalid) {
    const tracker = new WorldCycle(); arm(tracker); shut(tracker);
    assert.equal(tracker.update(hands, 360), false);
    assert.equal(tracker.update(close(), 400), false);
    assert.equal(tracker.update(close(), 550), false);
    arm(tracker, 600); shut(tracker, 800); reopen(tracker, 1000);
  }
});

test('large spatial replacements cancel instead of completing a cycle', () => {
  for (const change of [
    (hands: Hand[]) => {
      hands.forEach(hand => { hand.landmarks.forEach(point => { point.x += 0.3; }); });
    },
    (hands: Hand[]) => { hands.forEach(hand => hand.landmarks.forEach(point => { point.y -= 0.3; })); },
  ]) {
    const tracker = new WorldCycle(); arm(tracker); shut(tracker);
    const crossed = close(); change(crossed);
    assert.equal(tracker.update(crossed, 360), false);
    arm(tracker, 400); shut(tracker, 600); reopen(tracker, 800);
  }
});

test('edge-on, overlapping palms with ambiguous labels still complete exactly one close/reopen', () => {
  for (const scale of [0.35, 0.75, 1.1]) {
    for (const gap of [0, 0.04, -0.08]) {
      const tracker = new WorldCycle();
      const wide = () => worldCyclePair(3.2, { scale });
      assert.equal(tracker.status, 'waiting-open');
      assert.equal(tracker.update(wide(), 0), false);
      assert.equal(tracker.update(wide(), 100), false);
      assert.equal(tracker.status, 'open');
      const prayer = worldCyclePrayer(gap, scale);
      // Make the detector reverse order and change its label at contact.
      prayer.reverse().forEach(hand => { hand.handedness = 'Right'; });
      assert.equal(tracker.update(prayer, 200), false);
      assert.equal(tracker.status, 'closing');
      assert.equal(tracker.update(prayer, 340), false);
      assert.equal(tracker.status, 'closed');
      assert.equal(tracker.update(prayer, 600), false);
      assert.equal(tracker.update(wide(), 700), false);
      assert.equal(tracker.update(wide(), 800), true);
      assert.equal(tracker.status, 'open');
      assert.equal(tracker.update(wide(), 1000), false);
    }
  }
});

test('an observed approach into contact can finish its dwell through a brief local one-hand occlusion', () => {
  const tracker = new WorldCycle(); arm(tracker);
  assert.equal(tracker.update(worldCyclePrayer(1.1), 200), false);
  assert.equal(tracker.update(worldCyclePrayer(0.04), 260), false);
  assert.equal(tracker.status, 'closing');
  assert.equal(tracker.update(worldCyclePrayer(0.04).slice(0, 1), 300), false);
  assert.equal(tracker.status, 'closing');
  assert.equal(tracker.update(worldCyclePrayer(0.04).slice(0, 1), 360), false);
  assert.equal(tracker.status, 'occluded');
  reopen(tracker, 420);
  assert.equal(tracker.status, 'open');
  assert.equal(tracker.update(open(), 620), false);
});

test('confirmed contact survives short local occlusion without advancing while held', () => {
  const tracker = new WorldCycle(); arm(tracker);
  assert.equal(tracker.update(worldCyclePrayer(), 200), false);
  assert.equal(tracker.update(worldCyclePrayer(), 340), false);
  for (const time of [360, 450, 600, 850]) {
    assert.equal(tracker.update(worldCyclePrayer().slice(1), time), false);
    assert.equal(tracker.status, 'occluded');
  }
  reopen(tracker, 900);
});

test('brief proximity followed by losing a hand cannot supply an unobserved contact dwell', () => {
  for (const gap of [0.8, 1.1, 1.4]) {
    const tracker = new WorldCycle(); arm(tracker);
    const near = worldCyclePrayer(gap);
    assert.equal(tracker.update(near, 200), false);
    assert.equal(tracker.update(near, 300), false);
    assert.equal(tracker.status, 'closing');
    assert.equal(tracker.update(near.slice(0, 1), 340), false);
    assert.equal(tracker.status, 'reacquiring');
    arm(tracker, 400); shut(tracker, 600); reopen(tracker, 800);
  }
});

test('starting with occluded palms still requires the first open re-arm without changing color', () => {
  const tracker = new WorldCycle();
  assert.equal(tracker.update(worldCyclePrayer(), 0), false);
  assert.equal(tracker.update(worldCyclePrayer().slice(0, 1), 150), false);
  assert.equal(tracker.status, 'waiting-open');
  arm(tracker, 300); shut(tracker, 500); reopen(tracker, 700);
});

test('contact grace expires from the last pair, and cannot be extended by one-hand updates', () => {
  for (const candidateOnly of [false, true]) {
    const tracker = new WorldCycle(); arm(tracker);
    assert.equal(tracker.update(worldCyclePrayer(), 200), false);
    const lastPair = candidateOnly ? 200 : 340;
    if (!candidateOnly) assert.equal(tracker.update(worldCyclePrayer(), lastPair), false);
    for (const delay of [100, 300, 500, 700]) {
      assert.equal(tracker.update(worldCyclePrayer().slice(0, 1), lastPair + delay), false);
      assert.equal(tracker.status, candidateOnly && delay < 140 ? 'closing' : 'occluded');
    }
    assert.equal(tracker.update(worldCyclePrayer().slice(0, 1), lastPair + 701), false);
    assert.equal(tracker.status, 'waiting-open');
    arm(tracker, lastPair + 800);
    shut(tracker, lastPair + 1000); reopen(tracker, lastPair + 1200);
  }
});

test('reacquiring both hands after the contact deadline cannot rescue a stale cycle', () => {
  const tracker = new WorldCycle(); arm(tracker);
  assert.equal(tracker.update(worldCyclePrayer(), 200), false);
  assert.equal(tracker.update(worldCyclePrayer().slice(0, 1), 400), false);
  assert.equal(tracker.update(worldCyclePrayer().slice(0, 1), 800), false);
  assert.equal(tracker.update(open(), 901), false);
  assert.equal(tracker.status, 'waiting-open');
  arm(tracker, 1000); shut(tracker, 1200); reopen(tracker, 1400);
});

test('duplicate detections of the same landmarks cannot masquerade as overlapping palms', () => {
  for (const label of ['Left', 'unknown']) {
    const tracker = new WorldCycle(); arm(tracker);
    const hand = worldCyclePrayer()[0]; hand.handedness = label;
    const duplicate = [hand, structuredClone(hand)];
    const snapshot = structuredClone(duplicate);
    assert.equal(tracker.update(duplicate, 200), false);
    assert.equal(tracker.update(duplicate, 340), false);
    assert.equal(tracker.status, 'waiting-open');
    assert.deepEqual(duplicate, snapshot);
    arm(tracker, 400); shut(tracker, 600); reopen(tracker, 800);
  }
});

test('missing hands cannot invent a close, and a remote remaining hand cannot bridge one', () => {
  for (const { loss, status } of [
    { loss: [], status: 'waiting-open' },
    { loss: worldCyclePrayer().slice(0, 1), status: 'waiting-open' },
    { loss: open().slice(0, 1), status: 'reacquiring' },
  ]) {
    const tracker = new WorldCycle(); arm(tracker);
    assert.equal(tracker.update(loss, 200), false);
    assert.equal(tracker.status, status);
    arm(tracker, 300); shut(tracker, 500); reopen(tracker, 700);
  }
  for (const lost of [[], open().slice(0, 1)]) {
    const tracker = new WorldCycle(); arm(tracker);
    assert.equal(tracker.update(worldCyclePrayer(), 200), false);
    assert.equal(tracker.update(lost, 340), false);
    assert.equal(tracker.status, 'waiting-open');
    arm(tracker, 400); shut(tracker, 600); reopen(tracker, 800);
  }
});

test('brief local one-hand loss preserves an armed opening for a fresh measured close and reopen', () => {
  const tracker = new WorldCycle(); arm(tracker);
  assert.equal(tracker.update(open().slice(0, 1), 200), false);
  assert.equal(tracker.status, 'reacquiring');
  assert.equal(tracker.update(close(), 325), false);
  assert.equal(tracker.status, 'closing');
  assert.equal(tracker.update(close(), 465), false);
  assert.equal(tracker.status, 'closed');
  reopen(tracker, 500);
});

test('an open-phase gap cannot supply close dwell, including after a brief close candidate', () => {
  for (const priorClose of [false, true]) {
    const tracker = new WorldCycle(); arm(tracker);
    const before = priorClose ? close() : open();
    assert.equal(tracker.update(before, 200), false);
    assert.equal(tracker.update(before.slice(0, 1), 300), false);
    assert.equal(tracker.status, 'reacquiring');
    assert.equal(tracker.update(close(), 400), false);
    assert.equal(tracker.update(close(), 539), false);
    assert.equal(tracker.status, 'closing');
    assert.equal(tracker.update(open(), 540), false);
    assert.equal(tracker.update(open(), 640), false);
    assert.equal(tracker.status, 'open');
    shut(tracker, 700); reopen(tracker, 900);
  }
});

test('pre-contact one-hand loss followed by opening never changes the world', () => {
  const tracker = new WorldCycle(); arm(tracker);
  assert.equal(tracker.update(open().slice(0, 1), 200), false);
  assert.equal(tracker.update(open().slice(0, 1), 300), false);
  assert.equal(tracker.status, 'reacquiring');
  assert.equal(tracker.update(open(), 400), false);
  assert.equal(tracker.update(open(), 600), false);
  assert.equal(tracker.status, 'open');
  shut(tracker, 700); reopen(tracker, 900);
});

test('open retention expires after 300 ms from the pair, including on two-hand reacquisition', () => {
  for (const recovered of [false, true]) {
    const tracker = new WorldCycle(); arm(tracker);
    for (const time of [200, 300, 400]) {
      assert.equal(tracker.update(open().slice(0, 1), time), false);
      assert.equal(tracker.status, 'reacquiring');
    }
    assert.equal(tracker.update(recovered ? close() : open().slice(0, 1), 401), false);
    assert.equal(tracker.status, 'waiting-open');
    assert.equal(tracker.update(close(), 500), false);
    assert.equal(tracker.update(close(), 700), false);
    arm(tracker, 800); shut(tracker, 1000); reopen(tracker, 1200);
  }
});

test('open retention stays anchored to the last pair and rejects drifting or replaced hands', () => {
  for (const scale of [0.35, 0.75]) {
    const tracker = new WorldCycle(), base = worldCyclePair(3.2, { scale });
    assert.equal(tracker.update(base, 0), false);
    assert.equal(tracker.update(base, 100), false);
    const moved = (fraction: number) => base.slice(0, 1).map(hand => ({ ...hand,
      landmarks: hand.landmarks.map(point => ({ ...point, y: point.y + 0.18 * scale * fraction })),
    }));
    assert.equal(tracker.update(moved(0.5), 200), false);
    assert.equal(tracker.status, 'reacquiring');
    // A second small move cannot move the anchor with the remaining hand.
    assert.equal(tracker.update(moved(1), 300), false);
    assert.equal(tracker.status, 'waiting-open');
    assert.equal(tracker.update(base, 400), false);
    assert.equal(tracker.update(base, 500), false);
  }
});

test('one-hand contact grace does not turn depth-only motion into a close', () => {
  const tracker = new WorldCycle(); arm(tracker);
  const hands = open();
  hands.forEach(hand => {
    const wrist = hand.landmarks[0];
    hand.landmarks = hand.landmarks.map(point => ({ ...point,
      x: wrist.x + (point.x - wrist.x) * 2.4,
      y: wrist.y + (point.y - wrist.y) * 2.4,
    }));
  });
  assert.equal(tracker.update(hands, 200), false);
  assert.equal(tracker.update(hands.slice(0, 1), 340), false);
  assert.equal(tracker.status, 'waiting-open');
  arm(tracker, 400); shut(tracker, 600); reopen(tracker, 800);
});

test('duplicates cannot add dwell; backward, stale or invalid time cancels pending work', () => {
  const duplicate = new WorldCycle(); arm(duplicate); shut(duplicate);
  assert.equal(duplicate.update(open(), 400), false);
  for (let sample = 0; sample < 20; sample++) assert.equal(duplicate.update(open(), 400), false);
  assert.equal(duplicate.update(open(), 499), false);
  assert.equal(duplicate.update(open(), 500), true);
  for (const timestamp of [339, 1341, -1, NaN, Infinity]) {
    const tracker = new WorldCycle(); arm(tracker); shut(tracker);
    assert.equal(tracker.update(open(), timestamp), false);
    arm(tracker, 2000); shut(tracker, 2200); reopen(tracker, 2400);
  }
});

test('explicit reset discards both an armed session and a pending reopen', () => {
  for (const closed of [false, true]) {
    const tracker = new WorldCycle(); arm(tracker);
    if (closed) shut(tracker);
    tracker.reset(); arm(tracker, 400); shut(tracker, 600); reopen(tracker, 800);
  }
});
