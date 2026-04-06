import ExpoModulesCore
import AVFoundation

// MARK: - BackgroundAudioRecorder Singleton

/// Manages AVAudioRecorder lifecycle completely outside the JS thread.
/// This singleton survives JS thread suspension — iOS keeps the audio session
/// alive as long as `UIBackgroundModes: ["audio"]` is declared and the session
/// is active when the screen locks.
final class BackgroundAudioRecorder: NSObject, AVAudioRecorderDelegate {

  static let shared = BackgroundAudioRecorder()

  private var recorder: AVAudioRecorder?
  private var currentFileURL: URL?
  private var recordingStartTime: Date?
  private(set) var isRecording = false

  // Callbacks fired back to the Expo module
  var onChunkReady: ((String) -> Void)?    // fired when stopChunk completes → uri
  var onStopped: ((String?) -> Void)?      // fired when stopRecording completes → uri?
  var onError: ((String) -> Void)?         // any interruption / session error

  private override init() {
    super.init()
    registerNotifications()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Public API

  /// Configures the audio session and starts recording to a new timestamped file.
  /// Returns the file URI on success.
  func start() throws -> String {
    try configureAudioSession()

    let url = newRecordingURL()
    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
      AVEncoderBitRateKey: 128000,
    ]

    let rec = try AVAudioRecorder(url: url, settings: settings)
    rec.delegate = self
    rec.isMeteringEnabled = false

    guard rec.record() else {
      throw NSError(domain: "BackgroundRecorder", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "AVAudioRecorder.record() returned false"])
    }

    recorder = rec
    currentFileURL = url
    recordingStartTime = Date()
    isRecording = true
    return url.absoluteString
  }

  /// Stops the current chunk, returns the file URI, then immediately starts a new chunk.
  /// Keeps the AVAudioSession active — no gap, no re-activation.
  func stopChunk() throws -> String {
    guard let rec = recorder, isRecording else {
      throw NSError(domain: "BackgroundRecorder", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Not recording"])
    }

    rec.stop()
    let finishedURI = currentFileURL?.absoluteString ?? ""

    // Start next chunk immediately — same session, same thread
    let url = newRecordingURL()
    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
      AVEncoderBitRateKey: 128000,
    ]
    let nextRec = try AVAudioRecorder(url: url, settings: settings)
    nextRec.delegate = self
    nextRec.isMeteringEnabled = false

    guard nextRec.record() else {
      isRecording = false
      throw NSError(domain: "BackgroundRecorder", code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to start next chunk"])
    }

    recorder = nextRec
    currentFileURL = url
    recordingStartTime = Date()
    return finishedURI
  }

  /// Stops recording entirely, deactivates the audio session, returns the last file URI.
  func stop() -> String? {
    guard let rec = recorder else { return nil }
    rec.stop()
    let uri = currentFileURL?.absoluteString
    recorder = nil
    currentFileURL = nil
    recordingStartTime = nil
    isRecording = false

    // Deactivate session so other apps can reclaim audio
    try? AVAudioSession.sharedInstance().setActive(false,
      options: .notifyOthersOnDeactivation)
    return uri
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
    ]
  }

  // MARK: - AVAudioRecorderDelegate

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    let msg = error?.localizedDescription ?? "Unknown encode error"
    onError?(msg)
  }

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    // Normal finish (we called stop()) — handled in stopChunk/stop.
    // Unexpected finish (interruption ended recorder): try to recover.
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
      let uri = try start()
      _ = uri // new recording started; JS will detect next stopChunk returning a new URI
    } catch {
      isRecording = false
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
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

    switch type {
    case .began:
      // Phone call, Siri, etc. — recorder pauses automatically
      break

    case .ended:
      guard let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt else { return }
      let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
      if options.contains(.shouldResume) && isRecording {
        // Re-activate session and resume
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

    // Headphones unplugged / Bluetooth device disconnected
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
    // Media server crashed and reset — must rebuild everything
    guard isRecording else { return }
    recorder = nil
    currentFileURL = nil
    isRecording = false
    do {
      try configureAudioSession()
      let uri = try start()
      _ = uri
    } catch {
      onError?("Media services reset — recovery failed: \(error.localizedDescription)")
    }
  }
}

// MARK: - Expo Module

public class BackgroundRecorderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackgroundRecorder")

    // start() → Promise<string>  (file URI)
    AsyncFunction("start") { (promise: Promise) in
      do {
        let uri = try BackgroundAudioRecorder.shared.start()
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

    // stop() → Promise<string | null>  (URI of last file)
    AsyncFunction("stop") { (promise: Promise) in
      let uri = BackgroundAudioRecorder.shared.stop()
      promise.resolve(uri)
    }

    // getStatus() → { isRecording: bool, duration: number, uri: string | null }
    Function("getStatus") {
      return BackgroundAudioRecorder.shared.status()
    }
  }
}
