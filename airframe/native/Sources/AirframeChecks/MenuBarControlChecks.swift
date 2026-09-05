import Foundation
import AirframeCore

// Synthetic menu-intent and status checks only; no AppKit, hardware, or input.
func runMenuBarControlChecks() {
    func pending(_ mode: ControlMode = .pointerOnly, at now: Double = 0) -> MenuBarStartRequest {
        var request = MenuBarStartRequest()
        request.begin(mode: mode, now: now, authorized: true)
        return request
    }

    func indicator(state: ControlState = .active, pending: Bool = false,
                   requested: Bool = true, running: Bool = true,
                   authorized: Bool = true, hand: Double? = 1,
                   now: Double = 1) -> MenuBarIndicator {
        MenuBarIndicator.resolve(state: state, pending: pending, cameraRequested: requested,
                                 cameraRunning: running, authorized: authorized,
                                 lastHandAt: hand, now: now)
    }

    group("Fresh observations cannot create menu Start intent") {
        var request = MenuBarStartRequest()
        check(!request.isPending && request.mode == nil, "New menu request began armed")
        check(!request.validate(now: 1, authorized: true), "Validation created an intent")
        check(request.take(capturedAt: 1, now: 1, authorized: true) == nil, "Observation created an intent")
    }
    group("Menu Start preserves each explicitly selected mode exactly once") {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            var request = pending(mode)
            check(request.isPending && request.mode == mode, "Selected menu mode was not retained")
            check(request.take(capturedAt: 0.1, now: 0.1, authorized: true) == mode, "Fresh menu request failed")
            check(!request.isPending && request.mode == nil, "Consumed menu request remained pending")
            check(request.take(capturedAt: 0.2, now: 0.2, authorized: true) == nil, "Request was consumed twice")
            check(!request.validate(now: 0.3, authorized: true), "Validation revived consumed intent")
        }
    }
    group("New explicit menu Start replaces old intent but old frames cannot fulfill it") {
        var request = pending()
        request.begin(mode: .clickAndDrag, now: 1, authorized: true)
        check(request.take(capturedAt: 0.95, now: 1.05, authorized: true) == nil, "Old preview frame fulfilled replacement intent")
        check(request.isPending, "Fresh pre-request preview frame cancelled user intent")
        check(request.take(capturedAt: 1.1, now: 1.1, authorized: true) == .clickAndDrag, "New explicit selected mode was lost")
    }
    group("Unauthorized and invalid menu Starts clear any previous intent") {
        for (now, authorized) in [(1.0, false), (Double.nan, true), (Double.infinity, true),
                                   (-Double.infinity, true), (-0.001, true)] {
            var request = pending()
            request.begin(mode: .clickAndDrag, now: now, authorized: authorized)
            check(!request.isPending && request.mode == nil, "Invalid menu Start retained intent")
            check(request.take(capturedAt: 2, now: 2, authorized: true) == nil, "Later callback revived rejected Start")
        }
    }
    group("Permission revocation cancels pending Start through both validation paths") {
        var validated = pending()
        check(!validated.validate(now: 0.1, authorized: false), "Revoked permission passed validation")
        check(!validated.isPending, "Revoked request remained pending")
        check(validated.take(capturedAt: 0.2, now: 0.2, authorized: true) == nil, "Approval callback revived revoked request")
        var taken = pending()
        check(taken.take(capturedAt: 0.1, now: 0.1, authorized: false) == nil, "Take ignored revoked permission")
        check(!taken.isPending, "Unauthorized take retained pending intent")
        check(taken.take(capturedAt: 0.2, now: 0.2, authorized: true) == nil, "Fresh hand revived revoked request")
    }
    group("Invalid and reversed clocks cancel menu Start without revival") {
        for now in [Double.nan, .infinity, -.infinity, -0.1] {
            var request = pending()
            check(!request.validate(now: now, authorized: true), "Invalid clock passed pending validation")
            check(!request.isPending, "Invalid clock left pending intent")
            check(request.take(capturedAt: 1, now: 1, authorized: true) == nil, "Fresh callback revived invalid-clock request")
        }
        var reversed = pending(at: 1)
        check(reversed.validate(now: 1.1, authorized: true), "Valid time failed")
        check(reversed.validate(now: 1.1, authorized: true), "Equal time incorrectly failed")
        check(!reversed.validate(now: 1.05, authorized: true), "Clock reversal passed validation")
        check(reversed.take(capturedAt: 1.2, now: 1.2, authorized: true) == nil, "Later hand revived reversed clock")
        var taken = pending(at: 1)
        check(taken.validate(now: 1.2, authorized: true), "Clock high-water setup failed")
        check(taken.take(capturedAt: 1.1, now: 1.1, authorized: true) == nil && !taken.isPending, "Take bypassed clock high-water mark")
    }
    group("Pending menu Start expires at exactly 10 seconds without timer extension") {
        var request = pending()
        for now in [1.0, 5, 9, Double(10).nextDown] {
            check(request.validate(now: now, authorized: true), "Request expired before its deadline")
        }
        check(!request.validate(now: 10, authorized: true) && !request.isPending, "Repeated validation extended deadline")
        check(request.take(capturedAt: 10.1, now: 10.1, authorized: true) == nil, "Fresh callback revived expired Start")
        var exact = pending()
        check(exact.take(capturedAt: 10, now: 10, authorized: true) == nil && !exact.isPending, "Fresh frame bypassed exact deadline")
        var before = pending(.clickAndDrag)
        let lastInstant = Double(10).nextDown
        check(before.take(capturedAt: lastInstant, now: lastInstant, authorized: true) == .clickAndDrag, "Fresh frame just before deadline failed")
    }
    group("Fresh pre-request frames are ignored while preserving explicit Start intent") {
        var request = pending(at: 1)
        check(request.take(capturedAt: 0.99, now: 1.05, authorized: true) == nil, "Pre-request preview frame armed control")
        check(request.isPending && request.mode == .pointerOnly, "Ignored preview frame erased selected intent")
        check(request.take(capturedAt: 1.1, now: 1.1, authorized: true) == .pointerOnly, "New-session frame could not fulfill intent")
    }
    group("Start capture freshness includes exactly 200 ms and rejects unsafe timestamps") {
        var boundary = pending()
        check(boundary.take(capturedAt: 0, now: 0.2, authorized: true) == .pointerOnly, "Exact request/freshness boundary rejected")
        for (capture, now) in [(0.0, Double(0.2).nextUp), (1.1, 1.0),
                               (Double.nan, 0.1), (Double.infinity, 0.1),
                               (-Double.infinity, 0.1), (-0.01, 0.1)] {
            var request = pending()
            check(request.take(capturedAt: capture, now: now, authorized: true) == nil, "Unsafe capture armed menu control")
            check(!request.isPending, "Unsafe capture was ignored instead of cancelling intent")
            check(request.take(capturedAt: 2, now: 2, authorized: true) == nil, "Fresh callback revived unsafe-capture request")
        }
    }
    group("Explicit cancellation is idempotent and late callbacks cannot rearm") {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            var request = pending(mode)
            request.cancel(); request.cancel()
            check(!request.isPending && request.mode == nil, "Cancelled request retained mode")
            check(!request.validate(now: 0.1, authorized: true), "Validation revived cancellation")
            check(request.take(capturedAt: 0.2, now: 0.2, authorized: true) == nil, "First late callback revived cancellation")
            check(request.take(capturedAt: 0.3, now: 0.3, authorized: true) == nil, "Repeated late callback revived cancellation")
            request.begin(mode: mode, now: 1, authorized: true)
            check(request.take(capturedAt: 1, now: 1, authorized: true) == mode, "Cancellation prevented a new explicit Start")
        }
    }
    group("Camera off never shows green, regardless of pending or control state") {
        for state in [ControlState.off, .countdown, .waitingForHand, .active, .recoveringHand] {
            for pending in [false, true] {
                check(indicator(state: state, pending: pending, requested: false, running: false) == .off, "No-camera indicator was not off")
                check(indicator(state: state, pending: pending, requested: true, running: false) != .tracking, "Requested but stopped camera showed green")
            }
        }
    }
    group("Preview, countdown, pending, waiting, recovery and lost trust never show green") {
        check(indicator(state: .off) == .cameraOnly, "Preview alone showed active control")
        check(indicator(authorized: false) == .cameraOnly, "Untrusted control showed green")
        check(indicator(running: false) == .cameraOnly, "Stopped capture showed green")
        check(indicator(state: .countdown) == .starting, "Countdown status was wrong")
        check(indicator(state: .waitingForHand) == .waiting, "Waiting status was wrong")
        check(indicator(state: .recoveringHand) == .holding, "Frozen recovery showed green")
        for state in [ControlState.off, .countdown, .waitingForHand, .active, .recoveringHand] {
            check(indicator(state: state, pending: true) == .starting, "Pending Start incorrectly showed green")
        }
    }
    group("Green needs finite nonnegative fresh hand evidence and a valid current clock") {
        for hand: Double? in [nil, .nan, .infinity, -.infinity, -0.1, 1.1, 0.7] {
            check(indicator(hand: hand, now: 1) == .holding, "Missing/unsafe hand evidence showed green")
        }
        for now in [Double.nan, .infinity, -.infinity, -0.1, 0.9] {
            check(indicator(hand: 1, now: now) == .holding, "Invalid/reversed indicator clock showed green")
        }
        check(indicator(hand: -0.1, now: -0.1) == .holding, "Matching negative timestamps showed green")
        check(indicator(hand: 0, now: 0) == .tracking, "Fresh active tracking did not show green")
        check(indicator(hand: 0, now: 0.2) == .tracking, "Exact green freshness boundary failed")
        check(indicator(hand: 0, now: Double(0.2).nextUp) == .holding, "Stale green survived exact age cutoff")
    }
    group("Both pointer-only and click mode turn green only after the input gate activates") {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            let gate = ControlGate()
            check(gate.arm(now: 0, mode: mode, authorized: true), "Indicator integration setup could not arm")
            check(indicator(state: gate.state, hand: 0, now: 0) == .starting, "Countdown already showed green")
            let moving = GestureOutput(point: Point2D(x: 0.5, y: 0.5), phase: .move, ready: true)
            for step in 1...31 {
                let now = Double(step) / 10
                _ = gate.accept(moving, capturedAt: now, now: now, authorized: true)
            }
            check(gate.state == .active, "Mode failed to reach active state")
            check(indicator(state: gate.state, hand: 3.1, now: 3.1) == .tracking, "Fresh active mode did not show green")
            _ = gate.stop("User stop")
            check(indicator(state: gate.state, hand: 3.1, now: 3.1) == .cameraOnly, "Stop left indicator green")
        }
    }
    group("Menu status includes readable meaning rather than color alone") {
        let states: [MenuBarIndicator] = [.off, .cameraOnly, .starting, .waiting, .holding, .tracking]
        check(Set(states.map(\.description)).count == states.count, "Indicator meanings are not distinct")
        for state in states {
            check(!state.description.isEmpty && !state.shortLabel.isEmpty, "Indicator lacks readable status")
            check((state.shortLabel == "LIVE") == (state == .tracking), "Nontracking indicator says LIVE")
        }
        check(MenuBarIndicator.off.shortLabel == "OFF", "Off text missing")
        check(MenuBarIndicator.cameraOnly.shortLabel == "CAM", "Camera-only text missing")
        check(MenuBarIndicator.holding.shortLabel == "HOLD", "Frozen text missing")
    }
}
