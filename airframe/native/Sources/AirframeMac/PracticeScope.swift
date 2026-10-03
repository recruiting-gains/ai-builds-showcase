import AppKit
import CoreGraphics

/// A foreground restriction for a supervised trial, not a sandbox around CGEvent.
/// Never interprets session/protected-data availability as proof of screen unlock.
final class PracticeScope {
    private let application: NSRunningApplication
    private let expectedURL: URL
    private let expectedLaunch: Date?
    private static let identifier = "io.recruiting-gains.airframe-desktop-practice"

    private init(application: NSRunningApplication, url: URL) {
        self.application = application
        expectedURL = url.standardizedFileURL
        expectedLaunch = application.launchDate
    }

    static var sessionEligible: Bool {
        guard NSApp.isProtectedDataAvailable,
              let session = CGSessionCopyCurrentDictionary() as? [String: Any],
              (session[kCGSessionOnConsoleKey as String] as? Bool) == true,
              (session[kCGSessionLoginDoneKey as String] as? Bool) == true else { return false }
        return true
    }

    /// Resolves only the already-running desktop helper. Does not launch anything.
    static func resolve() -> PracticeScope? {
        let matches = NSRunningApplication.runningApplications(withBundleIdentifier: identifier)
            .filter { !$0.isTerminated }
        guard matches.count == 1, let app = matches.first, let url = app.bundleURL,
              Bundle(url: url)?.bundleIdentifier == identifier, sessionEligible else { return nil }
        return PracticeScope(application: app, url: url)
    }

    private var sameInstance: Bool {
        !application.isTerminated && application.bundleIdentifier == Self.identifier
            && application.bundleURL?.standardizedFileURL == expectedURL
            && application.launchDate == expectedLaunch
    }

    var eligible: Bool {
        sameInstance && !application.isHidden && Self.sessionEligible
            && NSWorkspace.shared.frontmostApplication?.processIdentifier == application.processIdentifier
    }
}
