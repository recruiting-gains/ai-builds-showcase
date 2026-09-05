import Foundation

@discardableResult
func runClientFixtureTests() throws -> Int {
    var count = 0
    func check(_ condition: @autoclosure () -> Bool, _ message: String) {
        precondition(condition(), message)
        count += 1
    }
    func fixture(_ result: String) -> Data {
        let object = try! JSONSerialization.jsonObject(with: Data(result.utf8))
        var data = Data("{\"id\":1,\"result\":{}}\n{\"method\":\"notice\",\"params\":{}}\n".utf8)
        data.append(try! JSONSerialization.data(withJSONObject: ["id": 2, "result": object]))
        data.append(0x0A)
        return data
    }

    let weekly = try CodexUsageClient.parseResponse(fixture("""
    {"rateLimits":{"primary":{"usedPercent":90,"windowDurationMins":300}},
     "rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":31,"windowDurationMins":10080,
       "resetsAt":2000003600},"secondary":null,"planType":"pro"}},
     "rateLimitResetCredits":{"availableCount":3}}
    """))
    check(weekly.primary?.usedPercent == 31, "Preferred Codex bucket must override legacy limits")
    check(weekly.primary?.remainingPercent == 69, "Percent shown is remaining, not used")
    check(weekly.primary?.durationMinutes == 10080, "Weekly primary must retain actual duration")
    check(weekly.secondary == nil, "Missing five-hour allowance must not be fabricated")
    check(weekly.primary?.resetsAt?.timeIntervalSince1970 == 2000003600, "Reset is Unix seconds")
    check(weekly.plan == "pro", "Plan stays optional")
    check(weekly.resetCredits == 3, "Only display available reset count; never redeem it")

    let legacy = try CodexUsageClient.parseResponse(fixture("""
    {"rateLimits":{"primary":{"usedPercent":15,"windowDurationMins":300},
      "secondary":{"usedPercent":38,"windowDurationMins":10080},
      "credits":{"balance":"12.50","unlimited":false}}}
    """))
    check(legacy.primary?.remainingPercent == 85, "Legacy primary works")
    check(legacy.secondary?.remainingPercent == 62, "Legacy secondary works")
    check(legacy.creditBalance == "12.50", "Credit balance remains text")
    check(!legacy.unlimitedCredits, "Unlimited is not assumed")
    check(legacy.resetCredits == 0, "Missing reset credits default to no displayed resets")

    let unknown = try CodexUsageClient.parseResponse(fixture("""
    {"rateLimits":{"primary":{"usedPercent":8},"secondary":null}}
    """))
    check(unknown.primary?.durationMinutes == nil, "Unknown duration stays unknown")
    check(unknown.primary?.resetsAt == nil, "Unknown reset is not fabricated")

    let unavailable = try CodexUsageClient.parseResponse(fixture("""
    {"rateLimits":{"primary":null,"secondary":null}}
    """))
    check(unavailable.primary == nil && unavailable.secondary == nil, "No allowances stay unavailable")

    let authError = Data("{\"id\":2,\"error\":{\"message\":\"Sign in required\"}}\n".utf8)
    do {
        _ = try CodexUsageClient.parseResponse(authError)
        preconditionFailure("Server authentication errors must surface")
    } catch UsageClientError.server(let message) {
        check(message == "Sign in required", "Preserve useful server error message")
    }

    for invalid in [Data([0xFF]), fixture("{}"), Data("{\"id\":1,\"result\":{}}\n".utf8)] {
        do {
            _ = try CodexUsageClient.parseResponse(invalid)
            preconditionFailure("Invalid or mismatched response must fail")
        } catch UsageClientError.invalidResponse {
            count += 1
        }
    }
    return count
}
