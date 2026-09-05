import Foundation
import AirframeCore

// Pure synthetic checks only. Main owns the counters and invokes this function;
// none of these checks access camera hardware, permissions, or operating-system input.
func runTrackingDeliveryChecks() {
    func isFault(_ delivery: TrackingDelivery) -> Bool {
        if case .fault = delivery { return true }
        return false
    }

    group("Fresh present and missing camera results preserve capture time") {
        for hand in [frame(1), nil] {
            let delivery = TrackingDelivery.observation(hand, capturedAt: 1)
            check(delivery.validated(at: 1) == delivery, "Fresh camera result changed")
            check(delivery.validated(at: 1.1) == delivery, "Fresh delayed camera result changed")
        }
    }
    group("Camera delivery enforces its exact 200 ms age boundary") {
        for hand in [frame(0), nil] {
            let delivery = TrackingDelivery.observation(hand, capturedAt: 0)
            check(delivery.validated(at: 0.2) == delivery, "200 ms boundary rejected")
            check(isFault(delivery.validated(at: Double(0.2).nextUp)), "Result older than 200 ms survived")
        }
    }
    group("Invalid camera capture times cannot become missing-hand recovery") {
        for timestamp in [Double.nan, .infinity, -.infinity, -0.01] {
            for hand in [frame(timestamp), nil] {
                check(isFault(TrackingDelivery.observation(hand, capturedAt: timestamp).validated(at: 1)), "Invalid capture time survived")
            }
        }
    }
    group("Invalid delivery clocks and future captures fail closed") {
        for hand in [frame(1), nil] {
            for now in [Double.nan, .infinity, -.infinity, -1, 0.999] {
                check(isFault(TrackingDelivery.observation(hand, capturedAt: 1).validated(at: now)), "Invalid delivery clock or future capture survived")
            }
        }
    }
    group("Fresh envelope cannot hide an inconsistent hand timestamp") {
        for timestamp in [0.5, 1.1, Double.nan, .infinity] {
            check(isFault(TrackingDelivery.observation(frame(timestamp), capturedAt: 1).validated(at: 1.01)), "Mismatched hand timestamp survived")
        }
    }
    group("A UI queue delay invalidates both hand and no-hand results") {
        for hand in [frame(1), nil] {
            let pending = TrackingDelivery.observation(hand, capturedAt: 1).validated(at: 1.05)
            check(isFault(pending.validated(at: 1.201)), "Queued stale result survived delivery-time validation")
        }
    }
    group("The first pending camera fault survives every later result") {
        let fault = TrackingDelivery.fault("first failure")
        for incoming in [TrackingDelivery.observation(frame(2), capturedAt: 2), .observation(nil, capturedAt: 2), .fault("later failure")] {
            check(TrackingDelivery.coalesce(pending: fault, incoming: incoming) == fault, "Later camera result erased a pending fault")
        }
        check(fault.validated(at: .nan) == fault, "Fault changed during timestamp validation")
    }
    group("Latest hand replaces an older hand without hiding pending hand loss") {
        let old = TrackingDelivery.observation(frame(1), capturedAt: 1)
        let fresh = TrackingDelivery.observation(frame(1.1), capturedAt: 1.1)
        let missing = TrackingDelivery.observation(nil, capturedAt: 1.2)
        let fault = TrackingDelivery.fault("inference failed")
        check(TrackingDelivery.coalesce(pending: nil, incoming: fresh) == fresh, "Empty queue lost first delivery")
        check(TrackingDelivery.coalesce(pending: old, incoming: fresh) == fresh, "Newest hand did not replace old hand")
        check(TrackingDelivery.coalesce(pending: fresh, incoming: missing) == missing, "Missing hand did not replace old hand")
        check(TrackingDelivery.coalesce(pending: missing, incoming: fresh) == missing, "Newest hand hid pending missing detection")
        check(TrackingDelivery.coalesce(pending: old, incoming: fault) == fault, "Incoming fault did not replace an observation")
        check(TrackingDelivery.coalesce(pending: missing, incoming: fault) == fault, "Incoming fault did not take priority over missing detection")
    }
    group("Repeated missing frames retain the first loss timestamp") {
        let first = TrackingDelivery.observation(nil, capturedAt: 1)
        let later = TrackingDelivery.observation(nil, capturedAt: 1.1)
        check(TrackingDelivery.coalesce(pending: first, incoming: later) == first, "Repeated missing frame moved the original loss time")
    }
    group("Coalescing a returned hand cannot hide loss during a held click") {
        let gate = heldGate()
        let pending = TrackingDelivery.observation(nil, capturedAt: 13.2)
        let good = TrackingDelivery.observation(frame(13.25), capturedAt: 13.25)
        let delivered = TrackingDelivery.coalesce(pending: pending, incoming: good).validated(at: 13.26)
        guard case let .observation(hand, capturedAt) = delivered else {
            check(false, "Fresh missing detection unexpectedly became a fault")
            return
        }
        check(hand == nil && capturedAt == 13.2, "Returned hand hid a pending loss during a held click")
        check(gate.noHand(capturedAt: capturedAt, now: 13.26, authorized: true) == [.up(center)], "Coalesced missing detection failed to release the click")
        check(gate.state == .off && !gate.buttonHeld, "Coalesced missing detection left click mode armed")
        check(gate.accept(output(.move), capturedAt: 13.3, now: 13.3, authorized: true).isEmpty, "Returned hand resumed control after click-mode loss")
    }
    group("A stale pending missing detection becomes a non-overwritable fault") {
        let stale = TrackingDelivery.observation(nil, capturedAt: 1).validated(at: 1.3)
        let fresh = TrackingDelivery.observation(frame(1.3), capturedAt: 1.3)
        check(isFault(TrackingDelivery.coalesce(pending: stale, incoming: fresh)), "Fresh frame hid a stale pending missing detection")
    }
    group("Stale missing detections stop pointer control instead of recovering") {
        let gate = activeGate(.pointerOnly)
        // This exercises the pure delivery-to-gate contract, not AppKit callbacks.
        switch TrackingDelivery.observation(nil, capturedAt: 13.1).validated(at: 13.301) {
        case .fault(let message): check(gate.stop(message).isEmpty, "Pointer-only hard stop emitted input")
        case .observation, .pinchUncertain: check(false, "Stale missing frame was incorrectly eligible for recovery")
        }
        check(gate.state == .off, "Stale missing result left pointer armed")
        check(gate.accept(output(.move), capturedAt: 13.4, now: 13.4, authorized: true).isEmpty, "Fresh hand rearmed after a delivery fault")
    }
}
