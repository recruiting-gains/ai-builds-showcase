import XCTest
@testable import AirframeCore

// Pure intent/indicator checks. These do not open a camera, request permission,
// or deliver events to macOS.
final class MenuBarControlTests: XCTestCase {
    private func pending(_ mode: ControlMode = .pointerOnly, at now: Double = 0) -> MenuBarStartRequest {
        var request = MenuBarStartRequest()
        request.begin(mode: mode, now: now, authorized: true)
        return request
    }

    private func indicator(state: ControlState = .active, pending: Bool = false,
                           requested: Bool = true, running: Bool = true,
                           authorized: Bool = true, hand: Double? = 1,
                           now: Double = 1) -> MenuBarIndicator {
        MenuBarIndicator.resolve(state: state, pending: pending, cameraRequested: requested,
                                 cameraRunning: running, authorized: authorized,
                                 lastHandAt: hand, now: now)
    }

    func testNoRequestMeansNoStartEvenWithFreshAuthorizedObservation() {
        var request = MenuBarStartRequest()
        XCTAssertFalse(request.isPending)
        XCTAssertNil(request.mode)
        XCTAssertFalse(request.validate(now: 1, authorized: true))
        XCTAssertNil(request.take(capturedAt: 1, now: 1, authorized: true))
    }

    func testExplicitStartKeepsTheSelectedModeAndIsConsumedExactlyOnce() {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            var request = pending(mode)
            XCTAssertTrue(request.isPending)
            XCTAssertEqual(request.mode, mode)
            XCTAssertEqual(request.take(capturedAt: 0.1, now: 0.1, authorized: true), mode)
            XCTAssertFalse(request.isPending)
            XCTAssertNil(request.mode)
            XCTAssertNil(request.take(capturedAt: 0.2, now: 0.2, authorized: true))
            XCTAssertFalse(request.validate(now: 0.3, authorized: true))
        }
    }

    func testFreshExplicitStartCanReplaceAnOlderPendingRequest() {
        var request = pending(.pointerOnly)
        request.begin(mode: .clickAndDrag, now: 1, authorized: true)
        XCTAssertNil(request.take(capturedAt: 0.95, now: 1.05, authorized: true))
        XCTAssertTrue(request.isPending)
        XCTAssertEqual(request.take(capturedAt: 1.1, now: 1.1, authorized: true), .clickAndDrag)
    }

    func testUnauthorizedStartCannotLeaveAnOldIntentPending() {
        var request = pending()
        request.begin(mode: .clickAndDrag, now: 1, authorized: false)
        XCTAssertFalse(request.isPending)
        XCTAssertNil(request.take(capturedAt: 1.1, now: 1.1, authorized: true))
    }

    func testInvalidStartClockCannotCreateOrPreserveIntent() {
        for now in [Double.nan, .infinity, -.infinity, -0.001] {
            var request = pending()
            request.begin(mode: .clickAndDrag, now: now, authorized: true)
            XCTAssertFalse(request.isPending)
            XCTAssertNil(request.mode)
            XCTAssertNil(request.take(capturedAt: 1, now: 1, authorized: true))
        }
    }

    func testPermissionRevocationCancelsAndLaterApprovalCannotReviveIntent() {
        var validated = pending()
        XCTAssertFalse(validated.validate(now: 0.1, authorized: false))
        XCTAssertFalse(validated.isPending)
        XCTAssertNil(validated.take(capturedAt: 0.2, now: 0.2, authorized: true))

        var taken = pending()
        XCTAssertNil(taken.take(capturedAt: 0.1, now: 0.1, authorized: false))
        XCTAssertFalse(taken.isPending)
        XCTAssertNil(taken.take(capturedAt: 0.2, now: 0.2, authorized: true))
    }

    func testInvalidValidationClocksCancelThePendingRequest() {
        for now in [Double.nan, .infinity, -.infinity, -0.1] {
            var request = pending()
            XCTAssertFalse(request.validate(now: now, authorized: true))
            XCTAssertFalse(request.isPending)
            XCTAssertNil(request.take(capturedAt: 1, now: 1, authorized: true))
        }
    }

    func testClockReversalAfterValidationCancelsButEqualClockIsAllowed() {
        var request = pending(at: 1)
        XCTAssertTrue(request.validate(now: 1.1, authorized: true))
        XCTAssertTrue(request.validate(now: 1.1, authorized: true))
        XCTAssertFalse(request.validate(now: 1.05, authorized: true))
        XCTAssertNil(request.take(capturedAt: 1.2, now: 1.2, authorized: true))
    }

    func testTakeCannotBypassClockHighWaterMark() {
        var request = pending(at: 1)
        XCTAssertTrue(request.validate(now: 1.2, authorized: true))
        XCTAssertNil(request.take(capturedAt: 1.1, now: 1.1, authorized: true))
        XCTAssertFalse(request.isPending)
    }

    func testTenSecondExpiryIsExactAndRepeatedValidationCannotExtendIt() {
        var request = pending()
        for now in [1.0, 5, 9, Double(10).nextDown] {
            XCTAssertTrue(request.validate(now: now, authorized: true))
        }
        XCTAssertFalse(request.validate(now: 10, authorized: true))
        XCTAssertFalse(request.isPending)
        XCTAssertNil(request.take(capturedAt: 10.1, now: 10.1, authorized: true))
    }

    func testFreshFrameAtExactTimeoutCannotConsumeExpiredIntent() {
        var request = pending()
        XCTAssertNil(request.take(capturedAt: 10, now: 10, authorized: true))
        XCTAssertFalse(request.isPending)
    }

    func testFreshFrameJustBeforeTimeoutCanConsumeIntent() {
        var request = pending(.clickAndDrag)
        let now = Double(10).nextDown
        XCTAssertEqual(request.take(capturedAt: now, now: now, authorized: true), .clickAndDrag)
    }

    func testFreshPreRequestFrameIsIgnoredWithoutLosingExplicitIntent() {
        var request = pending(at: 1)
        XCTAssertNil(request.take(capturedAt: 0.99, now: 1.05, authorized: true))
        XCTAssertTrue(request.isPending)
        XCTAssertEqual(request.mode, .pointerOnly)
        XCTAssertEqual(request.take(capturedAt: 1.1, now: 1.1, authorized: true), .pointerOnly)
    }

    func testFrameAtRequestTimeAndExactFreshnessBoundaryIsAccepted() {
        var request = pending()
        XCTAssertEqual(request.take(capturedAt: 0, now: 0.2, authorized: true), .pointerOnly)
    }

    func testStaleFutureAndInvalidCaptureTimesCancelInsteadOfWaiting() {
        for (capture, now) in [(0.0, Double(0.2).nextUp), (1.1, 1.0),
                               (Double.nan, 0.1), (Double.infinity, 0.1),
                               (-Double.infinity, 0.1), (-0.01, 0.1)] {
            var request = pending()
            XCTAssertNil(request.take(capturedAt: capture, now: now, authorized: true))
            XCTAssertFalse(request.isPending, "Invalid capture must cancel, not merely be ignored")
            XCTAssertNil(request.take(capturedAt: 2, now: 2, authorized: true))
        }
    }

    func testCancelIsIdempotentAndLateCallbacksCannotReviveIntent() {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            var request = pending(mode)
            request.cancel()
            request.cancel()
            XCTAssertFalse(request.isPending)
            XCTAssertFalse(request.validate(now: 0.1, authorized: true))
            XCTAssertNil(request.take(capturedAt: 0.2, now: 0.2, authorized: true))
            XCTAssertNil(request.take(capturedAt: 0.3, now: 0.3, authorized: true))
            request.begin(mode: mode, now: 1, authorized: true)
            XCTAssertEqual(request.take(capturedAt: 1, now: 1, authorized: true), mode)
        }
    }

    func testCameraOffNeverDisplaysGreenInAnyControlState() {
        for state in [ControlState.off, .countdown, .waitingForHand, .active, .recoveringHand] {
            for pending in [false, true] {
                XCTAssertEqual(indicator(state: state, pending: pending, requested: false, running: false), .off)
                XCTAssertNotEqual(indicator(state: state, pending: pending, requested: true, running: false), .tracking)
            }
        }
    }

    func testPreviewAndUntrustedActiveStateNeverDisplayGreen() {
        XCTAssertEqual(indicator(state: .off), .cameraOnly)
        XCTAssertEqual(indicator(authorized: false), .cameraOnly)
        XCTAssertEqual(indicator(running: false), .cameraOnly)
    }

    func testStartingWaitingAndRecoveryIndicatorsNeverDisplayGreen() {
        XCTAssertEqual(indicator(state: .countdown), .starting)
        XCTAssertEqual(indicator(state: .waitingForHand), .waiting)
        XCTAssertEqual(indicator(state: .recoveringHand), .holding)
        for state in [ControlState.off, .countdown, .waitingForHand, .active, .recoveringHand] {
            XCTAssertEqual(indicator(state: state, pending: true), .starting)
        }
    }

    func testGreenRequiresFreshFiniteNonnegativeHandAndCurrentTime() {
        for hand: Double? in [nil, .nan, .infinity, -.infinity, -0.1, 1.1, 0.7] {
            XCTAssertEqual(indicator(hand: hand, now: 1), .holding)
        }
        for now in [Double.nan, .infinity, -.infinity, -0.1, 0.9] {
            XCTAssertEqual(indicator(hand: 1, now: now), .holding)
        }
        XCTAssertEqual(indicator(hand: -0.1, now: -0.1), .holding)
    }

    func testTrackingAgeBoundaryIsExactAndDoesNotBecomeGreenFromCameraAlone() {
        XCTAssertEqual(indicator(hand: 0, now: 0), .tracking)
        XCTAssertEqual(indicator(hand: 0, now: 0.2), .tracking)
        XCTAssertEqual(indicator(hand: 0, now: Double(0.2).nextUp), .holding)
        XCTAssertEqual(indicator(state: .off, hand: 0, now: 0.1), .cameraOnly)
    }

    func testBothModesBecomeGreenOnlyAfterGateIsActive() {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            let gate = ControlGate()
            XCTAssertTrue(gate.arm(now: 0, mode: mode, authorized: true))
            XCTAssertEqual(indicator(state: gate.state, hand: 0, now: 0), .starting)
            let output = GestureOutput(point: Point2D(x: 0.5, y: 0.5), phase: .move, ready: true)
            for step in 1...31 {
                let now = Double(step) / 10
                _ = gate.accept(output, capturedAt: now, now: now, authorized: true)
            }
            XCTAssertEqual(gate.state, .active)
            XCTAssertEqual(indicator(state: gate.state, hand: 3.1, now: 3.1), .tracking)
            _ = gate.stop("User stop")
            XCTAssertEqual(indicator(state: gate.state, hand: 3.1, now: 3.1), .cameraOnly)
        }
    }

    func testEveryIndicatorHasADistinctAccessibleMeaningAndOnlyTrackingSaysLive() {
        let states: [MenuBarIndicator] = [.off, .cameraOnly, .starting, .waiting, .holding, .tracking]
        XCTAssertEqual(Set(states.map(\.description)).count, states.count)
        for state in states {
            XCTAssertFalse(state.description.isEmpty)
            XCTAssertFalse(state.shortLabel.isEmpty)
            XCTAssertEqual(state.shortLabel == "LIVE", state == .tracking)
        }
        XCTAssertEqual(MenuBarIndicator.off.shortLabel, "OFF")
        XCTAssertEqual(MenuBarIndicator.cameraOnly.shortLabel, "CAM")
        XCTAssertEqual(MenuBarIndicator.holding.shortLabel, "HOLD")
    }
}
