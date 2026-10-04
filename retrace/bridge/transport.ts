import type { SignalEvent, SourceKind } from "../shared/types";
import { MAX_BODY_BYTES, validateEvent } from "../worker/protocol";

export interface InputSample {
  sensorId: string;
  sourceKind: SourceKind;
  capturedAt: string;
  rssi?: number;
  amplitudes?: number[];
  amplitudeUnit?: "relative";
}
export function ingestEndpoint(value: string): URL {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error("The endpoint must use HTTPS, except on localhost.");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["/", "/api/ingest"].includes(url.pathname)
  )
    throw new Error(
      "Use a site origin or /api/ingest URL without credentials or query parameters.",
    );
  url.pathname = "/api/ingest";
  return url;
}
export function normalizeSample(
  input: unknown,
  sessionId: string,
  sequence: number,
  now = Date.now(),
): SignalEvent {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Each input line must be a JSON object.");
  // Only normalized measurements are accepted. A run owns its session and sequence.
  const allowed = new Set([
    "sensorId",
    "sourceKind",
    "capturedAt",
    "rssi",
    "amplitudes",
    "amplitudeUnit",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new Error(
      "Input contains unsupported fields. The bridge assigns sessionId, sequence, and schemaVersion.",
    );
  return validateEvent(
    { ...input, schemaVersion: 1, sessionId, sequence },
    now,
  );
}
export interface TransportOptions {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  attempts?: number;
}
export async function sendBatch(
  endpoint: URL,
  secret: string,
  events: SignalEvent[],
  options: TransportOptions = {},
) {
  const fetcher = options.fetch ?? fetch;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = Math.min(4, Math.max(1, options.attempts ?? 4));
  const body = JSON.stringify({ events });
  if (Buffer.byteLength(body) > MAX_BODY_BYTES)
    throw new Error("Batch exceeds 64 KiB.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      if (attempt === attempts - 1)
        throw new Error(
          "Connection failed after bounded retries; delivery may be uncertain. Session and sequence were preserved across retries.",
        );
      await sleep(250 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      const result = (await response.json()) as {
        accepted: number;
        dropped: number;
        epoch: string;
      };
      if (
        !Number.isInteger(result.accepted) ||
        !Number.isInteger(result.dropped) ||
        typeof result.epoch !== "string"
      )
        throw new Error("Unexpected server response.");
      return result;
    }
    if (response.status !== 429 && response.status < 500)
      throw new Error(
        `Ingest rejected (${response.status}); correct the input or credentials before restarting.`,
      );
    await response.body?.cancel();
    if (attempt === attempts - 1)
      throw new Error(
        `Ingest unavailable (${response.status}) after ${attempts} attempts.`,
      );
    const delay = Number(response.headers.get("retry-after"));
    await sleep(
      Number.isFinite(delay) && delay > 0
        ? Math.min(2000, delay * 1000)
        : 250 * 2 ** attempt,
    );
  }
  throw new Error("Retry budget exhausted.");
}
/** Incremental NDJSON parser with an enforced byte limit per line. */
export async function* ndjson(
  chunks: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<unknown> {
  let buffer = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for await (const chunk of chunks) {
    buffer +=
      typeof chunk === "string"
        ? chunk
        : decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_BODY_BYTES)
        throw new Error("NDJSON line exceeds 64 KiB.");
      if (line) {
        try {
          yield JSON.parse(line);
        } catch {
          throw new Error("Malformed NDJSON line.");
        }
      }
    }
    if (Buffer.byteLength(buffer) > MAX_BODY_BYTES)
      throw new Error("NDJSON line exceeds 64 KiB.");
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch {
      throw new Error("Malformed NDJSON line.");
    }
  }
}
