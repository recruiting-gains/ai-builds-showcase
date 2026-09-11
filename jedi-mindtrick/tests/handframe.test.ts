import test from 'node:test';
import assert from 'node:assert/strict';
import type { FrameRect, Hand, LocalStyle } from '../src/contracts';
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
const translated = (dx: number, dy = 0) => pair().map(h => ({ ...h,
  landmarks: h.landmarks.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) }));
const resized = (factor: number) => pair().map(h => ({ ...h,
  landmarks: h.landmarks.map(p => ({ ...p, x: 0.55 + (p.x - 0.55) * factor })) }));
const center = (frame: FrameRect) => ({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
const centerError = (a: FrameRect, b: FrameRect) => Math.hypot(center(a).x - center(b).x, center(a).y - center(b).y);
// Retain the previous release's adaptive filter as the motion comparison baseline.
function previousBlend(target: FrameRect, previous: FrameRect): FrameRect {
  const blend = (change: number) => 0.24 + 0.62 * Math.max(0, Math.min(1, (change - 0.003) / 0.047));
  const positionBlend = blend(centerError(target, previous));
  const sizeBlend = blend(Math.max(Math.abs(target.width - previous.width), Math.abs(target.height - previous.height)));
  const width = previous.width + (target.width - previous.width) * sizeBlend;
  const height = previous.height + (target.height - previous.height) * sizeBlend;
  return { x: center(previous).x + (center(target).x - center(previous).x) * positionBlend - width / 2,
    y: center(previous).y + (center(target).y - center(previous).y) * positionBlend - height / 2, width, height };
}

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
  const moved = pair().map(h => ({ ...h, landmarks: h.landmarks.map(p => ({ ...p, y: p.y + 0.002 })) }));
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

test('deliberate translation and resizing reach the target in one sample without overshoot', t => {
  const initial = deriveFrame(pair())!;
  const metrics: Record<string, { adaptive: number; previous: number }> = {};
  for (const [name, input, error] of [
    ['translation', translated(0.12), centerError],
    ['resize', resized(1.4), (a: FrameRect, b: FrameRect) => Math.abs(a.width - b.width)],
  ] as const) {
    const target = deriveFrame(input)!;
    let adaptive = initial, legacy = initial, adaptiveSamples = 0, previousSamples = 0;
    let lastError = error(initial, target);
    const tolerance = lastError * 0.10;
    for (let sample = 1; sample <= 20; sample++) {
      adaptive = deriveFrame(input, adaptive)!;
      legacy = previousBlend(target, legacy);
      const remaining = error(adaptive, target);
      assert.ok(remaining <= lastError + 1e-12, `${name} must approach the target monotonically`);
      assert.ok(adaptive.x >= 0 && adaptive.y >= 0 && adaptive.x + adaptive.width <= 1 && adaptive.y + adaptive.height <= 1);
      if (name === 'translation') {
        assert.ok(center(adaptive).x >= center(target).x - 1e-12 && center(adaptive).x <= center(initial).x + 1e-12);
        assert.ok(Math.abs(adaptive.width - initial.width) < 1e-12);
      } else {
        assert.ok(adaptive.width >= initial.width && adaptive.width <= target.width + 1e-12);
        assert.ok(centerError(adaptive, initial) < 1e-12, 'resizing must retain the intended center');
      }
      if (!adaptiveSamples && remaining <= tolerance) adaptiveSamples = sample;
      if (!previousSamples && error(legacy, target) <= tolerance) previousSamples = sample;
      lastError = remaining;
    }
    assert.equal(adaptiveSamples, 1, `${name} should reach 90% within one sample`);
    assert.ok(adaptiveSamples <= previousSamples / 2, `${name} should at least halve the previous settling samples`);
    metrics[name] = { adaptive: adaptiveSamples, previous: previousSamples };
  }
  t.diagnostic(`Samples to reach 90% of a deliberate change: ${JSON.stringify(metrics)}`);
});

test('continuous motion follows directly instead of retaining the previous adaptive lag', t => {
  const initial = deriveFrame(pair())!;
  let adaptive = initial, legacy = initial, adaptiveError = 0, previousError = 0;
  for (let sample = 1; sample <= 8; sample++) {
    const input = translated(sample * 0.015);
    const target = deriveFrame(input)!;
    adaptive = deriveFrame(input, adaptive)!;
    legacy = previousBlend(target, legacy);
    adaptiveError += centerError(adaptive, target);
    previousError += centerError(legacy, target);
  }
  assert.ok(adaptiveError < 1e-12, '1.5% frame movements should follow directly');
  assert.ok(adaptiveError < previousError * 0.1, 'follow movement with at least 90% less accumulated spatial error');
  t.diagnostic(`Eight-sample translation mean error: adaptive=${(adaptiveError / 8).toFixed(6)}, previous=${(previousError / 8).toFixed(6)} normalized units`);
});

test('stationary center and size jitter retain the previous adaptive suppression', t => {
  const initial = deriveFrame(pair())!;
  const metrics: Record<string, { adaptiveRms: number; previousRms: number }> = {};
  for (const name of ['translation', 'resize'] as const) {
    let adaptive = initial, legacy = initial, adaptiveSquared = 0, previousSquared = 0;
    for (let sample = 0; sample < 60; sample++) {
      const noise = (sample % 2 ? 1 : -1) * 0.0015;
      const input = name === 'translation' ? translated(noise) : resized(1 + noise / initial.width);
      const target = deriveFrame(input)!;
      adaptive = deriveFrame(input, adaptive)!;
      legacy = previousBlend(target, legacy);
      const error = name === 'translation' ? centerError : (a: FrameRect, b: FrameRect) => Math.abs(a.width - b.width);
      adaptiveSquared += error(adaptive, initial) ** 2;
      previousSquared += error(legacy, initial) ** 2;
    }
    const adaptiveRms = Math.sqrt(adaptiveSquared / 60), previousRms = Math.sqrt(previousSquared / 60);
    assert.ok(adaptiveRms <= previousRms + 1e-12, `${name} jitter must remain no greater than before`);
    assert.ok(adaptiveRms < 0.0015 * 0.25, `${name} jitter must be strongly attenuated`);
    metrics[name] = { adaptiveRms, previousRms };
  }
  t.diagnostic(`Stationary alternating-noise RMS: ${JSON.stringify(metrics)}`);
});

test('motion above 1.2% follows directly while sub-0.3% jitter still receives smoothing', () => {
  const initial = deriveFrame(pair())!;
  const deliberate = translated(0.0121);
  assert.ok(centerError(deriveFrame(deliberate, initial)!, deriveFrame(deliberate)!) < 1e-12);
  const noise = translated(0.002);
  const smoothed = deriveFrame(noise, initial)!;
  assert.ok(centerError(smoothed, initial) < centerError(deriveFrame(noise)!, initial) * 0.25);
});

test('adaptive follow retains teleport rejection and does not hold a lost or crossed frame', () => {
  const stale = { x: 0.05, y: 0.05, width: 0.16, height: 0.12 };
  assert.equal(deriveFrame(translated(0, 0.20), stale), null);
  const previous = deriveFrame(pair())!;
  assert.equal(deriveFrame([], previous), null);
  const crossed = pair();
  for (const index of [4, 8]) { crossed[0].landmarks[index].x = 0.2; crossed[1].landmarks[index].x = 0.8; }
  assert.equal(deriveFrame(crossed, previous), null);
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
