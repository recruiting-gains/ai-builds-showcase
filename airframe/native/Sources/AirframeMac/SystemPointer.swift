import AppKit
import ApplicationServices
import AirframeCore

/// The only OS-input emitter. It accepts typed pointer actions, never arbitrary commands.
final class SystemPointer {
    static let eventTag: Int64 = 0x4149524652414D45
    var displayID: CGDirectDisplayID = CGMainDisplayID()
    private var lastLocation = CGPoint.zero
    private var ownsButton = false

    static var isTrusted: Bool { AXIsProcessTrusted() }

    static func requestPermission() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    func post(_ actions: [PointerAction]) {
        for action in actions {
            if case .up = action {
                release()
                continue
            }
            let type: CGEventType
            let point: Point2D
            switch action {
            case let .move(p, dragging):
                guard Self.isTrusted else { continue }
                type = dragging ? .leftMouseDragged : .mouseMoved
                point = p
            case let .down(p):
                guard Self.isTrusted else { continue }
                type = .leftMouseDown
                point = p
            case let .up(p):
                // Always attempt release; macOS still enforces its permissions.
                type = .leftMouseUp
                point = p
            }
            let bounds = CGDisplayBounds(displayID)
            guard bounds.width > 1, bounds.height > 1 else { continue }
            // Map the central camera region to the chosen display, easing edge reach.
            let x = min(1, max(0, (point.x - 0.12) / 0.76))
            let y = min(1, max(0, (point.y - 0.10) / 0.80))
            let location = CGPoint(x: bounds.minX + x * (bounds.width - 1), y: bounds.minY + y * (bounds.height - 1))
            guard location.x.isFinite, location.y.isFinite else { continue }
            lastLocation = location
            guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: location, mouseButton: .left) else { continue }
            event.setIntegerValueField(.eventSourceUserData, value: Self.eventTag)
            if type == .leftMouseDown || type == .leftMouseUp {
                event.setIntegerValueField(.mouseEventClickState, value: 1)
            }
            event.post(tap: .cghidEventTap)
            if type == .leftMouseDown { ownsButton = true }
        }
    }

    private func release() {
        guard ownsButton else { return }
        ownsButton = false
        // Hardware takeover must not jump the cursor back to an old hand point.
        // Display unplug/permission changes must not bypass the release attempt.
        let location = CGEvent(source: nil)?.location ?? lastLocation
        guard let event = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: location, mouseButton: .left) else { return }
        event.setIntegerValueField(.eventSourceUserData, value: Self.eventTag)
        event.setIntegerValueField(.mouseEventClickState, value: 1)
        event.post(tap: .cghidEventTap)
    }
}
