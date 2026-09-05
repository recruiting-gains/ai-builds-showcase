import Foundation

public enum ControlMode: Equatable { case pointerOnly, clickAndDrag }
public enum ControlState: Equatable { case off, countdown, waitingForHand, active, recoveringHand, recoveringPinch }
public enum PointerAction: Equatable {
    case move(Point2D, dragging: Bool)
    case down(Point2D)
    case up(Point2D)
}

/// Independent authorization/liveness gate. Contains no APIs capable of controlling a computer.
public final class ControlGate {
    public private(set) var state: ControlState = .off
    public private(set) var reason = "Mac control is off."
    public private(set) var buttonHeld = false
    private var mode: ControlMode = .pointerOnly
    private var deadline = 0.0
    private var waitingDeadline = 0.0
    private var lastReceive = 0.0
    private var lastClock = 0.0
    private var lastTimestamp = -Double.infinity
    private var lastPoint = Point2D(x: 0.5, y: 0.5)
    private var recoveryDeadline = 0.0
    private var recoveryReadyAfter = 0.0
    private var recoveryOpenSince: Double?

    public init() {}

    /// The UI must stop the previous session before requesting a new one.
    @discardableResult
    public func arm(now: Double, mode: ControlMode, authorized: Bool) -> Bool {
        guard state == .off, now.isFinite, now >= 0, authorized else { return false }
        self.mode = mode
        state = .countdown
        deadline = now + 3
        waitingDeadline = deadline + 12
        lastReceive = now
        lastClock = now
        lastTimestamp = -Double.infinity
        recoveryDeadline = 0
        recoveryReadyAfter = 0
        recoveryOpenSince = nil
        reason = "Starting in 3 seconds. Keep an open hand visible."
        return true
    }

    public func stop(_ message: String) -> [PointerAction] {
        let release: [PointerAction] = buttonHeld ? [.up(lastPoint)] : []
        buttonHeld = false
        state = .off
        recoveryDeadline = 0
        recoveryReadyAfter = 0
        recoveryOpenSince = nil
        reason = message
        return release
    }

    public func tick(now: Double, authorized: Bool) -> [PointerAction] {
        guard state != .off else { return [] }
        guard now.isFinite, authorized else { return stop("Control stopped: permission or emergency monitor unavailable.") }
        guard now >= lastClock, now - lastReceive <= 0.65 else { return stop("Control stopped: camera frames became stale.") }
        lastClock = now
        if (state == .recoveringHand || state == .recoveringPinch), now >= recoveryDeadline {
            return stop("Control paused: hand recovery timed out. Start again when ready.")
        }
        if state == .countdown, now >= deadline {
            state = .waitingForHand
            reason = "Show a steady open hand to take control."
        }
        if state == .waitingForHand, now >= waitingDeadline {
            return stop("Control stopped: no ready open hand. Try again when ready.")
        }
        return []
    }

    /// Only for a fresh, successful camera inference with a missing/uncertain hand.
    /// Camera failures, stale deliveries and inference errors must use stop instead.
    /// The caller resets GestureEngine for every missing observation.
    public func noHand(capturedAt: Double, now: Double, authorized: Bool) -> [PointerAction] {
        guard state != .off else { return [] }
        if let failure = recordFrame(capturedAt: capturedAt, now: now, authorized: authorized) { return stop(failure) }
        if state == .recoveringPinch {
            return stop("Control paused: hand lost. Start Mac control again when ready.")
        }
        if state == .countdown, now >= deadline {
            state = .waitingForHand
            reason = "Show a steady open hand to take control."
        }
        if state == .waitingForHand, now >= waitingDeadline {
            return stop("Control stopped: no ready open hand. Try again when ready.")
        }
        if state == .active {
            guard mode == .pointerOnly, !buttonHeld else {
                return stop("Control paused: hand lost. Start Mac control again when ready.")
            }
            // A fixed window anchored to capture time, never refreshed by misses.
            state = .recoveringHand
            recoveryDeadline = capturedAt + 1.25
            recoveryReadyAfter = capturedAt + 0.5
            reason = "Pointer frozen. Show a steady open hand near its last position."
        }
        return []
    }

    /// Only a separate, validated thumb-uncertain observation can enter this
    /// bounded hold. A missing hand or a held button must never use this path
    /// to continue dragging. The caller resets GestureEngine before every hold.
    public func pinchUncertain(_ frame: PinchUncertainFrame, capturedAt: Double,
                               now: Double, authorized: Bool) -> [PointerAction] {
        guard state != .off else { return [] }
        guard frame.timestamp == capturedAt, frame.isReliable else {
            return stop("Control paused: partial hand data is invalid. Start again when ready.")
        }
        if mode == .pointerOnly { return noHand(capturedAt: capturedAt, now: now, authorized: authorized) }
        if let failure = recordFrame(capturedAt: capturedAt, now: now, authorized: authorized) { return stop(failure) }
        guard !buttonHeld else {
            return stop("Control paused: pinch tracking is uncertain. Start again when ready.")
        }
        recoveryOpenSince = nil
        if state == .active || state == .recoveringPinch {
            guard hypot(frame.indexTip.x - lastPoint.x, frame.indexTip.y - lastPoint.y) <= 0.20 + 1e-12 else {
                return stop("Control paused: hand moved outside the safe hold area. Start again when ready.")
            }
            if state == .active {
                state = .recoveringPinch
                recoveryDeadline = capturedAt + 1.25
                recoveryReadyAfter = capturedAt + 0.5
                reason = "Pinch uncertain: pointer and clicks frozen. Open your hand near its last position to continue."
            }
        }
        return []
    }

    public func accept(_ output: GestureOutput, capturedAt: Double, now: Double, authorized: Bool) -> [PointerAction] {
        guard state != .off else { return [] }
        if let failure = recordFrame(capturedAt: capturedAt, now: now, authorized: authorized) { return stop(failure) }
        if output.phase == .cancel { return stop("Control paused: hand tracking changed. Start again when ready.") }
        if state == .recoveringHand || state == .recoveringPinch {
            let expectedMode: ControlMode = state == .recoveringHand ? .pointerOnly : .clickAndDrag
            guard mode == expectedMode, !buttonHeld else { return stop("Control stopped: invalid recovery mode.") }
            // Never consume a malformed ready observation, including a purportedly
            // ready warming state. Unready warming data cannot emit any actions.
            if output.ready {
                guard output.phase != .warming, let point = output.point, valid(point) else {
                    return stop("Control stopped: no reliable pointer.")
                }
            }
            if state == .recoveringPinch {
                // Readiness can have been earned while far from the hold anchor;
                // .move can also mean the first 120 ms of a CLOSED pinch. Neither
                // is sufficient to resume click mode. Require a new uninterrupted
                // open-hand dwell here, near the frozen target, on complete data.
                guard output.isOpenHand, output.phase == .warming || output.phase == .move,
                      let point = output.point, valid(point),
                      hypot(point.x - lastPoint.x, point.y - lastPoint.y) <= 0.20 + 1e-12 else {
                    recoveryOpenSince = nil
                    return []
                }
                if recoveryOpenSince == nil { recoveryOpenSince = capturedAt }
                guard capturedAt - (recoveryOpenSince ?? capturedAt) + 1e-9 >= 0.5 else { return [] }
            }
            guard output.ready, output.phase == .move, let point = output.point else { return [] }
            // GestureEngine supplies the uninterrupted 500 ms open-hand dwell.
            // This additional floor prevents premature resume if readiness is stale.
            guard now >= recoveryReadyAfter,
                  hypot(point.x - lastPoint.x, point.y - lastPoint.y) <= 0.20 + 1e-12 else { return [] }
            state = .active
            recoveryDeadline = 0
            recoveryReadyAfter = 0
            recoveryOpenSince = nil
            reason = mode == .pointerOnly ? "LIVE · pointer only. Pinching cannot click." : "LIVE · clicks and dragging enabled."
        }
        if state == .countdown {
            if now < deadline { return [] }
            state = .waitingForHand
        }
        if state == .waitingForHand {
            guard now < waitingDeadline else { return stop("Control stopped: open-hand setup timed out.") }
            guard output.ready, output.phase == .move else { return [] }
            state = .active
            reason = mode == .pointerOnly ? "LIVE · pointer only. Pinching cannot click." : "LIVE · clicks and dragging enabled."
        }
        guard output.ready, let point = output.point, valid(point) else {
            return stop("Control stopped: no reliable pointer.")
        }
        lastPoint = point
        if mode == .pointerOnly { return [.move(point, dragging: false)] }
        switch output.phase {
        case .down:
            guard !buttonHeld else { return [.move(point, dragging: true)] }
            buttonHeld = true
            return [.move(point, dragging: false), .down(point)]
        case .held:
            return [.move(point, dragging: buttonHeld)]
        case .up:
            let release: [PointerAction] = buttonHeld ? [.up(point)] : []
            buttonHeld = false
            return release + [.move(point, dragging: false)]
        case .move:
            if buttonHeld { return stop("Control stopped: release sequence was interrupted.") }
            return [.move(point, dragging: false)]
        case .cancel, .warming:
            return stop("Control stopped: hand is not ready.")
        }
    }

    private func valid(_ point: Point2D) -> Bool {
        point.x.isFinite && point.y.isFinite && (0...1).contains(point.x) && (0...1).contains(point.y)
    }

    /// Shared freshness/high-water checks for detected and missing observations.
    /// Deadline and recovery liveness checks happen before updating clocks, so a
    /// late returning frame cannot bypass expiry before the next watchdog tick.
    private func recordFrame(capturedAt: Double, now: Double, authorized: Bool) -> String? {
        guard authorized, now.isFinite, now >= lastClock, capturedAt.isFinite, capturedAt >= 0,
              capturedAt <= now, now - capturedAt <= 0.25, capturedAt > lastTimestamp else {
            return "Control stopped: stale frame or permission changed."
        }
        guard now - lastReceive <= 0.65 else { return "Control stopped: camera frames became stale." }
        if state == .recoveringHand || state == .recoveringPinch {
            guard now < recoveryDeadline else { return "Control paused: hand recovery timed out. Start again when ready." }
        }
        lastReceive = now
        lastClock = now
        lastTimestamp = capturedAt
        return nil
    }
}
