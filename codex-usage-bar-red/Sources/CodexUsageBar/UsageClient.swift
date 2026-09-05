import Foundation
import Darwin

enum UsageClientError: LocalizedError {
    case codexNotFound
    case launchFailed(String)
    case timedOut
    case invalidResponse
    case server(String)

    func message(language: AppLanguage) -> String {
        switch self {
        case .codexNotFound:
            return L10n.string("error_codex_not_found", language: language)
        case .launchFailed(let message):
            return L10n.format("error_launch_failed", language: language, message)
        case .timedOut:
            return L10n.string("error_timeout", language: language)
        case .invalidResponse:
            return L10n.string("error_invalid_response", language: language)
        case .server(let message):
            return L10n.format("error_server", language: language, message)
        }
    }

    var errorDescription: String? { message(language: .system) }
}

enum CodexUsageClient {
    static func fetch() throws -> UsageSnapshot {
        guard let executable = findCodexExecutable() else {
            throw UsageClientError.codexNotFound
        }

        let process = Process()
        process.executableURL = executable
        process.arguments = ["app-server", "--listen", "stdio://"]

        var environment = ProcessInfo.processInfo.environment
        environment["TERM"] = "dumb"
        process.environment = environment

        let input = Pipe()
        let output = Pipe()
        // A child that exits between handshake writes must produce an error, not kill this app.
        _ = fcntl(input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1)
        process.standardInput = input
        process.standardOutput = output
        // Do not retain private server diagnostics or let an unread stderr pipe fill.
        process.standardError = FileHandle.nullDevice
        let exited = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in exited.signal() }

        defer {
            try? input.fileHandleForWriting.close()
            if process.isRunning {
                process.terminate()
                if exited.wait(timeout: .now() + 1) == .timedOut, process.isRunning {
                    // Only the exact child this request launched is stopped.
                    _ = Darwin.kill(process.processIdentifier, SIGKILL)
                    _ = exited.wait(timeout: .now() + 1)
                }
            }
            try? input.fileHandleForReading.close()
            try? output.fileHandleForWriting.close()
            try? output.fileHandleForReading.close()
        }

        do {
            try process.run()
        } catch {
            throw UsageClientError.launchFailed(error.localizedDescription)
        }

        let deadline = ProcessInfo.processInfo.systemUptime + 15

        let initialize: [String: Any] = [
            "id": 1,
            "method": "initialize",
            "params": [
                "clientInfo": [
                    "name": "codex-usage-bar",
                    "title": "Codex Usage Bar Red",
                    "version": "2.1.0-red"
                ],
                "capabilities": ["experimentalApi": true]
            ]
        ]
        let request: [String: Any] = [
            "id": 2,
            "method": "account/rateLimits/read",
            "params": NSNull()
        ]

        try send(initialize, to: input.fileHandleForWriting)
        var responseData = Data()
        let initialized = try readResponse(
            id: 1, from: output.fileHandleForReading, data: &responseData, deadline: deadline
        )
        if let error = initialized["error"] as? [String: Any] {
            throw UsageClientError.server(error["message"] as? String ?? "Unknown error")
        }
        guard initialized["result"] is [String: Any] else {
            throw UsageClientError.invalidResponse
        }
        try send(["method": "initialized", "params": [:]], to: input.fileHandleForWriting)
        try send(request, to: input.fileHandleForWriting)
        _ = try readResponse(
            id: 2, from: output.fileHandleForReading, data: &responseData, deadline: deadline
        )
        return try parseResponse(responseData)
    }

    private static func send(_ object: [String: Any], to handle: FileHandle) throws {
        do {
            try handle.write(contentsOf: line(for: object))
        } catch {
            throw UsageClientError.launchFailed(error.localizedDescription)
        }
    }

    // Polling a pipe keeps the deadline effective even when the child produces no output.
    // Only complete newline-delimited responses are accepted; no partial JSON is treated as success.
    private static func readResponse(
        id: Int, from handle: FileHandle, data: inout Data, deadline: TimeInterval
    ) throws -> [String: Any] {
        let descriptor = handle.fileDescriptor
        var buffer = [UInt8](repeating: 0, count: 16_384)
        while ProcessInfo.processInfo.systemUptime < deadline {
            for line in data.split(separator: 0x0A).dropLast(data.last == 0x0A ? 0 : 1) {
                if let json = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any],
                   (json["id"] as? NSNumber)?.intValue == id {
                    return json
                }
            }

            var descriptorState = pollfd(fd: descriptor, events: Int16(POLLIN), revents: 0)
            let ready = Darwin.poll(&descriptorState, 1, 100)
            if ready == 0 { continue }
            if ready < 0 {
                if errno == EINTR { continue }
                throw UsageClientError.invalidResponse
            }
            if descriptorState.revents & Int16(POLLNVAL | POLLERR) != 0 {
                throw UsageClientError.invalidResponse
            }
            let count = buffer.withUnsafeMutableBytes {
                Darwin.read(descriptor, $0.baseAddress, $0.count)
            }
            guard count > 0 else {
                if count < 0 && errno == EINTR { continue }
                throw UsageClientError.invalidResponse
            }
            guard data.count + count <= 1_048_576 else {
                throw UsageClientError.invalidResponse
            }
            data.append(contentsOf: buffer.prefix(count))
        }
        throw UsageClientError.timedOut
    }

    private static func line(for object: [String: Any]) throws -> Data {
        var data = try JSONSerialization.data(withJSONObject: object)
        data.append(0x0A)
        return data
    }

    static func parseResponse(_ data: Data) throws -> UsageSnapshot {
        guard let text = String(data: data, encoding: .utf8) else {
            throw UsageClientError.invalidResponse
        }

        for line in text.split(whereSeparator: \.isNewline) {
            guard let lineData = String(line).data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                  (json["id"] as? NSNumber)?.intValue == 2 else {
                continue
            }

            if let error = json["error"] as? [String: Any] {
                throw UsageClientError.server(error["message"] as? String ?? "Unknown error")
            }

            guard let result = json["result"] as? [String: Any],
                  let limits = preferredLimits(from: result) else {
                throw UsageClientError.invalidResponse
            }

            let credits = limits["credits"] as? [String: Any]
            let resets = result["rateLimitResetCredits"] as? [String: Any]

            return UsageSnapshot(
                primary: parseWindow(limits["primary"]),
                secondary: parseWindow(limits["secondary"]),
                plan: limits["planType"] as? String,
                creditBalance: credits?["balance"] as? String,
                unlimitedCredits: credits?["unlimited"] as? Bool ?? false,
                resetCredits: (resets?["availableCount"] as? NSNumber)?.intValue ?? 0,
                fetchedAt: Date()
            )
        }

        throw UsageClientError.invalidResponse
    }

    private static func preferredLimits(from result: [String: Any]) -> [String: Any]? {
        if let buckets = result["rateLimitsByLimitId"] as? [String: Any],
           let codex = buckets["codex"] as? [String: Any] {
            return codex
        }
        return result["rateLimits"] as? [String: Any]
    }

    private static func parseWindow(_ value: Any?) -> RateWindow? {
        guard let object = value as? [String: Any],
              let used = (object["usedPercent"] as? NSNumber)?.intValue else {
            return nil
        }
        let duration = (object["windowDurationMins"] as? NSNumber)?.intValue
        let resetTimestamp = (object["resetsAt"] as? NSNumber)?.doubleValue
        return RateWindow(
            usedPercent: used,
            durationMinutes: duration,
            resetsAt: resetTimestamp.map(Date.init(timeIntervalSince1970:))
        )
    }

    private static func findCodexExecutable() -> URL? {
        let candidates = [
            "/Applications/ChatGPT.app/Contents/Resources/codex",
            "/Applications/Codex.app/Contents/Resources/codex",
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex"
        ]
        return candidates
            .first(where: { FileManager.default.isExecutableFile(atPath: $0) })
            .map(URL.init(fileURLWithPath:))
    }
}
