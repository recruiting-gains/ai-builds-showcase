import Foundation

var testCount = 0
func check(_ condition: @autoclosure () -> Bool, _ label: String) {
    guard condition() else { fatalError("FAIL: \(label)") }
    testCount += 1
}

let now = Date(timeIntervalSince1970: 2_000_000_000)
func window(_ used: Int, _ duration: Int?, _ reset: Date? = nil) -> RateWindow {
    RateWindow(usedPercent: used, durationMinutes: duration, resetsAt: reset)
}
func snapshot(_ primary: RateWindow?, _ secondary: RateWindow?, fetchedAt: Date = now) -> UsageSnapshot {
    UsageSnapshot(primary: primary, secondary: secondary, plan: "pro", creditBalance: nil,
                  unlimitedCredits: false, resetCredits: 0, fetchedAt: fetchedAt)
}

let week = window(20, 10_080, now.addingTimeInterval(3600))
let weeklyOnly = snapshot(week, nil)
check(weeklyOnly.windows.count == 1, "weekly-only hides absent second quota")
check(weeklyOnly.windows[0].shortLabel == "Wk", "primary weekly quota must never be labeled 5h")
check(week.remainingLabel == "Wk 80% left", "remaining not used")
check(week.title == "Weekly allowance", "beginner-friendly weekly title")
let dual = snapshot(week, window(50, 300))
check(dual.windows.map(\.shortLabel) == ["5h", "Wk"], "sort by duration not response position")
check(snapshot(nil, week).windows.count == 1, "secondary-only supported")
check(snapshot(nil, nil).windows.isEmpty, "null windows unavailable, not invented zero")
check(window(-1, 60).remainingPercent == 100, "clamp negative usage")
check(window(101, 60).remainingPercent == 0, "clamp overage")
check(window(Int.min, nil).remainingPercent == 100, "clamp before subtraction")
check(window(Int.max, nil).remainingPercent == 0, "extreme positive usage")
check(window(0, 15).shortLabel == "15m", "unusual window duration retained")
check(window(0, 1_440).shortLabel == "1d", "daily window")
check(window(0, nil).shortLabel == "Quota", "unknown duration not guessed")
check(window(0, 0).shortLabel == "Quota", "invalid duration not guessed")
check(!weeklyOnly.isStale(at: now, readFailed: false), "fresh data")
check(weeklyOnly.isStale(at: now, readFailed: true), "failed read marks last known stale")
check(weeklyOnly.isStale(at: now.addingTimeInterval(661), readFailed: false), "old data stale")
check(snapshot(window(10, 300, now), nil).isStale(at: now, readFailed: false), "expired window stale, not reset to 100 locally")
check(!snapshot(window(10, 300, nil), nil).isStale(at: now, readFailed: false), "missing reset still valid fresh usage")

let clientChecks = try runClientFixtureTests()
print("PASS: \(testCount) model checks + \(clientChecks) client fixture checks")
