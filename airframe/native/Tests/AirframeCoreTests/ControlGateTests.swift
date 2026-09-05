import XCTest
@testable import AirframeCore

final class ControlGateTests: XCTestCase {
    private let point = Point2D(x: 0.4, y: 0.6)
    private func output(_ phase: GesturePhase = .move, ready: Bool = true) -> GestureOutput {
        GestureOutput(point: point, phase: phase, ready: ready)
    }
    private func active(_ mode: ControlMode = .pointerOnly) -> ControlGate {
        let gate = ControlGate()
        XCTAssertTrue(gate.arm(now: 0, mode: mode, authorized: true))
        for time in stride(from: 0.1, through: 3.1, by: 0.5) {
            _ = gate.accept(output(), capturedAt: time, now: time, authorized: true)
        }
        XCTAssertEqual(gate.state, .active)
        return gate
    }
    func testNeverEmitsBeforeExplicitArm() {
        let gate = ControlGate()
        XCTAssertEqual(gate.accept(output(.down), capturedAt: 1, now: 1, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }
    func testRefusesMissingPermission() {
        XCTAssertFalse(ControlGate().arm(now: 0, mode: .clickAndDrag, authorized: false))
    }
    func testRefusesInvalidStartTime() {
        XCTAssertFalse(ControlGate().arm(now: .nan, mode: .pointerOnly, authorized: true))
    }
    func testCountdownEmitsNothing() {
        let gate = ControlGate(); gate.arm(now: 0, mode: .clickAndDrag, authorized: true)
        for time in [0.5, 1.0, 1.5] { _ = gate.accept(output(.down), capturedAt: time, now: time, authorized: true) }
        XCTAssertEqual(gate.accept(output(.down), capturedAt: 2, now: 2, authorized: true), [])
        XCTAssertEqual(gate.state, .countdown)
    }
    func testNeedsOpenHandAfterCountdown() {
        let gate = ControlGate(); gate.arm(now: 0, mode: .clickAndDrag, authorized: true)
        for time in [0.5, 1.0, 1.5, 2.0, 2.5] { _ = gate.accept(output(.held), capturedAt: time, now: time, authorized: true) }
        XCTAssertEqual(gate.accept(output(.held), capturedAt: 3, now: 3, authorized: true), [])
        XCTAssertEqual(gate.state, .waitingForHand)
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.1, now: 3.1, authorized: true), [.move(point, dragging: false)])
    }
    func testPointerOnlyNeverClicks() {
        let gate = active()
        for (offset, phase) in [GesturePhase.down, .held, .up].enumerated() {
            let time = 3.2 + Double(offset) * 0.1
            XCTAssertEqual(gate.accept(output(phase), capturedAt: time, now: time, authorized: true), [.move(point, dragging: false)])
        }
        XCTAssertFalse(gate.buttonHeld)
    }
    func testExplicitClickModePostsOneDownAndOneUp() {
        let gate = active(.clickAndDrag)
        XCTAssertEqual(gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true), [.move(point, dragging: false), .down(point)])
        XCTAssertEqual(gate.accept(output(.held), capturedAt: 3.3, now: 3.3, authorized: true), [.move(point, dragging: true)])
        XCTAssertEqual(gate.accept(output(.up), capturedAt: 3.4, now: 3.4, authorized: true), [.up(point), .move(point, dragging: false)])
        XCTAssertFalse(gate.buttonHeld)
    }
    func testRepeatedDownDoesNotPressTwice() {
        let gate = active(.clickAndDrag)
        _ = gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.accept(output(.down), capturedAt: 3.3, now: 3.3, authorized: true), [.move(point, dragging: true)])
    }
    func testStopReleasesOnlyOnceAndCannotResume() {
        let gate = active(.clickAndDrag)
        _ = gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.stop("Escape"), [.up(point)])
        XCTAssertEqual(gate.stop("Repeated stop"), [])
        XCTAssertEqual(gate.accept(output(.down), capturedAt: 4, now: 4, authorized: true), [])
    }
    func testHandLossReleasesAndDisarms() {
        let gate = active(.clickAndDrag)
        _ = gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true), [.up(point)])
        XCTAssertEqual(gate.state, .off)
    }
    func testPermissionRevocationReleasesAndDisarms() {
        let gate = active(.clickAndDrag)
        _ = gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.tick(now: 3.3, authorized: false), [.up(point)])
        XCTAssertEqual(gate.state, .off)
    }
    func testWatchdogReleasesWhenCameraStalls() {
        let gate = active(.clickAndDrag)
        _ = gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.tick(now: 3.9, authorized: true), [.up(point)])
        XCTAssertEqual(gate.state, .off)
    }
    func testDelayedFrameDisarms() {
        let gate = active()
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.2, now: 3.6, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }
    func testDuplicateFrameDisarms() {
        let gate = active()
        _ = gate.accept(output(), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.2, now: 3.3, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }
    func testInvalidPointerDisarms() {
        let gate = active()
        let bad = GestureOutput(point: Point2D(x: .nan, y: 0.4), phase: .move, ready: true)
        XCTAssertEqual(gate.accept(bad, capturedAt: 3.2, now: 3.2, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }
    func testNoHandSetupHasBoundedTime() {
        let gate = ControlGate(); gate.arm(now: 0, mode: .pointerOnly, authorized: true)
        for time in stride(from: 0.5, through: 14.5, by: 0.5) {
            _ = gate.noHand(capturedAt: time, now: time, authorized: true)
        }
        XCTAssertEqual(gate.state, .waitingForHand)
        XCTAssertEqual(gate.noHand(capturedAt: 15, now: 15, authorized: true), [])
        XCTAssertEqual(gate.accept(output(), capturedAt: 15.1, now: 15.1, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }
    func testCancelNeverRegrabs() {
        let gate = active(.clickAndDrag)
        _ = gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.accept(GestureOutput(point: nil, phase: .cancel, ready: false), capturedAt: 3.3, now: 3.3, authorized: true), [.up(point)])
        XCTAssertEqual(gate.state, .off)
    }

    private func recovering() -> ControlGate {
        let gate = active()
        XCTAssertEqual(gate.noHand(capturedAt: 3.2, now: 3.2, authorized: true), [])
        XCTAssertEqual(gate.state, .recoveringHand)
        return gate
    }

    func testPointerLossFreezesWithoutMovementOrButtonEvents() {
        let gate = recovering()
        XCTAssertFalse(gate.buttonHeld)
        XCTAssertEqual(gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true), [])
        XCTAssertEqual(gate.accept(output(.warming, ready: false), capturedAt: 3.4, now: 3.4, authorized: true), [])
        XCTAssertEqual(gate.state, .recoveringHand)
    }

    func testReadyMoveCannotResumeBeforeFiveHundredMilliseconds() {
        let gate = recovering()
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.699, now: 3.699, authorized: true), [])
        XCTAssertEqual(gate.state, .recoveringHand)
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.7, now: 3.7, authorized: true), [.move(point, dragging: false)])
        XCTAssertEqual(gate.state, .active)
    }

    func testPinchedAndHeldOutputsNeverResumeOrEmitClicks() {
        for phase in [GesturePhase.down, .held, .up, .warming] {
            let gate = recovering()
            XCTAssertEqual(gate.accept(output(phase, ready: phase != .warming), capturedAt: 3.8, now: 3.8, authorized: true), [])
            XCTAssertEqual(gate.state, .recoveringHand)
            XCTAssertFalse(gate.buttonHeld)
        }
    }

    func testRepeatedMissesDoNotExtendFixedRecoveryDeadline() {
        let gate = recovering() // Deadline is exactly 4.45.
        for time in [3.5, 3.8, 4.1, 4.4] {
            XCTAssertEqual(gate.noHand(capturedAt: time, now: time, authorized: true), [])
            XCTAssertEqual(gate.state, .recoveringHand)
        }
        XCTAssertEqual(gate.noHand(capturedAt: 4.45, now: 4.45, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
        XCTAssertEqual(gate.accept(output(), capturedAt: 4.46, now: 4.46, authorized: true), [])
    }

    func testLateValidFrameCannotResumeBeforeTimerTickRuns() {
        for finalTime in [4.45, 4.46] {
            let gate = recovering()
            for time in [3.5, 3.8, 4.1, 4.4] { _ = gate.noHand(capturedAt: time, now: time, authorized: true) }
            XCTAssertEqual(gate.accept(output(), capturedAt: finalTime, now: finalTime, authorized: true), [])
            XCTAssertEqual(gate.state, .off)
        }
    }

    func testTickExpiresRecoveryAtExactDeadline() {
        let gate = recovering()
        for time in [3.5, 3.8, 4.1, 4.4] { _ = gate.noHand(capturedAt: time, now: time, authorized: true) }
        XCTAssertEqual(gate.tick(now: 4.45, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }

    func testDeadlineUsesCaptureTimeNotDelayedDeliveryTime() {
        let gate = active()
        _ = gate.noHand(capturedAt: 3.2, now: 3.4, authorized: true)
        for time in [3.6, 3.9, 4.2] { _ = gate.noHand(capturedAt: time, now: time, authorized: true) }
        _ = gate.accept(output(), capturedAt: 4.45, now: 4.45, authorized: true)
        XCTAssertEqual(gate.state, .off)
    }

    func testFarHandStaysFrozenUntilDeadlineAndDoesNotMoveResumeAnchor() {
        let gate = recovering()
        let far = GestureOutput(point: Point2D(x: 0.8, y: 0.9), phase: .move, ready: true)
        XCTAssertEqual(gate.accept(far, capturedAt: 3.8, now: 3.8, authorized: true), [])
        XCTAssertEqual(gate.state, .recoveringHand)
        let near = GestureOutput(point: Point2D(x: 0.55, y: 0.6), phase: .move, ready: true)
        XCTAssertEqual(gate.accept(near, capturedAt: 3.9, now: 3.9, authorized: true), [.move(Point2D(x: 0.55, y: 0.6), dragging: false)])
    }

    func testProximityUsesEuclideanDistanceAndInclusiveBoundary() {
        let outside = recovering()
        let diagonal = GestureOutput(point: Point2D(x: 0.55, y: 0.75), phase: .move, ready: true)
        XCTAssertEqual(outside.accept(diagonal, capturedAt: 3.8, now: 3.8, authorized: true), [])
        XCTAssertEqual(outside.state, .recoveringHand)
        let boundary = recovering()
        let edge = GestureOutput(point: Point2D(x: 0.6, y: 0.6), phase: .move, ready: true)
        XCTAssertEqual(boundary.accept(edge, capturedAt: 3.8, now: 3.8, authorized: true), [.move(Point2D(x: 0.6, y: 0.6), dragging: false)])
    }

    func testMissingObservationsShareTimestampHighWaterMark() {
        let gate = recovering()
        _ = gate.noHand(capturedAt: 3.4, now: 3.4, authorized: true)
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.3, now: 3.5, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }

    func testMissingObservationValidityMatchesDetectedFrames() {
        for (capture, time, permitted) in [(3.2, 3.2, false), (3.1, 3.2, true), (3.5, 3.2, true),
                                            (3.15, 3.5, true), (Double.nan, 3.2, true), (3.2, Double.infinity, true)] {
            let gate = active()
            XCTAssertEqual(gate.noHand(capturedAt: capture, now: time, authorized: permitted), [])
            XCTAssertEqual(gate.state, .off)
        }
    }

    func testClockReversalAfterTickStopsRecovery() {
        let gate = recovering()
        _ = gate.tick(now: 3.4, authorized: true)
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.3, now: 3.3, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }

    func testFreshFrameCannotConcealStalledCameraBeforeWatchdogTick() {
        for missing in [true, false] {
            let gate = recovering()
            if missing { _ = gate.noHand(capturedAt: 3.851, now: 3.851, authorized: true) }
            else { _ = gate.accept(output(), capturedAt: 3.851, now: 3.851, authorized: true) }
            XCTAssertEqual(gate.state, .off)
        }
    }

    func testMalformedReadyOutputsAndCancellationHardStopRecovery() {
        let malformed = [GestureOutput(point: nil, phase: .move, ready: true),
                         GestureOutput(point: Point2D(x: .nan, y: 0.6), phase: .move, ready: true),
                         GestureOutput(point: Point2D(x: 1.1, y: 0.6), phase: .held, ready: true),
                         output(.warming, ready: true), output(.cancel, ready: false)]
        for observation in malformed {
            let gate = recovering()
            XCTAssertEqual(gate.accept(observation, capturedAt: 3.8, now: 3.8, authorized: true), [])
            XCTAssertEqual(gate.state, .off)
        }
    }

    func testRecoveryPermissionRevocationAndHardStopNeverRevive() {
        let revoked = recovering()
        _ = revoked.noHand(capturedAt: 3.3, now: 3.3, authorized: false)
        XCTAssertEqual(revoked.state, .off)
        for reason in ["Escape", "Physical mouse", "Keyboard", "Camera fault", "Display changed", "Mode changed"] {
            let gate = recovering()
            XCTAssertEqual(gate.stop(reason), [])
            XCTAssertEqual(gate.accept(output(), capturedAt: 3.8, now: 3.8, authorized: true), [])
            XCTAssertEqual(gate.noHand(capturedAt: 3.9, now: 3.9, authorized: true), [])
            XCTAssertEqual(gate.state, .off)
        }
    }

    func testCannotArmOrChangeModeDuringRecovery() {
        let gate = recovering()
        XCTAssertFalse(gate.arm(now: 3.3, mode: .clickAndDrag, authorized: true))
        XCTAssertEqual(gate.state, .recoveringHand)
        XCTAssertEqual(gate.accept(output(), capturedAt: 3.8, now: 3.8, authorized: true), [.move(point, dragging: false)])
        XCTAssertFalse(gate.buttonHeld)
    }

    private func hand(_ time: Double, pinched: Bool = false) -> HandFrame {
        HandFrame(timestamp: time, aspectRatio: 1, wrist: Point2D(x: 0.4, y: 0.8),
                  middleMCP: Point2D(x: 0.4, y: 0.55), indexTip: point,
                  thumbTip: Point2D(x: pinched ? 0.43 : 0.60, y: 0.6), confidence: 0.95)
    }

    func testIntegratedEngineRequiresNewUninterruptedOpenDwell() {
        let engine = GestureEngine(), gate = ControlGate()
        XCTAssertTrue(gate.arm(now: 0, mode: .pointerOnly, authorized: true))
        for step in 0...31 {
            let time = Double(step) / 10
            _ = gate.accept(engine.update(hand(time)), capturedAt: time, now: time, authorized: true)
        }
        XCTAssertEqual(gate.state, .active)
        _ = engine.update(nil); _ = gate.noHand(capturedAt: 3.2, now: 3.2, authorized: true)
        for time in [3.3, 3.4] {
            XCTAssertEqual(gate.accept(engine.update(hand(time, pinched: true)), capturedAt: time, now: time, authorized: true), [])
        }
        for time in [3.5, 3.6, 3.7] {
            XCTAssertEqual(gate.accept(engine.update(hand(time)), capturedAt: time, now: time, authorized: true), [])
        }
        _ = engine.update(nil); _ = gate.noHand(capturedAt: 3.75, now: 3.75, authorized: true)
        for time in [3.8, 3.9, 4.0, 4.1, 4.2, 4.299] {
            XCTAssertEqual(gate.accept(engine.update(hand(time)), capturedAt: time, now: time, authorized: true), [])
            XCTAssertEqual(gate.state, .recoveringHand)
        }
        XCTAssertEqual(gate.accept(engine.update(hand(4.3)), capturedAt: 4.3, now: 4.3, authorized: true), [.move(point, dragging: false)])
        XCTAssertEqual(gate.state, .active)
    }
}
