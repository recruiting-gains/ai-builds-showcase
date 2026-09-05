# Native control safety review

The app also pauses control on any physical key-down without reading typed characters. **Stop camera and control before locking or leaving the Mac.** No universal lock-screen notification or protected-context emergency-key guarantee has been established.

## Boundary

Airframe Mac can affect the actual operating-system pointer after explicit user consent. That is materially more powerful than the browser demonstration. A false click can activate whichever application is under the pointer; the app cannot reliably determine that an arbitrary click is harmless.

Keep this release experimental. Do not use it for payments, purchases, sending messages, deleting files, approving permissions, operating equipment, or work where an accidental pointer event could cause harm. Keep a physical mouse/trackpad and Escape immediately available. Do not leave control armed unattended.

## Required control gates

- Launch begins with camera capture off and OS input disarmed.
- Starting camera preview does not arm computer control.
- Accessibility trust is checked; permissions are changed only by the user through macOS.
- The app must install both local and global emergency-stop monitoring before arming. If monitoring is unavailable, arming is refused.
- Arming requires an explicit action and visible three-second countdown. Pointer-only is the default. Clicking requires an additional explicit opt-in.
- A hand must first be observed open and stable. A hand already pinching on start or after reacquisition must not produce a click.
- Escape inside the Airframe window, the system-wide Escape monitor installed while control is armed, Stop, physical mouse takeover, stale/lost tracking, sleep/session changes, or display changes disarm control and attempt to release any synthetic button that the app owns. Protected macOS contexts can restrict event delivery; no universal Escape guarantee is made.
- After disarming, late camera frames, old countdown callbacks, or a newly visible hand must not re-arm it. A fresh explicit action is required.
- Changing settings that affect gesture interpretation must not carry a previous held pinch into a new mode.

These are review requirements. The implementation and evidence below determine which gates have actually been verified.

## Privacy and permissions

Camera frames are intended to stay in the local AVFoundation/Vision pipeline. No network daemon, browser bridge, microphone input, recording, or uploaded video is needed. This is not an App Sandbox-enforced network prohibition.

Global event monitoring is used only for safety interruption. It must not log typed content, save keystrokes, suppress physical events, or control applications in the background after disarming. A monitor's existence does not prove that every protected macOS context will deliver Escape; secure-input and permission behavior need hands-on verification.

Only a human grants Camera or Accessibility permissions. Build and test automation must not call permission prompts, alter the privacy database, remove quarantine flags, turn off Gatekeeper, or launch a control session.

## Adversarial checks

| Scenario | Expected safe outcome | Evidence required |
| --- | --- | --- |
| Stop during a held pinch | Disarm first; release exactly the button the app previously posted; no later drag/click | Pure state tests plus consented OS trial |
| Delayed camera/model result after Stop | Generation/session mismatch discards it | Lifecycle tests and source review |
| Permission resolves after Stop | No late capture or arming | Camera lifecycle review and mock tests |
| Camera loss or low-confidence landmarks | No new OS events; bounded watchdog disarms and releases | Synthetic tests; obstructed-camera trial later |
| App/window loses focus | Do not assume focus loss means an intentional stop, because the product controls other apps; global safety monitors must still work | Explicit background-app trial later |
| Sleep, lock, active session loss, or display reconfiguration | Disarm; require manual restart after returning | Notification wiring review; real system trial later |
| Physical mouse/trackpad use while armed | Physical input wins and disarms gestures; app-generated events do not falsely trigger or bypass this distinction | Event-source tagging review and real-device trial |
| Missing Accessibility or safety monitor | No control can arm | Source review; denied-permission trial later |
| Monitor stops receiving events or protected secure-input context | Do not promise Escape is universal; retain other stop routes and a short tracking watchdog | Hands-on acceptance; document limitations |
| Multiple monitors, negative coordinates, Retina scale | Clamp in the chosen display's correct coordinate space; never mix backing pixels and logical points | Pure mapping tests and multi-display trial |
| Clicking mode enabled while already pinching | Require release/open hand before any new click | Pure state tests |
| Process crash while button held | No claim that cleanup is guaranteed; user must retain physical control | Risk limitation, not a passing test |

## Packaging and signing

Packaging is local, Apple silicon, macOS 14 or later. The script runs tests and compilation without launching the application, preserves recognized prior generated bundles, and never overwrites an installed user app.

The signature is ad-hoc only. Hardened runtime is not enabled until the camera/Vision path has been tested under that configuration. The camera entitlement does not automatically grant camera access. Notarized, Developer ID-signed distribution is a separate release task requiring the developer's credentials and real deployment verification.

Official references:

- [Apple: camera authorization and usage strings](https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media)
- [Apple: camera entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.camera)
- [Apple: trusted Accessibility client check](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
- [Apple: Developer ID and notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

## Current evidence

Local verification on September 4, 2026 (America/Chicago; September 5 UTC), using macOS 26.6.2 and Apple Swift 6.3.3:

- The dependency-free `AirframeChecks` harness passed **33 groups and 325 assertions**, with zero failures. These are simulated gesture and authorization/liveness-gate checks only.
- The release executable compiled for **arm64**, targeting macOS 14 or later. The declared deployment target is not evidence of a runtime test on macOS 14.
- Both property lists and the packaging script passed syntax validation. The assembled app passed `codesign --verify --strict`; signature inspection reported **ad-hoc**, no Team Identifier, and no hardened-runtime flag. It is not notarized or Developer ID-signed.
- Independent source review identified and prompted fixes for missing preview/setup Escape behavior, repeated camera setup UI, physical movement below a per-event threshold, and mouse-button release depending on a disconnected display. The reviewed code now uses explicit cancellation state, a local Escape monitor, any nonzero physical movement for takeover, and emitter-owned button release at the current cursor position.
- Camera lifecycle review found generation and capture-output identity checks, coalesced UI delivery, and discarded late inference results. Camera Stop invalidates delivery/control immediately, while hardware shutdown completes asynchronously on the session queue.
- There are **44 authored XCTest cases** (27 gesture cases and 17 gate cases). They were **not executed locally** because this Command Line Tools installation lacks XCTest. The full-Xcode macOS CI job is configured to execute them; do not claim a CI pass without its actual result.
- The camera-free `--vision-smoke` path ran real Apple Vision revision 1 inference on Google's [official public hand test photograph](https://storage.googleapis.com/mediapipe-assets/pointing_up.jpg). It detected a hand with minimum required-point confidence `0.7734375` and mirrored, top-left index-fingertip coordinates approximately `(0.510509, 0.188687)`. The command reported `cameraOpened: false` and `systemInputPosted: false`. The source photograph was downloaded only to a temporary test location, not included in the app. This single still-image result is not a tracking-accuracy benchmark or live-webcam acceptance test.

Source review also confirmed that the global input monitor is removed when the control gate becomes off; the local Airframe-window Escape monitor remains for preview/setup safety. The native still-image diagnostic does not create an application window, request camera permission, or arm the OS-input emitter.

No physical camera, Accessibility permission grant, real pointer movement, click, drag, or live emergency-stop trial has been performed for this native app. These remain hands-on acceptance checks. No app was launched by the packaging script. Do not represent compile success, signature verification, still-image inference, or simulated checks as a real-world safety certification. A later release report may record additional explicitly authorized UI-only checks separately.
