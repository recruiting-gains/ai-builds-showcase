# HandFrame perspective and response

**Current Color worlds default:** [Straight panel](STRAIGHT-PANEL.md) uses four measured thumb/index corners directly, without the additional apparent-palm-size warp described below. The original contour behavior remains available under **Panel edges → Follow finger contour**; its historical response/depth evidence follows. Local-picture and saved-shape behavior are unchanged by that default.

This iteration responds to continued slow hand following and a request to stretch the picture by moving one hand toward the camera and the other away.

Current scheduling and automatic-outline behavior are described below. The 69-test deployment record near the end belongs to the earlier 3D release. The latest local palm/response update passes 118 application tests, 74 browser checks and eight print-flow scenarios. The [actual-model benchmark](HANDFRAME-RESPONSIVENESS.md) uses generated empty-camera input and does not measure physical-hand latency. The deployed HTML, JavaScript, CSS and vision worker match the tested build.

## Acceptance criteria

- Deliberate movement follows more directly than the preceding adaptive filter, without overshoot or stale poses.
- Capture can resume on worker completion using the newest available video frame. Animation and completion paths share one in-flight job and the current mode.
- Both hands at a neutral distance produce a centered surface. Approaching with either hand enlarges that side; reversing the motion reverses the perspective. Raising a hand rotates the surface.
- Picture content and all frame decorations transform together. Texture resolution and mesh size are bounded.
- Tracking loss, bad inputs, backward/stale time and recentering recover without carrying an old depth pose forward.
- Mouse/keyboard users can demonstrate stretch and tilt without a camera. Mobile controls fit the viewport.
- Preparing a still selects a visible frozen crop; only a separate explicit submission uploads it.

## Implementation

The camera requests an ideal 60 FPS with normal lower-rate fallback. Hand sampling now has a 16 ms minimum in both HandFrame and Invisible. The worker runs person segmentation at a 50 ms minimum when needed. It prefers GPU hand detection where supported, falls back to CPU during initialization, and can recover once on CPU from a GPU detection failure. Person segmentation stays on CPU. Both tasks share the worker, so mask processing delays the combined result; reported inference time includes that work. This is neither a 60 FPS claim nor a promise of GPU acceleration on every device.

Completion-triggered capture avoids waiting for another animation tick, while duplicate video timestamps, session generations and one-job backpressure prevent stale work and queues. Automatic outlines use a 0.60 minimum smoothing blend and follow directly after 0.006 normalized image units of movement. The [current synthetic comparison](HANDFRAME-RESPONSIVENESS.md) records faster gentle following with more stationary jitter.

A calibrated ratio of apparent palm size controls relative depth. The first valid pair establishes neutral depth. The Center depth button recalibrates the next valid pair. The model's per-hand landmark Z coordinates are not subtracted across hands: they have separate origins. Palm rotation, foreshortening, occlusion and tracking quality can still affect the size estimate. This is a monocular visual control, not a depth sensor or measured distance in meters. [MediaPipe coordinate definitions](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

An original Canvas2D projective renderer maps a reusable texture onto a quadrilateral, with an 8×6 mesh when perspective is present and a single affine draw for neutral/rotated flat frames. The texture is fixed at 384×256 pixels. The filter, generated still, postcard border and cinema bars share the same mapping. AI receives the selected unwarped crop shown in the preview; it never receives an automatic camera stream.

With Follow my hands on, the thumb/index contour already carries the hands' visible tilt. Rendering applies the additional depth warp without adding that tilt a second time. Saved outlines retain their separate roll control. Invisible now uses [continuous open/close palm visibility](PALM-VISIBILITY.md), replacing the earlier held-palm toggle; this does not change HandFrame's optional pinch shortcuts when automatic following is off.

## Ownership and execution

The coordinator owns UI integration, camera scheduling, surface rendering, browser verification and publication. The feature engineer owns pose geometry and frame smoothing plus their unit tests. An independent reviewer checks assumptions and final changes without editing those resources. Existing backend and provider behavior are reused.

The existing harness enforces 30 steps, 90 minutes of active execution, at most three attempts per node and at most two parallel command nodes. A new run is appropriate for this new feature; previous release runs and evidence remain preserved. Publication receipts are recorded after verification. Physical hand/depth acceptance remains separate from synthetic camera fixtures.

## Earlier 3D release verification

The production build passed 69 application tests, 14 harness tests and 23 local browser checks. Frontend and Worker typechecks, model integrity, production build and deployment dry run passed on attempt 1 in the new bounded run. The browser suite exercised the real MediaPipe models with generated camera streams, then deterministic hand landmarks through the app's actual camera callback, depth tracker and renderer. It checked both depth directions, loss and neutral reacquisition, injected tracking failure with usable manual recovery, mobile fit, accessible controls, explicit still submission and provider-failure recovery using mocked responses. No AI provider call was repeated for this frontend update.

| Synthetic filter measurement | Previous adaptive release | This update |
| --- | ---: | ---: |
| Samples to reach 90% of translation | 2 | 1 |
| Samples to reach 90% of resize | 2 | 1 |
| Mean position error over eight 1.5% movements | 0.011550 | <0.000001 |
| Stationary ±0.0015 jitter RMS | 0.0002083 | 0.0002083 |

These historical measurements isolate fixed-outline frame geometry. They do not establish webcam latency or accuracy, and are separate from the latest automatic-contour smoothing change. The final independent source/visual review for that release found no material blocker after correcting camera-failure control recovery and making the texture dimensions fixed. Screenshot review showed a continuous tilted surface without material mesh seams.

Deployed version: `1ea7e402-b9b6-4043-b3df-ff5c28f86803`. Live HTML and health return HTTP 200. The live JavaScript, CSS and vision-worker bytes match the tested production build. JavaScript SHA-256: `bc1e3397cf5c2a5a731956af2750eec448f0a622d834d7db949f8f6f0f5493b2`.

The new run is `1789095274540-d31e5d25-67c6-4137-9f77-39e0d470974c`, with source fingerprint `02338b2aba558e43b119bacfd65bc81dcad95873ff72cee6f1968fe1f267cd7e`. Physical hand responsiveness and near/far behavior remain for user observation. The harness does not mark those camera gates complete from synthetic inputs, and the original release's live AI evidence remains separate.
