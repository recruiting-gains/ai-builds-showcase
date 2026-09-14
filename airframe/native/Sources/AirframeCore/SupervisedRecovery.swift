import Foundation

/// A fresh successful inference with unusable or ambiguous hand geometry.
/// Invalid timestamps, stale delivery, permissions and camera faults are NOT loss.
public enum RecoverableTrackingLoss: Equatable, Sendable {
    case handMissing, thumbOccluded, multipleHands, unreliablePose
}

/// Ephemeral geometric continuity only. This is not hand/person identification.
struct RecoveryPose {
    let point: Point2D
    let wrist: Point2D
    let palmScale: Double

    init?(_ output: GestureOutput) {
        guard let point = output.point, let wrist = output.wrist,
              let palmScale = output.palmScale, palmScale.isFinite,
              (0.025...10).contains(palmScale),
              [point, wrist].allSatisfy({ $0.x.isFinite && $0.y.isFinite
                  && (0...1).contains($0.x) && (0...1).contains($0.y) }) else { return nil }
        self.point = point; self.wrist = wrist; self.palmScale = palmScale
    }

    func near(_ prior: RecoveryPose) -> Bool {
        hypot(point.x - prior.point.x, point.y - prior.point.y) <= 0.20 + 1e-12
            && hypot(wrist.x - prior.wrist.x, wrist.y - prior.wrist.y) <= 0.20 + 1e-12
            && (0.5...2).contains(palmScale / prior.palmScale)
    }

    func continuous(with prior: RecoveryPose) -> Bool {
        hypot(point.x - prior.point.x, point.y - prior.point.y) <= 0.10 + 1e-12
            && hypot(wrist.x - prior.wrist.x, wrist.y - prior.wrist.y) <= 0.08 + 1e-12
            && (0.75...(4.0 / 3.0)).contains(palmScale / prior.palmScale)
    }
}

/// A fixed first-loss lease. Misses, incomplete poses and failed dwells never
/// move the deadline. Only the owner can construct a new explicit session.
struct SupervisedRecovery {
    let lostAt: Double
    let priorPose: RecoveryPose?
    var expiresAt: Double { lostAt + 30 }
    private(set) var isStandby = false
    private var candidate: RecoveryPose?
    private var openSince: Double?
    private var lastObservation: Double?

    init(lostAt: Double, priorPose: RecoveryPose?) {
        self.lostAt = lostAt; self.priorPose = priorPose
    }

    mutating func advance(now: Double) {
        if !isStandby, now >= lostAt + 1.25 {
            isStandby = true
            resetDwell()
        }
    }

    mutating func resetDwell() {
        candidate = nil; openSince = nil; lastObservation = nil
    }

    mutating func observe(_ output: GestureOutput, capturedAt: Double, now: Double) -> Bool {
        advance(now: now)
        guard now < expiresAt, output.recoverableLoss == nil,
              output.isOpenHand, output.phase == .warming || output.phase == .move,
              let pose = RecoveryPose(output),
              !isStandby || output.isVerifiedOpenPalm else { resetDwell(); return false }
        if !isStandby {
            guard let priorPose, pose.near(priorPose) else { resetDwell(); return false }
        }
        // A delivery gap cannot be counted as an uninterrupted observed dwell.
        if let prior = candidate, !pose.continuous(with: prior) { resetDwell() }
        if let lastObservation, capturedAt - lastObservation > 0.2 + 1e-9 { resetDwell() }
        if openSince == nil { openSince = capturedAt }
        candidate = pose
        lastObservation = capturedAt
        let duration = isStandby ? 1.0 : 0.5
        return output.ready && output.phase == .move
            && capturedAt - (openSince ?? capturedAt) + 1e-9 >= duration
    }
}
