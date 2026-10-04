import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readJson,
  selectEvents,
  validateBatch,
  validateEvent,
} from "../worker/protocol";
const now = Date.now();
const sample = {
  schemaVersion: 1,
  sessionId: "run-a",
  sensorId: "sensor-a",
  sourceKind: "fixture",
  sequence: 0,
  capturedAt: new Date(now).toISOString(),
  rssi: -62,
} as const;
test("accepts declared measurements without inventing missing CSI", () => {
  assert.deepEqual(validateEvent(sample, now), sample);
  assert.equal(validateEvent(sample, now).amplitudes, undefined);
});
test("rejects malformed measurements, source labels, timestamps, and unexpected fields", () => {
  for (const patch of [
    { rssi: NaN },
    { rssi: -151 },
    { sequence: 1.2 },
    { schemaVersion: 2 },
    { sourceKind: "hardware-verified" },
    { capturedAt: new Date(now - 60_001).toISOString() },
    { capturedAt: new Date(now + 10_001).toISOString() },
    { amplitudes: [1] },
    { amplitudes: [-1], amplitudeUnit: "relative" },
    { amplitudes: Array(129).fill(1), amplitudeUnit: "relative" },
    { position: { x: 1 } },
    { receivedAt: new Date().toISOString() },
  ])
    assert.throws(() => validateEvent({ ...sample, ...patch }, now));
  assert.throws(() => validateEvent({ ...sample, rssi: undefined }, now));
});
test("validates complete batch before touching sequence state", () => {
  assert.throws(() =>
    validateBatch({ events: [sample, { ...sample, rssi: 5 }] }, now),
  );
  assert.throws(() => validateBatch({ events: Array(101).fill(sample) }, now));
  assert.throws(() => validateBatch({ events: [] }, now));
});
test("suppresses repeats/out-of-order events and accepts a new session", () => {
  const first = selectEvents([{ ...sample, sequence: 2 }], new Map());
  const second = selectEvents(
    [
      { ...sample, sequence: 2 },
      { ...sample, sequence: 1 },
      { ...sample, sessionId: "run-b", sequence: 0 },
    ],
    first.next,
  );
  assert.equal(second.dropped, 2);
  assert.equal(second.accepted.length, 1);
  assert.throws(
    () =>
      selectEvents(
        [{ ...sample, sequence: 3, sourceKind: "sensor" }],
        first.next,
      ),
    /source kind/,
  );
  assert.equal(first.next.get("run-a:sensor-a")?.sequence, 2);
});
test("enforces body size on the streamed bytes, including absent Content-Length", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: " ".repeat(65_537),
  });
  await assert.rejects(readJson(request), /too large/);
  await assert.rejects(
    readJson(
      new Request("https://example.com", { method: "POST", body: "{}" }),
    ),
    /application\/json/,
  );
  await assert.rejects(
    readJson(
      new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "oops",
      }),
    ),
    /Malformed/,
  );
});
