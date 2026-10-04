# ReTrace sensor interface v1

ReTrace's public experience uses deterministic **simulated** data. The private interface accepts normalized measurements supplied by a local adapter. It does not include Wi-Fi firmware, a trained sensing model, position estimation, vital signs, or proof of physical hardware accuracy. Software fixtures retain the `fixture` label throughout ingestion, streaming, and replay.

## Data and endpoints

`GET /api/health` reports service readiness and whether private secrets are configured. `GET /api/scenarios` returns `{scenarios}`. `GET /api/scenarios/:id` returns `{scenario, sourceKind: "simulation", samples}` at 10 Hz. Scenario room positions are illustrations, not measured or inferred positions.

`POST /api/ingest` accepts a JSON `{events: [...]}` envelope authenticated with `Authorization: Bearer <INGEST_SECRET>`. An event contains:

```json
{
  "schemaVersion": 1,
  "sessionId": "new-uuid-for-each-bridge-run",
  "sensorId": "adapter-01",
  "sequence": 0,
  "capturedAt": "2026-10-04T20:00:00.000Z",
  "sourceKind": "fixture",
  "rssi": -62.5,
  "amplitudes": [0.2, 0.4, 0.3],
  "amplitudeUnit": "relative"
}
```

The example timestamp must be replaced with the current capture time. Session and sensor IDs use 1–80 ASCII letters, numbers, hyphens, or underscores. Sequence is a nonnegative safe integer scoped to `(sessionId, sensorId)`. Restarting the bridge creates a fresh session. `sourceKind` is exactly `simulation`, `fixture`, or `sensor`; the source cannot change within retained stream metadata. The server verifies structure and credentials, not whether a caller's physical sensor claim is true.

RSSI, when supplied, is a finite value between −150 and 0 dBm. Amplitudes, when supplied, contain 1–128 finite values between 0 and 1,000,000 with `amplitudeUnit: "relative"`. At least one measurement is required. Missing measurements remain absent. Unknown fields, including room positions and client-supplied receipt timestamps, are rejected. Use UTC capture timestamps no more than 60 seconds old or 10 seconds in the future. Replay uses the browser's short buffer; old recordings must not be relabeled as fresh sensor captures.

The entire batch is validated before applying sequence updates. Duplicate/out-of-order sequences are suppressed, while a conflicting source returns HTTP 409. A successful response is `{accepted, dropped, epoch}`. The server adds `receivedAt` in UTC when accepting each sample. HTTP 400 indicates invalid input; 401 invalid credentials; 413 an oversized body; 415 an incorrect content type; 429 a bounded rate/capacity limit with `Retry-After`; 503 an unconfigured private interface. JSON error bodies have `{error}`.

## Viewer authentication and WebSocket

Set three distinct secret values of at least 32 characters: `INGEST_SECRET`, `VIEWER_SECRET`, and `SESSION_SECRET`. Provision them using Wrangler secrets. Never put them into client builds, GitHub, sample data, logs, URLs, or query strings. The public demo works without them; private endpoints fail closed until all three are configured.

`POST /api/login` takes `{secret: "<VIEWER_SECRET>"}` and requires an exact same-origin `Origin` header. Successful login creates an HMAC-signed viewer cookie valid for 30 minutes, with `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/api`. The response exposes only `expiresAt`. Login allows eight attempts per 15-minute window per keyed IP fingerprint and 60 globally per minute; raw IPs are not stored. Use HTTPS for browser development that needs the secure cookie.

`GET /api/stream` upgrades to a WebSocket after same-origin and cookie verification. It initially sends:

```json
{ "type": "status", "status": "waiting", "epoch": "runtime-uuid" }
```

Then fresh input produces:

```json
{ "type": "samples", "events": ["ReceivedEvent objects as described above"] }
```

For each `samples` message, viewers send `{"type":"ack"}`. This is flow control, not a delivery receipt for individual samples. Ten unacknowledged batches cause the server to disconnect the slow viewer. On a `status: "disconnected"` message, the viewer must close its socket and display the disconnected state; this makes expiry, logout, and slow-viewer handling explicit even when an intermediary delays the close handshake. Invalid inbound frames also close the connection. A new `epoch` means the runtime was reinitialized; clear previous live continuity and wait for fresh measurements. No historical samples are supplied on connect, after hibernation, or after restart.

Viewer cookies are checked at connection; their expiry is also enforced on data and with a Durable Object alarm. `POST /api/logout` requires same origin, revokes the current cookie until expiry, and closes its active sockets. Replaying that cookie is rejected. Logout is idempotent. Eight simultaneous viewers are supported.

The browser should mark samples **stale after five seconds**, **disconnected after fifteen seconds** or transport closure, using receipt time. Its replay buffer is capped at 60 seconds and presentation updates at 10 Hz. Source provenance and playback mode are separate: replaying a fixture remains a fixture.

## Local bridge

The adapter-side NDJSON format is one JSON object per line with `sensorId`, `sourceKind`, `capturedAt`, and measurements. Omit `schemaVersion`, `sessionId`, and `sequence`; the bridge owns these fields and will reject a file that tries to supply them. Each run supports at most 64 sensor IDs. It reads from standard input unless `--file` is supplied.

```sh
# Set secret variables privately in your shell; do not paste their values into logs.
export RETRACE_ENDPOINT=https://your-retrace-worker.workers.dev
# RETRACE_INGEST_SECRET must already contain your ingest secret.
npm run --silent fixture -- 30 | npm run --silent bridge

# Use an adapter emitting fresh normalized measurements:
node your-device-adapter.mjs | npm run --silent bridge

# A file must contain recent capture timestamps, not a relabeled old recording:
npm run bridge -- --file recent-samples.ndjson
```

Use `--endpoint` to override the endpoint environment variable. Only HTTPS is accepted, apart from explicit `localhost`, `127.0.0.1`, or `[::1]` development hosts. URL credentials, query strings, fragments, redirects, and unrelated endpoint paths are rejected. Request credentials come from `RETRACE_INGEST_SECRET`, never CLI arguments.

The bridge incrementally parses lines with a 64 KiB line bound. It submits one sample at a time with at least 110 ms between submissions, preserving producer backpressure. Each request has a five-second timeout and a maximum of four attempts. Network errors, HTTP 429, and 5xx retry with bounded backoff (250/500/1,000 ms or a server delay capped at two seconds). Permanent validation/authentication failures stop immediately. Retries preserve the identical session, sequence, and serialized payload, so an uncertain successful submission is deduplicated. A terminal network failure explicitly reports uncertain delivery; restarting starts a fresh session and is a deliberate new run.

The fixture producer emits five samples per second for 30 seconds by default (1–300 seconds configurable). It is software-generated data and contains no physical-device evidence.

## Resource limits, persistence, and verification

Request bodies are bounded to 64 KiB by actual streamed bytes, not just `Content-Length`; batches contain 1–100 samples. Ingest permits ten requests per second per private room. The single room is intentionally scoped to one owner's private stream, not a multi-tenant production service.

Only sequence/source metadata, login throttling counters, and unexpired cookie revocations persist in the SQLite-backed Durable Object. Sequence/source metadata expires after 24 hours without updates and is limited to 1,024 active stream IDs. This means deduplication/source continuity applies within that retention window; always use a new session UUID after a bridge restart. No sample measurements, browser replay contents, or raw IP addresses are durably stored or logged. WebSocket attachments retain only session expiry, flow-control counters, and runtime epoch. Structured application error logs omit request bodies, cookies, credentials, identifiers, and measurements. Invocation logs are disabled and trace sampling is low; infrastructure may retain ordinary request metadata under the Cloudflare account's settings.

`npm test` covers validation, sequence handling, source conflicts, incremental parsing, transport restrictions, retry identity, and retry exhaustion. `node scripts/verify-worker.mjs` runs the actual local Workers runtime with isolated temporary SQLite state and random test credentials. It exercises HTTP authentication, WebSockets, the actual NDJSON bridge process, ingestion, rate limits, slow viewers, logout, and a full runtime restart while verifying metadata continuity and absence of historical sample delivery. The local runtime test verifies disconnect control messages and client closure initiation; Miniflare can delay completion of the native close handshake. Full production/browser closure is a separate deployment check. It does not contact production or any sensor hardware.

Cloudflare implementation references: [hibernatable WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [static assets bindings](https://developers.cloudflare.com/workers/static-assets/binding/), and [Workers observability](https://developers.cloudflare.com/workers/observability/traces/).
