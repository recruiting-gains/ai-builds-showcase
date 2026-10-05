import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  ingestEndpoint,
  ndjson,
  normalizeSample,
  sendBatch,
} from "./transport";

async function main() {
  const args = process.argv.slice(2);
  const usage =
    "Usage: RETRACE_INGEST_SECRET=<secret> npm run bridge -- --endpoint https://retrace.example [--file samples.ndjson]";
  if (args.includes("--help")) {
    console.log(usage);
    return;
  }
  let endpointText = process.env.RETRACE_ENDPOINT,
    file: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index + 1] || !["--endpoint", "--file"].includes(args[index]))
      throw new Error(usage);
    if (args[index] === "--endpoint") endpointText = args[index + 1];
    else file = args[index + 1];
  }
  if (!endpointText) throw new Error("Set RETRACE_ENDPOINT or --endpoint.");
  const endpoint = ingestEndpoint(endpointText);
  const secret = process.env.RETRACE_INGEST_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "Set RETRACE_INGEST_SECRET to the ingest secret (at least 32 characters).",
    );
  const sessionId = randomUUID();
  const sequences = new Map<string, number>();
  const sources = new Map<string, string>();
  const stream = file ? createReadStream(file) : process.stdin;
  let sent = 0,
    dropped = 0,
    lastSubmit = 0;
  console.error(
    `ReTrace bridge session ${sessionId}. Reading normalized samples; no device driver is included.`,
  );
  for await (const input of ndjson(stream)) {
    const sensorId = (input as { sensorId?: string })?.sensorId ?? "";
    const event = normalizeSample(
      input,
      sessionId,
      sequences.get(sensorId) ?? 0,
    );
    if (sources.has(sensorId) && sources.get(sensorId) !== event.sourceKind)
      throw new Error(
        "A sensor cannot change source kind during a bridge run.",
      );
    if (sequences.size >= 64 && !sequences.has(sensorId))
      throw new Error("A bridge run supports at most 64 sensors.");
    sources.set(sensorId, event.sourceKind);
    const delay = Math.max(0, 110 - (Date.now() - lastSubmit));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastSubmit = Date.now();
    const result = await sendBatch(endpoint, secret, [event]);
    sequences.set(sensorId, event.sequence + 1);
    sent += result.accepted;
    dropped += result.dropped;
  }
  console.error(
    `Bridge complete: ${sent} accepted, ${dropped} duplicate/out-of-order samples suppressed.`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bridge failed.");
  process.exitCode = 1;
});
