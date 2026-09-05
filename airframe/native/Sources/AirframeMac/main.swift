import AppKit
import ImageIO

// Camera-free diagnostic. It cannot arm control or emit an operating-system input.
if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--vision-smoke" {
    let url = URL(fileURLWithPath: CommandLine.arguments[2])
    do {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let hand = try CameraEngine.detectHand(in: image, timestamp: ProcessInfo.processInfo.systemUptime) else {
            throw NSError(domain: "Airframe", code: 1, userInfo: [NSLocalizedDescriptionKey: "No confident hand detected in the supplied still image."])
        }
        let report: [String: Any] = ["status": "passed", "engine": "Apple Vision revision 1", "confidence": hand.confidence,
            "indexTip": ["x": hand.indexTip.x, "y": hand.indexTip.y], "cameraOpened": false, "systemInputPosted": false]
        let bytes = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
        print(String(decoding: bytes, as: UTF8.self))
        exit(0)
    } catch {
        fputs("Vision still-image check failed: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
