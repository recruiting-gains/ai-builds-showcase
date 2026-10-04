# ReTrace verification

Checked October 4, 2026. The source is an original implementation; the public experience uses simulated data.

## Software checks

- TypeScript frontend, Worker, and bridge checks pass.
- 13 unit/protocol tests pass: deterministic scenarios, room bounds, missing measurements, schema validation, source immutability, sequence reset/order, streamed body limits, HTTPS rules, and finite bridge retries.
- 11 isolated workerd verification groups pass: public API, authentication/origin checks, signed cookies, actual WebSocket ingestion, schema bounds, rate-limit recovery, spawned NDJSON bridge, slow-viewer flow control, restart behavior, logout revocation, and bounded login attempts.
- Production bundle and Wrangler deployment dry run pass.
- Dependency audit reports no vulnerabilities at this check.

## Browser checks

Chrome desktop on macOS, using desktop (1440×1080), phone (390×844), and narrow (320×740) viewports:

- Play/pause, scenario selection, keyboard scrubbing, reset, chapter navigation, JSON download, and About dialog dismissal pass.
- No horizontal document overflow or uncaught page errors in those checks.
- Automated axe WCAG 2 A/AA and 2.1 AA scans report no violations for the tested public screens. This is a scoped automated result, not a complete accessibility certification.
- Forced 2D fallback and unavailable-API behavior pass.
- Browser protocol fixtures verify missing RSSI remains unavailable, 128 amplitude bins have positive widths, stale data is labeled, and the buffer expires after 60 seconds.
- A canceled pending login does not reopen a stream.

The same public/browser suite also passes against the deployed URL. Phone results are viewport emulation, not physical iPhone testing. Appearance was separately inspected in desktop and portrait screenshots.

## Deployment

The Cloudflare Worker is live at https://retrace.recruiting-gains.workers.dev/ . Public health returns HTTP 200 with service ReTrace, version 1.0.0, simulated demo, and a configured private stream. Ingest/viewer/session secrets are kept outside source.

Live private-stream verification uses a labeled, synthetic protocol fixture, never physical sensor data. Login, authenticated ingestion, exact browser display, fixture labeling, and clearing on disconnect have passed. Native WebSocket closure is undergoing a separate release check. Detailed machine output is retained locally; it contains no credentials.

## Evidence boundaries

No CSI device, radio capture, room calibration, learned model, medical measurement, occupancy count, or physical position was tested. The normalized bridge is software-tested, not a claim of compatibility with a particular sensor device.

Signal measurements are never written to backend storage. Durable storage holds only control metadata such as source/sequence state, throttling counters, and temporary revocations. Browser samples expire after 60 seconds or clear on disconnect.

Miniflare's native WebSocket close handshake was delayed in isolated tests. Those tests verify the explicit disconnected message and bounded outgoing batches; native closure is undergoing a separate deployed Chrome check.
