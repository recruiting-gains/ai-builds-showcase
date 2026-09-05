import Foundation

/// A short-lived, one-shot intent created only by an explicit menu Start action.
/// No permission callback or later camera restart may recreate this intent.
public struct MenuBarStartRequest {
    public private(set) var mode: ControlMode?
    private var requestedAt = 0.0
    private var lastClock = 0.0
    public var isPending: Bool { mode != nil }

    public init() {}

    public mutating func begin(mode: ControlMode, now: Double, authorized: Bool) {
        cancel()
        guard authorized, now.isFinite, now >= 0 else { return }
        self.mode = mode
        requestedAt = now
        lastClock = now
    }

    public mutating func cancel() { mode = nil }

    /// True only while waiting for this explicitly requested camera session.
    @discardableResult
    public mutating func validate(now: Double, authorized: Bool) -> Bool {
        guard isPending else { return false }
        guard authorized, now.isFinite, now >= lastClock, now - requestedAt < 10 else {
            cancel()
            return false
        }
        lastClock = now
        return true
    }

    /// Called only for a fresh observation from CameraEngine's current generation.
    /// A queued preview frame from before the Start click cannot arm a session.
    public mutating func take(capturedAt: Double, now: Double, authorized: Bool) -> ControlMode? {
        guard validate(now: now, authorized: authorized) else { return nil }
        guard capturedAt.isFinite, capturedAt >= 0, capturedAt <= now, now - capturedAt <= 0.2 else {
            cancel()
            return nil
        }
        guard capturedAt >= requestedAt else { return nil }
        let selectedMode = mode
        cancel()
        return selectedMode
    }
}

/// The green state is evidence of a fresh hand AND armed control, not camera use alone.
public enum MenuBarIndicator: Equatable {
    case off, cameraOnly, starting, waiting, holding, tracking

    public static func resolve(state: ControlState, pending: Bool, cameraRequested: Bool,
                               cameraRunning: Bool, authorized: Bool, lastHandAt: Double?, now: Double) -> Self {
        guard cameraRequested || cameraRunning else { return .off }
        if pending { return .starting }
        guard state != .off, authorized, cameraRunning else { return .cameraOnly }
        switch state {
        case .off: return .cameraOnly
        case .countdown: return .starting
        case .waitingForHand: return .waiting
        case .recoveringHand: return .holding
        case .active:
            guard let lastHandAt, now.isFinite, now >= 0, lastHandAt.isFinite, lastHandAt >= 0,
                  now >= lastHandAt, now - lastHandAt <= 0.2 else { return .holding }
            return .tracking
        }
    }

    public var shortLabel: String {
        switch self {
        case .off: return "OFF"
        case .cameraOnly: return "CAM"
        case .starting, .waiting: return "WAIT"
        case .holding: return "HOLD"
        case .tracking: return "LIVE"
        }
    }

    public var description: String {
        switch self {
        case .off: return "Camera and control off"
        case .cameraOnly: return "Camera on or starting · control off"
        case .starting: return "Starting · keep an open hand visible"
        case .waiting: return "Waiting for a steady open hand"
        case .holding: return "Pointer frozen · finding your hand"
        case .tracking: return "Tracking · Mac control active"
        }
    }
}
