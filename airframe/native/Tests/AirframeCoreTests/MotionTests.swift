import Foundation
import XCTest
@testable import AirframeCore

final class MotionTests: XCTestCase {
    private let point = Point2D(x: 0.5, y: 0.25)
    private func frame(_ time: Double, ratio: Double = 0.7,
                       index: Point2D = Point2D(x: 0.5, y: 0.25),
                       wrist: Point2D = Point2D(x: 0.5, y: 0.75)) -> HandFrame {
        HandFrame(timestamp: time, aspectRatio: 4 / 3, wrist: wrist,
            middleMCP: Point2D(x: wrist.x, y: wrist.y - 0.25), indexTip: index,
            thumbTip: Point2D(x: index.x + ratio * 0.25 / (4 / 3), y: index.y), confidence: 0.95)
    }
    private func partial(_ time: Double, confidence: Double = 0.9,
                         point: Point2D = Point2D(x: 0.5, y: 0.25)) -> PinchUncertainFrame {
        PinchUncertainFrame(timestamp: time, aspectRatio: 4 / 3, wrist: Point2D(x: 0.5, y: 0.75),
            middleMCP: Point2D(x: 0.5, y: 0.5), indexTip: point, confidence: confidence)
    }
    private func arm(_ engine: GestureEngine) {
        for step in 0...5 { _ = engine.update(frame(Double(step) / 10)) }
    }
    private func activeGate() -> ControlGate {
        let gate = ControlGate()
        XCTAssertTrue(gate.arm(now: 0, mode: .clickAndDrag, authorized: true))
        for step in 1...31 {
            let time = Double(step) / 10
            _ = gate.accept(GestureOutput(point: point, phase: .move, ready: true), capturedAt: time, now: time, authorized: true)
        }
        XCTAssertEqual(gate.state, .active)
        return gate
    }

    func testNominalAndJitteredThirtyFPSAreNotHalved() {
        for jitter in [0.0, 0.0004] {
            var clock = InferenceCadence()
            let count = (0...300).filter { clock.shouldProcess(at: Double($0) / 30 + ($0 % 2 == 1 ? jitter : 0)) }.count
            XCTAssertEqual(count, 301)
        }
    }
    func testCadenceSupportsSlowerSourcesAndCapsFasterSources() {
        for fps in [24, 60, 120] {
            var clock = InferenceCadence()
            let count = (0...(fps * 10)).filter { clock.shouldProcess(at: Double($0) / Double(fps)) }.count
            XCTAssertLessThanOrEqual(abs(count - (min(fps, 30) * 10 + 1)), 1)
        }
    }
    func testCadenceDoesNotCatchUpOrAcceptReversedTimes() {
        var clock = InferenceCadence()
        XCTAssertTrue(clock.shouldProcess(at: 0))
        XCTAssertTrue(clock.shouldProcess(at: 1))
        XCTAssertFalse(clock.shouldProcess(at: 1.0001))
        for time in [Double.nan, Double.infinity, -1, 1, 0.5] { XCTAssertFalse(clock.shouldProcess(at: time)) }
        clock.reset()
        XCTAssertTrue(clock.shouldProcess(at: 0))
        XCTAssertTrue(clock.shouldProcess(at: 0.066))
        XCTAssertFalse(clock.shouldProcess(at: 0.0661))
    }
    func testAdaptiveFilterIsResponsiveForMovementAndStableForFineAiming() throws {
        let dt = 1.0 / 30
        let fast = GestureEngine(); arm(fast)
        let fastX = try XCTUnwrap(fast.update(frame(0.5 + dt, index: Point2D(x: 0.6, y: 0.25))).point).x
        XCTAssertGreaterThan(fastX, 0.5 + 0.1 * (1 - exp(-dt / 0.045)))
        XCTAssertLessThan(fastX, 0.6)
        let slow = GestureEngine(); arm(slow)
        let slowX = try XCTUnwrap(slow.update(frame(0.5 + dt, index: Point2D(x: 0.501, y: 0.25))).point).x
        XCTAssertGreaterThan(slowX, 0.5)
        XCTAssertLessThan(slowX, 0.5 + 0.001 * (1 - exp(-dt / 0.045)))
    }
    func testPinchUsesPalmTranslationNotFingertipCurl() throws {
        let engine = GestureEngine(); arm(engine)
        XCTAssertEqual(engine.update(frame(0.6, ratio: 0.2, index: Point2D(x: 0.5, y: 0.35))).point, point)
        let down = engine.update(frame(0.72, ratio: 0.2, index: Point2D(x: 0.5, y: 0.45)))
        XCTAssertEqual(down.phase, .down)
        XCTAssertEqual(down.point, point)
        let drag = engine.update(frame(0.8, ratio: 0.2, index: Point2D(x: 0.53, y: 0.44), wrist: Point2D(x: 0.53, y: 0.75)))
        XCTAssertEqual(drag.phase, .held)
        XCTAssertGreaterThan(try XCTUnwrap(drag.point).x, 0.5)
        XCTAssertLessThan(try XCTUnwrap(drag.point).x, 0.53)
    }
    func testReleaseKeepsItsTargetAndEasesBackToFingertip() throws {
        let engine = GestureEngine(); arm(engine)
        _ = engine.update(frame(0.6, ratio: 0.2, index: Point2D(x: 0.5, y: 0.35)))
        _ = engine.update(frame(0.72, ratio: 0.2, index: Point2D(x: 0.5, y: 0.35)))
        _ = engine.update(frame(0.8, index: Point2D(x: 0.5, y: 0.35)))
        let released = engine.update(frame(0.88, index: Point2D(x: 0.5, y: 0.35)))
        XCTAssertEqual(released.phase, .up)
        XCTAssertEqual(released.point, point)
        let resumed = try XCTUnwrap(engine.update(frame(0.896, index: Point2D(x: 0.5, y: 0.35))).point)
        XCTAssertGreaterThan(resumed.y, 0.25)
        XCTAssertLessThan(resumed.y, 0.27)
        _ = engine.update(nil)
        let reacquired = engine.update(frame(1, index: Point2D(x: 0.3, y: 0.25)))
        XCTAssertFalse(reacquired.ready)
        XCTAssertEqual(reacquired.point, Point2D(x: 0.3, y: 0.25))
    }
    func testReliableThumbOcclusionFreezesAndCannotAcceptReturningPinch() {
        let gate = activeGate()
        XCTAssertEqual(gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true), [])
        XCTAssertEqual(gate.state, .recoveringPinch)
        XCTAssertEqual(MenuBarIndicator.resolve(state: gate.state, pending: false, cameraRequested: true,
            cameraRunning: true, authorized: true, lastHandAt: 3.2, now: 3.2), .holding)
        for (step, phase) in [GesturePhase.down, .held, .up].enumerated() {
            let time = 3.3 + Double(step) / 10
            XCTAssertEqual(gate.accept(GestureOutput(point: point, phase: phase, ready: true), capturedAt: time, now: time, authorized: true), [])
            XCTAssertEqual(gate.state, .recoveringPinch)
        }
        XCTAssertFalse(gate.arm(now: 3.6, mode: .clickAndDrag, authorized: true))
    }
    func testThumbOcclusionWhileDraggingHardStopsAndReleasesOnce() {
        let gate = activeGate()
        _ = gate.accept(GestureOutput(point: point, phase: .down, ready: true), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.pinchUncertain(partial(3.3), capturedAt: 3.3, now: 3.3, authorized: true), [.up(point)])
        XCTAssertEqual(gate.state, .off)
        XCTAssertEqual(gate.pinchUncertain(partial(3.4), capturedAt: 3.4, now: 3.4, authorized: true), [])
    }
    func testMissingWeakDistantOrMalformedHandCannotPreserveClickMode() {
        let lost = activeGate()
        _ = lost.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(lost.noHand(capturedAt: 3.3, now: 3.3, authorized: true), [])
        XCTAssertEqual(lost.state, .off)
        for uncertain in [partial(3.2, confidence: 0.6999), partial(3.2, confidence: .nan),
                          partial(3.2, point: Point2D(x: 0.9, y: 0.25)), partial(3.2, point: Point2D(x: .nan, y: 0.25))] {
            let gate = activeGate()
            XCTAssertEqual(gate.pinchUncertain(uncertain, capturedAt: 3.2, now: 3.2, authorized: true), [])
            XCTAssertEqual(gate.state, .off)
        }
    }
    func testThumbHoldDeadlineDoesNotExtendOrResumeAfterExpiry() {
        let gate = activeGate()
        for time in [3.2, 3.6, 4.0, 4.4, 4.45] { _ = gate.pinchUncertain(partial(time), capturedAt: time, now: time, authorized: true) }
        XCTAssertEqual(gate.state, .off)
        XCTAssertEqual(gate.accept(GestureOutput(point: point, phase: .move, ready: true), capturedAt: 4.5, now: 4.5, authorized: true), [])
    }
    func testFreshOpenDwellThenNewPinchIsRequiredAfterOcclusion() {
        let gate = ControlGate(), engine = GestureEngine()
        XCTAssertTrue(gate.arm(now: 0, mode: .clickAndDrag, authorized: true))
        for step in 0...31 {
            let time = Double(step) / 10
            _ = gate.accept(engine.update(frame(time)), capturedAt: time, now: time, authorized: true)
        }
        _ = engine.update(nil)
        _ = gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
        for time in [3.3, 3.4] { XCTAssertEqual(gate.accept(engine.update(frame(time, ratio: 0.2)), capturedAt: time, now: time, authorized: true), []) }
        for time in [3.5, 3.6, 3.7, 3.8, 3.999] { XCTAssertEqual(gate.accept(engine.update(frame(time)), capturedAt: time, now: time, authorized: true), []) }
        XCTAssertEqual(gate.accept(engine.update(frame(4)), capturedAt: 4, now: 4, authorized: true), [.move(point, dragging: false)])
        XCTAssertEqual(gate.accept(engine.update(frame(4.1, ratio: 0.2)), capturedAt: 4.1, now: 4.1, authorized: true), [.move(point, dragging: false)])
        XCTAssertEqual(gate.accept(engine.update(frame(4.22, ratio: 0.2)), capturedAt: 4.22, now: 4.22, authorized: true), [.move(point, dragging: false), .down(point)])
    }
    func testUncertainDeliveryRetainsSafetyPriorityAndFreshness() {
        let uncertain = TrackingDelivery.pinchUncertain(partial(10), capturedAt: 10)
        let good = TrackingDelivery.observation(frame(10.05), capturedAt: 10.05)
        let lost = TrackingDelivery.observation(nil, capturedAt: 10.1)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: uncertain, incoming: good), uncertain)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: uncertain, incoming: lost), lost)
        XCTAssertEqual(TrackingDelivery.coalesce(pending: lost, incoming: uncertain), lost)
        guard case .fault = uncertain.validated(at: 10.201) else { return XCTFail("Stale partial hand accepted") }
        guard case .fault = TrackingDelivery.pinchUncertain(partial(10), capturedAt: 10.01).validated(at: 10.1) else {
            return XCTFail("Partial sample/timestamp mismatch accepted")
        }
    }
    func testFarOpenReadinessCannotResumeClickModeWithANearClosedHand() {
        let engine = GestureEngine(), gate = ControlGate()
        XCTAssertTrue(gate.arm(now: 0, mode: .clickAndDrag, authorized: true))
        for step in 0...31 {
            let time = Double(step) / 10
            _ = gate.accept(engine.update(frame(time)), capturedAt: time, now: time, authorized: true)
        }
        _ = engine.update(nil)
        _ = gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
        for time in [3.3, 3.4, 3.5, 3.6, 3.7, 3.8] {
            XCTAssertEqual(gate.accept(engine.update(frame(time, index: Point2D(x: 0.71, y: 0.25))),
                capturedAt: time, now: time, authorized: true), [])
        }
        for (time, wristX) in [(3.9, 0.5), (3.933, 0.47), (4.03, 0.47)] {
            let output = engine.update(frame(time, ratio: 0.2, index: Point2D(x: 0.68, y: 0.25),
                                             wrist: Point2D(x: wristX, y: 0.75)))
            XCTAssertFalse(output.isOpenHand)
            XCTAssertEqual(gate.accept(output, capturedAt: time, now: time, authorized: true), [])
            XCTAssertEqual(gate.state, .recoveringPinch)
            XCTAssertFalse(gate.buttonHeld)
        }
    }
    func testNearAnchorOpenDwellIsIndependentOfFarHandReadinessAndResetsWhenInterrupted() {
        for interruptDwell in [false, true] {
            let gate = ControlGate(), engine = GestureEngine()
            XCTAssertTrue(gate.arm(now: 0, mode: .clickAndDrag, authorized: true))
            for step in 0...31 {
                let time = Double(step) / 10
                _ = gate.accept(engine.update(frame(time)), capturedAt: time, now: time, authorized: true)
            }
            _ = engine.update(nil)
            _ = gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
            for time in [3.3, 3.4, 3.5, 3.6, 3.7, 3.8] {
                _ = gate.accept(engine.update(frame(time, index: Point2D(x: 0.71, y: 0.25))), capturedAt: time, now: time, authorized: true)
            }
            for time in [3.9, 4.0, 4.01, 4.1, 4.2, 4.3, 4.399] {
                let output = engine.update(frame(time, ratio: interruptDwell && time == 4.01 ? 0.2 : 0.7))
                XCTAssertTrue(output.ready)
                XCTAssertEqual(gate.accept(output, capturedAt: time, now: time, authorized: true), [])
                XCTAssertEqual(gate.state, .recoveringPinch)
            }
            let actions = gate.accept(engine.update(frame(4.4)), capturedAt: 4.4, now: 4.4, authorized: true)
            if interruptDwell {
                XCTAssertEqual(actions, [])
                XCTAssertEqual(gate.state, .recoveringPinch)
                _ = gate.tick(now: 4.45, authorized: true)
                XCTAssertEqual(gate.state, .off)
            } else {
                XCTAssertEqual(actions.count, 1)
                XCTAssertEqual(gate.state, .active)
                XCTAssertFalse(gate.buttonHeld)
            }
        }
    }
}
