# Airframe Mac v0.1.4 — private supervised hand recovery

Experimental native candidate for Apple silicon, macOS 14+. Public distribution is on hold. Build/test does not install, open, grant permissions, start the camera, or emit OS input. Older ordinary Start modes remain available; the new recovery policy is an explicit Desktop Practice-only opt-in.

## User problem and chosen boundary

The user reported moving one practice square successfully, then losing hand detection and needing the physical mouse to restart. No recording of that trial was captured. We cannot infer whether the particular miss came from hand pose, frame timing, lighting, or processing load. This update distinguishes healthy tracking loss from pipeline faults and adds ephemeral timing evidence for the next supervised trial.

Two independent agent reviews challenged the implementation. They are code reviews, not consultations with human Apple employees or a real-device safety certification.

## Recovery contract

- Healthy hand loss, thumb occlusion, ambiguous multiple hands, or unusable but well-formed pose: freeze output, release an owned button exactly once at the frozen cursor, clear old gesture readiness. Releasing a button can commit a drop/click; it is not cancellation or Undo.
- First-loss capture time starts a fixed 30-second lease. Repeated misses, partial hands, rejected candidates and failed dwells never move that deadline.
- Before 1.25 seconds: 500 ms observed open-thumb/index dwell with pointer/wrist proximity to the prior pose and bounded scale change. Success also requires consecutive geometric continuity and no observed gap over 200 ms.
- At/after 1.25 seconds: reset dwell and require one second of stronger open geometry: four extended non-thumb fingers at confidence >=0.70, separated MCP landmarks and nondegenerate palm width, plus the ordinary open-thumb/index test. This is 2D geometric evidence, not palm-facing classification or authenticated ownership.
- Recovery-to-LIVE emits zero events. A persistent normalized mapping offset anchors the returned hand to the frozen pointer; it does not decay back into a delayed jump. Keep the hand open for a subsequent fresh move, then use a new pinch to grab. A returning held pinch cannot resurrect the old drag.
- A successful recovery ends that loss episode. Any later distinct loss gets its own fixed lease. This is not a 30-second lifetime limit on the entire explicit practice session.
- Fixed reanchoring may reduce edge reach. Stop/new Start clears the offset. That trade-off needs live testing; no all-position fluidity claim is made.

## Stops are not recovery

Invalid/malformed data, nonfinite/future/reversed/out-of-order timestamps, delivery age over 200 ms, camera/inference failure or discontinuity, unavailable permissions/monitors, physical input, Escape/Stop, practice focus/Space/session/display changes, and lease expiry disarm. Subsequent good frames cannot re-arm. The no-delivery watchdog is 650 ms, checked by a 100 ms main-run-loop timer; the 200 ms frame-age gate is **not** a universal emergency-stop-latency guarantee. Main-thread blockage and protected macOS contexts remain limitations.

The existing practice helper must already be frontmost. Its running instance, bundle URL, launch date and ID are pinned; eligibility is checked before control decisions. It cannot be replaced by a new instance mid-session. This is non-adversarial application scoping, not executable attestation or an input sandbox. A global click outside a square can still affect another app before focus-loss handling. Use an empty harmless desktop and stop before locking or leaving.

Public on-console/login-complete and protected-data checks fail closed when unavailable, and lifecycle notifications stop control. They are not a universal unlocked-screen oracle. Actual lock, sleep, secure-input and Accessibility behavior remain user-led acceptance checks.

## Camera and interface changes

- Request up to two hands and reject multiple detected candidates instead of selecting one. Failure to detect another hand cannot prove exclusivity or identity.
- Preserve the 30 Hz admission scheduler, camera preset, adaptive pointer filter and pinch anchoring. No prediction through missing video; no camera-FPS or model upgrade claimed.
- Fault-priority, first-loss-preserving coalescing prevents good frames from erasing pending loss/faults. A mixed partial/full-loss queue keeps the real earliest thumb-loss timestamp and cause. Old capture generations cannot poison a later explicit start.
- Reject malformed confidence/coordinates independently of low-confidence-but-valid detection. Stronger standby evidence requires rotation-invariant, aspect-correct finger geometry.
- Show LOOKING / HOLD OPEN / LIVE / OFF, with DELAY for camera timing faults. Setup text distinguishes camera-on/control-off and displays the last stop reason.
- Session-local aggregates show processed/skipped/coalesced counts, capture drops, discontinuities, faults, admission age, Vision duration, UI queue age and delivered sample age. They are latest values/totals, not distributions or a persisted evaluation log. They reset on a new capture session. No video, landmark history, typed keys or microphone content is stored.
- UI refresh is throttled to 10 Hz except state changes or explicit actions; hidden preview does not receive frame redraw updates.

## Verification record

Local verification on September 5, 2026: the complete dependency-free harness passed **115 groups / 2,681 assertions / zero failures**, including 24 new recovery/menu groups and three open-finger geometry groups. The native debug app compiled successfully. An independent reviewer approved this as a supervised-practice candidate after the malformed-metadata, earliest-loss, and palm-geometry fixes.

Twenty-five new XCTest methods were authored and syntax-checked; existing XCTest loss expectations and exhaustive delivery handling were updated to match the new contract. The attempted local XCTest run could not execute because this Command Line Tools installation lacks the XCTest module; it is not a passing XCTest run. GitHub's full-Xcode workflow is the separate verification route, and its result must be checked rather than inferred.

The build script reruns the standalone harness, compiles the ARM64 release executable, and verifies the locally ad-hoc-signed bundle before producing its ZIP. Package success must be checked in that command's actual output. Ad-hoc signing is not Developer ID signing or notarization. All automated gesture checks are synthetic; compilation/packaging does not imply new live-camera, real-pointer, installation, permission or lock-screen acceptance.

## Supervised acceptance before broader promotion

1. Launch must leave camera/control OFF; ordinary modes must retain their previous stop behavior.
2. With six squares in front, choose the explicit recovery option. Confirm countdown, open-hand preparation and green LIVE; do not test around sensitive apps.
3. Drag one square and briefly lose the hand. Expect one release and LOOKING, no ghost drag. Return open near the prior pose; expect no cursor jump or click.
4. Return after several seconds with fingers extended and thumb/index apart. HOLD OPEN must require a fresh one-second observed dwell. Return already pinched; it must not click or inherit the drag.
5. Alternate missing, partial, multiple-hand and invalid-pose attempts. The fixed first-loss deadline must expire after 30 seconds and stay OFF until a new Start.
6. Check slow aiming, pinch stability, different hand sizes/angles, edge reach and repeated losses. Record user observations separately from synthetic test results.
7. During LOOKING/HOLD OPEN, move the real mouse, type, use Escape/Stop, switch apps/Spaces, close practice, sleep, lock, or change display. Validate each independently with the user present. None may silently resume afterward. Stop before entering a protected context when a reliable emergency path cannot be confirmed.
8. Inspect the local counters after a stop to distinguish tracking loss from camera/queue delay. Do not relax freshness limits merely to hide failures.

Installation is separate from the build. Preserve a backup, handle only Airframe's own permission entry through normal macOS UI if the changed ad-hoc signature needs approval, and never bypass Gatekeeper or edit privacy databases. No hosted site or other application needs changing for this candidate.
