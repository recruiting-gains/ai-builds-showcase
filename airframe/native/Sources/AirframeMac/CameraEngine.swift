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
    /// Nil means a fresh, successful inference could not reliably find the hand.
    /// Both nil and nonnil results carry the sample's monotonic presentation time.
    var onFrame: ((HandFrame?, Double) -> Void)?
    var onPinchUncertain: ((PinchUncertainFrame, Double) -> Void)?
    /// Capture, inference, and stale-delivery failures are never recoverable absence.
    var onFault: ((String) -> Void)?
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
    private var inferenceCadence = InferenceCadence()

    private struct FrameDelivery {
        let generation: UInt64
        let payload: TrackingDelivery
    }

    private enum SetupFailure: Error {
        case noCamera
        case cannotAddInput
        case cannotAddOutput
        case couldNotStart
    }

    private enum ObservationFailure: Error {
        case invalidTiming
        case invalidGeometry
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
        pendingDelivery = nil
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
        pendingDelivery = nil
        stateLock.unlock()

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
        let receivedAt = ProcessInfo.processInfo.systemUptime
        stateLock.lock()
        let token = generation
        // A queued callback from an old capture output must not acquire the
        // generation of a newly started session and become a fresh observation.
        let allowed = wantsCamera && isDeliveringFrames && activeOutputID == ObjectIdentifier(output)
        stateLock.unlock()
        guard allowed else { return }
        if inferenceGeneration != token {
            inferenceGeneration = token
            inferenceCadence.reset()
        }
        guard inferenceCadence.shouldProcess(at: receivedAt) else { return }

        autoreleasepool {
            guard CMSampleBufferDataIsReady(sampleBuffer), let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
                sendFault("Camera supplied an invalid image buffer. Controls are paused.", generation: token)
                return
            }
            let width = CVPixelBufferGetWidth(buffer)
            let height = CVPixelBufferGetHeight(buffer)
            guard width > 0, height > 0 else {
                sendFault("Camera image dimensions are invalid. Controls are paused.", generation: token)
                return
            }
            guard let capturedAt = captureTimestamp(for: sampleBuffer) else {
                sendFault("Camera sample timing could not be verified. Controls are paused.", generation: token)
                return
            }
            let timing = TrackingDelivery.observation(nil, capturedAt: capturedAt)
                .validated(at: ProcessInfo.processInfo.systemUptime)
            if case .fault = timing {
                enqueue(timing, generation: token)
                return
            }
            do {
                // Synchronous Vision work occurs only on the serial delegate queue;
                // late capture frames are discarded rather than queued for analysis.
                try VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:]).perform([handRequest])
                let delivery = try Self.makeDelivery(from: handRequest.results?.first, timestamp: capturedAt,
                                                     aspectRatio: Double(width) / Double(height))
                enqueue(delivery, generation: token)
            } catch {
                sendFault("Hand detection encountered an error. Controls are paused.", generation: token)
            }
        }
    }

    /// Apple documents every AVCaptureOutput timestamp on synchronizationClock.
    /// Convert to the host clock to measure age, then subtract that age from a
    /// contemporaneous uptime value. This never assumes the clocks share an epoch.
    /// Reported presentation time is not authenticated sensor exposure time;
    /// camera drivers and virtual cameras can still introduce unreported latency.
    private func captureTimestamp(for sampleBuffer: CMSampleBuffer) -> Double? {
        guard let sessionClock = session.synchronizationClock else { return nil }
        let presentation = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        guard presentation.isNumeric else { return nil }
        let hostClock = CMClockGetHostTimeClock()
        let hostPresentation = CMSyncConvertTime(presentation, from: sessionClock, to: hostClock)
        guard hostPresentation.isNumeric else { return nil }
        let uptime = ProcessInfo.processInfo.systemUptime
        let hostNow = CMClockGetTime(hostClock)
        guard hostNow.isNumeric else { return nil }
        let age = CMTimeGetSeconds(CMTimeSubtract(hostNow, hostPresentation))
        guard age.isFinite, age >= 0 else { return nil }
        let capturedAt = uptime - age
        guard capturedAt.isFinite, capturedAt >= 0 else { return nil }
        return capturedAt
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

    private func sendFault(_ message: String, generation token: UInt64) {
        enqueue(.fault(message), generation: token)
    }

    private func enqueue(_ payload: TrackingDelivery, generation token: UInt64) {
        let now = ProcessInfo.processInfo.systemUptime
        stateLock.lock()
        guard generation == token, wantsCamera && isDeliveringFrames else {
            stateLock.unlock()
            return
        }
        // Keep one event, but never erase an unhandled fault or first absence
        // with a newer hand. Click/drag must observe loss before another hand.
        // Aging pending absences/observations become faults before replacement.
        // Old-generation faults cannot poison this generation's first delivery.
        let pending = pendingDelivery?.generation == token ? pendingDelivery?.payload.validated(at: now) : nil
        let next = TrackingDelivery.coalesce(pending: pending, incoming: payload.validated(at: now))
        pendingDelivery = FrameDelivery(generation: token, payload: next)
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
            guard let delivery, self.isCurrent(delivery.generation, requiresRunning: true) else { return }
            switch delivery.payload.validated(at: ProcessInfo.processInfo.systemUptime) {
            case let .observation(frame, capturedAt):
                self.onFrame?(frame, capturedAt)
            case let .pinchUncertain(frame, capturedAt):
                self.onPinchUncertain?(frame, capturedAt)
            case let .fault(message):
                self.onFault?(message)
            }
        }
    }

    private static func makeHandRequest() -> VNDetectHumanHandPoseRequest {
        let request = VNDetectHumanHandPoseRequest()
        request.revision = VNDetectHumanHandPoseRequestRevision1
        request.maximumHandCount = 1
        return request
    }

    private static func makeDelivery(from hand: VNHumanHandPoseObservation?, timestamp: Double, aspectRatio: Double) throws -> TrackingDelivery {
        guard timestamp.isFinite, timestamp >= 0 else { throw ObservationFailure.invalidTiming }
        guard aspectRatio.isFinite, aspectRatio > 0 else { throw ObservationFailure.invalidGeometry }
        guard let hand,
              let wrist = try? hand.recognizedPoint(.wrist),
              let middle = try? hand.recognizedPoint(.middleMCP),
              let index = try? hand.recognizedPoint(.indexTip) else { return .observation(nil, capturedAt: timestamp) }
        let thumb = try? hand.recognizedPoint(.thumbTip)
        let pointerPoints = [wrist, middle, index]
        let points = pointerPoints + (thumb.map { [$0] } ?? [])
        guard points.allSatisfy({ $0.confidence.isFinite && (0...1).contains($0.confidence) }) else {
            throw ObservationFailure.invalidGeometry
        }
        // Low-confidence joint coordinates are not trustworthy geometry. Treat
        // them as uncertain detection, not as a capture/inference exception.
        guard pointerPoints.allSatisfy({ $0.confidence >= 0.55 }) else { return .observation(nil, capturedAt: timestamp) }
        guard pointerPoints.allSatisfy({ point in
            point.location.x.isFinite && point.location.y.isFinite
                && (0...1).contains(point.location.x) && (0...1).contains(point.location.y)
        }) else { throw ObservationFailure.invalidGeometry }
        func normalized(_ point: VNRecognizedPoint) -> Point2D {
            // Vision uses a lower-left origin. Core uses mirrored, top-left coordinates.
            Point2D(x: 1 - Double(point.location.x), y: 1 - Double(point.location.y))
        }
        guard let thumb, thumb.confidence >= 0.55 else {
            guard pointerPoints.allSatisfy({ $0.confidence >= 0.70 }) else { return .observation(nil, capturedAt: timestamp) }
            return .pinchUncertain(PinchUncertainFrame(timestamp: timestamp, aspectRatio: aspectRatio,
                wrist: normalized(wrist), middleMCP: normalized(middle), indexTip: normalized(index),
                confidence: Double(pointerPoints.map(\.confidence).min() ?? 0)), capturedAt: timestamp)
        }
        guard thumb.location.x.isFinite, thumb.location.y.isFinite,
              (0...1).contains(thumb.location.x), (0...1).contains(thumb.location.y) else {
            throw ObservationFailure.invalidGeometry
        }
        return .observation(HandFrame(timestamp: timestamp, aspectRatio: aspectRatio,
                         wrist: normalized(wrist), middleMCP: normalized(middle),
                         indexTip: normalized(index), thumbTip: normalized(thumb),
                         confidence: Double(points.map(\.confidence).min() ?? 0)), capturedAt: timestamp)
    }

    /// Optional CLI smoke-test seam: real Vision inference on a caller-provided
    /// still image, with no capture device, permission request, file, or network I/O.
    static func detectHand(in image: CGImage, timestamp: Double) throws -> HandFrame? {
        let request = makeHandRequest()
        try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
        let delivery = try makeDelivery(from: request.results?.first, timestamp: timestamp,
                                       aspectRatio: Double(image.width) / Double(image.height))
        if case let .observation(frame, _) = delivery { return frame }
        return nil
    }
}
