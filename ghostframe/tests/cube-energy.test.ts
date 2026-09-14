import test from 'node:test';
import assert from 'node:assert/strict';
import { EnergyResponse } from '../src/cube/energy';
import { CubeController, type CubePose } from '../src/cube/controller';
import type { Hand } from '../src/contracts';
const pose: CubePose = { x: 0.5, y: 0.5, size: 0.38, interaction: 'sizing' };

function movement(speed: number, fps = 60) {
  const response = new EnergyResponse();
  let state = response.update(pose, 0);
  for (let frame = 1; frame <= fps / 2; frame++) {
    state = response.update({ ...pose, x: pose.x + speed * frame / fps }, frame * 1000 / fps);
  }
  return { response, state, last: { ...pose, x: pose.x + speed / 2 } };
}

test('first acquisition is calm; spreading opens the field without mutating pose', () => {
  const response = new EnergyResponse(), original = { ...pose };
  assert.equal(response.update(pose, 0).strength, 0);
  assert.deepEqual(pose, original);
  assert.equal(response.update({ ...pose, size: 0.15 }, 20).spread, 0);
  assert.equal(response.update({ ...pose, size: 0.65 }, 40).spread, 1);
});
test('fast movement visibly exceeds slow movement; response is frame-rate normalized', () => {
  const slow = movement(0.1).state.strength, fast = movement(0.8).state.strength;
  assert.ok(fast > slow + 0.4);
  assert.ok(Math.abs(movement(0.8, 30).state.strength - fast) < 0.02);
});
test('a held-still input settles within one second', () => {
  const { response, last } = movement(0.8);
  let result = response.update(last, 520);
  for (let now = 540; now <= 1500; now += 20) result = response.update(last, now);
  assert.ok(result.strength < 0.01);
});
test('loss, invalid time, reversed or repeated timestamps, jumps and long gaps cannot surge', () => {
  for (const next of [
    { pose: null, now: 520 }, { pose, now: NaN }, { pose, now: 490 },
    { pose, now: 500 }, { pose, now: 900 },
    { pose: { ...pose, x: -1 }, now: 520 },
    { pose: { ...pose, size: 0.7 }, now: 520 },
  ]) {
    const { response } = movement(0.8);
    assert.equal(response.update(next.pose, next.now).strength, 0);
  }
});
test('sizing/carry changes, aspect changes and explicit lifecycle reset start calm', () => {
  for (const boundary of ['carry', 'aspect', 'reset']) {
    const { response, last } = movement(0.8);
    if (boundary === 'reset') response.reset();
    const result = response.update({ ...last, interaction: boundary === 'carry' ? 'holding' : 'sizing' }, 520, boundary === 'aspect' ? 9 / 16 : 1);
    assert.equal(result.strength, 0);
  }
});
test('reduced motion freezes every decorative time and surge signal', () => {
  const { response, last } = movement(0.8);
  for (let now = 520; now < 900; now += 20) {
    const state = response.update(last, now, 1, true);
    assert.equal(state.phase, 0); assert.equal(state.strength, 0);
  }
});
test('energy is bounded during sustained high-speed input and reacquisition', () => {
  const response = new EnergyResponse();
  for (let frame = 0; frame < 500; frame++) {
    const state = response.update({ ...pose, x: frame % 2 ? 0.6 : 0.4 }, frame * 16);
    assert.ok(state.strength >= 0 && state.strength <= 1);
    assert.ok(state.phase >= 0 && state.phase < Math.PI * 2);
  }
  response.update(null, 8000);
  assert.equal(response.update(pose, 8016).strength, 0);
});

test('independent 15/30/60 Hz tracking and 60 Hz paint produce the same settled strength', () => {
  const results: number[] = [];
  for (const stride of [1, 2, 4]) {
    const response = new EnergyResponse();
    let state = response.advance(0);
    for (let tick = 0; tick <= 120; tick++) {
      const now = tick * 1000 / 60;
      if (tick % stride === 0) response.sample({ ...pose, x: 0.1 + now / 1000 * 0.3 }, now);
      state = response.advance(now);
    }
    results.push(state.strength);
  }
  for (const strength of results) assert.ok(Math.abs(strength - 0.2) < 0.001);
});

function pair(offset = 0): Hand[] {
  return [0.25, 0.65].map((x, index) => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: x + offset, y: 0.5, z: 0 }));
    landmarks[0].y = 0.56; landmarks[9].y = 0.44;
    landmarks[8].y = 0.35; landmarks[4].y = 0.35; landmarks[4].x += 0.1;
    return { landmarks, handedness: index ? 'Right' : 'Left', score: 0.99 };
  });
}

test('real controller held pose is visual-only; missing or malformed input cannot rearm a surge', () => {
  for (const bad of [[], [{ ...pair()[0], landmarks: [] }]]) {
    const controller = new CubeController(), energy = new EnergyResponse();
    const sample = (hands: Hand[], now: number) => {
      controller.update(hands, now, 1, false);
      energy.sample(controller.measurementAt(now), now);
    };
    sample(pair(), 0); energy.advance(0);
    sample(pair(0.04), 66); energy.advance(66);
    sample(bad, 80);
    assert.ok(controller.poseAt(80), 'the old pose remains visible for the grace interval');
    assert.equal(energy.advance(90).strength, 0);
    sample(pair(0.05), 100);
    assert.equal(energy.advance(100).strength, 0, 'first accepted return is calm');
    assert.equal(controller.measurementAt(101), null, 'never return a stale measurement');
  }
});

test('particle phase loop is continuous, with emission tapered at each individual respawn', () => {
  const period = Math.PI * 2;
  for (const seed of [0.1, 0.3, 0.7]) {
    const t = (phase: number) => (seed * 17.13 + phase / period) % 1;
    assert.ok(Math.abs(t(period - 0.00001) - t(0.00001)) < 0.00001);
  }
});
