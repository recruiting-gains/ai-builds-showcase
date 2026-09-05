import Foundation

/// Normalized coordinates. The camera adapter supplies mirrored x and top-left y.
/// The core does not apply a second mirror, screen mapping, or operating-system input.
public struct Point2D: Equatable, Sendable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }

    fileprivate var isValid: Bool {
        x.isFinite && y.isFinite && (0...1).contains(x) && (0...1).contains(y)
    }
}

/// A single hand observation; timestamps are monotonic seconds, not milliseconds.
/// Confidence should be the minimum confidence of all four required observations.
public struct HandFrame: Equatable, Sendable {
    public let timestamp: Double
    public let aspectRatio: Double
    public let wrist: Point2D
    public let middleMCP: Point2D
    public let indexTip: Point2D
    public let thumbTip: Point2D
    public let confidence: Double

    public init(timestamp: Double, aspectRatio: Double, wrist: Point2D,
                middleMCP: Point2D, indexTip: Point2D, thumbTip: Point2D, confidence: Double) {
        self.timestamp = timestamp
        self.aspectRatio = aspectRatio
        self.wrist = wrist
        self.middleMCP = middleMCP
        self.indexTip = indexTip
        self.thumbTip = thumbTip
        self.confidence = confidence
    }

    fileprivate var isValid: Bool {
        timestamp.isFinite && timestamp >= 0 && aspectRatio.isFinite && (0.1...10).contains(aspectRatio)
            && confidence.isFinite && (0.55...1).contains(confidence)
            && [wrist, middleMCP, indexTip, thumbTip].allSatisfy(\.isValid)
    }
}

public enum GesturePhase: String, Equatable, Sendable {
    case move, down, held, up, cancel, warming
}

public struct GestureOutput: Equatable, Sendable {
    public let point: Point2D?
    public let phase: GesturePhase
    /// Recognition readiness only. It never grants user permission to emit OS input.
    public let ready: Bool

    public init(point: Point2D?, phase: GesturePhase, ready: Bool) {
        self.point = point
        self.phase = phase
        self.ready = ready
    }
}

/// Deterministic gesture-local state only. The owner must serialize calls and
/// independently gate OS input on explicit user start, permission, fresh frames,
/// physical-input takeover, and an emergency stop. This class accesses no hardware.
public final class GestureEngine {
    private static let closeRatio = 0.28
    private static let openRatio = 0.45
    private static let closeDuration = 0.120
    private static let releaseDuration = 0.080
    private static let armDuration = 0.500
    private static let continuityLimit = 0.350
    private static let smoothingTime = 0.045

    private var lastTimestamp: Double?
    private var previousWrist: Point2D?
    private var filteredPoint: Point2D?
    private var openSince: Double?
    private var closeSince: Double?
    private var releaseSince: Double?
    private var isReady = false
    private var isPressed = false
    private var hasObservation = false

    public init() {}

    /// Begins a new session. The emitter must release any held OS button itself
    /// before calling reset; a reset intentionally does not emit an input event.
    public func reset() {
        clearGesture()
        lastTimestamp = nil
    }

    public func update(_ frame: HandFrame?) -> GestureOutput {
        guard let frame else { return cancelIfNeeded() }
        guard frame.isValid else { return cancelIfNeeded() }
        if let lastTimestamp, frame.timestamp <= lastTimestamp {
            // Preserve the timestamp high-water mark across losses. A delayed
            // observation cannot silently rearm a current session.
            return cancelIfNeeded()
        }

        let delta = lastTimestamp.map { frame.timestamp - $0 }
        lastTimestamp = frame.timestamp
        if hasObservation, let delta, delta > Self.continuityLimit + 1e-9 {
            return cancelIfNeeded()
        }
        if let previousWrist,
           hypot(frame.wrist.x - previousWrist.x, frame.wrist.y - previousWrist.y) > 0.35 {
            return cancelIfNeeded()
        }

        // Convert normalized x to height-equivalent pixel units before computing
        // distances. Dividing by palm size removes camera-distance dependence.
        let palm = distance(frame.wrist, frame.middleMCP, aspect: frame.aspectRatio)
        let gap = distance(frame.indexTip, frame.thumbTip, aspect: frame.aspectRatio)
        guard palm.isFinite, gap.isFinite, palm >= 0.025 else { return cancelIfNeeded() }
        let ratio = gap / palm
        guard ratio.isFinite else { return cancelIfNeeded() }

        let point: Point2D
        if let filteredPoint, let delta {
            let alpha = 1 - exp(-min(delta, 0.100) / Self.smoothingTime)
            point = Point2D(x: filteredPoint.x + (frame.indexTip.x - filteredPoint.x) * alpha,
                            y: filteredPoint.y + (frame.indexTip.y - filteredPoint.y) * alpha)
        } else {
            point = frame.indexTip
        }
        filteredPoint = point
        previousWrist = frame.wrist
        hasObservation = true

        if !isReady {
            closeSince = nil
            releaseSince = nil
            if ratio + 1e-12 >= Self.openRatio {
                if openSince == nil { openSince = frame.timestamp }
                if elapsed(from: openSince, now: frame.timestamp, atLeast: Self.armDuration) {
                    isReady = true
                    openSince = nil
                    return GestureOutput(point: point, phase: .move, ready: true)
                }
            } else {
                openSince = nil
            }
            return GestureOutput(point: point, phase: .warming, ready: false)
        }

        if !isPressed {
            releaseSince = nil
            if ratio <= Self.closeRatio + 1e-12 {
                if closeSince == nil { closeSince = frame.timestamp }
                if elapsed(from: closeSince, now: frame.timestamp, atLeast: Self.closeDuration) {
                    closeSince = nil
                    isPressed = true
                    return GestureOutput(point: point, phase: .down, ready: true)
                }
            } else {
                closeSince = nil
            }
            return GestureOutput(point: point, phase: .move, ready: true)
        }

        if ratio + 1e-12 >= Self.openRatio {
            if releaseSince == nil { releaseSince = frame.timestamp }
            if elapsed(from: releaseSince, now: frame.timestamp, atLeast: Self.releaseDuration) {
                releaseSince = nil
                isPressed = false
                return GestureOutput(point: point, phase: .up, ready: true)
            }
        } else {
            releaseSince = nil
        }
        return GestureOutput(point: point, phase: .held, ready: true)
    }

    private func distance(_ a: Point2D, _ b: Point2D, aspect: Double) -> Double {
        hypot((a.x - b.x) * aspect, a.y - b.y)
    }

    private func elapsed(from start: Double?, now: Double, atLeast duration: Double) -> Bool {
        guard let start else { return false }
        // A tiny tolerance avoids binary floating-point representation turning
        // exactly 120 ms into 119.999999999 ms. It does not change debounce timing.
        return now - start + 1e-9 >= duration
    }

    private func cancelIfNeeded() -> GestureOutput {
        let phase: GesturePhase = hasObservation || isPressed || isReady ? .cancel : .warming
        clearGesture()
        return GestureOutput(point: nil, phase: phase, ready: false)
    }

    private func clearGesture() {
        previousWrist = nil
        filteredPoint = nil
        openSince = nil
        closeSince = nil
        releaseSince = nil
        isReady = false
        isPressed = false
        hasObservation = false
    }
}
