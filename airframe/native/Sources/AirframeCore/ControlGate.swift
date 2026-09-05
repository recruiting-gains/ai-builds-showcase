import Foundation

public enum ControlMode: Equatable { case pointerOnly, clickAndDrag }
public enum ControlState: Equatable { case off, countdown, waitingForHand, active }
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
    private var lastTimestamp = -Double.infinity
    private var lastPoint = Point2D(x: 0.5, y: 0.5)

    public init() {}

    /// The UI must stop the previous session before requesting a new one.
    @discardableResult
    public func arm(now: Double, mode: ControlMode, authorized: Bool) -> Bool {
        guard state == .off, now.isFinite, authorized else { return false }
        self.mode = mode
        state = .countdown
        deadline = now + 3
        waitingDeadline = deadline + 12
        lastReceive = now
        lastTimestamp = -Double.infinity
        reason = "Starting in 3 seconds. Keep an open hand visible."
        return true
    }

    public func stop(_ message: String) -> [PointerAction] {
        let release: [PointerAction] = buttonHeld ? [.up(lastPoint)] : []
        buttonHeld = false
        state = .off
        reason = message
        return release
    }

    public func tick(now: Double, authorized: Bool) -> [PointerAction] {
        guard state != .off else { return [] }
        guard now.isFinite, authorized else { return stop("Control stopped: permission or emergency monitor unavailable.") }
        guard now >= lastReceive, now - lastReceive <= 0.65 else { return stop("Control stopped: camera frames became stale.") }
        if state == .countdown, now >= deadline {
            state = .waitingForHand
            reason = "Show a steady open hand to take control."
        }
        if state == .waitingForHand, now > waitingDeadline {
            return stop("Control stopped: no ready open hand. Try again when ready.")
        }
        return []
    }

    public func noHand(now: Double) -> [PointerAction] {
        guard state != .off else { return [] }
        guard now.isFinite, now >= lastReceive else { return stop("Control stopped: invalid camera timing.") }
        lastReceive = now
        if state == .active { return stop("Control paused: hand lost. Start Mac control again when ready.") }
        return []
    }

    public func accept(_ output: GestureOutput, capturedAt: Double, now: Double, authorized: Bool) -> [PointerAction] {
        guard state != .off else { return [] }
        guard authorized, now.isFinite, now >= lastReceive, capturedAt.isFinite,
              capturedAt <= now, now - capturedAt <= 0.25,
              capturedAt > lastTimestamp else {
            return stop("Control stopped: stale frame or permission changed.")
        }
        lastReceive = now
        lastTimestamp = capturedAt
        if output.phase == .cancel { return stop("Control paused: hand tracking changed. Start again when ready.") }
        if state == .countdown {
            if now < deadline { return [] }
            state = .waitingForHand
        }
        if state == .waitingForHand {
            guard now <= waitingDeadline else { return stop("Control stopped: open-hand setup timed out.") }
            guard output.ready, output.phase == .move else { return [] }
            state = .active
            reason = mode == .pointerOnly ? "LIVE · pointer only. Pinching cannot click." : "LIVE · clicks and dragging enabled."
        }
        guard output.ready, let point = output.point,
              point.x.isFinite, point.y.isFinite,
              (0...1).contains(point.x), (0...1).contains(point.y) else {
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
}
