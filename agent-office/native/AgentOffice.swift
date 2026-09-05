import AppKit
import WebKit

@MainActor
final class OfficeDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var widget: NSPanel!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!
    private var officeMenu: NSMenu!
    private var bridge: Process?
    private var initialURL: URL?
    private var topItem: NSMenuItem!
    private var buffer = Data()
    private var keepOnTop = false
    private var compact = true

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "building.2.crop.circle", accessibilityDescription: "Agent Office")
        statusItem.button?.toolTip = "Agent Office — click for widget; right-click for full office and options"
        statusItem.button?.target = self
        statusItem.button?.action = #selector(statusClicked)
        statusItem.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        let menu = NSMenu()
        menu.addItem(withTitle: "Show / hide workspace widget", action: #selector(toggleWidget), keyEquivalent: "o").target = self
        menu.addItem(withTitle: "Open full office", action: #selector(openFullOffice), keyEquivalent: "").target = self
        menu.addItem(withTitle: "Move widget to upper-right", action: #selector(resetWidget), keyEquivalent: "").target = self
        topItem = menu.addItem(withTitle: "Keep full office above other windows", action: #selector(toggleTop), keyEquivalent: "")
        topItem.target = self
        menu.addItem(withTitle: "Reload office", action: #selector(reloadOffice), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Agent Office", action: #selector(quitOffice), keyEquivalent: "q").target = self
        officeMenu = menu
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.addUserScript(WKUserScript(source: "window.__AGENT_OFFICE_VIEW = 'widget';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.underPageBackgroundColor = .black
        window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 1120,height: 780), styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "Agent Office"
        window.backgroundColor = NSColor(calibratedRed: 0.063,green: 0.071,blue: 0.086,alpha: 1)
        window.minSize = NSSize(width: 620,height: 530)
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("AgentOfficeWindow")
        window.center()
        widget = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 480, height: 350), styleMask: [.titled, .closable, .resizable, .nonactivatingPanel, .utilityWindow], backing: .buffered, defer: false)
        widget.title = "Agent Office · Workspace"
        widget.backgroundColor = window.backgroundColor
        widget.minSize = NSSize(width: 360, height: 280)
        widget.maxSize = NSSize(width: 720, height: 600)
        widget.level = .floating
        widget.hidesOnDeactivate = false
        widget.isReleasedWhenClosed = false
        widget.delegate = self
        widget.contentView = webView
        NotificationCenter.default.addObserver(self, selector: #selector(displayChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        positionWidget()
        widget.orderFrontRegardless()
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
        reloadOffice()
    }
    private func showError(_ message: String) {
        let alert = NSAlert();alert.messageText = "Agent Office needs attention";alert.informativeText = message;alert.runModal()
    }
    @objc private func statusClicked() {
        if NSApp.currentEvent?.type == .rightMouseUp || NSApp.currentEvent?.modifierFlags.contains(.option) == true {
            guard let button = statusItem.button else { return }
            officeMenu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.minY - 4), in: button)
        } else { toggleWidget() }
    }
    private func setDisplay(compact next: Bool) {
        compact = next
        let destination: NSWindow = next ? widget : window
        if webView.window !== destination {
            webView.removeFromSuperview()
            destination.contentView = webView
        }
        // A display-only event retains the selected project, connection and animation state.
        let mode = next ? "widget" : "full"
        webView.evaluateJavaScript("window.__AGENT_OFFICE_VIEW = '\(mode)'; window.dispatchEvent(new CustomEvent('agent-office-view', {detail: '\(mode)'}));", completionHandler: nil)
    }
    @objc private func toggleWidget() {
        if compact && widget.isVisible { widget.orderOut(nil); return }
        window.orderOut(nil)
        setDisplay(compact: true)
        widget.orderFrontRegardless()
    }
    @objc private func openFullOffice() {
        widget.orderOut(nil)
        setDisplay(compact: false)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    private func positionWidget() {
        guard let screen = statusItem.button?.window?.screen ?? NSScreen.main ?? NSScreen.screens.first else { return }
        let visible = screen.visibleFrame
        let margin: CGFloat = 12
        var frame = widget.frame
        frame.size.width = min(frame.width, visible.width - margin * 2)
        frame.size.height = min(frame.height, visible.height - margin * 2)
        frame.origin = NSPoint(x: visible.maxX - frame.width - margin, y: visible.maxY - frame.height - margin)
        widget.setFrame(frame, display: true)
    }
    @objc private func resetWidget() {
        positionWidget()
        if !compact || !widget.isVisible { toggleWidget() }
    }
    @objc private func displayChanged() { positionWidget() }
    @objc private func toggleTop() {
        keepOnTop.toggle();window.level = keepOnTop ? .floating : .normal
        topItem.state = keepOnTop ? .on : .off
    }
    @objc private func reloadOffice() {
        guard let url = initialURL, var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        parts.queryItems = [URLQueryItem(name: "view", value: compact ? "widget" : "full")]
        let mode = compact ? "widget" : "full"
        webView.configuration.userContentController.removeAllUserScripts()
        webView.configuration.userContentController.addUserScript(WKUserScript(source: "window.__AGENT_OFFICE_VIEW = '\(mode)';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if let displayURL = parts.url { webView.load(URLRequest(url: displayURL)) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { setDisplay(compact: compact) }
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
