import XCTest
@testable import AirframeCore

final class GestureEngineTests: XCTestCase {
    private func frame(_ time: Double, ratio: Double = 0.70, aspect: Double = 4.0 / 3.0,
                       confidence: Double = 0.95, index: Point2D = Point2D(x: 0.50, y: 0.25),
                       wrist: Point2D = Point2D(x: 0.50, y: 0.75)) -> HandFrame {
        HandFrame(timestamp: time, aspectRatio: aspect, wrist: wrist,
                  middleMCP: Point2D(x: wrist.x, y: wrist.y - 0.25), indexTip: index,
                  thumbTip: Point2D(x: index.x + ratio * 0.25 / aspect, y: index.y),
                  confidence: confidence)
    }

    @discardableResult
    private func arm(_ engine: GestureEngine, startingAt time: Double = 0) -> GestureOutput {
        var output = engine.update(frame(time))
        for step in 1...5 { output = engine.update(frame(time + Double(step) * 0.1)) }
        XCTAssertEqual(output.phase, .move)
        XCTAssertTrue(output.ready)
        return output
    }

    @discardableResult
    private func press(_ engine: GestureEngine) -> GestureOutput {
        arm(engine)
        XCTAssertEqual(engine.update(frame(0.60, ratio: 0.20)).phase, .move)
        let output = engine.update(frame(0.72, ratio: 0.20))
        XCTAssertEqual(output.phase, .down)
        return output
    }

    func testStartsColdWithoutAnyPointOrPermissionToMove() {
        let output = GestureEngine().update(nil)
        XCTAssertEqual(output.phase, .warming)
        XCTAssertFalse(output.ready)
        XCTAssertNil(output.point)
    }

    func testRequiresFiveHundredMillisecondsOfContinuousOpenHand() {
        let engine = GestureEngine()
        for time in [0.0, 0.1, 0.2, 0.3, 0.4, 0.499] {
            let output = engine.update(frame(time))
            XCTAssertEqual(output.phase, .warming)
            XCTAssertFalse(output.ready)
        }
        let ready = engine.update(frame(0.5))
        XCTAssertEqual(ready.phase, .move)
        XCTAssertTrue(ready.ready)
    }

    func testInitialPinchNeverArmsOrGrabs() {
        let engine = GestureEngine()
        for step in 0...30 {
            let output = engine.update(frame(Double(step) * 0.1, ratio: 0.10))
            XCTAssertEqual(output.phase, .warming)
            XCTAssertFalse(output.ready)
        }
    }

    func testInterruptedOpenHandResetsArmingTimer() {
        let engine = GestureEngine()
        for time in [0.0, 0.1, 0.2] { _ = engine.update(frame(time)) }
        _ = engine.update(frame(0.3, ratio: 0.40))
        for time in [0.4, 0.5, 0.6, 0.7, 0.8] {
            XCTAssertFalse(engine.update(frame(time)).ready)
        }
        XCTAssertTrue(engine.update(frame(0.9)).ready)
    }

    func testPinchDebouncesForOneHundredTwentyMilliseconds() {
        let engine = GestureEngine()
        arm(engine)
        XCTAssertEqual(engine.update(frame(0.6, ratio: 0.20)).phase, .move)
        XCTAssertEqual(engine.update(frame(0.719, ratio: 0.20)).phase, .move)
        XCTAssertEqual(engine.update(frame(0.720, ratio: 0.20)).phase, .down)
    }

    func testHoldingPinchProducesOnlyOneDown() {
        let engine = GestureEngine()
        press(engine)
        for time in [0.75, 0.80, 0.85, 0.90] {
            let output = engine.update(frame(time, ratio: 0.20))
            XCTAssertEqual(output.phase, .held)
            XCTAssertTrue(output.ready)
        }
    }

    func testShortPinchCannotAccumulateAcrossAnOpenFrame() {
        let engine = GestureEngine()
        arm(engine)
        _ = engine.update(frame(0.60, ratio: 0.20))
        _ = engine.update(frame(0.68, ratio: 0.60))
        _ = engine.update(frame(0.70, ratio: 0.20))
        XCTAssertEqual(engine.update(frame(0.78, ratio: 0.20)).phase, .move)
        XCTAssertEqual(engine.update(frame(0.82, ratio: 0.20)).phase, .down)
    }

    func testHysteresisPreventsBoundaryChatterWhilePressed() {
        let engine = GestureEngine()
        press(engine)
        for (step, ratio) in [0.29, 0.35, 0.44, 0.30, 0.28].enumerated() {
            XCTAssertEqual(engine.update(frame(0.8 + Double(step) * 0.05, ratio: ratio)).phase, .held)
        }
    }

    func testReleaseWaitsEightyMillisecondsAndEmitsOneUp() {
        let engine = GestureEngine()
        press(engine)
        XCTAssertEqual(engine.update(frame(0.8)).phase, .held)
        XCTAssertEqual(engine.update(frame(0.879)).phase, .held)
        XCTAssertEqual(engine.update(frame(0.880)).phase, .up)
        XCTAssertEqual(engine.update(frame(0.90)).phase, .move)
    }

    func testBriefOpeningDoesNotAccumulateReleaseTime() {
        let engine = GestureEngine()
        press(engine)
        _ = engine.update(frame(0.80))
        _ = engine.update(frame(0.84, ratio: 0.20))
        _ = engine.update(frame(0.87))
        XCTAssertEqual(engine.update(frame(0.93)).phase, .held)
        XCTAssertEqual(engine.update(frame(0.95)).phase, .up)
    }

    func testLossCancelsRatherThanReleasingAClick() {
        let engine = GestureEngine()
        press(engine)
        let lost = engine.update(nil)
        XCTAssertEqual(lost.phase, .cancel)
        XCTAssertFalse(lost.ready)
        XCTAssertNil(lost.point)
        XCTAssertEqual(engine.update(nil).phase, .warming)
    }

    func testReacquiredPinchCannotResumePreviousDrag() {
        let engine = GestureEngine()
        press(engine)
        _ = engine.update(nil)
        for step in 0...8 {
            let output = engine.update(frame(0.9 + Double(step) * 0.1, ratio: 0.20))
            XCTAssertEqual(output.phase, .warming)
            XCTAssertFalse(output.ready)
        }
        arm(engine, startingAt: 2.0)
        XCTAssertEqual(engine.update(frame(2.60, ratio: 0.20)).phase, .move)
        XCTAssertEqual(engine.update(frame(2.72, ratio: 0.20)).phase, .down)
    }

    func testNilDuringWarmupRequiresAFullNewOpenInterval() {
        let engine = GestureEngine()
        _ = engine.update(frame(0.0))
        _ = engine.update(frame(0.2))
        XCTAssertEqual(engine.update(nil).phase, .cancel)
        XCTAssertFalse(engine.update(frame(0.4)).ready)
        XCTAssertFalse(engine.update(frame(0.6)).ready)
        XCTAssertFalse(engine.update(frame(0.8)).ready)
        XCTAssertTrue(engine.update(frame(0.9)).ready)
    }

    func testLowConfidenceIncludingNonFiniteScoresFailsClosed() {
        for confidence in [0.0, 0.5499, -1, 1.01, Double.nan, Double.infinity] {
            let engine = GestureEngine()
            arm(engine)
            let output = engine.update(frame(0.6, confidence: confidence))
            XCTAssertEqual(output.phase, .cancel)
            XCTAssertFalse(output.ready)
            XCTAssertNil(output.point)
        }
        let engine = GestureEngine()
        for step in 0...5 { _ = engine.update(frame(Double(step) * 0.1, confidence: 0.55)) }
        XCTAssertTrue(engine.update(frame(0.6, confidence: 0.55)).ready)
    }

    func testEveryRequiredCoordinateMustBeFiniteAndInsideFrame() {
        for bad in [Double.nan, Double.infinity, -0.01, 1.01] {
            for joint in 0...3 {
                for axis in 0...1 {
                    let engine = GestureEngine()
                    arm(engine)
                    let valid = frame(0.6)
                    var points = [valid.wrist, valid.middleMCP, valid.indexTip, valid.thumbTip]
                    points[joint] = Point2D(x: axis == 0 ? bad : points[joint].x,
                                           y: axis == 1 ? bad : points[joint].y)
                    let invalid = HandFrame(timestamp: 0.6, aspectRatio: valid.aspectRatio, wrist: points[0],
                                            middleMCP: points[1], indexTip: points[2], thumbTip: points[3], confidence: 0.95)
                    let output = engine.update(invalid)
                    XCTAssertEqual(output.phase, .cancel)
                    XCTAssertNil(output.point)
                }
            }
        }
    }

    func testInvalidAspectRatioFailsClosed() {
        for aspect in [0.0, -1, 0.001, 100, Double.nan, Double.infinity] {
            let engine = GestureEngine()
            arm(engine)
            XCTAssertEqual(engine.update(frame(0.6, aspect: aspect)).phase, .cancel)
        }
    }

    func testTinyAndDegeneratePalmCannotTriggerGestures() {
        for separation in [0.0, 0.001, 0.0249] {
            let engine = GestureEngine()
            arm(engine)
            let valid = frame(0.6)
            let tiny = HandFrame(timestamp: valid.timestamp, aspectRatio: valid.aspectRatio, wrist: valid.wrist,
                                 middleMCP: Point2D(x: valid.wrist.x, y: valid.wrist.y - separation),
                                 indexTip: valid.indexTip, thumbTip: valid.indexTip, confidence: valid.confidence)
            XCTAssertEqual(engine.update(tiny).phase, .cancel)
        }
    }

    func testAspectRatioCompensationKeepsPhysicalPinchEquivalent() {
        for aspect in [0.75, 1.0, 4.0 / 3.0, 2.0] {
            let engine = GestureEngine()
            for step in 0...5 { _ = engine.update(frame(Double(step) * 0.1, aspect: aspect)) }
            XCTAssertEqual(engine.update(frame(0.60, ratio: 0.27, aspect: aspect)).phase, .move)
            XCTAssertEqual(engine.update(frame(0.72, ratio: 0.27, aspect: aspect)).phase, .down)
            XCTAssertEqual(engine.update(frame(0.80, ratio: 0.46, aspect: aspect)).phase, .held)
            XCTAssertEqual(engine.update(frame(0.88, ratio: 0.46, aspect: aspect)).phase, .up)
        }
    }

    func testExactThresholdsAreNotChangedByFloatingPointRounding() {
        let engine = GestureEngine()
        for step in 0...5 { _ = engine.update(frame(Double(step) * 0.1, ratio: 0.45, aspect: 2)) }
        XCTAssertTrue(engine.update(frame(0.55, ratio: 0.45, aspect: 2)).ready)
        XCTAssertEqual(engine.update(frame(0.60, ratio: 0.28, aspect: 2)).phase, .move)
        XCTAssertEqual(engine.update(frame(0.72, ratio: 0.28, aspect: 2)).phase, .down)
        XCTAssertEqual(engine.update(frame(0.80, ratio: 0.45, aspect: 2)).phase, .held)
        XCTAssertEqual(engine.update(frame(0.88, ratio: 0.45, aspect: 2)).phase, .up)
    }

    func testOutOfOrderAndDuplicateFramesCancelWithoutMoving() {
        for stale in [0.5, 0.72] {
            let engine = GestureEngine()
            press(engine)
            let rejected = engine.update(frame(stale, ratio: 0.20))
            XCTAssertEqual(rejected.phase, .cancel)
            XCTAssertNil(rejected.point)
            XCTAssertFalse(rejected.ready)
            XCTAssertEqual(engine.update(frame(0.70)).phase, .warming)
            XCTAssertEqual(engine.update(frame(0.80)).phase, .warming)
        }
    }

    func testNonFiniteAndNegativeTimestampsAreRejected() {
        for bad in [Double.nan, Double.infinity, -1.0] {
            let engine = GestureEngine()
            arm(engine)
            XCTAssertEqual(engine.update(frame(bad)).phase, .cancel)
            XCTAssertFalse(engine.update(frame(0.6)).ready)
        }
    }

    func testLongFrameGapCannotCompleteArmingOrKeepButtonHeld() {
        let cold = GestureEngine()
        _ = cold.update(frame(0.0))
        XCTAssertEqual(cold.update(frame(0.501)).phase, .cancel)
        XCTAssertFalse(cold.update(frame(0.601)).ready)
        let pressed = GestureEngine()
        press(pressed)
        XCTAssertEqual(pressed.update(frame(1.071, ratio: 0.20)).phase, .cancel)
    }

    func testLargeWristJumpCancelsInsteadOfTeleportingCursor() {
        let engine = GestureEngine()
        press(engine)
        let output = engine.update(frame(0.8, ratio: 0.20, wrist: Point2D(x: 0.86, y: 0.75)))
        XCTAssertEqual(output.phase, .cancel)
        XCTAssertNil(output.point)
        XCTAssertFalse(output.ready)
    }

    func testSmoothingReducesJitterWithoutMirroringInputAgain() throws {
        let engine = GestureEngine()
        arm(engine)
        let point = try XCTUnwrap(engine.update(frame(0.516, index: Point2D(x: 0.52, y: 0.27))).point)
        XCTAssertGreaterThan(point.x, 0.50)
        XCTAssertLessThan(point.x, 0.52)
        XCTAssertGreaterThan(point.y, 0.25)
        XCTAssertLessThan(point.y, 0.27)
        let stable = GestureEngine()
        let observed = stable.update(frame(0.0, index: Point2D(x: 0.30, y: 0.25)))
        XCTAssertEqual(observed.point, Point2D(x: 0.30, y: 0.25))
    }

    func testLossClearsSmoothingHistoryInsteadOfSweepingAcrossScreen() {
        let engine = GestureEngine()
        arm(engine)
        _ = engine.update(nil)
        let reacquired = engine.update(frame(0.7, index: Point2D(x: 0.20, y: 0.25)))
        XCTAssertEqual(reacquired.point, Point2D(x: 0.20, y: 0.25))
        XCTAssertEqual(reacquired.phase, .warming)
        XCTAssertFalse(reacquired.ready)
    }

    func testResetClearsPressedStateAndPermitsANewTimestampEpoch() {
        let engine = GestureEngine()
        press(engine)
        engine.reset()
        XCTAssertEqual(engine.update(nil).phase, .warming)
        XCTAssertFalse(engine.update(frame(0.0, ratio: 0.20)).ready)
        engine.reset()
        arm(engine)
        XCTAssertEqual(engine.update(frame(0.6)).phase, .move)
    }

    func testReadyMeansGestureReadinessNotAnOSPermissionGrant() {
        let output = arm(GestureEngine())
        XCTAssertTrue(output.ready)
        XCTAssertEqual(output.phase, .move)
        // The core cannot import a camera, acquire Accessibility permission,
        // post mouse events, or arm the independent OS-input safety gate.
        XCTAssertNotNil(output.point)
    }
}
