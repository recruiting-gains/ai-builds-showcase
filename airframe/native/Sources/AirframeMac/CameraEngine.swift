import AirframeCore
import AVFoundation
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import Vision

/// Local-only camera capture. Constructing this object never opens a device or
/// asks for permission. Assign callbacks on the main thread; they run there too.
final class CameraEngine: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    /// The UI may attach a preview layer; session configuration belongs to this engine.
    let session = AVCaptureSession()
    var onFrame: ((HandFrame?) -> Void)?
    /// The Boolean is true only while this generation's capture session is running.
    var onStatus: ((String, Bool) -> Void)?

    /// Includes both a pending permission/start request and an active stream.
    var isRequested: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return wantsCamera
    }

    private let sessionQueue = DispatchQueue(label: "airframe.camera.session", qos: .userInitiated)
    private let visionQueue = DispatchQueue(label: "airframe.camera.vision", qos: .userInitiated)
    private let stateLock = NSLock()
    private var generation: UInt64 = 0
    private var wantsCamera = false
    private var isDeliveringFrames = false
    private var activeOutputID: ObjectIdentifier?
    private var pendingDelivery: FrameDelivery?
    private var frameDeliveryScheduled = false

    // These properties are accessed only on sessionQueue (except during deinit,
    // after no queued operation can still retain this engine).
    private var videoOutput: AVCaptureVideoDataOutput?
    private var observers: [NSObjectProtocol] = []
    private var sessionGeneration: UInt64?

    // These properties are accessed only on the serial visionQueue.
    private let handRequest = CameraEngine.makeHandRequest()
    private var inferenceGeneration: UInt64 = 0
    private var lastInferenceTime = -Double.infinity

    private struct FrameDelivery {
        let generation: UInt64
        let frame: HandFrame?
        let requiresRunning: Bool
    }

    private enum SetupFailure: Error {
        case noCamera
        case cannotAddInput
        case cannotAddOutput
        case couldNotStart
    }

    override init() {
        super.init()
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        let captureSession = session
        let output = videoOutput
        sessionQueue.async {
            output?.setSampleBufferDelegate(nil, queue: nil)
            if captureSession.isRunning { captureSession.stopRunning() }
        }
    }

    /// Invoke only from an explicit user action. Repeated calls while starting
    /// or running are idempotent; a stopped generation can never restart itself.
    func start() {
        stateLock.lock()
        guard !wantsCamera else { stateLock.unlock(); return }
        generation &+= 1
        let token = generation
        wantsCamera = true
        isDeliveringFrames = false
        activeOutputID = nil
        stateLock.unlock()

        sendStatus("Preparing camera permission…", running: false, generation: token)
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isCurrent(token, requiresWanted: true) else { return }
            // macOS otherwise raises an Objective-C exception, not a catchable Swift error.
            guard let explanation = Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String,
                  !explanation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                self.fail(token, message: "Camera unavailable: launch the packaged Airframe app with its camera usage description.")
                return
            }
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                self.scheduleStart(token)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                    guard let self, self.isCurrent(token, requiresWanted: true) else { return }
                    if granted {
                        self.scheduleStart(token)
                    } else {
                        self.fail(token, message: "Camera permission was denied. You can enable it in System Settings → Privacy & Security → Camera.")
                    }
                }
            case .denied, .restricted:
                self.fail(token, message: "Camera access is blocked. Check System Settings → Privacy & Security → Camera, then choose Start camera again.")
            @unknown default:
                self.fail(token, message: "Camera authorization is unavailable on this Mac.")
            }
        }
    }

    /// Invalidates permission callbacks, queued inference, and queued UI delivery
    /// immediately, then turns off hardware on the session queue.
    func stop() {
        stop(expectedGeneration: nil, finalMessage: "Camera stopped.")
    }

    private func fail(_ token: UInt64, message: String) {
        stop(expectedGeneration: token, finalMessage: message)
    }

    private func stop(expectedGeneration: UInt64?, finalMessage: String) {
        stateLock.lock()
        if let expectedGeneration, generation != expectedGeneration {
            stateLock.unlock()
            return
        }
        let stoppedGeneration = generation
        generation &+= 1
        let token = generation
        wantsCamera = false
        isDeliveringFrames = false
        activeOutputID = nil
        stateLock.unlock()

        sendFrame(nil, generation: token, requiresRunning: false)
        sendStatus("Stopping camera…", running: false, generation: token)
        sessionQueue.async { [weak self] in
            guard let self else { return }
            // A concurrent new start may have queued its setup before this
            // teardown. Never stop that newer generation's hardware session.
            if let active = self.sessionGeneration, active > stoppedGeneration { return }
            self.teardownSession()
            self.sendStatus(finalMessage, running: false, generation: token)
        }
    }

    private func scheduleStart(_ token: UInt64) {
        guard isCurrent(token, requiresWanted: true) else { return }
        sendStatus("Starting the local camera…", running: false, generation: token)
        sessionQueue.async { [weak self] in
            guard let self, self.isCurrent(token, requiresWanted: true) else { return }
            do {
                self.teardownSession()
                self.sessionGeneration = token
                try self.configureSession()
                guard self.isCurrent(token, requiresWanted: true) else {
                    self.teardownSession()
                    return
                }
                self.observeInterruptions(generation: token)
                self.session.startRunning()
                guard self.isCurrent(token, requiresWanted: true) else {
                    self.teardownSession()
                    return
                }
                guard self.session.isRunning else { throw SetupFailure.couldNotStart }
                self.stateLock.lock()
                let stillCurrent = self.generation == token && self.wantsCamera
                if stillCurrent, let output = self.videoOutput {
                    self.activeOutputID = ObjectIdentifier(output)
                    self.isDeliveringFrames = true
                }
                self.stateLock.unlock()
                if stillCurrent {
                    self.sendStatus("Camera on. Hand detection stays on this Mac.", running: true, generation: token)
                } else {
                    self.teardownSession()
                }
            } catch {
                self.teardownSession()
                let message: String
                switch error {
                case SetupFailure.noCamera:
                    message = "No camera is available. Connect a camera, then choose Start camera again."
                default:
                    message = "The camera could not start. Close other camera apps, check permission, and try again."
                }
                self.fail(token, message: message)
            }
        }
    }

    private func configureSession() throws {
        guard let device = AVCaptureDevice.default(for: .video) else { throw SetupFailure.noCamera }
        let input = try AVCaptureDeviceInput(device: device)
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: visionQueue)

        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.vga640x480) { session.sessionPreset = .vga640x480 }
        else if session.canSetSessionPreset(.medium) { session.sessionPreset = .medium }
        guard session.canAddInput(input) else { throw SetupFailure.cannotAddInput }
        session.addInput(input)
        guard session.canAddOutput(output) else { throw SetupFailure.cannotAddOutput }
        session.addOutput(output)
        videoOutput = output
        if let connection = output.connection(with: .video), connection.isVideoMirroringSupported {
            // Landmarks are mirrored exactly once after inference. Preview mirroring
            // is independent and should be enabled by the UI's preview layer.
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = false
        }
    }

    private func teardownSession() {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        videoOutput?.setSampleBufferDelegate(nil, queue: nil)
        if session.isRunning { session.stopRunning() }
        session.beginConfiguration()
        for output in session.outputs { session.removeOutput(output) }
        for input in session.inputs { session.removeInput(input) }
        session.commitConfiguration()
        videoOutput = nil
        sessionGeneration = nil
    }

    private func observeInterruptions(generation token: UInt64) {
        let notifications: [(Notification.Name, String)] = [
            (AVCaptureSession.wasInterruptedNotification, "Camera interrupted. Controls are paused; choose Start camera when you are ready."),
            (AVCaptureSession.runtimeErrorNotification, "Camera stopped after an error. Controls are paused; choose Start camera to try again."),
        ]
        for (name, message) in notifications {
            let observer = NotificationCenter.default.addObserver(forName: name, object: session, queue: nil) { [weak self] _ in
                // Deliberately never auto-resume after interruption or media-service reset.
                self?.fail(token, message: message)
            }
            observers.append(observer)
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let timestamp = ProcessInfo.processInfo.systemUptime
        stateLock.lock()
        let token = generation
        // A queued callback from an old capture output must not acquire the
        // generation of a newly started session and become a fresh observation.
        let allowed = wantsCamera && isDeliveringFrames && activeOutputID == ObjectIdentifier(output)
        stateLock.unlock()
        guard allowed else { return }
        if inferenceGeneration != token {
            inferenceGeneration = token
            lastInferenceTime = -Double.infinity
        }
        guard timestamp - lastInferenceTime >= 1.0 / 24.0 else { return }
        lastInferenceTime = timestamp

        autoreleasepool {
            guard CMSampleBufferDataIsReady(sampleBuffer), let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
                sendFrame(nil, generation: token)
                return
            }
            let width = CVPixelBufferGetWidth(buffer)
            let height = CVPixelBufferGetHeight(buffer)
            guard width > 0, height > 0 else { sendFrame(nil, generation: token); return }
            do {
                // Synchronous Vision work occurs only on the serial delegate queue;
                // late capture frames are discarded rather than queued for analysis.
                try VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:]).perform([handRequest])
                let frame = Self.makeFrame(from: handRequest.results?.first, timestamp: timestamp,
                                           aspectRatio: Double(width) / Double(height))
                sendFrame(frame, generation: token)
            } catch {
                // An inference failure is tracking loss, never permission to retain a drag.
                sendFrame(nil, generation: token)
            }
        }
    }

    private func isCurrent(_ token: UInt64, requiresWanted: Bool = false, requiresRunning: Bool = false) -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return generation == token && (!requiresWanted || wantsCamera)
            && (!requiresRunning || (wantsCamera && isDeliveringFrames))
    }

    private func sendStatus(_ message: String, running: Bool, generation token: UInt64) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isCurrent(token, requiresRunning: running) else { return }
            self.onStatus?(message, running)
        }
    }

    private func sendFrame(_ frame: HandFrame?, generation token: UInt64, requiresRunning: Bool = true) {
        stateLock.lock()
        guard generation == token, !requiresRunning || (wantsCamera && isDeliveringFrames) else {
            stateLock.unlock()
            return
        }
        // Coalesce to one pending main-queue delivery. A busy UI cannot accumulate
        // a backlog of old hand positions and play them back after it recovers.
        pendingDelivery = FrameDelivery(generation: token, frame: frame, requiresRunning: requiresRunning)
        let shouldSchedule = !frameDeliveryScheduled
        frameDeliveryScheduled = true
        stateLock.unlock()
        guard shouldSchedule else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.stateLock.lock()
            let delivery = self.pendingDelivery
            self.pendingDelivery = nil
            self.frameDeliveryScheduled = false
            self.stateLock.unlock()
            guard let delivery, self.isCurrent(delivery.generation, requiresRunning: delivery.requiresRunning) else { return }
            if let frame = delivery.frame, ProcessInfo.processInfo.systemUptime - frame.timestamp > 0.2 {
                self.onFrame?(nil)
            } else {
                self.onFrame?(delivery.frame)
            }
        }
    }

    private static func makeHandRequest() -> VNDetectHumanHandPoseRequest {
        let request = VNDetectHumanHandPoseRequest()
        request.revision = VNDetectHumanHandPoseRequestRevision1
        request.maximumHandCount = 1
        return request
    }

    private static func makeFrame(from hand: VNHumanHandPoseObservation?, timestamp: Double, aspectRatio: Double) -> HandFrame? {
        guard let hand, timestamp.isFinite, timestamp >= 0, aspectRatio.isFinite, aspectRatio > 0,
              let wrist = try? hand.recognizedPoint(.wrist),
              let middle = try? hand.recognizedPoint(.middleMCP),
              let index = try? hand.recognizedPoint(.indexTip),
              let thumb = try? hand.recognizedPoint(.thumbTip) else { return nil }
        let points = [wrist, middle, index, thumb]
        guard points.allSatisfy({ point in
            point.confidence.isFinite && (0.55...1).contains(point.confidence)
                && point.location.x.isFinite && point.location.y.isFinite
                && (0...1).contains(point.location.x) && (0...1).contains(point.location.y)
        }) else { return nil }
        func normalized(_ point: VNRecognizedPoint) -> Point2D {
            // Vision uses a lower-left origin. Core uses mirrored, top-left coordinates.
            Point2D(x: 1 - Double(point.location.x), y: 1 - Double(point.location.y))
        }
        return HandFrame(timestamp: timestamp, aspectRatio: aspectRatio,
                         wrist: normalized(wrist), middleMCP: normalized(middle),
                         indexTip: normalized(index), thumbTip: normalized(thumb),
                         confidence: Double(points.map(\.confidence).min() ?? 0))
    }

    /// Optional CLI smoke-test seam: real Vision inference on a caller-provided
    /// still image, with no capture device, permission request, file, or network I/O.
    static func detectHand(in image: CGImage, timestamp: Double) throws -> HandFrame? {
        let request = makeHandRequest()
        try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
        return makeFrame(from: request.results?.first, timestamp: timestamp,
                         aspectRatio: Double(image.width) / Double(image.height))
    }
}
