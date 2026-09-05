# Airframe Mac v0.1.3 — motion and pinch continuity candidate

Experimental local Apple silicon/macOS 14+ companion. This source update does not install or launch the app. Ad-hoc signing is not notarization or Developer ID signing.

## Findings and changes

1. **Frame scheduling:** the prior callback rule required 1/24 second since the last processed frame. A regular 30 fps source supplies frames every 1/30 second, so the rule admitted only alternate frames—about 15 fps even when processing was fast enough. The new drift-free 30 Hz admission clock keeps the original timing/freshness checks and does not queue catch-up work. Synthetic schedules verify 24, 30, 60, and 120 fps inputs and small callback jitter. No live-camera throughput measurement has been made for this update.
2. **Aiming and pinching:** a speed-responsive filter favors steadiness for small corrections and response for faster movement. During pinch debounce/hold/release, a palm-relative anchor separates intentional hand translation from fingertip curling. Release gently recenters to fingertip aiming. All anchor/filter state is cleared on tracking loss or reset. No unobserved position is extrapolated.
3. **Thumb-only uncertainty:** complete hand observations still require every original required landmark at confidence 0.55 or greater. A separate partial observation is eligible only when wrist, middle knuckle and index tip each have confidence at least 0.70, while the thumb is unavailable or below 0.55. It carries no fabricated thumb position and cannot generate movement or clicks.

## Bounded amber HOLD

In click mode, only an **active session with no button held** may preserve its explicit start through this partial observation. The gate freezes all output, displays amber HOLD, and starts a fixed 1.25-second deadline at the original sample time. The reported index tip must remain within 0.20 normalized distance of the last emitted pointer. Repeated partial frames cannot extend the deadline.

Every partial frame resets gesture readiness. Recovery requires complete fresh hand observations, an uninterrupted 500 ms open-hand dwell, and a ready move near the last point. It emits no inherited down/up/drag. Any future click requires a new 120 ms pinch. Pointer-only mode retains its existing bounded missing-hand recovery behavior.

**Hard stops remain:** full-hand loss in click mode (including during HOLD), unreliable wrist/middle/index geometry, distant partial hand, uncertainty while a button is already down, expired HOLD, stale or out-of-order frames, camera/inference faults, permission loss, Escape, physical mouse/keyboard takeover, Stop, sleep/session/display changes. An owned button is released on a hard stop; no subsequent frame can re-arm it. A partially visible hand cannot prove identity.

## Verification boundary and hands-on acceptance

Local verification on September 5, 2026: the dependency-free synthetic harness passed **88 groups / 962 assertions** with no failures. Fourteen new XCTest cases were authored, but the attempted local `swift test` could not run because this Command Line Tools installation lacks the XCTest module. No CI or real-camera result is claimed. Independent source review prompted regressions for far-open/near-closed reacquisition, independent near-anchor dwell, interrupted dwell, and near-deadline scheduling bursts; those cases passed in the standalone harness.

Automated checks exercise synthetic scheduling, gesture geometry, queue priorities, gate timing, and menu status. They do not establish live-camera recognition quality, actual pointer smoothness, physical-input emergency behavior, or macOS permission acceptance. Native compilation does not establish any of those either.

After explicit installation, the user should test on a harmless empty workspace with a physical mouse/trackpad and Escape available:

1. Start pointer-only; check slow aiming and fast traversal, hand orientation, and expected hard-stop routes.
2. Explicitly opt into clicks; rotate slightly while bringing fingers together. A thumb-only miss before mouse-down may show HOLD. Open the hand within the fixed window; it must resume without a click. Try a fresh pinch after reopening.
3. Obscure the full hand: click control must turn off. Return already pinched: it must stay off until explicitly restarted.
4. While dragging a harmless test object, obscure the thumb or full hand: the owned button must release and control stop, not resume the drag.
5. Check that the click and release targets remain stable and that palm translation can still drag. Check release recentering at different hand sizes/angles.
6. During HOLD, use Escape or the physical mouse; fresh camera frames must not resume control afterward. Confirm Stop shuts capture off.

Do not use payments, destructive controls, permission dialogs, sensitive applications, or unattended operation for this test. Permission entries must be handled only through normal user-approved macOS flows if a changed development signature requires it.
