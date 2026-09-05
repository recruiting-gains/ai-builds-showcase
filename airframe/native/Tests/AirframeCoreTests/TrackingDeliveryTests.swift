import XCTest
@testable import AirframeCore

final class TrackingDeliveryTests: XCTestCase {
    private func frame(_ timestamp: Double) -> HandFrame {
        HandFrame(timestamp: timestamp, aspectRatio: 4.0 / 3.0,
                  wrist: Point2D(x: 0.5, y: 0.75), middleMCP: Point2D(x: 0.5, y: 0.5),
                  indexTip: Point2D(x: 0.5, y: 0.25), thumbTip: Point2D(x: 0.7, y: 0.25), confidence: 0.95)
    }

    private func assertFault(_ delivery: TrackingDelivery, file: StaticString = #filePath, line: UInt = #line) {
        guard case .fault = delivery else {
            XCTFail("Unsafe delivery remained an observation", file: file, line: line)
            return
        }
    }

    func testFreshPresentAndMissingObservationsRetainTheirTimestamp() {
        for hand in [frame(1), nil] {
            let delivery = TrackingDelivery.observation(hand, capturedAt: 1)
            XCTAssertEqual(delivery.validated(at: 1), delivery)
            XCTAssertEqual(delivery.validated(at: 1.1), delivery)
        }
    }

    func testExactlyTwoHundredMillisecondsIsAcceptedButNextRepresentableTimeIsNot() {
        for hand in [frame(0), nil] {
            let delivery = TrackingDelivery.observation(hand, capturedAt: 0)
            XCTAssertEqual(delivery.validated(at: 0.2), delivery)
            assertFault(delivery.validated(at: Double(0.2).nextUp))
        }
    }

    func testInvalidCaptureTimesFailForPresentAndMissingHands() {
        for timestamp in [Double.nan, .infinity, -.infinity, -0.01] {
            for hand in [frame(timestamp), nil] {
                assertFault(TrackingDelivery.observation(hand, capturedAt: timestamp).validated(at: 1))
            }
        }
    }

    func testInvalidNowAndFutureCaptureTimesFailForPresentAndMissingHands() {
        for hand in [frame(1), nil] {
            let delivery = TrackingDelivery.observation(hand, capturedAt: 1)
            for now in [Double.nan, .infinity, -.infinity, -1, 0.999] {
                assertFault(delivery.validated(at: now))
            }
        }
    }

    func testFrameTimestampCannotBeLaunderedByFreshEnvelope() {
        for timestamp in [0.5, 1.1, Double.nan, .infinity] {
            assertFault(TrackingDelivery.observation(frame(timestamp), capturedAt: 1).validated(at: 1.01))
        }
    }

    func testPendingDeliveryMustBeRevalidatedAfterUIQueueDelay() {
        for hand in [frame(1), nil] {
            let pending = TrackingDelivery.observation(hand, capturedAt: 1).validated(at: 1.05)
            assertFault(pending.validated(at: 1.201))
        }
    }

    func testFirstPendingFaultCannotBeOverwrittenByGoodMissingOrAnotherFault() {
        let fault = TrackingDelivery.fault("first failure")
        let incoming: [TrackingDelivery] = [.observation(frame(2), capturedAt: 2),
                                            .observation(nil, capturedAt: 2), .fault("later failure")]
        for delivery in incoming {
            XCTAssertEqual(TrackingDelivery.coalesce(pending: fault, incoming: delivery), fault)
        }
        XCTAssertEqual(fault.validated(at: .nan), fault)
    }

    func testLatestHandReplacesAnOlderHandButCannotHidePendingHandLoss() {
        let old = TrackingDelivery.observation(frame(1), capturedAt: 1)
        let fresh = TrackingDelivery.observation(frame(1.1), capturedAt: 1.1)
        let missing = TrackingDelivery.observation(nil, capturedAt: 1.2)
        let fault = TrackingDelivery.fault("inference failed")
        XCTAssertEqual(TrackingDelivery.coalesce(pending: nil, incoming: fresh), fresh)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: old, incoming: fresh), fresh)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: fresh, incoming: missing), missing)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: missing, incoming: fresh), missing)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: old, incoming: fault), fault)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: missing, incoming: fault), fault)
    }

    func testRepeatedMissingFramesPreserveOriginalLossTimestamp() {
        let first = TrackingDelivery.observation(nil, capturedAt: 1)
        let later = TrackingDelivery.observation(nil, capturedAt: 1.1)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: first, incoming: later), first)
    }

    func testPendingMissingFrameCannotBeHiddenWhileClickIsHeld() {
        let gate = ControlGate()
        XCTAssertTrue(gate.arm(now: 0, mode: .clickAndDrag, authorized: true))
        let point = Point2D(x: 0.5, y: 0.5)
        let moving = GestureOutput(point: point, phase: .move, ready: true)
        for step in 1...31 {
            let now = Double(step) * 0.1
            _ = gate.accept(moving, capturedAt: now, now: now, authorized: true)
        }
        _ = gate.accept(GestureOutput(point: point, phase: .down, ready: true), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertTrue(gate.buttonHeld)
        let pending = TrackingDelivery.observation(nil, capturedAt: 3.3)
        let good = TrackingDelivery.observation(frame(3.35), capturedAt: 3.35)
        let delivered = TrackingDelivery.coalesce(pending: pending, incoming: good).validated(at: 3.36)
        guard case let .observation(hand, capturedAt) = delivered else {
            XCTFail("Fresh missing detection unexpectedly changed into a fault")
            return
        }
        XCTAssertNil(hand)
        XCTAssertEqual(capturedAt, 3.3)
        XCTAssertEqual(gate.noHand(capturedAt: capturedAt, now: 3.36, authorized: true), [.up(point)])
        XCTAssertEqual(gate.state, .off)
        XCTAssertFalse(gate.buttonHeld)
        XCTAssertEqual(gate.accept(moving, capturedAt: 3.4, now: 3.4, authorized: true), [])
    }

    func testStalePendingMissingDetectionWinsOverLaterFreshObservationAsFault() {
        let stale = TrackingDelivery.observation(nil, capturedAt: 1).validated(at: 1.3)
        let fresh = TrackingDelivery.observation(frame(1.3), capturedAt: 1.3)
        assertFault(TrackingDelivery.coalesce(pending: stale, incoming: fresh))
    }

    func testStaleMissingDetectionTakesHardStopPathNotRecoveryPath() {
        let gate = ControlGate()
        XCTAssertTrue(gate.arm(now: 0, mode: .pointerOnly, authorized: true))
        let output = GestureOutput(point: Point2D(x: 0.5, y: 0.5), phase: .move, ready: true)
        for step in 1...31 {
            let now = Double(step) * 0.1
            _ = gate.accept(output, capturedAt: now, now: now, authorized: true)
        }
        XCTAssertEqual(gate.state, .active)
        // Mirrors the callback contract, not real camera or AppKit execution.
        switch TrackingDelivery.observation(nil, capturedAt: 3.2).validated(at: 3.401) {
        case .fault(let message): XCTAssertEqual(gate.stop(message), [])
        case .observation:
            XCTFail("A stale nil frame would incorrectly enter pointer recovery")
        }
        XCTAssertEqual(gate.state, .off)
        XCTAssertEqual(gate.accept(output, capturedAt: 3.5, now: 3.5, authorized: true), [])
    }
}
