import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarios, sampleScenario, signalHistory } from "../shared/scenarios";
test("each scenario stays deterministic across seeks and reset", () => {
  for (const scenario of scenarios) {
    const expected = sampleScenario(scenario.id, 17.4);
    sampleScenario(scenario.id, 36);
    assert.deepEqual(sampleScenario(scenario.id, 17.4), expected);
    assert.equal(expected.sourceKind, "simulation");
    assert.ok(Number.isFinite(expected.rssi));
    assert.equal(expected.amplitudes.length, 32);
  }
});
test("empty scene never shows a position and all frames stay in room bounds", () => {
  for (const scenario of scenarios)
    for (let t = 0; t <= 48; t += 0.1) {
      const sample = sampleScenario(scenario.id, t);
      if (scenario.id === "empty") assert.equal(sample.position, null);
      if (sample.position) {
        assert.ok(Math.abs(sample.position.x) <= 4);
        assert.ok(Math.abs(sample.position.z) <= 3);
      }
      assert.ok(sample.amplitudes.every((v) => Number.isFinite(v) && v >= 0));
    }
});
test("histories finish on the inspected frame and clamp negative time", () => {
  assert.deepEqual(
    signalHistory("movement", 17.4).at(-1),
    sampleScenario("movement", 17.4),
  );
  assert.equal(sampleScenario("entry", -1).time, 0);
  assert.equal(sampleScenario("entry", 100).time, 48);
});
