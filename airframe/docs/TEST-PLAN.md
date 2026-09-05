# Airframe verification plan

Airframe is an original, browser-contained gesture workspace. A passing automated check does **not** establish that a physical hand tracks well in a real room. Camera quality, lighting, occlusion, device speed, and individual users require a separate hands-on check.

## Release gates

| Area | Required evidence | What it establishes |
| --- | --- | --- |
| Build | TypeScript check, production build, Worker dry run | The shipped frontend and Worker compile and bind correctly. |
| Gesture interpretation | Synthetic landmark unit tests | Point/pinch hysteresis, stable release, and tracking-loss handling follow their deterministic contracts. These are simulated inputs, not a real-camera evaluation. |
| Camera lifecycle | Mock stream/model tests | Stop and stale permission/model results cannot leave a stream or an active drag running. |
| Privacy | Browser permission spy plus source review | No camera is requested before an explicit action. Frames and landmarks remain in the browser; the app does not pretend to control the operating system. |
| Browser usability | Playwright checks at 1440 px and 380 px | A visitor can explore with a mouse, select and move cards with a keyboard, reset the workspace, and use the controls without horizontal document overflow. |
| Permission denial | Browser test with an explicit denial mock | The user receives an understandable message and can continue with the non-camera controls. |
| Release safety | Escape, stop, and tracking-loss tests | Gesture-driven interactions stop when their authorization or tracking disappears. |
| Layout data | Validation unit tests and browser save/restore checks | Saved values are bounded and schema-checked. Damaged local storage cannot prevent startup. Saved data contains only layout information, not camera material. |
| Accessibility | Keyboard checks, reduced-motion checks, axe | The tested states contain no serious or critical automated accessibility violations. This is not a substitute for a screen-reader review. |
| Deployment | Public URL and Worker API smoke checks | The deployed URL actually serves the expected release and its documented endpoints. |

## Automated browser scenarios

1. Load a fresh desktop page. Record any camera request and fail if one occurs before **Enable camera**. Fail on unexpected browser errors.
2. Choose **Explore with mouse**. Select a workspace card, drag it, and confirm its position changes. Press Escape during interaction and confirm it releases.
3. Focus a card using its accessible control, move it using arrow keys, and confirm its position changes. Verify Enter and Escape do not leave a stuck grab state.
4. Use **Reset workspace** and a different **Workspace preset**. Confirm deterministic layout changes and successful recovery to a usable workspace.
5. Save a layout, inspect its browser storage, and confirm it has the expected version and bounded layout fields. Reload and confirm restoration. Supply damaged persisted data in the test runner and verify the default workspace still works. This version does not include file import or export.
6. Choose **Enable camera** with a test-only `NotAllowedError` mock. Verify the failure is explained and mouse exploration remains usable. Never activate the developer's physical camera.
7. Run at a 380 px mobile viewport and inspect `scrollWidth` versus `clientWidth`. Important controls must stay reachable and the document must not scroll horizontally.
8. Repeat a fresh load under `prefers-reduced-motion: reduce`. Verify the relevant motion-reduction behavior and retain functional controls.
9. Run axe on the initial and mouse-workspace states; fail for serious or critical issues.

Browser instrumentation belongs only to the test runner. Airframe must not expose a production global that injects landmarks or silently grants camera access.

## Required hands-on camera check before claiming real-world readiness

- Use a consenting tester in a well-lit room, with the camera indicator visible.
- Enable the camera explicitly; point at each of the workspace edges.
- Pinch once, hold, move a card, and release. Check that one pinch produces one grab and that opening the fingers releases it.
- Move the hand fully out of the frame during a grab. The card must release without continuing to move.
- Press Escape while pinching, then re-enter with an open hand. A stale pinch must not immediately re-grab.
- Stop the camera during tracking and confirm the hardware indicator turns off.
- Deny camera access, reload, and try mouse/keyboard controls.
- Repeat on at least one desktop and one mobile browser. Record device, browser, lighting, tracking stability, and limitations.

## Result wording

Only mark a check as passed after recording its observed result. Report simulated landmark tests, mocked permission tests, browser checks, and physical-camera trials separately. Do not imply full-computer control: the deployed website can manipulate its own workspace, not arbitrary desktop apps or the operating-system cursor.

## Current evidence

On September 4, 2026 (America/Chicago; September 5 UTC), the independent browser runner passed 19 check groups against the built local Worker at `http://127.0.0.1:8797`:

- Desktop at 1440 × 1050 and mobile at 380 × 844: no horizontal document overflow and no serious or critical axe violations in the tested states.
- Real browser mouse, keyboard, and mobile touch events moved and released cards. Escape released a held mouse drag. Preset changes, reset, server-validated local save, reload restoration, and damaged-storage rejection passed.
- The guide opened, closed, and restored focus. Under reduced motion, two at-rest scene screenshots were pixel-identical and controls still worked.
- Stop and Escape both cancelled model setup, kept the camera-off state truthful, and prevented a late permission request.
- The real built model initialized before the one deliberately mocked camera permission denial. The UI explained that denial and preserved mouse exploration. No physical camera was opened. No browser exceptions or third-party browser requests occurred in these states.

Reproduce with `AIRFRAME_BASE_URL=http://127.0.0.1:8797 AIRFRAME_QA_DIR=test-results/browser npm run test:browser`. The runner writes its result and desktop/mobile screenshots under the chosen output directory. The public preview image is a separate clean capture of the actual interface with the camera off; it is not a generated mockup.

The same 19 check groups also passed against the live deployment at `https://airframe.recruiting-gains.workers.dev` on September 5, 2026 at `03:22:00.498Z`. The public run verified the actual public layout-validation endpoint and hosted model startup, retained the explicit camera-denial mock, and made no physical-camera access. Its durable report and screenshots are in `test-results/public-browser`; reproduce with `AIRFRAME_BASE_URL=https://airframe.recruiting-gains.workers.dev AIRFRAME_QA_DIR=test-results/public-browser npm run test:browser`. The tested public states had no browser exceptions, third-party browser requests, or serious/critical axe violations.

The tracking lane separately verified the built model under the Worker security policy on one official public static hand image: both normal GPU inference and a test-injected GPU initialization failure followed by real CPU fallback returned 21 hand landmarks, with no camera calls. Reproduce with `AIRFRAME_VISION_TEST_URL=http://127.0.0.1:8797 npx tsx scripts/vision-smoke.ts`; its report is `test-results/vision-smoke.json`. This is actual model inference on a still image, not a live-webcam accuracy trial.

**Still pending:** physical-camera usability and ergonomics, iPhone/Safari camera behavior, and screen-reader acceptance. The main release report records the deployment and source synchronization evidence separately. On narrow screens, spatial cards can overlap; all tested handles remained reachable and touch dragging worked.
