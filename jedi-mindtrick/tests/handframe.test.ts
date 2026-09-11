import test from 'node:test';
import assert from 'node:assert/strict';
import type { Hand, LocalStyle } from '../src/contracts';
import { deriveFrame, PinchController, stylePixels } from '../src/handframe/index';

function hand(x: number, handedness: string, pinched = false): Hand {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y: 0.65, z: 0 }));
  landmarks[0] = { x, y: 0.75, z: 0 };
  landmarks[9] = { x, y: 0.55, z: 0 };
  landmarks[8] = { x, y: 0.30, z: 0 };
  landmarks[4] = { x: x + (x > 0.5 ? -0.10 : 0.10), y: 0.50, z: 0 };
  if (pinched) landmarks[4] = { x: x + 0.01, y: 0.31, z: 0 };
  return { landmarks, score: 0.95, handedness };
}
const pair = (pinched = false) => [hand(0.8, 'Left', pinched), hand(0.3, 'Right')];

test('frame mirrors asymmetric source landmarks and ignores detector list order', () => {
  const hands = pair(), snapshot = structuredClone(hands);
  const frame = deriveFrame(hands)!;
  assert.ok(Math.abs(frame.x - 0.2) < 1e-12);
  assert.ok(Math.abs(frame.width - 0.5) < 1e-12);
  assert.ok(Math.abs(frame.y - 0.3) < 1e-12);
  assert.deepEqual(deriveFrame([...hands].reverse()), frame);
  assert.deepEqual(hands, snapshot);
});

test('frame remains bounded, smooths changes, and never returns a stale frame after lost tracking', () => {
  const previous = deriveFrame(pair())!;
  const moved = pair().map(h => ({ ...h, landmarks: h.landmarks.map(p => ({ ...p, y: p.y + 0.05 })) }));
  const target = deriveFrame(moved)!, smooth = deriveFrame(moved, previous)!;
  assert.ok(smooth.y > previous.y && smooth.y < target.y);
  const edgeHands = [hand(0.99, 'Left'), hand(0.01, 'Right')];
  const edge = deriveFrame(edgeHands)!;
  assert.ok(edge.x >= 0 && edge.y >= 0 && edge.x + edge.width <= 1 && edge.y + edge.height <= 1);
  assert.ok(edge.width <= 0.9 && edge.height <= 0.86);
  assert.equal(deriveFrame([], previous), null);
  assert.equal(deriveFrame([pair()[0]], previous), null);
});

test('frame rejects crossed fingertips, low confidence, malformed hands, and degenerate palms', () => {
  const crossed = pair();
  for (const index of [4, 8]) { crossed[0].landmarks[index].x = 0.2; crossed[1].landmarks[index].x = 0.8; }
  assert.equal(deriveFrame(crossed), null);
  const invalid = pair(); invalid[0].landmarks[8].x = Number.NaN;
  assert.equal(deriveFrame(invalid), null);
  const weak = pair(); weak[1].score = 0.49;
  assert.equal(deriveFrame(weak), null);
  const flat = pair(); flat[0].landmarks[9] = { ...flat[0].landmarks[0] };
  assert.equal(deriveFrame(flat), null);
});

test('short pinch advances once on release, with brief noise ignored', () => {
  const p = new PinchController();
  assert.equal(p.update(pair(), 0), null);
  assert.equal(p.update(pair(true), 100), null);
  assert.equal(p.update(pair(), 120), null);
  assert.equal(p.update(pair(true), 200), null);
  assert.equal(p.update(pair(), 350), 'next-style');
  assert.equal(p.update(pair(), 400), null);
});

test('599ms release advances; 600ms hold captures once and never advances on release', () => {
  const short = new PinchController(); short.update(pair(), 0); short.update(pair(true), 100);
  assert.equal(short.update(pair(), 699), 'next-style');
  const long = new PinchController(); long.update(pair(), 0); long.update(pair(true), 100);
  assert.equal(long.update(pair(true), 699), null);
  assert.equal(long.update(pair(true), 700), 'capture');
  assert.equal(long.update(pair(true), 900), null);
  assert.equal(long.update(pair(true), 1300), null);
  assert.equal(long.update(pair(), 1400), null);
  long.update(pair(true), 1500);
  assert.equal(long.update(pair(), 1600), 'next-style');
});

test('a release exactly at the hold threshold captures instead of changing style', () => {
  const p = new PinchController(); p.update(pair(), 0); p.update(pair(true), 100);
  assert.equal(p.update(pair(), 700), 'capture');
  assert.equal(p.update(pair(), 750), null);
});

test('a closed hand on acquisition cannot act until opened; loss cancels an in-progress pinch', () => {
  const p = new PinchController();
  p.update(pair(true), 0); assert.equal(p.update(pair(true), 700), null);
  p.update(pair(), 800); p.update(pair(true), 900);
  assert.equal(p.update([], 1000), null);
  assert.equal(p.update(pair(true), 1100), null);
  assert.equal(p.update(pair(true), 1800), null);
  p.update(pair(), 1900); p.update(pair(true), 2000);
  assert.equal(p.update(pair(), 2100), 'next-style');
});

test('detector ordering does not change the pinching hand; stale or backwards timestamps cancel', () => {
  const p = new PinchController(); p.update(pair(), 0); p.update(pair(true), 100);
  assert.equal(p.update(pair(true).reverse(), 700), 'capture');
  assert.equal(p.update(pair(true), 700), null);
  p.update(pair(), 800); p.update(pair(true), 900);
  assert.equal(p.update(pair(true), 899), null);
  assert.equal(p.update(pair(true), 1600), null);
  p.update(pair(), 1700); p.update(pair(true), 1800);
  assert.equal(p.update(pair(true), 3000), null);
  assert.equal(p.update(pair(true), 3700), null);
});

test('a second closed hand must open before another action can start', () => {
  const p = new PinchController(); p.update(pair(), 0); p.update(pair(true), 100);
  const both = [hand(0.8, 'Left', true), hand(0.3, 'Right', true)];
  assert.equal(p.update(both, 700), 'capture');
  const secondHeld = [hand(0.8, 'Left'), hand(0.3, 'Right', true)];
  assert.equal(p.update(secondHeld, 800), null);
  assert.equal(p.update(secondHeld, 1500), null);
  p.update(pair(), 1600); p.update(pair(true), 1700);
  assert.equal(p.update(pair(), 1800), 'next-style');
});

test('all local filters mutate RGB predictably, preserve alpha, and remain distinct', () => {
  const styles: LocalStyle[] = ['thermal', 'ink', 'neon', 'dream'];
  const outputs = styles.map(style => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 90, 130, 190, 127, 255, 255, 255, 255]);
    assert.equal(stylePixels(pixels, style), pixels);
    assert.deepEqual([pixels[3], pixels[7], pixels[11]], [0, 127, 255]);
    return [...pixels];
  });
  assert.equal(new Set(outputs.map(output => output.join(','))).size, 4);
  assert.deepEqual(outputs[0].slice(8, 11), [255, 250, 208]);
  assert.throws(() => stylePixels(new Uint8ClampedArray(3), 'ink'), /RGBA/);
});
