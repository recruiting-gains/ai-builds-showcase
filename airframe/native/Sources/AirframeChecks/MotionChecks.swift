import Foundation
import AirframeCore

private let motionPoint = Point2D(x: 0.5, y: 0.25)

private func partial(_ time: Double, confidence: Double = 0.9,
                     point: Point2D = motionPoint) -> PinchUncertainFrame {
    PinchUncertainFrame(timestamp: time, aspectRatio: 4 / 3,
        wrist: Point2D(x: 0.5, y: 0.75), middleMCP: Point2D(x: 0.5, y: 0.5),
        indexTip: point, confidence: confidence)
}

private func clickGate() -> ControlGate {
    let gate = ControlGate()
    check(gate.arm(now: 0, mode: .clickAndDrag, authorized: true), "Motion check must arm explicitly")
    for step in 1...31 {
        let time = Double(step) / 10
        _ = gate.accept(GestureOutput(point: motionPoint, phase: .move, ready: true),
                        capturedAt: time, now: time, authorized: true)
    }
    check(gate.state == .active, "Motion check did not enter active control")
    return gate
}

func runMotionChecks() {
    group("Drift-free inference keeps nominal 30 fps instead of halving it") {
        var clock = InferenceCadence()
        let accepted = (0...300).filter { clock.shouldProcess(at: Double($0) / 30) }.count
        check(accepted == 301, "A nominal 30 fps camera dropped regular frames: \(accepted)")
        var jittered = InferenceCadence()
        let jitterCount = (0...300).filter {
            jittered.shouldProcess(at: Double($0) / 30 + ($0 % 2 == 1 ? 0.0004 : 0))
        }.count
        check(jitterCount == 301, "Small callback jitter halved the cadence")
    }
    group("Inference cadence caps faster sources without drift or catch-up bursts") {
        for fps in [24, 60, 120] {
            var clock = InferenceCadence()
            let accepted = (0...(fps * 10)).filter { clock.shouldProcess(at: Double($0) / Double(fps)) }.count
            check(abs(accepted - (min(fps, 30) * 10 + 1)) <= 1, "Incorrect cadence for \(fps) fps: \(accepted)")
        }
        var clock = InferenceCadence()
        check(clock.shouldProcess(at: 0), "First sample skipped")
        check(clock.shouldProcess(at: 1), "First fresh sample after pause skipped")
        check(!clock.shouldProcess(at: 1.0001), "Scheduler caught up with a burst")
        for invalid in [Double.nan, Double.infinity, -1, 1, 0.5] {
            check(!clock.shouldProcess(at: invalid), "Invalid or reversed scheduling time accepted")
        }
        clock.reset()
        check(clock.shouldProcess(at: 0), "New capture generation could not reset the cadence")
        check(clock.shouldProcess(at: 0.066), "Delayed nominal sample was skipped")
        check(!clock.shouldProcess(at: 0.0661), "Near-boundary delay caused a 100 microsecond catch-up burst")
    }
    group("Adaptive filtering reduces fast-move lag and slow aiming jitter without overshoot") {
        let fast = GestureEngine(); arm(fast)
        let dt = 1.0 / 30
        let fastPoint = fast.update(frame(0.5 + dt, index: Point2D(x: 0.6, y: 0.25))).point!
        let oldFastX = 0.5 + 0.1 * (1 - exp(-dt / 0.045))
        check(fastPoint.x > oldFastX && fastPoint.x < 0.6, "Fast motion did not reduce lag or overshot")
        let slow = GestureEngine(); arm(slow)
        let slowPoint = slow.update(frame(0.5 + dt, index: Point2D(x: 0.501, y: 0.25))).point!
        let oldSlowX = 0.5 + 0.001 * (1 - exp(-dt / 0.045))
        check(slowPoint.x > 0.5 && slowPoint.x < oldSlowX, "Fine aiming no longer filters small jitter")
    }
    group("Fingertip curling does not pull the click target; palm translation still drags") {
        let engine = GestureEngine(); arm(engine)
        let closing = engine.update(frame(0.6, ratio: 0.2, index: Point2D(x: 0.5, y: 0.35)))
        check(closing.point == motionPoint && closing.phase == .move, "Pinch initiation pulled the cursor")
        let pressed = engine.update(frame(0.72, ratio: 0.2, index: Point2D(x: 0.5, y: 0.45)))
        check(pressed.point == motionPoint && pressed.phase == .down, "Curling moved the mouse-down target")
        let drag = engine.update(frame(0.8, ratio: 0.2, index: Point2D(x: 0.53, y: 0.44),
                                       wrist: Point2D(x: 0.53, y: 0.75)))
        check(drag.phase == .held && drag.point!.x > 0.5 && drag.point!.x < 0.53,
              "Pinch anchoring blocked genuine hand translation")
        _ = engine.update(nil)
        let reacquired = engine.update(frame(0.9, index: Point2D(x: 0.3, y: 0.25)))
        check(!reacquired.ready && reacquired.point == Point2D(x: 0.3, y: 0.25), "Old pinch anchor survived loss")
    }
    group("Reliable thumb occlusion freezes without ending unpressed click session") {
        let gate = clickGate()
        check(gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true).isEmpty,
              "Occlusion emitted pointer input")
        check(gate.state == .recoveringPinch && !gate.buttonHeld, "Unpressed pinch occlusion did not enter hold")
        check(MenuBarIndicator.resolve(state: gate.state, pending: false, cameraRequested: true,
            cameraRunning: true, authorized: true, lastHandAt: 3.2, now: 3.2) == .holding, "Hold appeared green")
        for (step, phase) in [GesturePhase.down, .held, .up].enumerated() {
            let time = 3.3 + Double(step) / 10
            check(gate.accept(GestureOutput(point: motionPoint, phase: phase, ready: true),
                capturedAt: time, now: time, authorized: true).isEmpty && gate.state == .recoveringPinch,
                "A returning pinch/release emitted input without a fresh open hand")
        }
    }
    group("Mouse-up target stays steady and returns smoothly to fingertip aiming") {
        let engine = GestureEngine(); arm(engine)
        _ = engine.update(frame(0.6, ratio: 0.2, index: Point2D(x: 0.5, y: 0.35)))
        _ = engine.update(frame(0.72, ratio: 0.2, index: Point2D(x: 0.5, y: 0.35)))
        _ = engine.update(frame(0.8, index: Point2D(x: 0.5, y: 0.35)))
        let released = engine.update(frame(0.88, index: Point2D(x: 0.5, y: 0.35)))
        check(released.phase == .up && released.point == motionPoint, "Opening fingers shifted the mouse-up target")
        let next = engine.update(frame(0.896, index: Point2D(x: 0.5, y: 0.35))).point!
        check(next.y > 0.25 && next.y < 0.27, "Release snapped immediately back to the fingertip")
        _ = engine.update(nil)
        check(engine.update(frame(1, index: Point2D(x: 0.3, y: 0.25))).point == Point2D(x: 0.3, y: 0.25),
              "Release smoothing survived tracking loss")
    }
    group("Thumb hold still hard-stops on held button, whole-hand loss, weak/far pointer or permission loss") {
        let dragging = clickGate()
        _ = dragging.accept(GestureOutput(point: motionPoint, phase: .down, ready: true), capturedAt: 3.2, now: 3.2, authorized: true)
        check(dragging.pinchUncertain(partial(3.3), capturedAt: 3.3, now: 3.3, authorized: true) == [.up(motionPoint)]
              && dragging.state == .off, "Uncertain drag did not release and hard-stop")
        check(dragging.pinchUncertain(partial(3.4), capturedAt: 3.4, now: 3.4, authorized: true).isEmpty,
              "Stopped drag released twice")
        let lost = clickGate(); _ = lost.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
        check(lost.noHand(capturedAt: 3.3, now: 3.3, authorized: true).isEmpty && lost.state == .off,
              "Whole-hand loss retained click-mode recovery")
        for uncertain in [partial(3.2, confidence: 0.6999), partial(3.2, confidence: .nan),
                          partial(3.2, point: Point2D(x: 0.9, y: 0.25))] {
            let gate = clickGate()
            check(gate.pinchUncertain(uncertain, capturedAt: 3.2, now: 3.2, authorized: true).isEmpty
                  && gate.state == .off, "Weak/far partial hand retained click mode")
        }
        let revoked = clickGate()
        check(revoked.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: false).isEmpty
              && revoked.state == .off, "Permission loss allowed thumb recovery")
    }
    group("Thumb-hold expiry cannot slide and hard stop cannot auto-resume") {
        let gate = clickGate()
        for time in [3.2, 3.6, 4.0, 4.4] {
            check(gate.pinchUncertain(partial(time), capturedAt: time, now: time, authorized: true).isEmpty,
                  "Repeated uncertain samples emitted input")
        }
        _ = gate.pinchUncertain(partial(4.45), capturedAt: 4.45, now: 4.45, authorized: true)
        check(gate.state == .off, "Repeated occlusion extended fixed deadline")
        check(gate.accept(GestureOutput(point: motionPoint, phase: .move, ready: true),
            capturedAt: 4.5, now: 4.5, authorized: true).isEmpty && gate.state == .off, "Expired hold auto-resumed")
        for reason in ["Escape", "Physical mouse", "Keyboard", "Camera fault", "Display changed"] {
            let stopped = clickGate(); _ = stopped.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
            _ = stopped.stop(reason)
            check(stopped.accept(GestureOutput(point: motionPoint, phase: .move, ready: true),
                capturedAt: 3.8, now: 3.8, authorized: true).isEmpty && stopped.state == .off,
                "Hard stop \(reason) was revived")
        }
    }
    group("Real gesture reset requires open hand and a new pinch after thumb uncertainty") {
        let gate = ControlGate(), engine = GestureEngine()
        check(gate.arm(now: 0, mode: .clickAndDrag, authorized: true), "Integrated click test arm failed")
        for step in 0...31 {
            let time = Double(step) / 10
            _ = gate.accept(engine.update(frame(time)), capturedAt: time, now: time, authorized: true)
        }
        _ = engine.update(nil)
        _ = gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
        for time in [3.3, 3.4] {
            check(gate.accept(engine.update(frame(time, ratio: 0.2)), capturedAt: time, now: time, authorized: true).isEmpty,
                  "Pinch on reacquisition emitted an action")
        }
        for time in [3.5, 3.6, 3.7, 3.8, 3.999] {
            check(gate.accept(engine.update(frame(time)), capturedAt: time, now: time, authorized: true).isEmpty,
                  "Short open interval resumed early")
        }
        check(gate.accept(engine.update(frame(4.0)), capturedAt: 4.0, now: 4.0, authorized: true) == [.move(motionPoint, dragging: false)]
              && gate.state == .active, "500 ms open-hand recovery did not resume")
        let closing = gate.accept(engine.update(frame(4.1, ratio: 0.2)), capturedAt: 4.1, now: 4.1, authorized: true)
        check(closing == [.move(motionPoint, dragging: false)], "Fresh pinch bypassed debounce")
        let down = gate.accept(engine.update(frame(4.22, ratio: 0.2)), capturedAt: 4.22, now: 4.22, authorized: true)
        check(down == [.move(motionPoint, dragging: false), .down(motionPoint)], "Fresh deliberate pinch failed")
    }
    group("Partial tracking delivery cannot hide loss, skip readiness reset, or accept stale data") {
        let uncertain = TrackingDelivery.pinchUncertain(partial(10), capturedAt: 10)
        let good = TrackingDelivery.observation(frame(10.05), capturedAt: 10.05)
        let lost = TrackingDelivery.observation(nil, capturedAt: 10.1)
        check(TrackingDelivery.coalesce(pending: uncertain, incoming: good) == uncertain,
              "Complete hand erased pending readiness reset")
        check(TrackingDelivery.coalesce(pending: uncertain, incoming: lost) == lost,
              "Thumb hold concealed genuine loss")
        check(TrackingDelivery.coalesce(pending: lost, incoming: uncertain) == lost,
              "Uncertain thumb concealed pending genuine loss")
        if case .fault = uncertain.validated(at: 10.201) {} else { check(false, "Stale thumb hold became fresh") }
        if case .fault = TrackingDelivery.pinchUncertain(partial(10), capturedAt: 10.01).validated(at: 10.1) {} else {
            check(false, "Partial frame/sample timestamp mismatch accepted")
        }
    }
    group("Far open warmup cannot smuggle a closed pinch back into click control") {
        let engine = GestureEngine(), gate = ControlGate()
        check(gate.arm(now: 0, mode: .clickAndDrag, authorized: true), "Adversarial click test could not arm")
        for step in 0...31 {
            let time = Double(step) / 10
            _ = gate.accept(engine.update(frame(time)), capturedAt: time, now: time, authorized: true)
        }
        _ = engine.update(nil)
        _ = gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
        for time in [3.3, 3.4, 3.5, 3.6, 3.7, 3.8] {
            let output = engine.update(frame(time, index: Point2D(x: 0.71, y: 0.25)))
            check(gate.accept(output, capturedAt: time, now: time, authorized: true).isEmpty,
                  "Far open hand resumed control")
        }
        for (time, wristX) in [(3.9, 0.5), (3.933, 0.47), (4.03, 0.47)] {
            let output = engine.update(frame(time, ratio: 0.2, index: Point2D(x: 0.68, y: 0.25),
                                             wrist: Point2D(x: wristX, y: 0.75)))
            check(!output.isOpenHand, "Closed pinch falsely reported current openness")
            check(gate.accept(output, capturedAt: time, now: time, authorized: true).isEmpty
                  && gate.state == .recoveringPinch && !gate.buttonHeld,
                  "Far-open readiness allowed a near closed pinch to activate/click")
        }
    }
    group("Thumb holds retain timing, watchdog, malformed-data and permission hard stops") {
        for (captured, now) in [(3.2, 3.451), (3.3, 3.2), (3.1, 3.2), (3.8, 3.8)] {
            let gate = clickGate()
            check(gate.pinchUncertain(partial(captured), capturedAt: captured, now: now, authorized: true).isEmpty
                  && gate.state == .off, "Invalid/stalled time entered a thumb hold")
        }
        let gate = clickGate()
        _ = gate.pinchUncertain(partial(3.2), capturedAt: 3.2, now: 3.2, authorized: true)
        check(!gate.arm(now: 3.3, mode: .clickAndDrag, authorized: true), "Hold allowed a second arm")
        _ = gate.tick(now: 3.3, authorized: false)
        check(gate.state == .off, "Lost trust during a hold did not stop")
        let pointerOnly = ControlGate()
        check(pointerOnly.arm(now: 0, mode: .pointerOnly, authorized: true), "Malformed partial test arm failed")
        _ = pointerOnly.pinchUncertain(partial(0.1, confidence: .nan), capturedAt: 0.1, now: 0.1, authorized: true)
        check(pointerOnly.state == .off, "Malformed partial geometry hid inside pointer-only recovery")
    }
    group("Far-open readiness still requires a full uninterrupted near-anchor open dwell") {
        for interruptDwell in [false, true] {
            let gate = ControlGate(), engine = GestureEngine()
            check(gate.arm(now: 0, mode: .clickAndDrag, authorized: true), "Near-open regression arm failed")
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
                let ratio = interruptDwell && time == 4.01 ? 0.2 : 0.7
                let output = engine.update(frame(time, ratio: ratio))
                check(output.ready, "Regression must use already-earned far-hand readiness")
                check(gate.accept(output, capturedAt: time, now: time, authorized: true).isEmpty
                      && gate.state == .recoveringPinch, "Near open hand skipped its own 500ms dwell")
            }
            let actions = gate.accept(engine.update(frame(4.4)), capturedAt: 4.4, now: 4.4, authorized: true)
            if interruptDwell {
                check(actions.isEmpty && gate.state == .recoveringPinch, "Interrupted near dwell accumulated time")
                _ = gate.tick(now: 4.45, authorized: true)
                check(gate.state == .off, "Interrupted dwell escaped fixed expiry")
            } else {
                check(actions.count == 1 && gate.state == .active && !gate.buttonHeld, "Full near-open dwell did not resume safely")
            }
        }
    }
}
