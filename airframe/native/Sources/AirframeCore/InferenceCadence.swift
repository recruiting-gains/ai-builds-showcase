import Foundation

/// A drift-free admission clock for the serial camera inference queue. This is
/// scheduling only: it never changes sample timestamps or freshness validation.
public struct InferenceCadence {
    private let interval: Double
    private var nextDeadline: Double?
    private var lastArrival: Double?

    public init(framesPerSecond: Double = 30) {
        precondition(framesPerSecond.isFinite && (1...120).contains(framesPerSecond))
        interval = 1 / framesPerSecond
    }

    public mutating func reset() {
        nextDeadline = nil
        lastArrival = nil
    }

    public mutating func shouldProcess(at time: Double) -> Bool {
        guard time.isFinite, time >= 0,
              lastArrival.map({ time > $0 }) ?? true else { return false }
        lastArrival = time
        guard let deadline = nextDeadline else {
            nextDeadline = time + interval
            return true
        }
        // Camera callbacks jitter slightly around their nominal frame period.
        // Never move the clock later on a skipped frame: that halves a 30 fps
        // source when a naïve "elapsed >= 1/24" admission test is used.
        guard time + 0.001 >= deadline else { return false }
        let missedIntervals = max(1, floor((time + 0.001 - deadline) / interval) + 1)
        nextDeadline = deadline + missedIntervals * interval
        return true
    }
}
