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
        XCTAssertEqual(gate.accept(output(.down), capturedAt: 2, now: 2, authorized: true), [])
        XCTAssertEqual(gate.state, .countdown)
    }
    func testNeedsOpenHandAfterCountdown() {
        let gate = ControlGate(); gate.arm(now: 0, mode: .clickAndDrag, authorized: true)
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
        XCTAssertEqual(gate.noHand(now: 3.3), [.up(point)])
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
        _ = gate.noHand(now: 3); _ = gate.tick(now: 3, authorized: true)
        _ = gate.noHand(now: 16)
        XCTAssertEqual(gate.accept(output(), capturedAt: 16, now: 16, authorized: true), [])
        XCTAssertEqual(gate.state, .off)
    }
    func testCancelNeverRegrabs() {
        let gate = active(.clickAndDrag)
        _ = gate.accept(output(.down), capturedAt: 3.2, now: 3.2, authorized: true)
        XCTAssertEqual(gate.accept(GestureOutput(point: nil, phase: .cancel, ready: false), capturedAt: 3.3, now: 3.3, authorized: true), [.up(point)])
        XCTAssertEqual(gate.state, .off)
    }
}
