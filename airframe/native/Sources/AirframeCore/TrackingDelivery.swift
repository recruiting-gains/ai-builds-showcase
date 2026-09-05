/// A successful detector result (including uncertain/missing hand detection) is
/// distinct from a pipeline fault. Neither type itself grants permission to act.
public enum TrackingDelivery: Equatable, Sendable {
    case observation(HandFrame?, capturedAt: Double)
    case pinchUncertain(PinchUncertainFrame, capturedAt: Double)
    case fault(String)

    /// Run when queued and again immediately before delivery. Nil observations
    /// have the same age requirement as recognized hands; absence is not a clock.
    public func validated(at now: Double) -> TrackingDelivery {
        switch self {
        case .fault:
            return self
        case let .pinchUncertain(frame, capturedAt):
            let timing = TrackingDelivery.observation(nil, capturedAt: capturedAt).validated(at: now)
            if case .fault = timing { return timing }
            guard frame.timestamp == capturedAt, frame.isReliable else {
                return .fault("Partial hand observation is invalid. Controls are paused.")
            }
            return self
        case let .observation(frame, capturedAt):
            guard now.isFinite, now >= 0, capturedAt.isFinite, capturedAt >= 0,
                  capturedAt <= now else {
                return .fault("Camera sample timing is invalid. Controls are paused.")
            }
            guard now - capturedAt <= 0.2 else {
                return .fault("Camera sample is too old. Controls are paused.")
            }
            if let frame, frame.timestamp != capturedAt {
                return .fault("Camera observation timing does not match its sample. Controls are paused.")
            }
            return self
        }
    }

    /// Never erase an unhandled fault or the first missing-hand observation. A
    /// click/drag owner must see that first loss to release safely, and its
    /// timestamp must not slide forward with later missing samples. Callers
    /// separately discard old-generation data before using this priority rule.
    public static func coalesce(pending: TrackingDelivery?, incoming: TrackingDelivery) -> TrackingDelivery {
        if let pending, case .fault = pending { return pending }
        if case .fault = incoming { return incoming }
        if let pending, case .observation(nil, _) = pending { return pending }
        if case .observation(nil, _) = incoming { return incoming }
        // A queued thumb-occlusion event must not disappear behind a newer
        // complete hand; the gate must reset click readiness first. Genuine
        // hand loss has higher priority and still stops clicking immediately.
        if let pending, case .pinchUncertain = pending { return pending }
        return incoming
    }
}
