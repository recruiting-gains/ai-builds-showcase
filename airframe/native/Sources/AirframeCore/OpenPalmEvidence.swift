import Foundation

/// Extra 2D pose evidence for deliberate standby resume. This is not identity,
/// depth, palm-facing classification, or permission to emit operating-system input.
public enum OpenPalmEvidence {
    public struct Joint: Sendable {
        public let point: Point2D
        public let confidence: Double
        public init(_ point: Point2D, confidence: Double) {
            self.point = point
            self.confidence = confidence
        }
        fileprivate var reliable: Bool {
            confidence.isFinite && (0.70...1).contains(confidence)
                && point.x.isFinite && point.y.isFinite
                && (0...1).contains(point.x) && (0...1).contains(point.y)
        }
    }

    public struct Finger: Sendable {
        public let base: Joint
        public let middle: Joint
        public let tip: Joint
        public init(base: Joint, middle: Joint, tip: Joint) {
            self.base = base; self.middle = middle; self.tip = tip
        }
    }

    /// Exactly four non-thumb fingers must be confidently extended. The gesture
    /// engine separately verifies thumb/index separation, continuity, and dwell.
    public static func isOpen(wrist: Joint, fingers: [Finger], aspectRatio: Double) -> Bool {
        guard wrist.reliable, fingers.count == 4,
              aspectRatio.isFinite, (0.1...10).contains(aspectRatio) else { return false }
        func vector(_ a: Point2D, _ b: Point2D) -> (Double, Double) {
            ((b.x - a.x) * aspectRatio, b.y - a.y)
        }
        func length(_ a: Point2D, _ b: Point2D) -> Double {
            let v = vector(a, b); return hypot(v.0, v.1)
        }
        guard fingers.allSatisfy({ $0.base.reliable && $0.middle.reliable && $0.tip.reliable }) else { return false }
        let palmScale = length(wrist.point, fingers[1].base.point)
        guard palmScale >= 0.025,
              length(fingers[0].base.point, fingers[3].base.point) >= palmScale * 0.35 else { return false }
        for index in 0..<3 {
            guard length(fingers[index].base.point, fingers[index + 1].base.point) >= palmScale * 0.04 else { return false }
        }
        return fingers.allSatisfy { finger in
            let palm = length(wrist.point, finger.base.point)
            let first = vector(finger.base.point, finger.middle.point)
            let second = vector(finger.middle.point, finger.tip.point)
            let firstLength = hypot(first.0, first.1), secondLength = hypot(second.0, second.1)
            guard palm >= 0.025, firstLength >= palm * 0.12, secondLength >= palm * 0.12 else { return false }
            let straightness = (first.0 * second.0 + first.1 * second.1) / (firstLength * secondLength)
            return straightness >= 0.60
                && length(wrist.point, finger.tip.point) >= length(wrist.point, finger.middle.point) + palm * 0.12
        }
    }
}
