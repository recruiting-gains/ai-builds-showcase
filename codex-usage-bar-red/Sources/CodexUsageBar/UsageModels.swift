import Foundation

struct RateWindow: Sendable {
    let usedPercent: Int
    let durationMinutes: Int?
    let resetsAt: Date?

    var remainingPercent: Int { 100 - max(0, min(100, usedPercent)) }

    var shortLabel: String {
        guard let minutes = durationMinutes, minutes > 0 else { return "Quota" }
        if minutes == 10_080 { return "Wk" }
        if minutes.isMultiple(of: 1_440) { return "\(minutes / 1_440)d" }
        if minutes.isMultiple(of: 60) { return "\(minutes / 60)h" }
        return "\(minutes)m"
    }

    var title: String {
        durationMinutes == 10_080 ? "Weekly allowance" : "\(shortLabel) allowance"
    }

    var remainingLabel: String {
        "\(shortLabel) \(remainingPercent)% left"
    }
}

struct UsageSnapshot: Sendable {
    let primary: RateWindow?
    let secondary: RateWindow?
    let plan: String?
    let creditBalance: String?
    let unlimitedCredits: Bool
    let resetCredits: Int
    let fetchedAt: Date

    // Window positions are not meanings: a weekly-only plan returns its week as primary.
    var windows: [RateWindow] {
        [primary, secondary].compactMap { $0 }.sorted {
            ($0.durationMinutes ?? Int.max) < ($1.durationMinutes ?? Int.max)
        }
    }

    func isStale(at now: Date, readFailed: Bool) -> Bool {
        readFailed || now.timeIntervalSince(fetchedAt) > 660 ||
            windows.contains { $0.resetsAt.map { $0 <= now } ?? false }
    }
}
