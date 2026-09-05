import AppKit
import AVFoundation
import AirframeCore

private let mint = NSColor(calibratedRed: 0.56, green: 0.94, blue: 0.80, alpha: 1)

final class PreviewView: NSView {
    let videoLayer: AVCaptureVideoPreviewLayer
    var hand: HandFrame? { didSet { needsDisplay = true } }
    var cameraOn = false { didSet { updateVideoVisibility() } }
    var showVideo = false { didSet { updateVideoVisibility() } }
    override var isFlipped: Bool { true }

    init(session: AVCaptureSession) {
        videoLayer = AVCaptureVideoPreviewLayer(session: session)
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.10, blue: 0.12, alpha: 1).cgColor
        layer?.cornerRadius = 16
        layer?.masksToBounds = true
        videoLayer.videoGravity = .resizeAspect
        videoLayer.isHidden = true
        layer?.addSublayer(videoLayer)
        setAccessibilityLabel("Optional local camera preview. Hidden by default; hiding it does not turn off tracking.")
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }
    private func updateVideoVisibility() {
        videoLayer.isHidden = !cameraOn || !showVideo
        needsDisplay = true
    }
    override func layout() {
        super.layout()
        videoLayer.frame = bounds
        if let connection = videoLayer.connection, connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = true
        }
    }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if !cameraOn || !showVideo {
            let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 14, weight: .medium), .foregroundColor: mint]
            let text = (cameraOn ? "PREVIEW HIDDEN  ·  CAMERA ON" : "CAMERA OFF  ·  CONTROL OFF") as NSString
            let size = text.size(withAttributes: attrs)
            text.draw(at: NSPoint(x: (bounds.width - size.width) / 2, y: bounds.midY - 10), withAttributes: attrs)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuDelegate {
    private var window: NSWindow!
    private let camera = CameraEngine()
    private let gestures = GestureEngine()
    private let gate = ControlGate()
    private let pointer = SystemPointer()
    private var preview: PreviewView!
    private var cameraRunning = false
    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var timer: Timer?
    private var statusItem: NSStatusItem!
    private var stopMenuItem: NSMenuItem!
    private var startPointerMenuItem: NSMenuItem!
    private var startClicksMenuItem: NSMenuItem!
    private var statusMenuItem: NSMenuItem!
    private var reasonMenuItem: NSMenuItem!
    private var menuStart = MenuBarStartRequest()
    private var lastHandAt: Double?
    private var stateLabel = NSTextField(labelWithString: "CONTROL OFF")
    private var detailLabel = NSTextField(wrappingLabelWithString: "Start with a camera preview. Your Mac’s cursor will not move.")
    private var cameraLabel = NSTextField(wrappingLabelWithString: "Camera off. Nothing is recorded or uploaded.")
    private var permissionLabel = NSTextField(wrappingLabelWithString: "Accessibility is required only for Mac control.")
    private var cameraButton = NSButton()
    private var controlButton = NSButton()
    private var clicks = NSButton(checkboxWithTitle: "Allow left clicks and dragging", target: nil, action: nil)
    private var previewToggle = NSButton(checkboxWithTitle: "Show camera preview (optional)", target: nil, action: nil)
    private var displayPicker = NSPopUpButton()
    private var screenIDs: [CGDirectDisplayID] = []
    private var observers: [NSObjectProtocol] = []
    private var countdownStarted = 0.0

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        installLocalEmergencyMonitor()
        camera.onFrame = { [weak self] frame, capturedAt in self?.receive(frame, capturedAt: capturedAt) }
        camera.onPinchUncertain = { [weak self] frame, capturedAt in
            guard let self else { return }
            self.preview.hand = nil
            self.lastHandAt = nil
            _ = self.gestures.update(nil)
            self.cameraLabel.stringValue = "Hand visible, thumb uncertain. Open your hand toward the camera."
            self.pointer.post(self.gate.pinchUncertain(frame, capturedAt: capturedAt,
                now: ProcessInfo.processInfo.systemUptime, authorized: self.canControl))
            self.refresh()
        }
        camera.onFault = { [weak self] message in
            guard let self else { return }
            self.preview.hand = nil
            self.cameraLabel.stringValue = message
            // A failed/stale camera sample is never eligible for pointer recovery.
            self.lastHandAt = nil
            if self.menuStart.isPending { self.stopEverything("Start canceled: " + message) }
            else { self.stopControl("Control stopped: " + message + " Start again when ready.") }
        }
        camera.onStatus = { [weak self] message, running in
            guard let self else { return }
            self.cameraRunning = running
            self.cameraLabel.stringValue = message
            self.preview.cameraOn = running
            self.preview.needsLayout = true
            if !running {
                self.lastHandAt = nil
                // Preparing/starting are not terminal failures. A pending menu
                // intent still waits for the first fresh current-session frame.
                if !self.camera.isRequested { self.stopControl("Mac control is off. " + message) }
            }
            self.refresh()
        }
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.screensDidSleepNotification, NSWorkspace.sessionDidResignActiveNotification] {
            observers.append(workspaceCenter.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.stopEverything("Stopped for sleep or session change.") })
        }
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            self?.stopControl("Display configuration changed. Select a display and start again.")
            self?.reloadDisplays()
        })
        timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.menuStart.isPending,
               !self.menuStart.validate(now: ProcessInfo.processInfo.systemUptime, authorized: self.hasControlPermissionAndMonitors) {
                self.stopEverything("Menu start canceled or timed out. Choose Start again when ready.")
            }
            let actions = self.gate.tick(now: ProcessInfo.processInfo.systemUptime, authorized: self.canControl)
            self.pointer.post(actions)
            self.refresh()
        }
        RunLoop.main.add(timer!, forMode: .common)
        refresh()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private var hasControlPermissionAndMonitors: Bool { SystemPointer.isTrusted && globalMonitor != nil && localMonitor != nil }
    private var canControl: Bool { hasControlPermissionAndMonitors && cameraRunning }

    private var emergencyMask: NSEvent.EventTypeMask { [.keyDown, .mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel, .leftMouseDragged] }

    private func installLocalEmergencyMonitor() {
        guard localMonitor == nil else { return }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: emergencyMask) { [weak self] event in
            self?.handlePhysicalEvent(event)
            return event
        }
    }

    private func installEmergencyMonitors() {
        installLocalEmergencyMonitor()
        guard globalMonitor == nil else { return }
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: emergencyMask) { [weak self] event in self?.handlePhysicalEvent(event) }
    }

    private func removeEmergencyMonitors() {
        if let globalMonitor { NSEvent.removeMonitor(globalMonitor) }
        globalMonitor = nil
    }

    private func handlePhysicalEvent(_ event: NSEvent) {
        if event.type == .keyDown {
            if event.keyCode == 53, camera.isRequested || cameraRunning || gate.state != .off {
                stopEverything("Emergency stop: Escape. Camera and control are off.")
            } else if gate.state != .off || menuStart.isPending {
                stopControl("Paused: keyboard input took over. Start again when ready.")
            }
            return // Never reads, records, or transmits typed characters.
        }
        guard gate.state != .off || menuStart.isPending else { return }
        if event.cgEvent?.getIntegerValueField(.eventSourceUserData) == SystemPointer.eventTag { return }
        if event.type == .mouseMoved || event.type == .leftMouseDragged {
            guard abs(event.deltaX) + abs(event.deltaY) > 0 else { return }
        }
        stopControl("Paused: physical mouse or trackpad took over. Start again when ready.")
    }

    private func receive(_ frame: HandFrame?, capturedAt: Double) {
        preview.hand = frame
        let now = ProcessInfo.processInfo.systemUptime
        if menuStart.isPending, cameraRunning {
            if let mode = menuStart.take(capturedAt: capturedAt, now: now, authorized: canControl) {
                gestures.reset()
                countdownStarted = now
                guard gate.arm(now: now, mode: mode, authorized: canControl) else {
                    stopEverything("Menu start could not arm safely. Choose Start again.")
                    return
                }
            } else if !menuStart.isPending {
                stopEverything("Menu start canceled: camera data or permission was not ready. Choose Start again.")
                return
            }
        }
        lastHandAt = frame?.timestamp
        guard let frame else {
            if cameraRunning { cameraLabel.stringValue = "Camera on. Show one open hand in good light." }
            _ = gestures.update(nil)
            pointer.post(gate.noHand(capturedAt: capturedAt, now: now, authorized: canControl))
            refresh()
            return
        }
        let output = gestures.update(frame)
        if cameraRunning {
            cameraLabel.stringValue = output.ready ? "Hand detected. Point to aim; pinch only clicks when allowed." : "Hand detected. Keep your fingers open and steady to get ready."
        }
        pointer.post(gate.accept(output, capturedAt: frame.timestamp, now: now, authorized: canControl))
        refresh()
    }

    @objc private func toggleCamera() {
        if camera.isRequested || cameraRunning { stopEverything("Camera and Mac control are off.") }
        else { cameraButton.isEnabled = false; cameraLabel.stringValue = "Starting camera. Approve Camera when macOS asks. Preview stays hidden unless selected."; camera.start() }
    }

    @objc private func toggleControl() {
        if gate.state != .off { stopControl("Mac control paused. Camera preview remains on."); return }
        guard cameraRunning else { detailLabel.stringValue = "Start camera preview first."; return }
        guard SystemPointer.isTrusted else { detailLabel.stringValue = "Grant Accessibility to Airframe Mac in System Settings, then try again."; return }
        installEmergencyMonitors()
        guard canControl else { stopControl("Cannot install the emergency monitors. Mac control was not enabled."); return }
        gestures.reset()
        countdownStarted = ProcessInfo.processInfo.systemUptime
        _ = gate.arm(now: countdownStarted, mode: clicks.state == .on ? .clickAndDrag : .pointerOnly, authorized: canControl)
        refresh()
    }

    @objc private func startPointerFromMenu() { startFromMenu(mode: .pointerOnly) }
    @objc private func startClicksFromMenu() { startFromMenu(mode: .clickAndDrag) }

    private func startFromMenu(mode: ControlMode) {
        guard gate.state == .off, !menuStart.isPending else { return }
        // Never queue computer control across a first-time permission dialog.
        guard SystemPointer.isTrusted, AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            showWindow()
            stopControl("First approve Camera using Start camera and Accessibility using Set up Accessibility. Then choose a menu-bar Start option. Nothing was started.")
            return
        }
        installEmergencyMonitors()
        guard hasControlPermissionAndMonitors else {
            stopEverything("Cannot install emergency monitors. Menu start was not enabled.")
            return
        }
        clicks.state = mode == .clickAndDrag ? .on : .off
        previewToggle.state = .off
        preview.showVideo = false
        lastHandAt = nil
        menuStart.begin(mode: mode, now: ProcessInfo.processInfo.systemUptime, authorized: true)
        window.orderOut(nil)
        camera.start()
        refresh()
    }

    @objc private func previewChanged() { preview.showVideo = previewToggle.state == .on }

    @objc private func accessibilitySetup() {
        stopControl("Mac control is off while you review Accessibility permission.")
        SystemPointer.requestPermission()
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") { NSWorkspace.shared.open(url) }
    }

    @objc private func modeChanged() { stopControl("Click mode changed. Start Mac control again to confirm.") }
    @objc private func displayChanged() {
        stopControl("Display changed. Start Mac control again when ready.")
        if screenIDs.indices.contains(displayPicker.indexOfSelectedItem) { pointer.displayID = screenIDs[displayPicker.indexOfSelectedItem] }
    }
    @objc private func emergencyStop() { stopEverything("Emergency stop. Camera and control are off.") }
    @objc private func showWindow() {
        stopControl("Control paused for setup. Use a Start button when ready.")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc private func quit() { stopEverything("Airframe Mac is closing."); NSApp.terminate(nil) }

    private func stopControl(_ reason: String) {
        let canceledStartup = menuStart.isPending
        menuStart.cancel()
        pointer.post(gate.stop(reason))
        gestures.reset()
        lastHandAt = nil
        removeEmergencyMonitors()
        if canceledStartup {
            camera.stop()
            cameraRunning = false
            preview?.cameraOn = false
        }
        refresh()
    }
    private func stopEverything(_ reason: String) {
        stopControl(reason)
        camera.stop()
        cameraRunning = false
        preview?.hand = nil
        preview?.cameraOn = false
        refresh()
    }

    private func refresh() {
        guard window != nil else { return }
        if gate.state == .off, !menuStart.isPending, globalMonitor != nil { removeEmergencyMonitors() }
        cameraButton.isEnabled = true
        cameraButton.title = cameraRunning ? "Stop camera" : camera.isRequested ? "Cancel camera setup" : "Start camera"
        permissionLabel.stringValue = SystemPointer.isTrusted ? "✓ Accessibility approved for this app." : "Accessibility not approved. Preview still works."
        controlButton.isEnabled = cameraRunning && !menuStart.isPending
        controlButton.title = gate.state == .off ? "Start Mac control" : "Pause Mac control"
        clicks.isEnabled = gate.state == .off && !menuStart.isPending
        displayPicker.isEnabled = gate.state == .off && !menuStart.isPending
        stopMenuItem.isEnabled = camera.isRequested || cameraRunning || gate.state != .off || menuStart.isPending
        startPointerMenuItem.isEnabled = gate.state == .off && !menuStart.isPending
        startClicksMenuItem.isEnabled = startPointerMenuItem.isEnabled
        switch gate.state {
        case .off: stateLabel.stringValue = menuStart.isPending ? "STARTING CAMERA · CONTROL OFF" : "CONTROL OFF"
        case .countdown:
            let count = max(1, Int(ceil(3 - (ProcessInfo.processInfo.systemUptime - countdownStarted))))
            stateLabel.stringValue = "STARTING IN \(count)…"
        case .waitingForHand: stateLabel.stringValue = "SHOW AN OPEN HAND"
        case .recoveringHand: stateLabel.stringValue = "POINTER FROZEN · FINDING HAND"
        case .recoveringPinch: stateLabel.stringValue = "POINTER FROZEN · OPEN HAND TO CONTINUE"
        case .active: stateLabel.stringValue = clicks.state == .on ? "LIVE · CLICK + DRAG" : "LIVE · POINTER ONLY"
        }
        detailLabel.stringValue = menuStart.isPending ? "Waiting for fresh camera data. Move the mouse or press Escape to cancel." : gate.reason
        refreshMenuIndicator()
    }

    private func refreshMenuIndicator() {
        let indicator = MenuBarIndicator.resolve(state: gate.state, pending: menuStart.isPending,
            cameraRequested: camera.isRequested, cameraRunning: cameraRunning, authorized: canControl,
            lastHandAt: lastHandAt, now: ProcessInfo.processInfo.systemUptime)
        let color: NSColor = indicator == .tracking ? .systemGreen : indicator == .off ? .secondaryLabelColor : .systemOrange
        let countdown = gate.state == .countdown ? " \(max(1, Int(ceil(3 - (ProcessInfo.processInfo.systemUptime - countdownStarted)))))" : ""
        let title = NSMutableAttributedString(string: "●", attributes: [.foregroundColor: color, .font: NSFont.systemFont(ofSize: 12, weight: .bold)])
        title.append(NSAttributedString(string: " A \(indicator.shortLabel)\(countdown)", attributes: [.foregroundColor: NSColor.labelColor, .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium)]))
        statusItem.button?.attributedTitle = title
        let mode = clicks.state == .on ? "Pinch clicks enabled" : "Pointer only"
        statusItem.button?.setAccessibilityLabel("Airframe: \(indicator.description). \(mode).")
        statusItem.button?.toolTip = "\(indicator.description) · \(mode). Click for Start, Stop, or setup."
        statusMenuItem.title = "\(indicator.description) · \(mode)"
        reasonMenuItem.title = detailLabel.stringValue
    }

    func menuWillOpen(_ menu: NSMenu) {
        // Even a gesture-opened menu must not remain under synthetic click control.
        if gate.state != .off || menuStart.isPending { stopControl("Control paused while the Airframe menu is open. Choose Start to resume.") }
        refresh()
    }

    private func buildMenu() {
        let mainMenu = NSMenu()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Airframe Mac", action: #selector(showWindow), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Airframe Mac", action: #selector(quit), keyEquivalent: "q")
        let appItem = NSMenuItem(); appItem.submenu = appMenu; mainMenu.addItem(appItem); NSApp.mainMenu = mainMenu
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "A· OFF"
        let menu = NSMenu()
        menu.autoenablesItems = false
        menu.delegate = self
        statusMenuItem = menu.addItem(withTitle: "Camera and control off", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        reasonMenuItem = menu.addItem(withTitle: "Choose Start when ready.", action: nil, keyEquivalent: "")
        reasonMenuItem.isEnabled = false
        menu.addItem(.separator())
        startPointerMenuItem = menu.addItem(withTitle: "Start pointer only — camera on, preview hidden", action: #selector(startPointerFromMenu), keyEquivalent: "")
        startClicksMenuItem = menu.addItem(withTitle: "Start with pinch clicks — camera on, preview hidden", action: #selector(startClicksFromMenu), keyEquivalent: "")
        stopMenuItem = menu.addItem(withTitle: "STOP CAMERA & CONTROL", action: #selector(emergencyStop), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Show setup / optional camera preview", action: #selector(showWindow), keyEquivalent: "")
        menu.addItem(withTitle: "Quit Airframe Mac", action: #selector(quit), keyEquivalent: "")
        for item in appMenu.items + menu.items { item.target = self }
        statusItem.menu = menu
    }

    private func label(_ text: String, size: CGFloat = 13, bold: Bool = false) -> NSTextField {
        let field = NSTextField(wrappingLabelWithString: text)
        field.font = .systemFont(ofSize: size, weight: bold ? .semibold : .regular)
        field.textColor = .labelColor
        return field
    }
    private func button(_ title: String, action: Selector, prominent: Bool = false) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        button.controlSize = .large
        if prominent { button.bezelColor = mint; button.contentTintColor = .black }
        return button
    }
    private func stack(_ views: [NSView], horizontal: Bool = false, spacing: CGFloat = 12) -> NSStackView {
        let stack = NSStackView(views: views)
        stack.orientation = horizontal ? .horizontal : .vertical
        stack.alignment = horizontal ? .top : .leading
        stack.spacing = spacing
        return stack
    }
    private func reloadDisplays() {
        screenIDs = NSScreen.screens.compactMap { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value }
        displayPicker.removeAllItems()
        for (index, screen) in NSScreen.screens.enumerated() { displayPicker.addItem(withTitle: "\(index + 1). \(screen.localizedName)") }
        if let index = screenIDs.firstIndex(of: CGMainDisplayID()) { displayPicker.selectItem(at: index) }
        if screenIDs.indices.contains(displayPicker.indexOfSelectedItem) { pointer.displayID = screenIDs[displayPicker.indexOfSelectedItem] }
    }

    private func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 850, height: 735), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Airframe Mac — Local Gesture Control"
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 820, height: 735)
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.075, blue: 0.095, alpha: 1)
        window.center()
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        let title = label("airframe.  /  MAC \(version)", size: 30, bold: true); title.textColor = mint
        let subtitle = label("Your hands. Your whole workspace.", size: 20, bold: true)
        let intro = label("A local companion for controlling your Mac’s cursor across apps. No browser connection, cloud commands, or video uploads.")
        preview = PreviewView(session: camera.session)
        preview.translatesAutoresizingMaskIntoConstraints = false
        preview.widthAnchor.constraint(equalToConstant: 430).isActive = true
        preview.heightAnchor.constraint(equalToConstant: 300).isActive = true
        cameraLabel.font = .systemFont(ofSize: 12)
        previewToggle.target = self; previewToggle.action = #selector(previewChanged)
        let left = stack([preview, previewToggle, cameraLabel, label("Point to aim • Pinch to press • Open to release", size: 13, bold: true), label("Amber HOLD: open your hand near its last position for ½s.\nBrief thumb-only misses can hold before a click; lost hands or uncertain drags stop click control.\nIf control is off, press Start again. Use good light.", size: 12)])
        cameraButton = button("Start camera", action: #selector(toggleCamera), prominent: true)
        controlButton = button("Start Mac control", action: #selector(toggleControl))
        clicks.target = self; clicks.action = #selector(modeChanged)
        clicks.setAccessibilityHelp("Off by default. When enabled and Mac control is started, pinching presses the left mouse button and holding drags. Releasing may activate the item underneath.")
        displayPicker.target = self; displayPicker.action = #selector(displayChanged)
        reloadDisplays()
        permissionLabel.font = .systemFont(ofSize: 11)
        let right = stack([label("01  CAMERA · PREVIEW OPTIONAL", size: 11, bold: true), cameraButton,
                           label("02  PERMISSION", size: 11, bold: true), button("Set up Accessibility", action: #selector(accessibilitySetup)), permissionLabel,
                           label("03  CONTROL", size: 11, bold: true), displayPicker, clicks, controlButton,
                           button("STOP CAMERA & CONTROL", action: #selector(emergencyStop))], spacing: 10)
        right.widthAnchor.constraint(equalToConstant: 320).isActive = true
        stateLabel.font = .monospacedSystemFont(ofSize: 15, weight: .semibold); stateLabel.textColor = mint
        detailLabel.font = .systemFont(ofSize: 12)
        let warning = label("Use A in the top menu bar to start with this window hidden. Green = live; amber = waiting or camera only.\nClosing this window stops capture; Airframe stays in the menu bar. Escape stops while starting or armed.\nMouse/keyboard pauses control. Stop before locking or leaving. Experimental; no right-click, scrolling or typing.", size: 11)
        warning.textColor = .secondaryLabelColor
        let all = stack([title, subtitle, intro, stack([left, right], horizontal: true, spacing: 24), stateLabel, detailLabel, warning], spacing: 13)
        all.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(all)
        NSLayoutConstraint.activate([all.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 24), all.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -24), all.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 24), all.bottomAnchor.constraint(lessThanOrEqualTo: window.contentView!.bottomAnchor, constant: -18)])
    }

    func windowWillClose(_ notification: Notification) { stopEverything("Airframe closed.") }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }
    func applicationWillTerminate(_ notification: Notification) {
        stopEverything("Airframe quit.")
        if let localMonitor { NSEvent.removeMonitor(localMonitor) }
        localMonitor = nil
        timer?.invalidate()
        for observer in observers { NotificationCenter.default.removeObserver(observer); NSWorkspace.shared.notificationCenter.removeObserver(observer) }
    }
}
