# Cube mode — independent review

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

No release-blocking defect remained in the reviewed scope after the overlap correction and final 16-check pass. This review supports the tested local Cube implementation within those boundaries. GitHub merge, Cloudflare deployment and the public URL must be verified separately by the release coordinator; this report alone does not claim a live release.
