import Foundation
import AirframeCore

// Synthetic core checks only: these assert requested PointerActions, not whether
// another macOS application cancels its native drag or changes a document.
func runRecoveryChecks() {
    let frozen = Point2D(x: 0.5, y: 0.5)
    func sample(_ phase: GesturePhase = .move,
                point: Point2D = Point2D(x: 0.5, y: 0.5),
                open: Bool = true, verified: Bool = true,
                wrist: Point2D? = Point2D(x: 0.5, y: 0.75),
                scale: Double? = 0.25, ready: Bool = true) -> GestureOutput {
        GestureOutput(point: point, phase: phase, ready: ready,
                      isOpenHand: open, wrist: wrist, palmScale: scale,
                      isVerifiedOpenPalm: verified)
    }
    @discardableResult
    func feed(_ gate: ControlGate, _ time: Double,
              _ value: GestureOutput? = nil) -> [PointerAction] {
        gate.accept(value ?? sample(), capturedAt: time, now: time, authorized: true)
    }
    func active(_ mode: ControlMode = .clickAndDrag, enabled: Bool = true) -> ControlGate {
        let gate = ControlGate()
        check(gate.arm(now: 0, mode: mode, authorized: true, recoveryEnabled: enabled), "Recovery fixture could not arm")
        for index in 1...31 { _ = feed(gate, Double(index) / 10) }
        check(gate.state == .active, "Recovery fixture did not reach LIVE")
        return gate
    }
    func missing(_ gate: ControlGate, _ first: Int, _ last: Int,
                 reason: RecoverableTrackingLoss = .handMissing) {
        for index in first...last {
            let time = Double(index) / 10
            check(gate.noHand(capturedAt: time, now: time, authorized: true, reason: reason).isEmpty,
                  "Frozen missing observation emitted a pointer action")
        }
    }
    func shortRecovery(_ gate: ControlGate, point: Point2D = Point2D(x: 0.5, y: 0.5)) {
        _ = gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true)
        for index in 34...39 {
            check(feed(gate, Double(index) / 10, sample(point: point)).isEmpty,
                  "Recovery dwell or reanchor emitted an action")
        }
        check(gate.state == .active, "500 ms short recovery did not resume")
    }
    func expectMove(_ actions: [PointerAction], at expected: Point2D, _ message: String) {
        guard actions.count == 1, case let .move(point, dragging) = actions[0] else {
            check(false, message + " (not one movement)")
            return
        }
        check(!dragging && abs(point.x - expected.x) < 1e-9 && abs(point.y - expected.y) < 1e-9, message)
    }

    group("Opt-in loss during a drag requests one release, then freezes every loss reason") {
        for reason in [RecoverableTrackingLoss.handMissing, .thumbOccluded, .multipleHands, .unreliablePose] {
            let gate = active()
            _ = feed(gate, 3.2, sample(.down, open: false, verified: false))
            check(gate.buttonHeld, "Drag fixture did not hold a button")
            check(gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true, reason: reason) == [.up(frozen)],
                  "Loss failed to request exactly one release at frozen point")
            check(!gate.buttonHeld && gate.state != .active && gate.state != .off,
                  "Opt-in loss did not enter a click-free recovery state")
            missing(gate, 34, 38, reason: reason)
            check(gate.stop("Explicit stop").isEmpty, "Already released drag requested another release")
        }
    }
    group("Direct partial-thumb observation during drag releases without synthetic continuation") {
        let gate = active()
        _ = feed(gate, 3.2, sample(.down, open: false, verified: false))
        let partial = PinchUncertainFrame(timestamp: 3.3, aspectRatio: 4.0 / 3.0,
            wrist: Point2D(x: 0.5, y: 0.75), middleMCP: frozen, indexTip: frozen, confidence: 0.95)
        check(gate.pinchUncertain(partial, capturedAt: 3.3, now: 3.3, authorized: true) == [.up(frozen)],
              "Partial observation did not request one release")
        check(!gate.buttonHeld && gate.state != .active && gate.state != .off,
              "Partial observation continued dragging or bypassed opt-in recovery")
        missing(gate, 34, 38, reason: .thumbOccluded)
    }
    group("Engine-encoded recoverable loss releases once and malformed loss fails closed") {
        for malformed in [false, true] {
            let gate = active()
            _ = feed(gate, 3.2, sample(.down, open: false, verified: false))
            let loss = GestureOutput(point: malformed ? frozen : nil, phase: .cancel,
                                     ready: false, recoverableLoss: .unreliablePose)
            check(feed(gate, 3.3, loss) == [.up(frozen)], "Engine loss failed to request exactly one release")
            check(gate.state == (malformed ? .off : .reacquiringHand),
                  "Malformed loss did not stop, or valid loss skipped recovery")
            check(!gate.buttonHeld, "Engine loss left the button held")
            missing(gate, 34, 36)
        }
    }
    group("Malformed engine frames after reset cannot masquerade as recovery warmup") {
        for invalidConfidence in [Double.nan, .infinity, -0.1] {
            let gate = active()
            missing(gate, 33, 33)
            let engine = GestureEngine()
            engine.reset()
            let value = engine.update(frame(3.4, confidence: invalidConfidence))
            check(value.phase == .warming && value.point == nil && value.recoverableLoss == nil,
                  "Malformed-frame fixture no longer exercises untyped empty warmup")
            check(feed(gate, 3.4, value).isEmpty && gate.state == .off && !gate.recoveryEnabled,
                  "Malformed frame after reset stayed in an auto-recoverable state")
            for index in 35...45 {
                check(feed(gate, Double(index) / 10).isEmpty && gate.state == .off,
                      "Good frames revived recovery after malformed data")
            }
        }
    }
    group("Unready warmup cannot shelter malformed pointer or palm metadata") {
        for value in [sample(.warming, point: Point2D(x: .nan, y: 0.5), ready: false),
                      sample(.warming, wrist: Point2D(x: .nan, y: 0.75), ready: false),
                      sample(.warming, scale: .nan, ready: false)] {
            let gate = active()
            missing(gate, 33, 33)
            check(feed(gate, 3.4, value).isEmpty && gate.state == .off && !gate.recoveryEnabled,
                  "Malformed unready metadata did not hard-stop recovery")
            check(feed(gate, 3.5).isEmpty && gate.state == .off,
                  "Valid warmup revived a malformed-data hard stop")
        }
    }
    group("Queued mixed losses preserve earliest cause and lease while legacy mode stops") {
        let partial = PinchUncertainFrame(timestamp: 3.3, aspectRatio: 4.0 / 3.0,
            wrist: Point2D(x: 0.5, y: 0.75), middleMCP: frozen, indexTip: frozen, confidence: 0.95)
        let pending = TrackingDelivery.pinchUncertain(partial, capturedAt: 3.3)
        for later in [TrackingDelivery.observation(nil, capturedAt: 3.4),
                      .trackingLoss(.multipleHands, capturedAt: 3.4)] {
            for delivery in [TrackingDelivery.coalesce(pending: pending, incoming: later),
                             TrackingDelivery.coalesce(pending: later, incoming: pending)] {
                check(delivery == .trackingLoss(.thumbOccluded, capturedAt: 3.3),
                      "Mixed queued loss changed the first cause or timestamp")
                check(TrackingDelivery.coalesce(pending: delivery,
                      incoming: .observation(frame(3.5), capturedAt: 3.5)) == delivery,
                      "Fresh hand erased the unhandled first loss")
                guard case let .trackingLoss(reason, capturedAt) = delivery else { continue }
                for enabled in [false, true] {
                    let gate = active(enabled: enabled)
                    _ = feed(gate, 3.2, sample(.down, open: false, verified: false))
                    check(gate.noHand(capturedAt: capturedAt, now: 3.4, authorized: true, reason: reason) == [.up(frozen)],
                          "Mixed queued loss failed to request one release")
                    check(gate.state == (enabled ? .reacquiringHand : .off),
                          "Mixed loss bypassed the selected recovery policy")
                    if enabled {
                        check(abs((gate.recoveryRemainingSeconds(now: 3.4) ?? -1) - 29.9) < 1e-8,
                              "Mixed-loss lease started at the later arrival instead of first capture")
                    }
                }
            }
        }
        let legacy = active(enabled: false)
        check(legacy.pinchUncertain(partial, capturedAt: 3.3, now: 3.3, authorized: true).isEmpty
              && legacy.state == .recoveringPinch, "Legacy partial-hold fixture failed")
        check(legacy.noHand(capturedAt: 3.4, now: 3.4, authorized: true, reason: .thumbOccluded).isEmpty
              && legacy.state == .off, "Typed loss incorrectly revived a legacy partial hold")
        let mismatch = TrackingDelivery.pinchUncertain(partial, capturedAt: 3.31)
        if case .fault = TrackingDelivery.coalesce(pending: mismatch, incoming: .observation(nil, capturedAt: 3.4)) {
            check(true, "Malformed partial was rejected")
        } else { check(false, "Coalescing laundered a malformed partial into recoverable loss") }
    }
    group("Short recovery needs a new 500 ms open-hand dwell and silent reanchor") {
        // Extra extended-finger evidence is required only after standby begins.
        for verified in [false, true] {
            let gate = active()
            _ = gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true)
            check(gate.state == .reacquiringHand, "Short loss did not enter reacquisition")
            for index in 34...38 {
                check(feed(gate, Double(index) / 10, sample(verified: verified)).isEmpty,
                      "Short dwell moved or clicked before 500 ms")
                check(gate.state != .active, "Short recovery accepted less than 500 ms of new open evidence")
            }
            check(feed(gate, 3.9, sample(verified: verified)).isEmpty && gate.state == .active,
                  "500 ms return was not a silent LIVE transition")
            expectMove(feed(gate, 4.0), at: frozen, "Stable post-recovery hand jumped")
        }
    }
    group("Standby needs a new one-second dwell, not the short-return threshold") {
        let gate = active()
        missing(gate, 33, 47)
        check(gate.state == .standby, "Long loss did not enter standby")
        for index in 48...57 {
            check(feed(gate, Double(index) / 10).isEmpty, "Standby moved during its open-palm dwell")
            check(gate.state != .active, "Standby resumed before one second of new open evidence")
        }
        check(feed(gate, 5.8).isEmpty && gate.state == .active, "One-second standby recovery did not silently resume")
    }
    group("Short return cannot use a distant pointer or wrist as the old candidate") {
        for distantWrist in [false, true] {
            let gate = active()
            missing(gate, 33, 33)
            let value = sample(point: Point2D(x: distantWrist ? 0.5 : 0.85, y: 0.5),
                               wrist: Point2D(x: distantWrist ? 0.85 : 0.5, y: 0.75))
            for index in 34...44 {
                check(feed(gate, Double(index) / 10, value).isEmpty, "Distant short-return candidate emitted input")
                check(gate.state == .reacquiringHand, "Distant geometry earned short-return readiness")
            }
        }
    }
    group("The 30-second recovery lease stays anchored to first loss") {
        let gate = active()
        missing(gate, 33, 42)
        let originalRemaining = gate.recoveryRemainingSeconds(now: 4.2) ?? -1
        check(abs(originalRemaining - 29.1) < 1e-8, "Recovery lease did not start at first loss")
        for index in 43...332 {
            let time = Double(index) / 10
            if index % 3 == 0 {
                check(feed(gate, time, sample(open: false, verified: false)).isEmpty, "Rejected return emitted input")
            } else {
                check(gate.noHand(capturedAt: time, now: time, authorized: true,
                                 reason: index % 2 == 0 ? .multipleHands : .handMissing).isEmpty,
                      "Repeated loss emitted input")
            }
        }
        check(gate.state == .standby, "Recovery expired before the fixed lease")
        check(abs((gate.recoveryRemainingSeconds(now: 33.2) ?? -1) - 0.1) < 1e-8,
              "Repeated misses or rejected candidates slid the deadline")
        check(feed(gate, 33.3).isEmpty && gate.state == .off, "A returning frame bypassed exact lease expiry")
        check(feed(gate, 33.4, sample(.down)).isEmpty, "Expired recovery revived itself")
    }
    group("Missing, ambiguous, pinched and unverified returns cannot resume") {
        for candidate in [sample(open: false), sample(verified: false),
                          sample(.down, open: false, verified: false),
                          sample(.held, open: false, verified: false),
                          sample(wrist: nil), sample(scale: nil),
                          sample(wrist: Point2D(x: .nan, y: 0.5)), sample(scale: .nan),
                          sample(scale: 0), sample(scale: -1)] {
            let gate = active()
            missing(gate, 33, 47)
            for index in 48...62 {
                check(feed(gate, Double(index) / 10, candidate).isEmpty, "Invalid return emitted an action")
                check(gate.state != .active, "Invalid return earned recovery readiness")
            }
        }
        let gate = active()
        missing(gate, 33, 62, reason: .multipleHands)
        check(gate.state == .standby, "Ambiguous hand observations resumed control")
    }
    group("An interrupted dwell restarts from fresh evidence") {
        let gate = active()
        missing(gate, 33, 47)
        for index in 48...56 { _ = feed(gate, Double(index) / 10) }
        check(feed(gate, 5.7, sample(open: false, verified: false)).isEmpty, "Interrupted candidate emitted input")
        for index in 58...67 {
            check(feed(gate, Double(index) / 10).isEmpty, "Restarted dwell emitted input")
            check(gate.state != .active, "Pre-interruption evidence was reused")
        }
        check(feed(gate, 6.8).isEmpty && gate.state == .active, "Fresh one-second dwell failed after interruption")
    }
    group("Crossing the short-return boundary discards the shorter dwell") {
        let gate = active()
        missing(gate, 33, 41)
        for index in 42...45 { _ = feed(gate, Double(index) / 10) }
        for index in 46...55 {
            check(feed(gate, Double(index) / 10).isEmpty, "Boundary transition emitted input")
            check(gate.state == .standby, "Short dwell leaked across the standby boundary")
        }
        check(feed(gate, 5.6).isEmpty && gate.state == .active,
              "Standby failed after a wholly new one-second dwell")
    }
    group("Sparse observations do not accumulate an uninterrupted dwell") {
        let gate = active()
        missing(gate, 33, 47)
        for time in [4.8, 5.2, 5.6, 6.0, 6.4] {
            check(feed(gate, time).isEmpty, "Sparse recovery observations emitted input")
            check(gate.state != .active, "400 ms gaps were mistaken for continuous open-palm evidence")
        }
    }
    group("Candidate geometry continuity rejects wrist and scale switching") {
        for switchScale in [false, true] {
            let gate = active()
            missing(gate, 33, 47)
            for index in 48...69 {
                let alternate = index % 2 == 0
                let value = sample(wrist: Point2D(x: !switchScale && alternate ? 0.85 : 0.5, y: 0.75),
                                   scale: switchScale && alternate ? 0.5 : 0.25)
                check(feed(gate, Double(index) / 10, value).isEmpty, "Switching recovery candidates emitted input")
                check(gate.state != .active, "Discontinuous candidate geometry resumed control")
            }
        }
    }
    group("Reanchor persists for later frames and only a fresh LIVE pinch can press") {
        let gate = active()
        _ = feed(gate, 3.2, sample(.down, open: false, verified: false))
        shortRecovery(gate, point: Point2D(x: 0.6, y: 0.5))
        for index in 40...45 {
            expectMove(feed(gate, Double(index) / 10, sample(point: Point2D(x: 0.6, y: 0.5))),
                       at: frozen, "Reanchor offset was dropped after the resume frame")
        }
        expectMove(feed(gate, 4.6, sample(point: Point2D(x: 0.65, y: 0.55))),
                   at: Point2D(x: 0.55, y: 0.55), "Post-recovery relative movement jumped")
        let down = feed(gate, 4.7, sample(.down, point: Point2D(x: 0.65, y: 0.55), open: false, verified: false))
        check(down.count == 2 && gate.buttonHeld, "Fresh LIVE pinch did not enable an explicit new drag")
        check(gate.stop("Stop new drag").count == 1, "New drag did not request a release")
    }
    group("Recovery never reuses a carried pinch before a post-LIVE open observation") {
        let gate = active()
        shortRecovery(gate)
        for (index, phase) in [GesturePhase.down, .held, .up].enumerated() {
            check(feed(gate, 4.0 + Double(index) / 10, sample(phase, open: false, verified: false)).isEmpty,
                  "Carried pinch emitted input before the new LIVE open observation")
            check(!gate.buttonHeld, "Carried pinch began a new drag")
        }
        expectMove(feed(gate, 4.3), at: frozen, "Post-LIVE open observation did not restore pointer movement")
        let press = feed(gate, 4.4, sample(.down, open: false, verified: false))
        check(press == [.move(frozen, dragging: false), .down(frozen)],
              "A distinct pinch after LIVE open was not accepted")
    }
    group("Long-return reanchor and offset mapping stay inside normalized bounds") {
        let gate = active(.pointerOnly)
        missing(gate, 33, 47)
        let far = sample(point: Point2D(x: 0.85, y: 0.2), wrist: Point2D(x: 0.85, y: 0.45), scale: 0.2)
        for index in 48...58 {
            check(feed(gate, Double(index) / 10, far).isEmpty, "Long-return reanchor emitted input")
        }
        check(gate.state == .active, "Continuous new standby position was rejected")
        expectMove(feed(gate, 5.9, far), at: frozen, "Long-return reanchor jumped to the new raw position")
        expectMove(feed(gate, 6.0, sample(point: Point2D(x: 0, y: 1))), at: Point2D(x: 0, y: 1),
                   "Offset mapping exceeded normalized bounds")
        expectMove(feed(gate, 6.1, sample(point: Point2D(x: 0.85, y: 0.2))), at: frozen,
                   "Boundary clamping destroyed the persistent offset")
    }
    group("Stop, permission and timing faults cannot revive recovery") {
        for fault in 0...8 {
            let gate = active()
            missing(gate, 33, 33)
            let result: [PointerAction]
            switch fault {
            case 0: result = gate.stop("Explicit stop")
            case 1: result = gate.tick(now: 3.4, authorized: false)
            case 2: result = gate.tick(now: 4.0, authorized: true)
            case 3: result = gate.accept(sample(), capturedAt: 3.4, now: 3.7, authorized: true)
            case 4: result = gate.accept(sample(), capturedAt: 3.5, now: 3.4, authorized: true)
            case 5: result = gate.accept(sample(), capturedAt: 3.2, now: 3.4, authorized: true)
            case 6: result = gate.accept(sample(), capturedAt: 3.3, now: 3.4, authorized: true)
            case 7: result = gate.accept(sample(.cancel), capturedAt: 3.4, now: 3.4, authorized: true)
            default: result = gate.noHand(capturedAt: 3.4, now: 3.4, authorized: false)
            }
            check(result.isEmpty && gate.state == .off, "Recovery hard fault did not stop without input")
            for index in 41...56 {
                check(feed(gate, Double(index) / 10).isEmpty && gate.state == .off,
                      "Later good frames revived a stopped recovery")
            }
        }
    }
    group("Opt-out keeps the previous explicit restart rules") {
        let gate = active(.clickAndDrag, enabled: false)
        check(!gate.recoveryEnabled, "Opt-out secretly enabled recovery")
        _ = feed(gate, 3.2, sample(.down, open: false, verified: false))
        check(gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true) == [.up(frozen)] && gate.state == .off,
              "Legacy drag-loss behavior changed")
        let pointer = active(.pointerOnly, enabled: false)
        missing(pointer, 33, 33)
        check(pointer.state == .recoveringHand, "Legacy pointer hold state changed")
        missing(pointer, 34, 45)
        check(pointer.tick(now: 4.55, authorized: true).isEmpty && pointer.state == .off,
              "Legacy pointer hold no longer has its short timeout")
    }
    group("Menu recovery opt-in is copied before one-shot consumption and never inferred") {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            for enabled in [false, true] {
                var request = MenuBarStartRequest()
                check(!request.recoveryEnabled, "A new menu request silently opted into recovery")
                request.begin(mode: mode, now: 1, authorized: true, recoveryEnabled: enabled)
                let selectedRecovery = request.recoveryEnabled
                let selectedMode = request.take(capturedAt: 1.1, now: 1.1, authorized: true)
                check(selectedMode == mode && selectedRecovery == enabled, "Menu selection was lost before consumption")
                check(!request.isPending && !request.recoveryEnabled && request.mode == nil,
                      "Consumed request retained reusable recovery authority")
                guard let selectedMode else { continue }
                let gate = ControlGate()
                check(gate.arm(now: 1.1, mode: selectedMode, authorized: true, recoveryEnabled: selectedRecovery),
                      "A copied explicit menu selection failed to arm")
                check(gate.recoveryEnabled == enabled, "Gate changed the explicitly selected recovery mode")
                check(request.take(capturedAt: 1.2, now: 1.2, authorized: true) == nil && !request.recoveryEnabled,
                      "Later observation reused consumed opt-in intent")
            }
        }
    }
    group("Menu cancel, expiry and rejected starts erase recovery opt-in without revival") {
        for failure in 0...5 {
            var request = MenuBarStartRequest()
            request.begin(mode: .clickAndDrag, now: 1, authorized: true, recoveryEnabled: true)
            switch failure {
            case 0:
                request.cancel(); request.cancel()
            case 1:
                check(request.validate(now: 10.9, authorized: true), "Pending opt-in expired before its deadline")
                check(!request.validate(now: 11, authorized: true), "Validation extended the menu opt-in deadline")
            case 2:
                check(request.take(capturedAt: 11, now: 11, authorized: true) == nil, "Take bypassed exact opt-in expiry")
            case 3:
                check(!request.validate(now: 1.1, authorized: false), "Revoked permission retained menu opt-in")
            case 4:
                request.begin(mode: .pointerOnly, now: 1.1, authorized: false, recoveryEnabled: true)
            default:
                check(request.take(capturedAt: 1.1, now: 1.4, authorized: true) == nil, "Stale camera result consumed opt-in")
            }
            check(!request.isPending && !request.recoveryEnabled && request.mode == nil,
                  "Rejected or finished menu intent left recovery enabled")
            check(request.take(capturedAt: 12, now: 12, authorized: true) == nil && !request.recoveryEnabled,
                  "A later camera callback revived expired or cancelled opt-in")
        }
    }
    group("Only a new explicit menu selection replaces pending recovery preference") {
        var request = MenuBarStartRequest()
        request.begin(mode: .clickAndDrag, now: 1, authorized: true, recoveryEnabled: true)
        check(request.take(capturedAt: 0.99, now: 1.05, authorized: true) == nil,
              "Pre-request preview frame fulfilled opt-in intent")
        check(request.isPending && request.recoveryEnabled, "Ignored preview frame erased explicit recovery choice")
        request.begin(mode: .pointerOnly, now: 2, authorized: true)
        check(request.isPending && !request.recoveryEnabled && request.mode == .pointerOnly,
              "Ordinary Start inherited a previous opt-in")
        let copiedRecovery = request.recoveryEnabled
        check(request.take(capturedAt: 2.1, now: 2.1, authorized: true) == .pointerOnly && !copiedRecovery,
              "Replacement menu request changed the chosen safety mode")
    }
    group("Recovery menu labels distinguish LOOKING and HOLD OPEN without claiming LIVE") {
        for (state, expected) in [(ControlState.reacquiringHand, MenuBarIndicator.looking),
                                  (.standby, .standby)] {
            for requested in [false, true] {
                for running in [false, true] {
                    for pending in [false, true] {
                        for authorized in [false, true] {
                            let actual = MenuBarIndicator.resolve(state: state, pending: pending,
                                cameraRequested: requested, cameraRunning: running, authorized: authorized,
                                lastHandAt: 1, now: 1)
                            let safeExpected: MenuBarIndicator = !requested && !running ? .off
                                : pending ? .starting : !authorized || !running ? .cameraOnly : expected
                            check(actual == safeExpected && actual != .tracking,
                                  "Recovery indicator bypassed camera, permission, or pending-start precedence")
                        }
                    }
                }
            }
        }
        check(MenuBarIndicator.looking.shortLabel == "LOOKING", "Short recovery label is missing")
        check(MenuBarIndicator.standby.shortLabel == "HOLD OPEN", "Standby instruction is missing")
        check(MenuBarIndicator.holding.shortLabel == "HOLD", "Legacy frozen label changed")
        check(MenuBarIndicator.looking.description != MenuBarIndicator.standby.description,
              "Two recovery stages have indistinguishable descriptions")
        for indicator in [MenuBarIndicator.looking, .standby] {
            check(!indicator.description.isEmpty && indicator.shortLabel != "LIVE",
                  "Recovery status incorrectly advertises active control")
        }
    }
}
