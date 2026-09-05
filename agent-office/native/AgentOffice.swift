import AppKit
import WebKit

@MainActor
final class OfficeDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!
    private var bridge: Process?
    private var initialURL: URL?
    private var topItem: NSMenuItem!
    private var buffer = Data()
    private var keepOnTop = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "building.2.crop.circle", accessibilityDescription: "Agent Office")
        let menu = NSMenu()
        menu.addItem(withTitle: "Show / hide office", action: #selector(toggleOffice), keyEquivalent: "o").target = self
        topItem = menu.addItem(withTitle: "Keep above other windows", action: #selector(toggleTop), keyEquivalent: "")
        topItem.target = self
        menu.addItem(withTitle: "Reload office", action: #selector(reloadOffice), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Agent Office", action: #selector(quitOffice), keyEquivalent: "q").target = self
        statusItem.menu = menu
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.underPageBackgroundColor = .black
        window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 1120,height: 780), styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "Agent Office"
        window.contentView = webView
        window.backgroundColor = NSColor(calibratedRed: 0.063,green: 0.071,blue: 0.086,alpha: 1)
        window.minSize = NSSize(width: 620,height: 530)
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("AgentOfficeWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        startBridge()
    }
    private func startBridge() {
        guard let resources = Bundle.main.resourceURL else { return }
        let nodes = ["/opt/homebrew/bin/node","/usr/local/bin/node"]
        guard let node = nodes.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            showError("Node.js is required. Install Node.js 22 or newer, then reopen Agent Office."); return
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory,in: .userDomainMask)[0].appendingPathComponent("Agent Office")
        do { try FileManager.default.createDirectory(at: support,withIntermediateDirectories: true) } catch { showError("The local office folder could not be opened."); return }
        let child = Process()
        child.executableURL = URL(fileURLWithPath: node)
        child.arguments = [resources.appendingPathComponent("bridge/server.mjs").path]
        var environment = ProcessInfo.processInfo.environment
        environment["AGENT_OFFICE_PUBLIC"] = resources.appendingPathComponent("site").path
        environment["AGENT_OFFICE_CONFIG"] = support.appendingPathComponent("office.local.json").path
        environment["AGENT_OFFICE_RUNTIME"] = support.appendingPathComponent("runtime.local.json").path
        child.environment = environment
        let pipe = Pipe()
        child.standardOutput = pipe
        child.standardError = FileHandle.nullDevice
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            Task { @MainActor in self?.receive(data) }
        }
        child.terminationHandler = { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.statusItem.button?.title = " Offline"
            }
        }
        bridge = child
        do { try child.run() } catch { showError("The local observer could not start. No Codex settings were changed.") }
    }
    private func receive(_ data: Data) {
        buffer.append(data)
        guard buffer.count < 8192 else { return }
        guard let newline = buffer.firstIndex(of: 10) else { return }
        let line = buffer.prefix(upTo: newline)
        buffer.removeSubrange(...newline)
        guard let object = try? JSONSerialization.jsonObject(with: line) as? [String:Any],
              object["ready"] as? Bool == true,let value = object["url"] as? String,
              let url = URL(string:value),url.scheme == "http",url.host == "127.0.0.1" else { return }
        initialURL = url
        webView.load(URLRequest(url:url))
    }
    private func showError(_ message: String) {
        let alert = NSAlert();alert.messageText = "Agent Office needs attention";alert.informativeText = message;alert.runModal()
    }
    @objc private func toggleOffice() {
        if window.isVisible { window.orderOut(nil) }
        else { window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true) }
    }
    @objc private func toggleTop() {
        keepOnTop.toggle();window.level = keepOnTop ? .floating : .normal
        topItem.state = keepOnTop ? .on : .off
    }
    @objc private func reloadOffice() { if let url = initialURL { webView.load(URLRequest(url:url)) } }
    @objc private func quitOffice() { bridge?.terminate();NSApp.terminate(nil) }
    func windowShouldClose(_ sender: NSWindow) -> Bool { sender.orderOut(nil);return false }
    func applicationWillTerminate(_ notification: Notification) { bridge?.terminate() }
    func webView(_ webView: WKWebView,decidePolicyFor action: WKNavigationAction,decisionHandler: @escaping (WKNavigationActionPolicy)->Void) {
        guard let url=action.request.url,url.scheme == "http",url.host == "127.0.0.1",url.port == initialURL?.port else { decisionHandler(.cancel);return }
        decisionHandler(.allow)
    }
}
@main
struct AgentOfficeMain {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = OfficeDelegate()
        app.delegate = delegate
        app.run()
    }
}
