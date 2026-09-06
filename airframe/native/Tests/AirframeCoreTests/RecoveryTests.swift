import XCTest
@testable import AirframeCore

/// Synthetic gate contracts only; no camera, Accessibility, or native input.
final class RecoveryTests: XCTestCase {
    private let frozen = Point2D(x: 0.5, y: 0.5)

    private func sample(_ phase: GesturePhase = .move,
                        point: Point2D = Point2D(x: 0.5, y: 0.5),
                        open: Bool = true, verified: Bool = true,
                        wrist: Point2D? = Point2D(x: 0.5, y: 0.75),
                        scale: Double? = 0.25, ready: Bool = true) -> GestureOutput {
        GestureOutput(point: point, phase: phase, ready: ready, isOpenHand: open,
                      wrist: wrist, palmScale: scale, isVerifiedOpenPalm: verified)
    }

    @discardableResult
    private func feed(_ gate: ControlGate, _ time: Double,
                      _ value: GestureOutput? = nil) -> [PointerAction] {
        gate.accept(value ?? sample(), capturedAt: time, now: time, authorized: true)
    }

    private func active(_ mode: ControlMode = .clickAndDrag, enabled: Bool = true) -> ControlGate {
        let gate = ControlGate()
        XCTAssertTrue(gate.arm(now: 0, mode: mode, authorized: true, recoveryEnabled: enabled))
        for index in 1...31 { feed(gate, Double(index) / 10) }
        XCTAssertEqual(gate.state, .active)
        return gate
    }

    private func missing(_ gate: ControlGate, _ range: ClosedRange<Int>,
                         reason: RecoverableTrackingLoss = .handMissing) {
        for index in range {
            let time = Double(index) / 10
            XCTAssertEqual(gate.noHand(capturedAt: time, now: time, authorized: true, reason: reason), [])
        }
    }

    private func recovered(_ mode: ControlMode = .clickAndDrag,
                           point: Point2D = Point2D(x: 0.5, y: 0.5)) -> ControlGate {
        let gate = active(mode)
        missing(gate, 33...33)
        for index in 34...39 { XCTAssertEqual(feed(gate, Double(index) / 10, sample(point: point)), []) }
        XCTAssertEqual(gate.state, .active)
        return gate
    }

    private func assertMove(_ actions: [PointerAction], at expected: Point2D,
                            file: StaticString = #filePath, line: UInt = #line) {
        guard actions.count == 1, case let .move(point, dragging) = actions[0] else {
            XCTFail("Expected exactly one pointer-only movement", file: file, line: line)
            return
        }
        XCTAssertFalse(dragging, file: file, line: line)
        XCTAssertEqual(point.x, expected.x, accuracy: 1e-9, file: file, line: line)
        XCTAssertEqual(point.y, expected.y, accuracy: 1e-9, file: file, line: line)
    }

    func testEveryRecoverableLossReleasesHeldButtonExactlyOnce() {
        for reason in [RecoverableTrackingLoss.handMissing, .thumbOccluded, .multipleHands, .unreliablePose] {
            let gate = active()
            feed(gate, 3.2, sample(.down, open: false, verified: false))
            XCTAssertTrue(gate.buttonHeld)
            XCTAssertEqual(gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true, reason: reason), [.up(frozen)])
            XCTAssertEqual(gate.state, .reacquiringHand)
            XCTAssertFalse(gate.buttonHeld)
            missing(gate, 34...40, reason: reason)
            XCTAssertEqual(gate.stop("Stop after release"), [])
        }
    }

    func testPartialThumbPathReleasesHeldButtonThenFreezes() {
        let gate = active()
        feed(gate, 3.2, sample(.down, open: false, verified: false))
        let partial = PinchUncertainFrame(timestamp: 3.3, aspectRatio: 4.0 / 3.0,
            wrist: Point2D(x: 0.5, y: 0.75), middleMCP: frozen, indexTip: frozen, confidence: 0.95)
        XCTAssertEqual(gate.pinchUncertain(partial, capturedAt: 3.3, now: 3.3, authorized: true), [.up(frozen)])
        XCTAssertEqual(gate.state, .reacquiringHand)
        XCTAssertFalse(gate.buttonHeld)
        missing(gate, 34...40, reason: .thumbOccluded)
    }

    func testEngineLossOutputAndMalformedLossHaveDifferentRecoveryOutcomes() {
        for malformed in [false, true] {
            let gate = active()
            feed(gate, 3.2, sample(.down, open: false, verified: false))
            let loss = GestureOutput(point: malformed ? frozen : nil, phase: .cancel,
                                     ready: false, recoverableLoss: .unreliablePose)
            XCTAssertEqual(feed(gate, 3.3, loss), [.up(frozen)])
            XCTAssertEqual(gate.state, malformed ? .off : .reacquiringHand)
            XCTAssertFalse(gate.buttonHeld)
            missing(gate, 34...36)
        }
    }

    func testMalformedEngineFrameAfterResetCannotLookLikeRecoverableWarmup() {
        for confidence in [Double.nan, .infinity, -0.1] {
            let gate = active()
            missing(gate, 33...33)
            let engine = GestureEngine()
            engine.reset()
            let bad = HandFrame(timestamp: 3.4, aspectRatio: 4.0 / 3.0,
                wrist: Point2D(x: 0.5, y: 0.75), middleMCP: frozen,
                indexTip: Point2D(x: 0.5, y: 0.25), thumbTip: Point2D(x: 0.7, y: 0.25),
                confidence: confidence)
            let value = engine.update(bad)
            XCTAssertEqual(value.phase, .warming)
            XCTAssertNil(value.point)
            XCTAssertNil(value.recoverableLoss)
            XCTAssertEqual(feed(gate, 3.4, value), [])
            XCTAssertEqual(gate.state, .off)
            XCTAssertFalse(gate.recoveryEnabled)
            for index in 35...45 {
                XCTAssertEqual(feed(gate, Double(index) / 10), [])
                XCTAssertEqual(gate.state, .off)
            }
        }
    }

    func testMalformedUnreadyPointerOrPalmMetadataHardStopsRecovery() {
        for value in [sample(.warming, point: Point2D(x: .nan, y: 0.5), ready: false),
                      sample(.warming, wrist: Point2D(x: .nan, y: 0.75), ready: false),
                      sample(.warming, scale: .nan, ready: false)] {
            let gate = active()
            missing(gate, 33...33)
            XCTAssertEqual(feed(gate, 3.4, value), [])
            XCTAssertEqual(gate.state, .off)
            XCTAssertFalse(gate.recoveryEnabled)
            XCTAssertEqual(feed(gate, 3.5), [])
            XCTAssertEqual(gate.state, .off)
        }
    }

    func testQueuedMixedLossPreservesEarliestCaptureAndConservativeLegacyStop() {
        let partial = PinchUncertainFrame(timestamp: 3.3, aspectRatio: 4.0 / 3.0,
            wrist: Point2D(x: 0.5, y: 0.75), middleMCP: frozen, indexTip: frozen, confidence: 0.95)
        let pending = TrackingDelivery.pinchUncertain(partial, capturedAt: 3.3)
        for later in [TrackingDelivery.observation(nil, capturedAt: 3.4),
                      .trackingLoss(.multipleHands, capturedAt: 3.4)] {
            for delivery in [TrackingDelivery.coalesce(pending: pending, incoming: later),
                             TrackingDelivery.coalesce(pending: later, incoming: pending)] {
                XCTAssertEqual(delivery, .trackingLoss(.thumbOccluded, capturedAt: 3.3))
                XCTAssertEqual(TrackingDelivery.coalesce(pending: delivery,
                    incoming: .observation(nil, capturedAt: 3.5)), delivery)
                guard case let .trackingLoss(reason, capturedAt) = delivery else { continue }
                for enabled in [false, true] {
                    let gate = active(enabled: enabled)
                    feed(gate, 3.2, sample(.down, open: false, verified: false))
                    XCTAssertEqual(gate.noHand(capturedAt: capturedAt, now: 3.4, authorized: true, reason: reason), [.up(frozen)])
                    XCTAssertEqual(gate.state, enabled ? .reacquiringHand : .off)
                    if enabled {
                        XCTAssertEqual(gate.recoveryRemainingSeconds(now: 3.4) ?? -1, 29.9, accuracy: 1e-9)
                    }
                }
            }
        }
        let legacy = active(enabled: false)
        XCTAssertEqual(legacy.pinchUncertain(partial, capturedAt: 3.3, now: 3.3, authorized: true), [])
        XCTAssertEqual(legacy.state, .recoveringPinch)
        XCTAssertEqual(legacy.noHand(capturedAt: 3.4, now: 3.4, authorized: true, reason: .thumbOccluded), [])
        XCTAssertEqual(legacy.state, .off)
        let mismatch = TrackingDelivery.pinchUncertain(partial, capturedAt: 3.31)
        if case .fault = TrackingDelivery.coalesce(pending: mismatch, incoming: .observation(nil, capturedAt: 3.4)) {
            // Correct: invalid partial data cannot be converted to typed loss.
        } else { XCTFail("Malformed partial became recoverable loss") }
    }

    func testShortRecoveryRequiresNew500MillisecondsAndSilentResume() {
        for verified in [false, true] {
            let gate = active()
            missing(gate, 33...33)
            for index in 34...38 {
                XCTAssertEqual(feed(gate, Double(index) / 10, sample(verified: verified)), [])
                XCTAssertEqual(gate.state, .reacquiringHand)
            }
            XCTAssertEqual(feed(gate, 3.9, sample(verified: verified)), [])
            XCTAssertEqual(gate.state, .active)
            assertMove(feed(gate, 4.0), at: frozen)
        }
    }

    func testStandbyRequiresNewOneSecondVerifiedOpenPalm() {
        let gate = active()
        missing(gate, 33...47)
        XCTAssertEqual(gate.state, .standby)
        for index in 48...57 {
            XCTAssertEqual(feed(gate, Double(index) / 10), [])
            XCTAssertEqual(gate.state, .standby)
        }
        XCTAssertEqual(feed(gate, 5.8), [])
        XCTAssertEqual(gate.state, .active)
    }

    func testShortRecoveryNeedsPointerAndWristNearPreLossCandidate() {
        for distantWrist in [false, true] {
            let gate = active()
            missing(gate, 33...33)
            let value = sample(point: Point2D(x: distantWrist ? 0.5 : 0.85, y: 0.5),
                               wrist: Point2D(x: distantWrist ? 0.85 : 0.5, y: 0.75))
            for index in 34...44 {
                XCTAssertEqual(feed(gate, Double(index) / 10, value), [])
                XCTAssertEqual(gate.state, .reacquiringHand)
            }
        }
    }

    func testCrossingShortLossBoundaryResetsDwell() {
        let gate = active()
        missing(gate, 33...41)
        for index in 42...45 { XCTAssertEqual(feed(gate, Double(index) / 10), []) }
        for index in 46...55 {
            XCTAssertEqual(feed(gate, Double(index) / 10), [])
            XCTAssertEqual(gate.state, .standby)
        }
        XCTAssertEqual(feed(gate, 5.6), [])
        XCTAssertEqual(gate.state, .active)
    }

    func testThirtySecondLeaseCannotSlideAcrossLossesOrRejectedReturns() {
        let gate = active()
        missing(gate, 33...33)
        XCTAssertEqual(gate.recoveryRemainingSeconds(now: 3.3) ?? -1, 30, accuracy: 1e-9)
        for index in 34...332 {
            let time = Double(index) / 10
            if index % 3 == 0 {
                XCTAssertEqual(feed(gate, time, sample(open: false, verified: false)), [])
            } else {
                XCTAssertEqual(gate.noHand(capturedAt: time, now: time, authorized: true,
                    reason: index % 2 == 0 ? .multipleHands : .handMissing), [])
            }
        }
        XCTAssertEqual(gate.state, .standby)
        XCTAssertEqual(gate.recoveryRemainingSeconds(now: 33.2) ?? -1, 0.1, accuracy: 1e-9)
        XCTAssertEqual(feed(gate, 33.3), [])
        XCTAssertEqual(gate.state, .off)
        XCTAssertNil(gate.recoveryRemainingSeconds(now: 33.4))
        XCTAssertEqual(feed(gate, 33.4, sample(.down)), [])
    }

    func testAbsentAmbiguousAndInvalidReturnsNeverResume() {
        for candidate in [sample(open: false), sample(verified: false),
                          sample(.down, open: false, verified: false),
                          sample(.held, open: false, verified: false),
                          sample(wrist: nil), sample(scale: nil),
                          sample(wrist: Point2D(x: .nan, y: 0.5)),
                          sample(scale: .nan), sample(scale: 0), sample(scale: -1)] {
            let gate = active()
            missing(gate, 33...47)
            for index in 48...62 {
                XCTAssertEqual(feed(gate, Double(index) / 10, candidate), [])
                XCTAssertNotEqual(gate.state, .active)
            }
        }
        let gate = active()
        missing(gate, 33...62, reason: .multipleHands)
        XCTAssertEqual(gate.state, .standby)
    }

    func testWarmingCanAccumulateDwellButCannotEmitOrResumeUntilReady() {
        let gate = active()
        missing(gate, 33...33)
        for index in 34...39 {
            XCTAssertEqual(feed(gate, Double(index) / 10, sample(.warming, ready: false)), [])
            XCTAssertEqual(gate.state, .reacquiringHand)
        }
        XCTAssertEqual(feed(gate, 4.0), [])
        XCTAssertEqual(gate.state, .active)
    }

    func testInterruptedDwellMustRestart() {
        let gate = active()
        missing(gate, 33...47)
        for index in 48...56 { XCTAssertEqual(feed(gate, Double(index) / 10), []) }
        XCTAssertEqual(feed(gate, 5.7, sample(open: false, verified: false)), [])
        for index in 58...67 {
            XCTAssertEqual(feed(gate, Double(index) / 10), [])
            XCTAssertEqual(gate.state, .standby)
        }
        XCTAssertEqual(feed(gate, 6.8), [])
        XCTAssertEqual(gate.state, .active)
    }

    func testSparseFramesAndSwitchingCandidatesCannotEarnDwell() {
        let sparse = active()
        missing(sparse, 33...47)
        for time in [4.8, 5.2, 5.6, 6.0, 6.4] {
            XCTAssertEqual(feed(sparse, time), [])
            XCTAssertEqual(sparse.state, .standby)
        }
        for switchScale in [false, true] {
            let gate = active()
            missing(gate, 33...47)
            for index in 48...69 {
                let alternate = index % 2 == 0
                let value = sample(wrist: Point2D(x: !switchScale && alternate ? 0.85 : 0.5, y: 0.75),
                                   scale: switchScale && alternate ? 0.5 : 0.25)
                XCTAssertEqual(feed(gate, Double(index) / 10, value), [])
                XCTAssertEqual(gate.state, .standby)
            }
        }
    }

    func testPersistentReanchorDoesNotJumpOnLaterFrames() {
        let gate = recovered(point: Point2D(x: 0.6, y: 0.5))
        for index in 40...45 {
            assertMove(feed(gate, Double(index) / 10, sample(point: Point2D(x: 0.6, y: 0.5))), at: frozen)
        }
        assertMove(feed(gate, 4.6, sample(point: Point2D(x: 0.65, y: 0.55))), at: Point2D(x: 0.55, y: 0.55))
    }

    func testCarriedPinchCannotStartBeforePostLiveOpenAndNewPinch() {
        let gate = recovered()
        for (index, phase) in [GesturePhase.down, .held, .up].enumerated() {
            XCTAssertEqual(feed(gate, 4.0 + Double(index) / 10, sample(phase, open: false, verified: false)), [])
            XCTAssertFalse(gate.buttonHeld)
        }
        assertMove(feed(gate, 4.3), at: frozen)
        XCTAssertEqual(feed(gate, 4.4, sample(.down, open: false, verified: false)),
                       [.move(frozen, dragging: false), .down(frozen)])
        XCTAssertTrue(gate.buttonHeld)
    }

    func testStandbyNewPositionReanchorsAndClampsWithoutLosingOffset() {
        let gate = active(.pointerOnly)
        missing(gate, 33...47)
        let far = sample(point: Point2D(x: 0.85, y: 0.2), wrist: Point2D(x: 0.85, y: 0.45), scale: 0.2)
        for index in 48...58 { XCTAssertEqual(feed(gate, Double(index) / 10, far), []) }
        XCTAssertEqual(gate.state, .active)
        assertMove(feed(gate, 5.9, far), at: frozen)
        assertMove(feed(gate, 6.0, sample(point: Point2D(x: 0, y: 1))), at: Point2D(x: 0, y: 1))
        assertMove(feed(gate, 6.1, sample(point: Point2D(x: 0.85, y: 0.2))), at: frozen)
    }

    func testHardFaultsCannotBeRevivedByLaterGoodFrames() {
        for fault in 0...8 {
            let gate = active()
            missing(gate, 33...33)
            let result: [PointerAction]
            switch fault {
            case 0: result = gate.stop("Stop")
            case 1: result = gate.tick(now: 3.4, authorized: false)
            case 2: result = gate.tick(now: 4.0, authorized: true)
            case 3: result = gate.accept(sample(), capturedAt: 3.4, now: 3.7, authorized: true)
            case 4: result = gate.accept(sample(), capturedAt: 3.5, now: 3.4, authorized: true)
            case 5: result = gate.accept(sample(), capturedAt: 3.2, now: 3.4, authorized: true)
            case 6: result = gate.accept(sample(), capturedAt: 3.3, now: 3.4, authorized: true)
            case 7: result = gate.accept(sample(.cancel), capturedAt: 3.4, now: 3.4, authorized: true)
            default: result = gate.noHand(capturedAt: 3.4, now: 3.4, authorized: false)
            }
            XCTAssertEqual(result, [])
            XCTAssertEqual(gate.state, .off)
            for index in 41...56 {
                XCTAssertEqual(feed(gate, Double(index) / 10), [])
                XCTAssertEqual(gate.state, .off)
            }
        }
    }

    func testOptOutPreservesLegacyDragLossAndShortPointerTimeout() {
        let gate = active(enabled: false)
        XCTAssertFalse(gate.recoveryEnabled)
        feed(gate, 3.2, sample(.down, open: false, verified: false))
        XCTAssertEqual(gate.noHand(capturedAt: 3.3, now: 3.3, authorized: true), [.up(frozen)])
        XCTAssertEqual(gate.state, .off)
        let pointer = active(.pointerOnly, enabled: false)
        missing(pointer, 33...45)
        XCTAssertEqual(pointer.state, .recoveringHand)
        XCTAssertEqual(pointer.tick(now: 4.55, authorized: true), [])
        XCTAssertEqual(pointer.state, .off)
    }

    func testExplicitNewSessionClearsRecoveryOffsetAndOptIn() {
        let gate = recovered(point: Point2D(x: 0.6, y: 0.5))
        assertMove(feed(gate, 4.0, sample(point: Point2D(x: 0.6, y: 0.5))), at: frozen)
        XCTAssertEqual(gate.stop("New session"), [])
        XCTAssertTrue(gate.arm(now: 5, mode: .pointerOnly, authorized: true))
        XCTAssertFalse(gate.recoveryEnabled)
        for index in 51...80 { feed(gate, Double(index) / 10) }
        assertMove(feed(gate, 8.1, sample(point: Point2D(x: 0.6, y: 0.5))), at: Point2D(x: 0.6, y: 0.5))
    }

    func testMenuRecoverySelectionMustBeCopiedBeforeOneShotTake() {
        for mode in [ControlMode.pointerOnly, .clickAndDrag] {
            for enabled in [false, true] {
                var request = MenuBarStartRequest()
                XCTAssertFalse(request.recoveryEnabled)
                request.begin(mode: mode, now: 1, authorized: true, recoveryEnabled: enabled)
                let selectedRecovery = request.recoveryEnabled
                let selectedMode = request.take(capturedAt: 1.1, now: 1.1, authorized: true)
                XCTAssertEqual(selectedMode, mode)
                XCTAssertEqual(selectedRecovery, enabled)
                XCTAssertFalse(request.isPending)
                XCTAssertFalse(request.recoveryEnabled)
                XCTAssertNil(request.mode)
                guard let selectedMode else { continue }
                let gate = ControlGate()
                XCTAssertTrue(gate.arm(now: 1.1, mode: selectedMode, authorized: true, recoveryEnabled: selectedRecovery))
                XCTAssertEqual(gate.recoveryEnabled, enabled)
                XCTAssertNil(request.take(capturedAt: 1.2, now: 1.2, authorized: true))
                XCTAssertFalse(request.recoveryEnabled)
            }
        }
    }

    func testCancelledExpiredAndRejectedMenuIntentsClearRecoveryWithoutRevival() {
        for failure in 0...5 {
            var request = MenuBarStartRequest()
            request.begin(mode: .clickAndDrag, now: 1, authorized: true, recoveryEnabled: true)
            switch failure {
            case 0: request.cancel(); request.cancel()
            case 1:
                XCTAssertTrue(request.validate(now: 10.9, authorized: true))
                XCTAssertFalse(request.validate(now: 11, authorized: true))
            case 2: XCTAssertNil(request.take(capturedAt: 11, now: 11, authorized: true))
            case 3: XCTAssertFalse(request.validate(now: 1.1, authorized: false))
            case 4: request.begin(mode: .pointerOnly, now: 1.1, authorized: false, recoveryEnabled: true)
            default: XCTAssertNil(request.take(capturedAt: 1.1, now: 1.4, authorized: true))
            }
            XCTAssertFalse(request.isPending)
            XCTAssertFalse(request.recoveryEnabled)
            XCTAssertNil(request.mode)
            XCTAssertNil(request.take(capturedAt: 12, now: 12, authorized: true))
            XCTAssertFalse(request.recoveryEnabled)
        }
    }

    func testOnlyExplicitMenuStartCanReplacePendingRecoveryPreference() {
        var request = MenuBarStartRequest()
        request.begin(mode: .clickAndDrag, now: 1, authorized: true, recoveryEnabled: true)
        XCTAssertNil(request.take(capturedAt: 0.99, now: 1.05, authorized: true))
        XCTAssertTrue(request.isPending)
        XCTAssertTrue(request.recoveryEnabled)
        request.begin(mode: .pointerOnly, now: 2, authorized: true)
        XCTAssertTrue(request.isPending)
        XCTAssertFalse(request.recoveryEnabled)
        XCTAssertEqual(request.mode, .pointerOnly)
        let copiedRecovery = request.recoveryEnabled
        XCTAssertEqual(request.take(capturedAt: 2.1, now: 2.1, authorized: true), .pointerOnly)
        XCTAssertFalse(copiedRecovery)
    }

    func testRecoveryIndicatorsHaveDistinctLabelsAndCannotClaimLiveTracking() {
        for (state, expected) in [(ControlState.reacquiringHand, MenuBarIndicator.looking),
                                  (.standby, .standby)] {
            for requested in [false, true] {
                for running in [false, true] {
                    for pending in [false, true] {
                        for authorized in [false, true] {
                            let actual = MenuBarIndicator.resolve(state: state, pending: pending,
                                cameraRequested: requested, cameraRunning: running, authorized: authorized,
                                lastHandAt: 1, now: 1)
                            let safeExpected: MenuBarIndicator = !requested && !running ? .off
                                : pending ? .starting : !authorized || !running ? .cameraOnly : expected
                            XCTAssertEqual(actual, safeExpected)
                            XCTAssertNotEqual(actual, .tracking)
                        }
                    }
                }
            }
        }
        XCTAssertEqual(MenuBarIndicator.looking.shortLabel, "LOOKING")
        XCTAssertEqual(MenuBarIndicator.standby.shortLabel, "HOLD OPEN")
        XCTAssertEqual(MenuBarIndicator.holding.shortLabel, "HOLD")
        XCTAssertNotEqual(MenuBarIndicator.looking.description, MenuBarIndicator.standby.description)
        for indicator in [MenuBarIndicator.looking, .standby] {
            XCTAssertFalse(indicator.description.isEmpty)
            XCTAssertNotEqual(indicator.shortLabel, "LIVE")
        }
    }
}
