import type { SignalEvent, SourceKind } from "../shared/types";

export const MAX_BODY_BYTES = 65_536;
export const MAX_BATCH_EVENTS = 100;
export const MAX_AMPLITUDES = 128;
export const MAX_CAPTURE_AGE_MS = 60_000;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const FIELDS = new Set([
  "schemaVersion",
  "sessionId",
  "sensorId",
  "sequence",
  "capturedAt",
  "sourceKind",
  "rssi",
  "amplitudes",
  "amplitudeUnit",
]);

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export function validateEvent(value: unknown, now = Date.now()): SignalEvent {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Each event must be an object.");
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((key) => !FIELDS.has(key)))
    throw new HttpError(400, "Unknown event field.");
  if (event.schemaVersion !== 1)
    throw new HttpError(400, "Unsupported schema version.");
  if (
    typeof event.sessionId !== "string" ||
    !ID.test(event.sessionId) ||
    typeof event.sensorId !== "string" ||
    !ID.test(event.sensorId)
  )
    throw new HttpError(400, "Invalid session or sensor ID.");
  if (!Number.isSafeInteger(event.sequence) || (event.sequence as number) < 0)
    throw new HttpError(400, "Sequence must be a nonnegative safe integer.");
  if (!["simulation", "fixture", "sensor"].includes(event.sourceKind as string))
    throw new HttpError(400, "Invalid source kind.");
  if (
    typeof event.capturedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(event.capturedAt)
  )
    throw new HttpError(400, "capturedAt must be a UTC ISO timestamp.");
  const timestamp = Date.parse(event.capturedAt);
  if (
    !Number.isFinite(timestamp) ||
    timestamp < now - MAX_CAPTURE_AGE_MS ||
    timestamp > now + 10_000
  )
    throw new HttpError(
      400,
      "Capture time must be within the last 60 seconds and no more than 10 seconds ahead.",
    );
  if (
    event.rssi !== undefined &&
    (typeof event.rssi !== "number" ||
      !Number.isFinite(event.rssi) ||
      event.rssi < -150 ||
      event.rssi > 0)
  )
    throw new HttpError(400, "RSSI must be between -150 and 0 dBm.");
  if (event.amplitudes !== undefined) {
    if (
      !Array.isArray(event.amplitudes) ||
      event.amplitudes.length < 1 ||
      event.amplitudes.length > MAX_AMPLITUDES ||
      event.amplitudes.some(
        (x) =>
          typeof x !== "number" ||
          !Number.isFinite(x) ||
          x < 0 ||
          x > 1_000_000,
      )
    )
      throw new HttpError(
        400,
        "Amplitudes must contain 1–128 finite nonnegative values.",
      );
    if (event.amplitudeUnit !== "relative")
      throw new HttpError(
        400,
        "Amplitude measurements require amplitudeUnit: relative.",
      );
  } else if (event.amplitudeUnit !== undefined)
    throw new HttpError(400, "Amplitude units require amplitude measurements.");
  if (event.rssi === undefined && event.amplitudes === undefined)
    throw new HttpError(400, "At least one measurement is required.");
  return event as unknown as SignalEvent;
}

export function validateBatch(value: unknown, now = Date.now()): SignalEvent[] {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "events")
  )
    throw new HttpError(400, "Expected an events envelope.");
  const events = (value as { events?: unknown }).events;
  if (
    !Array.isArray(events) ||
    events.length < 1 ||
    events.length > MAX_BATCH_EVENTS
  )
    throw new HttpError(400, "A batch must contain 1–100 events.");
  return events.map((event) => validateEvent(event, now));
}

export async function readJson(
  request: Request,
  limit = MAX_BODY_BYTES,
): Promise<unknown> {
  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "Use application/json.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) throw new HttpError(413, "Request is too large.");
  if (!request.body) throw new HttpError(400, "JSON body required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    );
  } catch {
    throw new HttpError(400, "Malformed JSON.");
  }
}

export interface SequenceState {
  sequence: number;
  source: SourceKind;
}
/** Compute a batch atomically before writing sequence metadata or broadcasting. */
export function selectEvents(
  events: SignalEvent[],
  existing: Map<string, SequenceState>,
) {
  const next = new Map(existing);
  const accepted: SignalEvent[] = [];
  for (const event of events) {
    const key = `${event.sessionId}:${event.sensorId}`;
    const previous = next.get(key);
    if (previous && previous.source !== event.sourceKind)
      throw new HttpError(
        409,
        "A stream cannot change its source kind. Start a new session.",
      );
    if (previous && event.sequence <= previous.sequence) continue;
    next.set(key, { sequence: event.sequence, source: event.sourceKind });
    accepted.push(event);
  }
  return { accepted, next, dropped: events.length - accepted.length };
}
