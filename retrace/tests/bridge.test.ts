import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ingestEndpoint,
  ndjson,
  normalizeSample,
  sendBatch,
} from "../bridge/transport";
const input = {
  sensorId: "fixture",
  sourceKind: "fixture",
  capturedAt: new Date().toISOString(),
  rssi: -65,
};
test("requires HTTPS except explicit localhost and refuses URL credentials", () => {
  assert.equal(ingestEndpoint("https://example.com").pathname, "/api/ingest");
  assert.equal(ingestEndpoint("http://127.0.0.1:8787").protocol, "http:");
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com?secret=hidden",
    "https://example.com/wrong",
  ])
    assert.throws(() => ingestEndpoint(url));
});
test("bridge owns sessions and preserves fixture source provenance", () => {
  assert.equal(normalizeSample(input, "run-new", 0).sourceKind, "fixture");
  assert.throws(() =>
    normalizeSample({ ...input, sessionId: "forged" }, "run-new", 0),
  );
});
test("bounded retries preserve the exact serialized session and sequence", async () => {
  const requests: string[] = [];
  const delays: number[] = [];
  const event = normalizeSample(input, "retry-run", 4);
  const result = await sendBatch(
    ingestEndpoint("https://example.com"),
    "test-secret",
    [event],
    {
      fetch: async (_url, options) => {
        requests.push(String(options?.body));
        return requests.length < 3
          ? new Response("{}", { status: 503 })
          : Response.json({ accepted: 1, dropped: 0, epoch: "epoch" });
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    },
  );
  assert.equal(result.accepted, 1);
  assert.equal(new Set(requests).size, 1);
  assert.deepEqual(delays, [250, 500]);
});
test("retries exhaust and permanent auth failures never retry", async () => {
  let attempts = 0;
  await assert.rejects(
    sendBatch(
      ingestEndpoint("https://example.com"),
      "hidden",
      [normalizeSample(input, "run", 0)],
      {
        fetch: async () => {
          attempts++;
          throw new Error("hidden");
        },
        sleep: async () => {},
      },
    ),
    /bounded retries/,
  );
  assert.equal(attempts, 4);
  attempts = 0;
  await assert.rejects(
    sendBatch(
      ingestEndpoint("https://example.com"),
      "hidden",
      [normalizeSample(input, "run", 0)],
      {
        fetch: async () => {
          attempts++;
          return new Response("{}", { status: 401 });
        },
        sleep: async () => {},
      },
    ),
    /401/,
  );
  assert.equal(attempts, 1);
});
test("NDJSON handles split chunks and rejects oversized or malformed lines", async () => {
  const collect = async (chunks: string[]) => {
    const values = [];
    for await (const value of ndjson(
      (async function* () {
        yield* chunks;
      })(),
    ))
      values.push(value);
    return values;
  };
  assert.deepEqual(await collect(['{"a":', '1}\n\n{"b":2}']), [
    { a: 1 },
    { b: 2 },
  ]);
  await assert.rejects(collect(["x".repeat(65_537)]), /64 KiB/);
  await assert.rejects(collect(["oops\n"]), /Malformed/);
});
