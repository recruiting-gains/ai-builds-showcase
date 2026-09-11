# Independent acceptance review — Jedi mindtrick

Status: implementation review checkpoint. All executed synthetic/mocked tests pass and the seven identified source issues have been corrected. Browser, webcam, provider and deployment observations remain separate release evidence; they are not established by this review.

Scope: the supplied reference's Invisible and HandFrame effects. The middle ASL demonstration is outside this project. The independent reviewer owns this review and independent acceptance tests; implementation remains read-only for this reviewer.

## Observable acceptance

| Area | Required evidence | Status |
| --- | --- | --- |
| Invisible composition | Synthetic source/background pixels prove full restoration at fade 0, intended replacement at fade 1, partial blending and unchanged pixels outside the mask. | Synthetic fixtures passed; webcam quality pending |
| Invisible portal | The framed region is clipped to image bounds; pixels outside it remain unchanged. Empty-room capture is required, and recapture replaces the background. | Synthetic clipping passed; capture/recapture pending |
| Original input | Tracking reads raw camera frames before compositing. The disappearance effect cannot erase the control hands from the inference input. | Source reviewed; worker wiring mocks passed |
| HandFrame geometry | Mirrored coordinates, two-hand identity, edge clipping and finite bounded rectangles are tested; weak/missing/crossed hands cannot issue gestures. | Source and the feature engineer's passing synthetic tests reviewed; real hand tracking pending |
| Gesture timing | Quick pinch switches once on release; reaching 600 ms captures once; a long hold never also switches style; release rearms; tracking loss resets safely. | Source and the feature engineer's passing boundary tests reviewed; real gesture use pending |
| Live rendering | Local styles change the frame while the rest of the preview remains usable; layout/geometry controls and keyboard/mouse alternatives work. | Source reviewed; browser/GPU appearance pending |
| Camera lifecycle | Permission denial, missing camera, model failure and tracking loss produce usable states. Stop/unmount releases tracks and workers. At most one inference is in flight and stale results cannot mutate a replacement session. | Source reviewed; late-permission and stale-worker mocks passed; real browser pending |
| Explicit still request | Only a deliberate still submission sends a bounded crop and selected style. Camera streams, empty backgrounds and reference-video frames are not uploaded implicitly. | Main source reviewed: gesture prepares, separate click submits; network inspection pending |
| Provider recovery | Timeout/failure preserve local preview and crop. One request ID identifies one logical render. Ambiguous failures cannot silently create another paid provider request; conflicts cannot substitute a different crop. | Main source reviewed; real Worker code with mocked AI and SQLite passes concurrency/conflict/failure/abort tests; FLUX multipart and bounded PNG/JPEG transport tested; live provider evidence is separate |
| API limits | Content type, request schema, byte limit, style allowlist, timeout, same-origin policy and configured usage limits reject invalid requests before inference. | Envelope/body-limit and actual route/quota tests pass with mocked platform base and AI |
| Harness | An explicit graph enforces transition, time and attempt limits; logs/checkpoints preserve completed effects and retries require changed evidence; resume does not repeat publication. Handoffs are labeled by actual host/manual capability. | Source reviewed; 14 harness fixture tests passed, including runtime input fingerprints and interrupted effects |
| Release | Public app/assets, both actual camera effects, and a returned AI-stylized still displayed in HandFrame are verified separately. Synthetic tests alone do not satisfy this row. | Pending |

## Failure cases to exercise

- Borderline pinch durations (below, exactly at and above 600 ms), prolonged holds, partial release, confidence drops, hand identity changes, stale timestamps and restart during inference.
- Empty mask, full mask, fractional mask/fade, small known pixel fixtures, frame wholly outside the image, clipping on each edge and non-finite coordinates.
- Camera permission denial or track ending, failed model load, worker initialization/error/timeout, repeated mode switching and stop during startup.
- Malformed/oversized still requests, unknown style, missing request ID, duplicate same-ID request, same-ID different payload, provider error, response loss after provider completion and an explicit retry.
- Harness successful progression, one justified correction, unchanged-failure stop, exhausted attempts/time/transitions, corrupted checkpoint and interrupted completed side effects.

## Evidence boundaries

Tests written here will use synthetic fixtures and mocked services. No camera activation or upload is part of independent test execution. Source inspection establishes implementation intent; it cannot establish real segmentation quality, GPU appearance, actual frame rate or remote provider success. Any later recorded verification will name its method and remaining limits.

The original camera/video and credentials must not be copied into this repository, test reports, harness events or public artifacts. The user's private reference is behavior guidance, not a published demo asset.

## Review findings

### R1 — interrupted palm observation can trigger a false toggle

Corrected and retested: `PalmHold` initially inferred continuous hold from elapsed time alone. Two open-palm observations at 0 ms and 5000 ms triggered a toggle despite the observation gap. The independent regression `a long observation gap cannot be treated as a continuously held palm` reproduced this failure. A second regression caught duplicate timestamps rearming an already fired palm. The owner added stale/backward/invalid timestamp handling and ignored duplicates without clearing the fired state. Both independent regressions pass.

### R2 — midnight partition can bypass duplicate protection

Corrected and tested: the first backend version selected its ledger by client `createdAt` UTC day while accepting timestamps within two minutes of server time. Near UTC midnight, the same request ID, image and style could therefore reach two ledgers by varying `createdAt` across the boundary. The owner changed this small preview to a stable coordination object with server-day quota counting; ID metadata becomes eligible for pruning after 48 hours, with an oldest-record alarm and pruning on new requests. Actual alarm delivery is platform-dependent, so this is not a hard deletion-time guarantee. Tests execute the actual route/ledger code with a mocked platform base, mocked AI and real in-memory SQLite. The midnight, duplicate/concurrent request, conflicting payload and daily budget tests pass. This does not constitute a Cloudflare deployment test.

### R3 — response timeout should cancel underlying work

Corrected and tested: the first backend version raced inference against 45 seconds but did not cancel the losing provider request. The owner added an abort signal while retaining the ambiguous-failure ledger record because cancellation cannot prove that inference never occurred. The current FLUX path receives a base64 image object and bounds both encoded and decoded output lengths. A fake-clock test executes the actual timeout path, verifies the provider signal is aborted at 45 seconds and HTTP 504 is returned, and confirms another request with the same ID cannot call AI again.

### R4 — cleanup must preserve new claims and the schema

Corrected and tested: after switching to a stable ledger, `alarm()` initially called `storage.deleteAll()`. The owner replaced it with age-filtered SQL deletion. The actual alarm method now passes a test with real in-memory SQLite: expired rows are removed, a recent submitted claim remains, and a later request succeeds using the retained table. Empty-ledger cleanup also leaves the schema usable.

### R5 — harness fingerprint must include the vision runtime inputs

Corrected and tested: the first project graph fingerprinted app/backend/test source but omitted the authored public vision worker and model-asset preparation inputs. The graph now includes scripts and actual public runtime/model/WASM bytes, with an asset-verification stage before build. Model preparation validates fixed model hashes. The harness regression proving that authored worker and WASM mutations change the fingerprint passes.

### R6 — Stop control should remain available during permission wait

Corrected in source: the first main UI hid the Stop button while camera permission was pending, although the camera pipeline correctly supports cancelling a pending start. The status handler now preserves Stop visibility during permission and model startup. Actual browser presentation remains part of the UI verification lane.

### R7 — new requests must not postpone the oldest cleanup deadline

Corrected and tested: scheduling every cleanup relative to the newest request could leave older metadata waiting indefinitely while new requests arrived. The owner now schedules from the oldest remaining record's expiry. A controlled-clock test proves that a request arriving 24 hours later preserves the earlier alarm deadline; after that alarm runs, the expired record is removed and the next record's expiry is scheduled. This verifies scheduling logic, not a promise of exact platform alarm delivery time.

## Executed checks

At this checkpoint `npm test` passed **44 tests**: 20 independent acceptance cases, the feature engineer's 10 HandFrame cases, and 14 independent Worker cases. `npm run typecheck` passed for both frontend and Worker against the current FLUX implementation. The prior `npm run test:harness` check passed **14 fixture tests**; the harness was not changed or rerun in this provider-contract review.

Worker cases bundle and execute `worker/index.ts`, replace only the platform base and remote AI service, and run the actual SQL statements against Node's in-memory SQLite. The FLUX tests inspect the actual multipart body for the exact selected crop, allowlisted style prompt, model ID and 512-pixel requested output dimensions. They cover base64 PNG transport, JPEG-signature transport, malformed/oversized output rejection, provider-access denial with HTTP 503 and metadata-only logs, HTTP 504 timeout, and claim retention after failure. The JPEG fixture verifies signature/MIME handling, not image decoding. Synthetic bytes are authored in the tests; no reference-media or camera image is used. This provides meaningful application-logic evidence without claiming Cloudflare runtime, model quality, network privacy inspection or a real returned generated image.

No camera, GPU appearance, live provider render or live deployment was exercised by this reviewer. Record those observations separately before declaring both requested real-camera results complete.

## Perspective and response follow-up

An independent read-only review checked the camera scheduling, palm-size depth model, perspective geometry, renderer and saved screenshots. It found one fallback regression: tracking failure left manual sliders disabled. The coordinator fixed inactive-state synchronization and added a browser failure/recovery check. A performance concern about repeatedly resizing the texture was resolved with a fixed 384×256 backing canvas. The reviewer confirmed both corrections and found no remaining material blocker in the bounded change. The final local browser report has 23 checks. Geometry is a monocular visual control; neither synthetic tests nor screenshot review establishes physical-hand depth accuracy or end-to-end latency.
