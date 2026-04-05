import { requireNativeModule } from 'expo-modules-core';

interface BackgroundRecorderStatus {
  isRecording: boolean;
  duration: number;
  uri: string | null;
}

interface NativeBackgroundRecorder {
  start(): Promise<string>;
  stopChunk(): Promise<string>;
  stop(): Promise<string | null>;
  getStatus(): BackgroundRecorderStatus;
}

const BackgroundRecorder = requireNativeModule<NativeBackgroundRecorder>('BackgroundRecorder');

/**
 * Start a new background recording.
 * Configures the AVAudioSession and returns the file URI of the first chunk.
 */
export async function startRecording(): Promise<string> {
  return BackgroundRecorder.start();
}

/**
 * Complete the current chunk and immediately begin the next one.
 * The AVAudioSession stays active — no gap in audio capture.
 * Returns the URI of the completed chunk file.
 */
export async function stopChunk(): Promise<string> {
  return BackgroundRecorder.stopChunk();
}

/**
 * Stop recording entirely and deactivate the audio session.
 * Returns the URI of the final chunk file, or null if nothing was recorded.
 */
export async function stopRecording(): Promise<string | null> {
  return BackgroundRecorder.stop();
}

/**
 * Synchronous snapshot of recorder state.
 */
export function getRecordingStatus(): BackgroundRecorderStatus {
  return BackgroundRecorder.getStatus();
}

export type { BackgroundRecorderStatus };
