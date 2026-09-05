import Foundation

/// Reliable pointer landmarks with an unavailable/uncertain thumb. No thumb
/// position is invented, and this observation cannot emit any pointer action.
public struct PinchUncertainFrame: Equatable, Sendable {
    public let timestamp: Double
    public let aspectRatio: Double
    public let wrist: Point2D
    public let middleMCP: Point2D
    public let indexTip: Point2D
    public let confidence: Double

    public init(timestamp: Double, aspectRatio: Double, wrist: Point2D,
                middleMCP: Point2D, indexTip: Point2D, confidence: Double) {
        self.timestamp = timestamp
        self.aspectRatio = aspectRatio
        self.wrist = wrist
        self.middleMCP = middleMCP
        self.indexTip = indexTip
        self.confidence = confidence
    }

    var isReliable: Bool {
        timestamp.isFinite && timestamp >= 0 && aspectRatio.isFinite && (0.1...10).contains(aspectRatio)
            && confidence.isFinite && (0.70...1).contains(confidence)
            && [wrist, middleMCP, indexTip].allSatisfy {
                $0.x.isFinite && $0.y.isFinite && (0...1).contains($0.x) && (0...1).contains($0.y)
            }
            && hypot((wrist.x - middleMCP.x) * aspectRatio, wrist.y - middleMCP.y) >= 0.025
    }
}
