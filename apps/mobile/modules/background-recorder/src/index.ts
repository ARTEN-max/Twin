import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

interface BackgroundRecorderStatus {
  isRecording: boolean;
  duration: number;
  uri: string | null;
  nextPartIndex: number;
}

export interface ChunkRotatedEvent {
  uri: string;
  partIndex: number;
}

export interface RecorderErrorEvent {
  message: string;
}

export type SpeechAuthorizationStatus =
  | 'authorized'
  | 'denied'
  | 'restricted'
  | 'notDetermined'
  | 'unknown';

interface NativeBackgroundRecorder {
  start(rotationIntervalSec: number): Promise<string>;
  stopChunk(): Promise<string>;
  stop(): Promise<{ uri: string; partIndex: number } | null>;
  getStatus(): BackgroundRecorderStatus;
  requestSpeechAuthorization(): Promise<SpeechAuthorizationStatus>;
  transcribeFile(uri: string): Promise<string>;
  // EventEmitter methods inherited from NativeModule base class
  addListener<E extends string, T>(eventName: E, listener: (event: T) => void): EventSubscription;
}

const BackgroundRecorder = requireNativeModule<NativeBackgroundRecorder>('BackgroundRecorder');

/**
 * Start a new background recording.
 *
 * `rotationIntervalSec` controls native chunk rotation: when greater than 0,
 * the native module stops the current chunk and starts a new one every
 * `rotationIntervalSec` seconds, firing `onChunkRotated` for each finished
 * chunk. The rotation timer runs on the iOS main run loop, which stays alive
 * during background audio (`UIBackgroundModes: ["audio"]`), so chunks are
 * produced through screen lock and JS thread suspension.
 *
 * Pass 0 to disable native rotation (the caller can still rotate manually
 * via `stopChunk()`).
 */
export async function startRecording(rotationIntervalSec: number = 60): Promise<string> {
  return BackgroundRecorder.start(rotationIntervalSec);
}

/**
 * Manually rotate: complete the current chunk and immediately begin the next.
 * The audio session stays active — no gap in capture.
 */
export async function stopChunk(): Promise<string> {
  return BackgroundRecorder.stopChunk();
}

/**
 * Stop recording entirely and deactivate the audio session.
 * Returns the URI of the final chunk and the partIndex it should upload as,
 * or null if nothing was recorded.
 */
export async function stopRecording(): Promise<{ uri: string; partIndex: number } | null> {
  return BackgroundRecorder.stop();
}

/**
 * Synchronous snapshot of recorder state.
 */
export function getRecordingStatus(): BackgroundRecorderStatus {
  return BackgroundRecorder.getStatus();
}

/**
 * Subscribe to chunk-rotation events. Native fires this when a chunk finishes
 * and the next one has already started recording.
 */
export function addChunkRotatedListener(
  listener: (event: ChunkRotatedEvent) => void
): EventSubscription {
  return BackgroundRecorder.addListener<'onChunkRotated', ChunkRotatedEvent>(
    'onChunkRotated',
    listener
  );
}

/**
 * Subscribe to recorder errors (interruption recovery, encode errors, rotation
 * failures, etc.). Non-fatal — recording usually continues; surface as needed.
 */
export function addRecorderErrorListener(
  listener: (event: RecorderErrorEvent) => void
): EventSubscription {
  return BackgroundRecorder.addListener<'onRecorderError', RecorderErrorEvent>(
    'onRecorderError',
    listener
  );
}

/**
 * Request iOS speech-recognition permission. Idempotent; safe to call
 * repeatedly. Returns the granted/denied status string.
 */
export async function requestSpeechAuthorization(): Promise<SpeechAuthorizationStatus> {
  return BackgroundRecorder.requestSpeechAuthorization();
}

/**
 * Transcribe a previously-recorded audio file on-device via SFSpeechRecognizer.
 * Forces on-device recognition so audio never leaves the phone. Returns the
 * transcript text on success.
 *
 * Rejects on permission/availability/recognition errors — callers should treat
 * rejection as a soft failure and let the server fall back to cloud Whisper.
 */
export async function transcribeAudioFile(uri: string): Promise<string> {
  return BackgroundRecorder.transcribeFile(uri);
}

export type { BackgroundRecorderStatus };
