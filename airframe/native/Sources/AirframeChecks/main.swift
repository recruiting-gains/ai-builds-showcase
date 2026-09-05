import Foundation
import AirframeCore

// Dependency-free synthetic checks for Command Line Tools installations lacking
// XCTest. This is intentionally NOT labeled an XCTest run. It opens no camera,
// obtains no permissions, and emits no keyboard or mouse input.
var assertions = 0
var failures: [String] = []
var groups = 0

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    assertions += 1
    if !condition() { failures.append(message) }
}

func group(_ name: String, _ body: () -> Void) {
    groups += 1
    let before = failures.count
    body()
    print("\(failures.count == before ? "PASS" : "FAIL") · \(name)")
}

func frame(_ time: Double, ratio: Double = 0.70, aspect: Double = 4.0 / 3.0,
           confidence: Double = 0.95, index: Point2D = Point2D(x: 0.50, y: 0.25),
           wrist: Point2D = Point2D(x: 0.50, y: 0.75)) -> HandFrame {
    HandFrame(timestamp: time, aspectRatio: aspect, wrist: wrist,
              middleMCP: Point2D(x: wrist.x, y: wrist.y - 0.25), indexTip: index,
              thumbTip: Point2D(x: index.x + ratio * 0.25 / aspect, y: index.y), confidence: confidence)
}

func arm(_ engine: GestureEngine, at start: Double = 0) {
    var output = engine.update(frame(start))
    for step in 1...5 { output = engine.update(frame(start + Double(step) * 0.1)) }
    check(output.ready && output.phase == .move, "Continuous open hand should become ready after 500 ms")
}

func press(_ engine: GestureEngine) {
    arm(engine)
    check(engine.update(frame(0.60, ratio: 0.20)).phase == .move, "Pinch must debounce")
    check(engine.update(frame(0.72, ratio: 0.20)).phase == .down, "Stable 120 ms pinch must emit down")
}

group("Cold start and no-hand frames never move") {
    let output = GestureEngine().update(nil)
    check(output.phase == .warming && !output.ready && output.point == nil, "Cold output must not authorize movement")
}
group("Continuous 500 ms open-hand arming") {
    let engine = GestureEngine()
    for time in [0.0, 0.1, 0.2, 0.3, 0.4, 0.499] { check(!engine.update(frame(time)).ready, "Premature open-hand arming") }
    check(engine.update(frame(0.5)).ready, "Open hand failed to arm at 500 ms")
}
group("Initial pinch cannot arm") {
    let engine = GestureEngine()
    for step in 0...30 { let out = engine.update(frame(Double(step) * 0.1, ratio: 0.1)); check(!out.ready && out.phase == .warming, "Initial pinch armed") }
}
group("Interrupted opening restarts the arming interval") {
    let engine = GestureEngine()
    for time in [0.0, 0.1, 0.2] { _ = engine.update(frame(time)) }
    _ = engine.update(frame(0.3, ratio: 0.40))
    for time in [0.4, 0.5, 0.6, 0.7, 0.8] { check(!engine.update(frame(time)).ready, "Interrupted open-hand timer accumulated") }
    check(engine.update(frame(0.9)).ready, "New open interval failed")
}
group("120 ms pinch debounce and exactly one down") {
    let engine = GestureEngine(); arm(engine)
    check(engine.update(frame(0.60, ratio: 0.2)).phase == .move, "Immediate pinch down")
    check(engine.update(frame(0.719, ratio: 0.2)).phase == .move, "Early pinch down")
    check(engine.update(frame(0.720, ratio: 0.2)).phase == .down, "Missing pinch down")
    for time in [0.75, 0.80, 0.85] { check(engine.update(frame(time, ratio: 0.2)).phase == .held, "Held pinch repeated down") }
}
group("Interrupted pinch cannot accumulate debounce") {
    let engine = GestureEngine(); arm(engine)
    _ = engine.update(frame(0.60, ratio: 0.2)); _ = engine.update(frame(0.68)); _ = engine.update(frame(0.70, ratio: 0.2))
    check(engine.update(frame(0.78, ratio: 0.2)).phase == .move, "Interrupted pinch accumulated")
    check(engine.update(frame(0.82, ratio: 0.2)).phase == .down, "New pinch interval failed")
}
group("Pinch/release hysteresis") {
    let engine = GestureEngine(); press(engine)
    for (step, ratio) in [0.29, 0.35, 0.44, 0.30, 0.28].enumerated() {
        check(engine.update(frame(0.80 + Double(step) * 0.05, ratio: ratio)).phase == .held, "Pinch boundary chatter")
    }
}
group("80 ms release debounce and exactly one up") {
    let engine = GestureEngine(); press(engine)
    check(engine.update(frame(0.80)).phase == .held, "Immediate release")
    check(engine.update(frame(0.879)).phase == .held, "Early release")
    check(engine.update(frame(0.880)).phase == .up, "Release missing at 80 ms")
    check(engine.update(frame(0.90)).phase == .move, "Repeated up")
}
group("Interrupted opening does not accumulate release time") {
    let engine = GestureEngine(); press(engine)
    _ = engine.update(frame(0.80)); _ = engine.update(frame(0.84, ratio: 0.2)); _ = engine.update(frame(0.87))
    check(engine.update(frame(0.93)).phase == .held, "Short opening accumulated release")
    check(engine.update(frame(0.95)).phase == .up, "New release interval failed")
}
group("Hand loss cancels rather than completing a click") {
    let engine = GestureEngine(); press(engine)
    let output = engine.update(nil)
    check(output.phase == .cancel && !output.ready && output.point == nil, "Hand loss did not cancel safely")
    check(engine.update(nil).phase == .warming, "Repeated loss emitted duplicate cancellation")
}
group("Reacquired pinch cannot continue old drag") {
    let engine = GestureEngine(); press(engine); _ = engine.update(nil)
    for step in 0...8 { check(!engine.update(frame(0.9 + Double(step) * 0.1, ratio: 0.2)).ready, "Lost drag resumed") }
    arm(engine, at: 2.0)
    check(engine.update(frame(2.6, ratio: 0.2)).phase == .move, "Reacquired pinch did not debounce")
    check(engine.update(frame(2.72, ratio: 0.2)).phase == .down, "New deliberate drag failed")
}
group("Loss during warmup resets the full 500 ms interval") {
    let engine = GestureEngine(); _ = engine.update(frame(0)); _ = engine.update(frame(0.2)); _ = engine.update(nil)
    for time in [0.4, 0.6, 0.8] { check(!engine.update(frame(time)).ready, "Warmup survived hand loss") }
    check(engine.update(frame(0.9)).ready, "Rearmed open hand failed")
}
group("Confidence bounds including NaN and Infinity") {
    for confidence in [0, 0.5499, -1, 1.01, Double.nan, Double.infinity] {
        let engine = GestureEngine(); arm(engine)
        let output = engine.update(frame(0.6, confidence: confidence))
        check(output.phase == .cancel && output.point == nil, "Invalid confidence accepted")
    }
    let engine = GestureEngine()
    for step in 0...5 { _ = engine.update(frame(Double(step) * 0.1, confidence: 0.55)) }
    check(engine.update(frame(0.6, confidence: 0.55)).ready, "Confidence boundary rejected")
}
group("All eight required coordinates reject invalid values") {
    for bad in [Double.nan, Double.infinity, -0.01, 1.01] {
        for joint in 0...3 { for axis in 0...1 {
            let engine = GestureEngine(); arm(engine); let valid = frame(0.6)
            var points = [valid.wrist, valid.middleMCP, valid.indexTip, valid.thumbTip]
            points[joint] = Point2D(x: axis == 0 ? bad : points[joint].x, y: axis == 1 ? bad : points[joint].y)
            let invalid = HandFrame(timestamp: 0.6, aspectRatio: valid.aspectRatio, wrist: points[0], middleMCP: points[1], indexTip: points[2], thumbTip: points[3], confidence: 0.95)
            let output = engine.update(invalid)
            check(output.phase == .cancel && output.point == nil, "Invalid joint coordinate accepted")
        } }
    }
}
group("Malformed aspect ratios and tiny palms fail closed") {
    for aspect in [0, -1, 0.001, 100, Double.nan, Double.infinity] {
        let engine = GestureEngine(); arm(engine); check(engine.update(frame(0.6, aspect: aspect)).phase == .cancel, "Invalid aspect accepted")
    }
    for separation in [0, 0.001, 0.0249] {
        let engine = GestureEngine(); arm(engine); let valid = frame(0.6)
        let tiny = HandFrame(timestamp: 0.6, aspectRatio: valid.aspectRatio, wrist: valid.wrist,
                             middleMCP: Point2D(x: valid.wrist.x, y: valid.wrist.y - separation),
                             indexTip: valid.indexTip, thumbTip: valid.indexTip, confidence: 0.95)
        check(engine.update(tiny).phase == .cancel, "Degenerate palm accepted")
    }
}
group("Pixel aspect ratio preserves physical pinch behavior") {
    for aspect in [0.75, 1.0, 4.0 / 3.0, 2.0] {
        let engine = GestureEngine()
        for step in 0...5 { _ = engine.update(frame(Double(step) * 0.1, aspect: aspect)) }
        _ = engine.update(frame(0.60, ratio: 0.27, aspect: aspect))
        check(engine.update(frame(0.72, ratio: 0.27, aspect: aspect)).phase == .down, "Aspect distorted pinch")
        _ = engine.update(frame(0.80, ratio: 0.46, aspect: aspect))
        check(engine.update(frame(0.88, ratio: 0.46, aspect: aspect)).phase == .up, "Aspect distorted release")
    }
}
group("Exact ratio/timing boundaries tolerate floating-point rounding") {
    let engine = GestureEngine()
    for step in 0...5 { _ = engine.update(frame(Double(step) * 0.1, ratio: 0.45, aspect: 2)) }
    check(engine.update(frame(0.55, ratio: 0.45, aspect: 2)).ready, "Open-ratio exact boundary rejected")
    _ = engine.update(frame(0.60, ratio: 0.28, aspect: 2))
    check(engine.update(frame(0.72, ratio: 0.28, aspect: 2)).phase == .down, "Close-ratio exact boundary rejected")
    _ = engine.update(frame(0.80, ratio: 0.45, aspect: 2))
    check(engine.update(frame(0.88, ratio: 0.45, aspect: 2)).phase == .up, "Release-ratio exact boundary rejected")
}
group("Out-of-order, duplicate, nonfinite and negative times fail closed") {
    for stale in [0.5, 0.72, -1, Double.nan, Double.infinity] {
        let engine = GestureEngine(); press(engine)
        let output = engine.update(frame(stale, ratio: 0.2))
        check(output.phase == .cancel && !output.ready && output.point == nil, "Invalid frame time accepted")
        check(!engine.update(frame(0.8)).ready, "Invalid timing did not disarm")
    }
}
group("Long frame gaps cannot arm or leave a pinch held") {
    let cold = GestureEngine(); _ = cold.update(frame(0))
    check(cold.update(frame(0.501)).phase == .cancel, "Arming across a stale frame gap")
    let engine = GestureEngine(); press(engine)
    check(engine.update(frame(1.071, ratio: 0.2)).phase == .cancel, "Drag survived stale frame gap")
}
group("Large wrist jumps cancel instead of teleporting") {
    let engine = GestureEngine(); press(engine)
    let output = engine.update(frame(0.8, ratio: 0.2, wrist: Point2D(x: 0.86, y: 0.75)))
    check(output.phase == .cancel && output.point == nil, "Wrist jump moved the pointer")
}
group("Smoothing reduces jitter without a second mirror") {
    let engine = GestureEngine(); arm(engine)
    if let point = engine.update(frame(0.516, index: Point2D(x: 0.52, y: 0.27))).point {
        check(point.x > 0.50 && point.x < 0.52 && point.y > 0.25 && point.y < 0.27, "Jitter was not smoothed")
    } else { check(false, "Smoothed point missing") }
    let cold = GestureEngine()
    check(cold.update(frame(0, index: Point2D(x: 0.30, y: 0.25))).point == Point2D(x: 0.30, y: 0.25), "Core mirrored pre-mirrored input")
}
group("Loss and reset erase smoothing, press state and timestamp epoch") {
    let engine = GestureEngine(); press(engine); _ = engine.update(nil)
    let fresh = engine.update(frame(0.9, index: Point2D(x: 0.2, y: 0.25)))
    check(fresh.point == Point2D(x: 0.2, y: 0.25) && !fresh.ready, "Loss swept across stale pointer history")
    engine.reset(); check(engine.update(nil).phase == .warming, "Reset emitted old press")
    arm(engine); check(engine.update(frame(0.6)).phase == .move, "Reset retained old timestamp epoch")
}

let center = Point2D(x: 0.5, y: 0.5)
func output(_ phase: GesturePhase, ready: Bool = true, point: Point2D? = Point2D(x: 0.5, y: 0.5)) -> GestureOutput {
    GestureOutput(point: point, phase: phase, ready: ready)
}
func activeGate(_ mode: ControlMode = .clickAndDrag) -> ControlGate {
    let gate = ControlGate()
    check(gate.arm(now: 10, mode: mode, authorized: true), "Explicit gate arm rejected")
    for step in 0...29 { _ = gate.accept(output(.move), capturedAt: 10 + Double(step) * 0.1, now: 10 + Double(step) * 0.1, authorized: true) }
    check(gate.state == .countdown, "Gate skipped three-second countdown")
    _ = gate.accept(output(.move), capturedAt: 13.01, now: 13.01, authorized: true)
    check(gate.state == .active, "Gate did not accept a ready hand after countdown")
    return gate
}
func heldGate() -> ControlGate {
    let gate = activeGate()
    let actions = gate.accept(output(.down), capturedAt: 13.1, now: 13.1, authorized: true)
    check(gate.buttonHeld && actions.contains(.down(center)), "Authorized click gate did not hold")
    return gate
}
group("Gate requires explicit authorization and enforces countdown") {
    let gate = ControlGate()
    check(!gate.arm(now: 0, mode: .pointerOnly, authorized: false), "Unauthorized gate armed")
    check(gate.accept(output(.down), capturedAt: 1, now: 1, authorized: true).isEmpty, "Unarmed gate emitted input")
    _ = activeGate()
}
group("Pointer-only mode cannot click even on a pinch") {
    let gate = activeGate(.pointerOnly)
    let actions = gate.accept(output(.down), capturedAt: 13.1, now: 13.1, authorized: true)
    check(!gate.buttonHeld && actions == [.move(center, dragging: false)], "Pointer-only mode emitted a click")
}
group("Stop releases a held button exactly once") {
    let gate = heldGate()
    check(gate.stop("Explicit stop") == [.up(center)], "Stop did not release held button")
    check(gate.stop("Repeated stop").isEmpty && !gate.buttonHeld && gate.state == .off, "Repeated stop released twice")
}
group("Hand loss and cancellation disarm and release") {
    let lost = heldGate()
    check(lost.noHand(now: 13.2) == [.up(center)] && lost.state == .off, "Hand loss left mouse held")
    let cancelled = heldGate()
    check(cancelled.accept(output(.cancel, ready: false, point: nil), capturedAt: 13.2, now: 13.2, authorized: true) == [.up(center)], "Cancellation left mouse held")
}
group("Wall-clock staleness and permission revocation release") {
    let stale = heldGate()
    check(stale.tick(now: 13.8, authorized: true) == [.up(center)] && stale.state == .off, "Stale camera left input active")
    let revoked = heldGate()
    check(revoked.tick(now: 13.2, authorized: false) == [.up(center)] && revoked.state == .off, "Permission revocation left input active")
}
group("Old/future/duplicate output timestamps fail closed") {
    for (capture, now) in [(12.0, 13.2), (13.3, 13.2), (13.1, 13.2)] {
        let gate = heldGate()
        let actions = gate.accept(output(.held), capturedAt: capture, now: now, authorized: true)
        check(actions == [.up(center)] && gate.state == .off, "Invalid output timestamp survived gate")
    }
}
group("Unready or invalid points cannot move a live pointer") {
    let invalid = heldGate()
    check(invalid.accept(output(.held, point: Point2D(x: .nan, y: 0.5)), capturedAt: 13.2, now: 13.2, authorized: true) == [.up(center)], "NaN reached pointer output")
    let warming = heldGate()
    check(warming.accept(output(.warming, ready: false), capturedAt: 13.2, now: 13.2, authorized: true) == [.up(center)], "Unready hand continued drag")
}
group("Physical-input or Escape stop signal cannot auto-rearm") {
    let gate = heldGate()
    check(gate.stop("Physical input / Escape") == [.up(center)], "Emergency stop signal did not release")
    check(gate.accept(output(.move), capturedAt: 13.2, now: 13.2, authorized: true).isEmpty, "Hand silently rearmed after manual takeover")
}
group("Countdown cannot survive a stale camera stream") {
    let gate = ControlGate()
    check(gate.arm(now: 10, mode: .pointerOnly, authorized: true), "Countdown did not arm")
    check(gate.tick(now: 10.651, authorized: true).isEmpty && gate.state == .off, "Countdown ignored stale camera frames")
}
group("Waiting for a ready hand has a bounded deadline") {
    let gate = ControlGate()
    check(gate.arm(now: 10, mode: .pointerOnly, authorized: true), "Waiting test could not arm")
    for step in 1...150 {
        let time = 10 + Double(step) * 0.1
        _ = gate.accept(output(.warming, ready: false, point: nil), capturedAt: time, now: time, authorized: true)
        _ = gate.tick(now: time, authorized: true)
    }
    check(gate.state == .waitingForHand, "Waiting mode ended before its bounded deadline")
    _ = gate.accept(output(.warming, ready: false, point: nil), capturedAt: 25.01, now: 25.01, authorized: true)
    check(gate.tick(now: 25.01, authorized: true).isEmpty && gate.state == .off, "No-hand waiting deadline did not stop control")
}
group("A live pointer-only session cannot silently switch into clicking") {
    let gate = activeGate(.pointerOnly)
    check(!gate.arm(now: 13.05, mode: .clickAndDrag, authorized: true), "Mode changed without stopping the current session")
    check(gate.accept(output(.down), capturedAt: 13.1, now: 13.1, authorized: true) == [.move(center, dragging: false)], "Rejected mode change nevertheless enabled clicking")
}

print("\nAirframe standalone checks: \(groups) groups, \(assertions) assertions, \(failures.count) failures.")
print("Evidence boundary: synthetic core and input-gate logic only; not XCTest, live-camera recognition, Accessibility permission, or actual OS-input acceptance.")
if !failures.isEmpty {
    for failure in failures { print("FAILURE: \(failure)") }
    exit(1)
}
