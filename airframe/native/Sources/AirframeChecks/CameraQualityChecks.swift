import Foundation
import AirframeCore

func runCameraQualityChecks() {
    typealias Joint = OpenPalmEvidence.Joint
    typealias Finger = OpenPalmEvidence.Finger
    let wrist = Joint(Point2D(x: 0.5, y: 0.8), confidence: 0.9)
    let fingers = (0..<4).map { n in
        let x = 0.35 + Double(n) * 0.1
        return Finger(base: Joint(Point2D(x: x, y: 0.6), confidence: 0.9),
                      middle: Joint(Point2D(x: x, y: 0.45), confidence: 0.9),
                      tip: Joint(Point2D(x: x, y: 0.25), confidence: 0.9))
    }
    group("Standby open-hand evidence requires four reliably extended fingers") {
        check(OpenPalmEvidence.isOpen(wrist: wrist, fingers: fingers, aspectRatio: 4.0 / 3), "Open geometric pattern rejected")
        for count in [0, 1, 2, 3] {
            check(!OpenPalmEvidence.isOpen(wrist: wrist, fingers: Array(fingers.prefix(count)), aspectRatio: 4.0 / 3), "Missing fingers accepted")
        }
        check(!OpenPalmEvidence.isOpen(wrist: wrist, fingers: fingers + [fingers[0]], aspectRatio: 4.0 / 3), "Unexpected finger count accepted")
        for index in 0..<4 {
            var bent = fingers
            bent[index] = Finger(base: fingers[index].base, middle: fingers[index].middle,
                                 tip: Joint(Point2D(x: fingers[index].tip.point.x, y: 0.7), confidence: 0.9))
            check(!OpenPalmEvidence.isOpen(wrist: wrist, fingers: bent, aspectRatio: 4.0 / 3), "Curled finger accepted")
        }
    }
    group("Open-hand evidence rejects uncertain, malformed and degenerate joints") {
        for confidence in [0.54, 0.699, -1, 1.1, Double.nan, Double.infinity] {
            var weak = fingers
            weak[0] = Finger(base: fingers[0].base, middle: fingers[0].middle,
                             tip: Joint(fingers[0].tip.point, confidence: confidence))
            check(!OpenPalmEvidence.isOpen(wrist: wrist, fingers: weak, aspectRatio: 4.0 / 3), "Unreliable extra landmark accepted")
        }
        for aspect in [0.0, 11, Double.nan, Double.infinity] {
            check(!OpenPalmEvidence.isOpen(wrist: wrist, fingers: fingers, aspectRatio: aspect), "Invalid aspect accepted")
        }
        let invalid = Joint(Point2D(x: .nan, y: 0.8), confidence: 0.9)
        check(!OpenPalmEvidence.isOpen(wrist: invalid, fingers: fingers, aspectRatio: 1), "Invalid wrist accepted")
        let tiny = Finger(base: wrist, middle: wrist, tip: wrist)
        check(!OpenPalmEvidence.isOpen(wrist: wrist, fingers: [tiny, tiny, tiny, tiny], aspectRatio: 1), "Degenerate hand accepted")
        check(!OpenPalmEvidence.isOpen(wrist: wrist, fingers: Array(repeating: fingers[1], count: 4), aspectRatio: 1), "Overlapping duplicate fingers accepted")
    }
    group("Open-hand geometry is rotation invariant in aspect-correct space") {
        func rotated(_ joint: Joint, angle: Double, aspect: Double) -> Joint {
            let x = (joint.point.x - 0.5) * aspect, y = joint.point.y - 0.5
            return Joint(Point2D(x: 0.5 + (x * cos(angle) - y * sin(angle)) / aspect,
                                 y: 0.5 + x * sin(angle) + y * cos(angle)), confidence: joint.confidence)
        }
        for aspect in [1.0, 4.0 / 3, 16.0 / 9] {
            for angle in [-Double.pi / 2, -Double.pi / 4, 0, Double.pi / 4, Double.pi / 2] {
                let rotatedFingers = fingers.map { finger in
                    Finger(base: rotated(finger.base, angle: angle, aspect: aspect),
                           middle: rotated(finger.middle, angle: angle, aspect: aspect),
                           tip: rotated(finger.tip, angle: angle, aspect: aspect))
                }
                check(OpenPalmEvidence.isOpen(wrist: rotated(wrist, angle: angle, aspect: aspect), fingers: rotatedFingers,
                                              aspectRatio: aspect), "Rotation/aspect changed an otherwise eligible hand")
            }
        }
    }
}
