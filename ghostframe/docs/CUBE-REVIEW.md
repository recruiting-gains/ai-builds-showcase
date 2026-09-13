# Cube mode — review

## Current update: translucent appearance and one-hand carry

Reviewed September 13, 2026. The latest request uses the supplied current recording as the improvement target and adds two-hand sizing followed by one-hand holding. Exact matching to the unavailable original reference is no longer the acceptance criterion.

The coordinator ran the revised fixed-production-build browser suite: **21/21 checks passed**, with no recorded page errors or mutation requests. The suite uses synthetic camera pixels and injected landmarks; the app still performs actual WebGL composition, MediaRecorder encoding, file download and decoding of the downloaded bytes. Local report: ignored `test-results/cube-hold-verified/report.json`.

The new 188,957-byte MP4 covers six stages: small cube, enlarged cube, one-hand hold, carried movement, returning pair, and a bright background. In decoded frames, the measured width stayed at 0.1797 of the video for sizing and 0.1797 while holding, then 0.1797 while moving; its center moved from 0.4941 to 0.3740. Returning the pair enlarged the width to 0.2852. These measurements are synthetic image-space evidence, not a measurement of real hand accuracy. The bright-frame test uses an orange stripe to check that the camera remains visible through the center; background blue pixels are not used as cube geometry evidence there.

An independent critic inspected the original supplied stills, new preview, decoded bright/small/holding/moved frames and the renderer/controller source read-only. The reviewer accepted the clean holographic appearance: separated cages, fine visible points, quieter rear edges and a translucent core. On the bright background, outlines remain visible across blue and gray regions and the orange stripe remains visible through the core. The blue material is deliberately restrained. The reviewer requested no material correction and found no consequential controller defect. The coordinator subsequently made the alternate preset more clearly violet after its first preview was too close to blue. The final 21/21 rerun also verifies that a pinch changes rendered violet pixels, not only the button label. This is subjective visual review supported by retained images, separate from the numerical checks.

The controller review confirmed that two hands acquire the cube, either continuously identified survivor holds its size and offset, and a returning pair resumes smooth sizing. Pair/single transitions cancel pending pinches. Missing/invalid input breaks carry acquisition immediately, even while the last visual pose remains visible for up to 150 ms. A lone hand cannot recreate that pose. Camera, aspect, identity, crossing, timestamp and mode/manual reset boundaries retain gesture cancellation.

Validation also passed **263 unit tests** (including 21 Cube tests), **14 harness tests**, frontend/Worker typechecking, production build, existing phone studio and tracking-stability browser suites, and Cloudflare deployment dry-run. No new dependencies, backend bindings, camera, inference worker or upload route were introduced. The coordinator owns browser execution/release; the independent critic did not rerun those suites.

The supplied real-camera clip supports visible composition and scaling of the *previous* implementation. Physical iPhone acceptance of the **new** appearance and carry interaction remains pending, as do sustained performance, perceived motion smoothness and native saving on that phone. The decoded synthetic video does not establish those outcomes. The earlier build/release review is preserved below as historical evidence.

## Original Cube implementation review

Reviewed September 12, 2026 (America/Chicago). The reviewer owned the browser acceptance script and this report, independently inspecting the coordinator's application integration and the separate controller/renderer modules.

## Observed browser result

The final local production build (`index-DAFEI11o.js`, `index-DTRmahNx.css`) passed **16 of 16 Chromium checks**, with zero uncaught page errors and zero POST/PUT/PATCH/DELETE requests. The browser used synthetic camera pixels and synthetic hand landmarks. It ran real WebGL, the application Canvas2D compositor, MediaRecorder, browser download, and decoding of the bytes read back from the saved file.

The first minimal proof completed before broader acceptance: a downloaded 118,373-byte MP4 decoded at 768 × 432. Its frames at 0.1 and 0.8 seconds contained blue face pixels, white wireframe pixels and the original gray camera background; the frames differed. A subsequent stable-production replay independently reproduced that result. The saved replay was visually inspected and showed the textured blue cube and connected white edges. The saved image was not merely an HTML overlay above an unmodified recording canvas.

| Gate | Observed evidence |
| --- | --- |
| Camera-free preview | Blue cube and white edges visible without a camera request. |
| Transparent composition | Generated gray camera corners retained; blue faces and white edges appear in the final scene. |
| Saved clip | Actual downloaded MP4 bytes decode at two timestamps with cube, wireframe, camera and changing frames. Recorder-owned tracks end after finalization. |
| Position and scale | Raw hand midpoint reflects once for front camera and stays unreflected for rear; larger separation enlarges the bounded cube. |
| Four camera/orientation cases | Front/rear with landscape source and true portrait 432 × 768 source. Portrait camera proportions are retained. |
| Gesture isolation | A deliberate one-hand pinch/release changes appearance once. Holding, missing hands and reacquisition produce no extra change or prepared still, even after enabling legacy HandFrame hold controls. |
| Manual/automatic reset | A pinch begun before switching to manual cannot complete after automatic control resumes. Two loaded photos retain the selected slot. |
| Loss and stall | Missing hands and intentionally stalled inference remove the cube after the bounded hold. Fresh landmarks restore it. |
| Orientation during recording | An active landscape recording becomes a playable 768 × 432 clip; an instrumented canvas-width setter observes the switch to portrait width only in the recorder's `ready` phase. |
| Shared camera and worker | One active vision worker, no requested person segmentation in Cube, no second active camera. |
| Layout and mode transitions | Controls are reachable at portrait/landscape viewports; Cube → HandFrame → Invisible → Cube preserves camera access and disposes/recreates Cube graphics. |
| Graphics loss | Forced context loss displays an error inside fullscreen and exposes one deliberate retry after exiting. Second loss leaves Cube unavailable while the camera stays live. |
| Stop | All synthetic camera tracks and workers are released; no media upload occurs. |

Run against a production preview with `node scripts/cube-browser-check.mjs http://127.0.0.1:PORT`, or use `npm run test:cube`. The default browser channel is installed Chrome; CI can set `PLAYWRIGHT_CHANNEL=chromium`. Results, screenshots and saved synthetic clips are under the ignored `test-results/` directory. `CUBE_OUTPUT` selects a separate result directory.

The first development-server run proved rendering and saving but later gates were invalidated by a concurrent application reload. It was not counted as a full passing suite. The stable production run supplied the complete result above.

## Deployed-browser verification

The same 16 acceptance checks subsequently passed against [the existing GhostFrame URL](https://jedi-mindtrick.recruiting-gains.workers.dev/) on September 13, 2026 at 04:46 UTC (September 12 locally), with zero recorded page errors or mutation requests. The corrected live run downloaded a **115,319-byte MP4**, decoded it at 768 × 432, and observed 44,443/44,617 blue pixels and 656/754 white edge pixels in frames at 0.1/0.8 seconds. Both retained the gray camera background and had different frame hashes. The orientation gate also passed: canvas width changed from 768 to 432 only after the recorder reached `ready`, while the completed clip retained its original 768 × 432 dimensions.

The first live run was **14 passed, 2 failed**, and was not counted as a passing release check. Its replay fixture assigned downloaded bytes to a `data:` video URL, which the unchanged production `media-src 'self' blob:` Content Security Policy disallows. The application's own blob preview had loaded and the browser had downloaded 117,579 bytes. Because the fixture failed before discarding that clip, the later orientation test correctly encountered a disabled Record button; that second failure was a cascade from the fixture failure.

The coordinator corrected only the test: it now constructs a `Blob` from the actual downloaded bytes, replays through an allowed blob URL, and releases the video source and object URL in `finally`. The reviewer checked this correction and independently confirmed the live CSP response. The subsequent 16/16 report is `test-results/cube-live-verified/report.json`. No production application code or policy was relaxed to make the fixture pass.

The release coordinator separately verified that deployed asset SHA256 values match the built assets. That deployment identity check and the browser result establish the tested public delivery; neither establishes physical-phone acceptance. The follow-up source correction contains the replay fixture and review documentation, leaving the tested production application assets unchanged.

## Independent source checks

- Cube consumes raw worker landmarks and applies exactly one display mirror. Legacy transformed HandFrame coordinates are not reused as Cube coordinates.
- The Cube worker-result branch returns before legacy photo/world/hold-to-still processing. The drawing branch is also explicit; photo rendering cannot capture Cube by falling through a general condition. Still preparation and upload entry points require HandFrame mode.
- The lazily imported renderer uses a generation check. An import finishing after mode exit, camera stop or page hiding cannot allocate an obsolete graphics context. Cached-module reentry still checks the current mode and enabled state.
- One transparent WebGL layer is rendered and copied immediately to the same canvas used by the existing recorder. The renderer owns no extra requestAnimationFrame loop, camera or model. Geometry, materials, listeners and context have a bounded disposal path.
- Canvas resizing waits while the recorder reports either recording or stopping. Existing upload API, backend, bindings and recording limits were not broadened by Cube.

The independent controller review identified an overlapping-pinch ambiguity: a second hand could close during an active pinch and the first release could still change appearance. The controller owner corrected it to cancel that sequence and require both hands open again. A focused regression failed before the correction and passed afterward; the owner reported 13 focused controller tests and typechecking passing. The final browser rerun includes the corrected controller; the focused overlap regression supplies the specific ambiguity proof.

## Limits and release claims

Desktop WebKit **rendered the manual Cube preview**, but its attempted camera fixture did not establish camera or recording acceptance: the synthetic getUserMedia request counter remained zero and the page reported permission declined. The exact fixture interception issue remains unresolved; this is not evidence that physical iPhone camera access fails or succeeds. Do not present the WebKit run as a complete passing camera suite.

Physical iPhone acceptance remains **pending**: actual MediaPipe hand accuracy, ten real pinch/release attempts, front/back camera behavior, rotation, a 60-second Cube-versus-HandFrame comparison, thermal behavior, native share/save and replay in the intended phone app have not been observed in this review. The fixture checks do not establish a phone frame-rate or visual-latency claim.

No release-blocking defect remained in the reviewed scope after the overlap correction and the final local and deployed 16-check passes. Public browser delivery is verified within the synthetic-test boundaries described above. GitHub merge and deployment bookkeeping remain separately recorded by the release coordinator; physical iPhone acceptance remains pending.
