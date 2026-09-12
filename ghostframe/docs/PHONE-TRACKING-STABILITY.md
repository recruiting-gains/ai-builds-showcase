# Phone tracking and photo stability

The phone repair preserves the camera's proportions before hand detection and uses the same proportions for gesture measurements. Previously a portrait frame was forced into 512 × 288 pixels, and measurements still assumed a 16:9 source. A valid portrait open-palm fixture could therefore be rejected even when its landscape equivalent worked.

Camera inference now resizes the entire image uniformly to a maximum 512-pixel edge. The worker reports the inference aspect with each result. Hand opening, palm curl, outline validation, relative palm-size depth and close/reopen cycling use it for physical distances. Normalized coordinates still cover the same complete camera image. The existing canvas layout and photo proportions are unchanged. MediaPipe defines x and z in image-width units and y in image-height units; [Google's hand-landmarker documentation](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) describes those coordinates.

Two-hand photos retain their last measured drawing through at most 150 ms of an otherwise valid missing detection. The deadline does not extend with repeated omissions and is also checked while painting if inference stalls. A valid closed pose still hides the picture immediately; invalid geometry, longer loss, reset or camera-aspect changes clear the held drawing. This is a display hold, not invented gesture input: color/photo cycling continues to receive current detector results. One-hand reveal still requires a fresh open palm after loss.

Photo corners are filtered once per inference instead of being drawn directly from raw fingertips on every paint. Small tremors are damped; deliberate movement follows quickly. The automatic clip still comes from measured thumb/index chains, including an inverted L. Full-picture reveal also damps small size changes while preserving immediate fully open and closed endpoints.

## Repair path and acceptance

Current source and live behavior → reproduce portrait rejection, missed detection and jitter → correct camera geometry and photo display → unit/browser/model checks → GitHub checks → deploy and verify live assets. A failed check returns to a concrete correction; an unavailable dependency leaves a saved resume point.

The coordinator owns integration and publication. A gesture specialist owns reveal/pose/palm controllers and tests. An independent reviewer owns the stability browser test and reviews integration. The workflow is development guidance plus existing test commands, not a new runtime agent service. Investigation is bounded to 45 minutes, 65 action groups and three correction passes, checked by the coordinator.

Acceptance requires preserved camera aspect, equivalent portrait/landscape gestures, less photo jitter, short omission recovery, prompt valid closure, bounded prolonged loss, retained inverted-L support, and passing affected phone/recording checks.

## Reproduce the checks

From `ghostframe`, after installing the locked dependencies:

```sh
npm run assets
npm test
npm run test:harness
npm run build
npm run test:phone
npm run check:deploy
```

`test:phone` runs the existing phone suite and the new stability regression against a bounded production preview. For a separate engine or actual-model smoke, start a production preview and run:

```sh
npx vite preview --host 127.0.0.1 --port 8812
# In another terminal:
PLAYWRIGHT_BROWSER=webkit node --import tsx scripts/tracking-stability-browser-check.mjs http://127.0.0.1:8812/
node scripts/vision-aspect-browser-check.mjs http://127.0.0.1:8812/
```

WebKit must be installed with Playwright before that optional engine check. Reports are written under `test-results/`. The stability test uses generated camera frames and synthetic landmarks, real image decoding and the real app compositor. The model smoke uses the shipped worker, actual MediaPipe assets and generated empty scenes; it verifies compatibility, not recognition accuracy on a person.

## Observed result — September 12, 2026

- 242 application tests and 14 harness tests pass, with frontend/Worker types, production build, pinned model integrity and deployment dry run.
- The existing 31 phone checks pass, including front/back switching, one-hand opt-in, local picture replacement, close/reopen cycling, fullscreen fallback and a decoded recording containing the effect.
- The new stability suite passes 14 checks in Chromium and 14 in WebKit. Its old live baseline reproduced distorted input, transient photo loss, excessive photo size/position jitter and rejected portrait hand geometry.
- With identical repeated synthetic hand input, whole-photo width variation fell from 64 to 32 canvas pixels; fingertip-pinned photo-center variation fell from 6 to 1 pixel. These measure those fixtures, not a universal percentage improvement on every phone.
- Actual MediaPipe processing succeeds for generated portrait and landscape camera streams. The worker reports the correct aspect and releases its resources on stop.
- The dependency audit reports zero vulnerabilities for this project's lockfile.

An older camera test stub lacked decoded dimensions; it was corrected to model a ready 1280 × 720 video, while a separate zero-dimension test verifies capture waits for metadata. The WebKit startup test allowance was increased from 8 to 20 seconds after a cold-start timeout, remaining below the app's 30-second model watchdog. Neither correction removes the behavioral assertions.

Physical iPhone recognition, thermal performance and perceived hand response still require a camera trial on that phone. These tests do not claim to reproduce its lighting, hardware or actual hand movements. Refresh the app once after publication, add local pictures again, then start the camera.
