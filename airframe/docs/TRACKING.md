# Local hand tracking

Airframe uses Google's MediaPipe Hand Landmarker to estimate 21 hand points locally. The camera starts only after the visitor presses the camera button and accepts browser permission. No audio is requested. Camera frames are never sent to the backend, saved, or recorded. Model/WASM downloads are normal same-origin static requests; no runtime CDN is required. This controls the Airframe workspace only, not the system pointer or other applications.

## Implementation

- `HandController` owns camera and worker resources. One ImageBitmap can be pending at a time. Inference runs off the UI thread at up to 25 frames/second; actual speed depends on the device.
- MediaPipe first attempts its GPU delegate, then CPU if initialization or inference fails. Both run in the browser worker. Unsupported devices get an error and retain mouse/touch controls.
- `GestureProcessor` is a pure state machine. It locks the first selected hand by handedness and nearest wrist. It does not switch to another hand mid-drag. An unexpected jump, invalid coordinates, or missing hand cancels the current gesture; it never synthesizes a release-click from lost tracking.
- Index fingertip 8 aims the mirrored pointer. Thumb tip 4 to index tip 8 distance is divided by wrist 0 to middle MCP 9 distance, after compensating for image width/height. This avoids raw pixel and aspect-ratio thresholds.
- A stable pinch below 0.30 palm lengths for 80 ms emits one `down`. Opening above 0.46 for 65 ms emits one `up`. The gap provides hysteresis. Sensitivity multiplies both thresholds and is clamped to 0.7–1.4.
- A newly acquired hand must first open before pinching can grab. Time-based smoothing reduces jitter. Missing hands cancel immediately; a lock can be released after 500 ms without the tracked hand. This is a heuristic, not biometric identity tracking.
- Stop, pagehide, hidden tabs, startup races, inference errors and a ten-second inference watchdog release all active camera tracks and terminate the worker. A late permission result is stopped even if it arrives after cancellation. No automatic camera restart occurs.
- The sample `confidence` field is a handedness classification score, **not** a calibrated probability that the gesture is correct. Do not label it as tracking accuracy. Detection and presence confidence thresholds are separate model settings.

## Assets and reproducibility

Run `npm run prepare:vision` before development. Build runs it automatically. The script checks exact dependency version 1.0.1, copies its six original WASM/loader files, and downloads Google's hand-landmarker float16 version 1 only if the locally cached model does not match the pinned size/digest. Download timeout: 45 seconds; size bound: 7,819,105 bytes; redirects rejected. SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.

The digest was measured from the official HTTPS asset during implementation, not taken from a signed release manifest. It catches unexpected changes after this pin; it is not a security audit or guarantee about the original model. Generated model/WASM binaries are ignored by Git and recreated at build. See `public/THIRD-PARTY-NOTICES.txt` and the Apache license copy.

## Evidence boundaries

Synthetic landmark unit tests verify gesture state transitions, mirroring, smoothing, tracking loss, hand switching, invalid data and pinch thresholds. They do not prove camera recognition accuracy. Browser mocks can verify permissions and resource cleanup without opening a real camera. Any static public hand-image inference check is separately labeled as a model smoke test, not a live webcam session. Real camera permission, lighting and ergonomic checks require a consenting human before claiming live-gesture acceptance.

### Reproduce the real-model smoke test

In one terminal, run `npm run dev -- --port 5174`. In another, run `npx tsx scripts/vision-smoke.ts`. The helper downloads Google's public `pointing_up.jpg` into memory, serves it only inside the test browser, and uses the actual worker, WASM and pinned model. It never requests a real camera. A second run injects a deliberate GPU initialization failure **only into the test browser's copy of the worker**, then requires real CPU inference to succeed. No production testing globals or camera fixtures are shipped. Results go to ignored `test-results/vision-smoke.json`.

On 2026-09-05, both paths found one hand with 21 landmarks in the 358×376 reference image. Handedness scores were approximately 0.993; this is not a recognition accuracy benchmark. Initial inference in headless Chromium was approximately 5.3 seconds on its GPU/software renderer and 100 ms on CPU; these are smoke-test observations, not performance promises. The gesture processor accepted both outputs as an ungrabbed pointer. Camera permission calls: zero. This test establishes working inference on one public image, not real-time webcam or universal-device acceptance.

Primary references: [Google hand-landmarker web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [task and model overview](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker), and the model card linked in the third-party notice.
