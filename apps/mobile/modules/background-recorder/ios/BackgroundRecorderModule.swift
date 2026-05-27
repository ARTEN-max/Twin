import ExpoModulesCore
import AVFoundation
import Speech

// MARK: - BackgroundAudioRecorder Singleton

/// Manages AVAudioRecorder lifecycle completely outside the JS thread.
/// This singleton survives JS thread suspension — iOS keeps the audio session
/// alive as long as `UIBackgroundModes: ["audio"]` is declared and the session
/// is active when the screen locks.
///
/// Owns its own rotation timer so chunks are produced even while the screen is
/// locked and the JS thread is suspended. The timer fires on the main run loop;
/// active audio I/O keeps the run loop running through lock.
final class BackgroundAudioRecorder: NSObject, AVAudioRecorderDelegate {

  static let shared = BackgroundAudioRecorder()

  private var recorder: AVAudioRecorder?
  private var currentFileURL: URL?
  private var recordingStartTime: Date?
  private(set) var isRecording = false

  private var rotationTimer: Timer?
  private var rotationIntervalSec: TimeInterval = 0
  private var nextPartIndex: Int = 1

  // Callbacks fired back to the Expo module which forwards them as events.
  // (uri, partIndex) for rotated chunks.
  var onChunkRotated: ((String, Int) -> Void)?
  var onError: ((String) -> Void)?

  private override init() {
    super.init()
    registerNotifications()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Public API

  /// Starts recording. If `rotationIntervalSec > 0`, schedules a timer that
  /// stops the current chunk and starts a new one every `rotationIntervalSec`,
  /// firing `onChunkRotated` for each finished chunk.
  func start(rotationIntervalSec: Double) throws -> String {
    try configureAudioSession()

    nextPartIndex = 1
    self.rotationIntervalSec = rotationIntervalSec

    let url = try beginRecording()
    isRecording = true

    if rotationIntervalSec > 0 {
      scheduleRotationTimer()
    }

    return url.absoluteString
  }

  /// Manually rotate chunks. Usually unnecessary now that rotation runs in the
  /// timer, but kept for tests and forced-rotation callers.
  func stopChunk() throws -> String {
    guard let _ = recorder, isRecording else {
      throw NSError(domain: "BackgroundRecorder", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Not recording"])
    }
    return try rotateChunkInternal()
  }

  /// Stops recording entirely. Invalidates the rotation timer, deactivates the
  /// audio session, returns the final chunk's URI and the partIndex it should
  /// be uploaded under.
  func stop() -> (uri: String, partIndex: Int)? {
    rotationTimer?.invalidate()
    rotationTimer = nil

    guard let rec = recorder else { return nil }
    rec.stop()
    let uri = currentFileURL?.absoluteString
    let partIndex = nextPartIndex

    recorder = nil
    currentFileURL = nil
    recordingStartTime = nil
    isRecording = false

    try? AVAudioSession.sharedInstance().setActive(false,
      options: .notifyOthersOnDeactivation)

    guard let finalURI = uri else { return nil }
    return (finalURI, partIndex)
  }

  /// Synchronous status snapshot.
  func status() -> [String: Any] {
    let duration: Double
    if let start = recordingStartTime, isRecording {
      duration = Date().timeIntervalSince(start)
    } else {
      duration = 0
    }
    return [
      "isRecording": isRecording,
      "duration": duration,
      "uri": currentFileURL?.absoluteString ?? NSNull(),
      "nextPartIndex": nextPartIndex,
    ]
  }

  // MARK: - Internal recording lifecycle

  /// Builds a new AVAudioRecorder and starts it. Caller updates `isRecording`.
  /// Returns the URL the recorder is writing to.
  @discardableResult
  private func beginRecording() throws -> URL {
    let url = newRecordingURL()
    let rec = try AVAudioRecorder(url: url, settings: recorderSettings())
    rec.delegate = self
    rec.isMeteringEnabled = false

    guard rec.record() else {
      throw NSError(domain: "BackgroundRecorder", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "AVAudioRecorder.record() returned false"])
    }

    recorder = rec
    currentFileURL = url
    recordingStartTime = Date()
    return url
  }

  /// Stops the current chunk and begins the next one in a single atomic step.
  /// Returns the URI of the finished chunk; the new chunk is already running.
  /// Fires `onChunkRotated` with the finished chunk's URI and partIndex.
  @discardableResult
  private func rotateChunkInternal() throws -> String {
    guard let rec = recorder else {
      throw NSError(domain: "BackgroundRecorder", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Not recording"])
    }

    rec.stop()
    let finishedURI = currentFileURL?.absoluteString ?? ""
    let finishedPart = nextPartIndex
    nextPartIndex += 1

    do {
      _ = try beginRecording()
    } catch {
      isRecording = false
      throw error
    }

    onChunkRotated?(finishedURI, finishedPart)
    return finishedURI
  }

  private func scheduleRotationTimer() {
    rotationTimer?.invalidate()
    // Use a Timer scheduled on the main run loop. Active audio recording keeps
    // the run loop alive across lock screen / background, so the timer fires
    // even while the JS thread is suspended.
    let timer = Timer(timeInterval: rotationIntervalSec, repeats: true) { [weak self] _ in
      guard let self = self, self.isRecording else { return }
      do {
        _ = try self.rotateChunkInternal()
      } catch {
        self.onError?("Rotation failed: \(error.localizedDescription)")
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    rotationTimer = timer
  }

  private func recorderSettings() -> [String: Any] {
    return [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 16000,   // 16kHz is sufficient for speech / Whisper
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
      AVEncoderBitRateKey: 32000, // 32kbps ≈ 14 MB/hour, well under Whisper's 25 MB limit
    ]
  }

  // MARK: - On-device transcription (SFSpeechRecognizer)
  //
  // This is the cost-floor lever: every chunk transcribed on-device is one
  // chunk we don't pay Whisper for. Caller passes the chunk's file URL and
  // gets back the recognized text. Server-side Whisper remains as the safety
  // net — if recognition fails or returns empty, the server transcribes.

  /// Asks the user for speech-recognition permission. Idempotent; safe to call
  /// repeatedly. Resolves with the granted/denied/restricted/notDetermined raw
  /// value so the caller can react in JS.
  func requestSpeechAuthorization(completion: @escaping (SFSpeechRecognizerAuthorizationStatus) -> Void) {
    SFSpeechRecognizer.requestAuthorization { status in
      DispatchQueue.main.async { completion(status) }
    }
  }

  /// Pick the best on-device speech locale: device locale, then preferred languages.
  private static func speechRecognizerForDevice() -> SFSpeechRecognizer? {
    var candidates: [Locale] = [Locale.current]
    for preferred in Locale.preferredLanguages {
      candidates.append(Locale(identifier: preferred))
    }
    candidates.append(Locale(identifier: "en-US"))

    var seen = Set<String>()
    for locale in candidates {
      let key = locale.identifier
      if seen.contains(key) { continue }
      seen.insert(key)
      if let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable {
        return recognizer
      }
    }
    return nil
  }

  /// Transcribes a previously-recorded audio file on-device. Forces
  /// `requiresOnDeviceRecognition = true` when supported so audio never
  /// leaves the device for the Apple speech servers (privacy + the whole
  /// point of this code path is zero per-minute cost).
  func transcribeFile(at url: URL, completion: @escaping (Result<String, Error>) -> Void) {
    requestSpeechAuthorization { status in
      guard status == .authorized else {
        completion(.failure(NSError(domain: "BackgroundRecorder", code: 10,
          userInfo: [NSLocalizedDescriptionKey: "Speech recognition not authorized (status=\(status.rawValue))"])))
        return
      }

      guard let recognizer = Self.speechRecognizerForDevice(),
            recognizer.isAvailable else {
        completion(.failure(NSError(domain: "BackgroundRecorder", code: 11,
          userInfo: [NSLocalizedDescriptionKey: "Speech recognizer not available"])))
        return
      }

      let request = SFSpeechURLRecognitionRequest(url: url)
      request.shouldReportPartialResults = false
      if recognizer.supportsOnDeviceRecognition {
        request.requiresOnDeviceRecognition = true
      }

      // Guard against the recognition callback firing more than once. iOS may
      // deliver an intermediate result + an error; we only resolve once.
      var resolved = false
      recognizer.recognitionTask(with: request) { result, error in
        if resolved { return }
        if let error = error {
          resolved = true
          completion(.failure(error))
          return
        }
        if let result = result, result.isFinal {
          resolved = true
          completion(.success(result.bestTranscription.formattedString))
        }
      }
    }
  }

  // MARK: - AVAudioRecorderDelegate

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    let msg = error?.localizedDescription ?? "Unknown encode error"
    onError?(msg)
  }

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    if isRecording && !flag {
      onError?("Recording finished unexpectedly — attempting restart")
      attemptRecovery()
    }
  }

  // MARK: - Private helpers

  private func newRecordingURL() -> URL {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let filename = "recording_\(Int(Date().timeIntervalSince1970 * 1000)).m4a"
    return docs.appendingPathComponent(filename)
  }

  private func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord,
                            mode: .default,
                            options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker])
    try session.setActive(true, options: .notifyOthersOnDeactivation)
  }

  private func attemptRecovery() {
    guard isRecording else { return }
    do {
      _ = try beginRecording()
    } catch {
      isRecording = false
      rotationTimer?.invalidate()
      rotationTimer = nil
      onError?("Recovery failed: \(error.localizedDescription)")
    }
  }

  // MARK: - Notification Handlers

  private func registerNotifications() {
    let nc = NotificationCenter.default
    nc.addObserver(self, selector: #selector(handleInterruption(_:)),
                   name: AVAudioSession.interruptionNotification, object: nil)
    nc.addObserver(self, selector: #selector(handleRouteChange(_:)),
                   name: AVAudioSession.routeChangeNotification, object: nil)
    nc.addObserver(self, selector: #selector(handleMediaServicesReset),
                   name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
    nc.addObserver(self, selector: #selector(handleAppBackground),
                   name: UIApplication.didEnterBackgroundNotification, object: nil)
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

    switch type {
    case .began:
      break

    case .ended:
      guard let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt else { return }
      let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
      if options.contains(.shouldResume) && isRecording {
        do {
          try configureAudioSession()
          recorder?.record()
        } catch {
          onError?("Failed to resume after interruption: \(error.localizedDescription)")
        }
      }

    @unknown default:
      break
    }
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    guard let info = notification.userInfo,
          let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }

    if reason == .oldDeviceUnavailable && isRecording {
      do {
        try configureAudioSession()
        recorder?.record()
      } catch {
        onError?("Route change recovery failed: \(error.localizedDescription)")
      }
    }
  }

  @objc private func handleMediaServicesReset() {
    guard isRecording else { return }
    recorder = nil
    currentFileURL = nil
    isRecording = false
    do {
      try configureAudioSession()
      _ = try beginRecording()
      isRecording = true
    } catch {
      onError?("Media services reset — recovery failed: \(error.localizedDescription)")
    }
  }

  @objc private func handleAppBackground() {
    guard isRecording else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
      guard let self = self, self.isRecording else { return }
      do {
        try self.configureAudioSession()
        if let rec = self.recorder, !rec.isRecording {
          rec.record()
        }
      } catch {
        self.attemptRecovery()
      }
    }
  }
}

// MARK: - Expo Module

public class BackgroundRecorderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackgroundRecorder")

    Events("onChunkRotated", "onRecorderError")

    OnCreate {
      BackgroundAudioRecorder.shared.onChunkRotated = { [weak self] uri, partIndex in
        self?.sendEvent("onChunkRotated", [
          "uri": uri,
          "partIndex": partIndex,
        ])
      }
      BackgroundAudioRecorder.shared.onError = { [weak self] msg in
        self?.sendEvent("onRecorderError", [
          "message": msg,
        ])
      }
    }

    // start(rotationIntervalSec) → Promise<string>  (URI of first chunk)
    AsyncFunction("start") { (rotationIntervalSec: Double, promise: Promise) in
      do {
        let uri = try BackgroundAudioRecorder.shared.start(rotationIntervalSec: rotationIntervalSec)
        promise.resolve(uri)
      } catch {
        promise.reject("ERR_START", error.localizedDescription)
      }
    }

    // stopChunk() → Promise<string>  (URI of completed chunk; new chunk already running)
    AsyncFunction("stopChunk") { (promise: Promise) in
      do {
        let uri = try BackgroundAudioRecorder.shared.stopChunk()
        promise.resolve(uri)
      } catch {
        promise.reject("ERR_STOP_CHUNK", error.localizedDescription)
      }
    }

    // stop() → Promise<{ uri, partIndex } | null>
    AsyncFunction("stop") { (promise: Promise) in
      if let result = BackgroundAudioRecorder.shared.stop() {
        promise.resolve([
          "uri": result.uri,
          "partIndex": result.partIndex,
        ])
      } else {
        promise.resolve(nil)
      }
    }

    // getStatus() → { isRecording, duration, uri, nextPartIndex }
    Function("getStatus") {
      return BackgroundAudioRecorder.shared.status()
    }

    // requestSpeechAuthorization() → Promise<string>
    // Returns one of: "authorized" | "denied" | "restricted" | "notDetermined"
    AsyncFunction("requestSpeechAuthorization") { (promise: Promise) in
      BackgroundAudioRecorder.shared.requestSpeechAuthorization { status in
        let str: String
        switch status {
        case .authorized:    str = "authorized"
        case .denied:        str = "denied"
        case .restricted:    str = "restricted"
        case .notDetermined: str = "notDetermined"
        @unknown default:    str = "unknown"
        }
        promise.resolve(str)
      }
    }

    // transcribeFile(uri) → Promise<string>
    // On-device speech recognition. Resolves with the transcript text, or
    // rejects if not authorized / recognizer unavailable / recognition errors.
    // Callers should treat rejection as a soft failure and let the server
    // fall back to Whisper.
    AsyncFunction("transcribeFile") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri) else {
        promise.reject("ERR_TRANSCRIBE", "Invalid URI: \(uri)")
        return
      }
      BackgroundAudioRecorder.shared.transcribeFile(at: url) { result in
        switch result {
        case .success(let text):
          promise.resolve(text)
        case .failure(let error):
          promise.reject("ERR_TRANSCRIBE", error.localizedDescription)
        }
      }
    }
  }
}
