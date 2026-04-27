/* global setTimeout, clearTimeout, console, process */
/**
 * RecordingContext
 *
 * Owns the entire recording lifecycle independently of any screen. This is the
 * thing that makes "all-day recording" possible: navigating away from the
 * NewRecordingScreen no longer kills the AVAudioRecorder. The provider also
 * owns AppState handling, crash recovery, upload, and polling — anything that
 * must continue running across screens or app backgrounding.
 *
 * Screens become presentational: they read `phase` / `duration` / `error` and
 * call `start()` / `stop()` / `cancel()`. A floating pill in AppStack lets the
 * user see and stop an active recording from anywhere in the app.
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system/legacy';
import {
  startRecording as nativeStart,
  stopRecording as nativeStop,
  addRecorderErrorListener,
  transcribeAudioFile,
  requestSpeechAuthorization,
} from 'background-recorder';
import {
  createRecording,
  completeUpload,
  getRecordingStatus,
  retryTranscription,
  getMe,
  ApiClientError,
} from '@komuchi/shared';
import { useAuth } from './AuthContext';

const MIC_EXPLAINED_KEY = 'twin_mic_permission_explained';
const STALE_RECORDING_KEY = 'twin:stale_recording';
const KEEP_AWAKE_TAG = 'twin-recording';

export type RecordingPhase =
  | 'idle'
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error';

export type StartResult =
  | { ok: true }
  | { ok: false; reason: 'no_consent' | 'mic_denied' | 'mic_explainer_required' | 'error' };

interface RecordingContextValue {
  phase: RecordingPhase;
  duration: number;
  isRecording: boolean;
  currentRecordingId: string | null;
  uploadProgress: string;
  error: string | null;
  /** Recording ID that just finished processing — consumers navigate then call `acknowledgeComplete`. */
  lastCompletedRecordingId: string | null;
  /** When this is set, the user has previously seen the explainer; UI can skip it. */
  micExplainerSeen: boolean;

  /** Idempotent: requests permission and starts a single native recording file. */
  start(opts?: { hasConsent: boolean }): Promise<StartResult>;
  /** Stops native recording, uploads the file, and polls for completion. */
  stop(): Promise<void>;
  /** Discards any in-flight recording without uploading. */
  cancel(): Promise<void>;
  /** Retries a failed recording's transcription job. */
  retry(): Promise<void>;
  acknowledgeComplete(): void;
  acknowledgeError(): void;
  markExplainerSeen(): Promise<void>;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording(): RecordingContextValue {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error('useRecording must be used inside <RecordingProvider>');
  return ctx;
}

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.uid ?? null;

  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [duration, setDuration] = useState(0);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [lastCompletedRecordingId, setLastCompletedRecordingId] = useState<string | null>(null);
  const [micExplainerSeen, setMicExplainerSeen] = useState(false);

  // Refs that mirror state for use inside async callbacks / timers.
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef<number>(0);
  const durationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pollCancelledRef = useRef(false);
  const maxRecordingDurationSecRef = useRef<number | null>(null);
  const autoStopTriggeredRef = useRef(false);

  // Load mic-explainer flag once
  useEffect(() => {
    AsyncStorage.getItem(MIC_EXPLAINED_KEY)
      .then((v) => setMicExplainerSeen(v === '1'))
      .catch(() => {});
  }, []);

  // Crash recovery: detect a stale recording from a prior killed session.
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(STALE_RECORDING_KEY)
      .then(async (saved) => {
        if (!saved) return;
        try {
          const { uri, startTime } = JSON.parse(saved) as { uri: string; startTime: number };
          const info = await FileSystem.getInfoAsync(uri);
          const fileSize = (info as { size?: number }).size ?? 0;
          if (info.exists && fileSize > 1000) {
            const durationSec = Math.floor((Date.now() - startTime) / 1000);
            const mins = Math.floor(durationSec / 60);
            const secs = durationSec % 60;
            const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
            Alert.alert(
              'Interrupted Recording Found',
              `A ${formatted} recording was cut short when the app was closed. Upload it now?`,
              [
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: async () => {
                    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
                    await AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});
                  },
                },
                {
                  text: 'Upload',
                  onPress: async () => {
                    await AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});
                    await uploadFlow(uri);
                  },
                },
              ]
            );
          } else {
            await AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});
          }
        } catch {
          await AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});
        }
      })
      .catch(() => {});
  }, [userId]);

  // App background → on foreground, re-sync the visible duration from wall clock.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === 'active' && prev.match(/background|inactive/) && isRecordingRef.current) {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setDuration(elapsed);
      }
    });
    return () => sub.remove();
  }, []);

  // Wall-clock-based duration ticker while recording
  useEffect(() => {
    if (phase !== 'recording') {
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
      return;
    }
    if (durationTimeoutRef.current || !isRecordingRef.current) return;

    const tick = () => {
      if (!isRecordingRef.current) {
        durationTimeoutRef.current = null;
        return;
      }
      const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
      setDuration(elapsed);
      durationTimeoutRef.current = setTimeout(tick, 500);
    };
    durationTimeoutRef.current = setTimeout(tick, 500);
  }, [phase]);

  const resetRecordingLimits = useCallback(() => {
    maxRecordingDurationSecRef.current = null;
    autoStopTriggeredRef.current = false;
  }, []);

  const markExplainerSeen = useCallback(async () => {
    await AsyncStorage.setItem(MIC_EXPLAINED_KEY, '1').catch(() => {});
    setMicExplainerSeen(true);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return false;
      await markExplainerSeen();
      // Pre-prompt for speech recognition too, so the on-device transcription
      // path works on the first chunk without surprising the user mid-session.
      // Failure here is silent — server-side Whisper covers if denied.
      requestSpeechAuthorization().catch(() => {});
      return true;
    } catch (err) {
      console.error('Error requesting permission:', err);
      return false;
    }
  }, [markExplainerSeen]);

  /**
   * Try to transcribe a chunk on-device via SFSpeechRecognizer. Returns the
   * transcript text on success, or undefined on any failure (permission,
   * recognition error, file unreadable). Server falls back to Whisper when
   * undefined — the cost saving compounds as more chunks succeed locally.
   */
  const transcribeOnDevice = useCallback(async (uri: string): Promise<string | undefined> => {
    try {
      const text = await transcribeAudioFile(uri);
      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    } catch (err) {
      console.warn('On-device transcription failed; falling back to cloud:', err);
      return undefined;
    }
  }, []);

  const start = useCallback(
    async (opts?: { hasConsent: boolean }): Promise<StartResult> => {
      if (opts && !opts.hasConsent) return { ok: false, reason: 'no_consent' };
      if (isRecordingRef.current) return { ok: true };
      if (!userId) return { ok: false, reason: 'error' };

      // Surface the explainer the first time
      if (!micExplainerSeen) {
        return { ok: false, reason: 'mic_explainer_required' };
      }

      const hasPermission = await requestPermission();
      if (!hasPermission) return { ok: false, reason: 'mic_denied' };

      try {
        let maxMinutesPerRecording: number | null = null;
        try {
          const me = await getMe(userId);
          maxMinutesPerRecording = me.subscription?.limits.maxMinutesPerRecording ?? null;
        } catch (err) {
          console.warn(
            'Could not fetch recording limits before start; proceeding without auto-stop',
            err
          );
        }
        maxRecordingDurationSecRef.current =
          maxMinutesPerRecording != null ? maxMinutesPerRecording * 60 : null;
        autoStopTriggeredRef.current = false;

        setError(null);
        setDuration(0);
        setCurrentRecordingId(null);
        setUploadProgress('');

        // One recording stays one file: chunk rotation is disabled.
        const uri = await nativeStart(0);

        recordingStartTimeRef.current = Date.now();
        isRecordingRef.current = true;
        pollCancelledRef.current = false;

        activateKeepAwakeAsync(KEEP_AWAKE_TAG);

        AsyncStorage.setItem(
          STALE_RECORDING_KEY,
          JSON.stringify({ uri, startTime: Date.now() })
        ).catch(() => {});

        setPhase('recording');
        return { ok: true };
      } catch (err) {
        console.error('Error starting recording:', err);
        setError(err instanceof Error ? err.message : 'Failed to start recording');
        setPhase('error');
        return { ok: false, reason: 'error' };
      }
    },
    [micExplainerSeen, requestPermission, userId]
  );

  // Subscribe to native recorder errors.
  useEffect(() => {
    const errorSub = addRecorderErrorListener((event) => {
      console.warn('Recorder error:', event.message);
    });
    return () => {
      errorSub.remove();
    };
  }, []);

  const pollForCompletion = useCallback(
    async (id: string) => {
      if (!userId) return;
      setPhase('processing');
      setUploadProgress('Processing your recording...');

      let attempts = 0;
      const maxAttempts = 120;
      const baseDelay = 2000;

      while (attempts < maxAttempts) {
        if (pollCancelledRef.current) return;
        try {
          const result = await getRecordingStatus(userId, id);
          if (pollCancelledRef.current) return;
          setUploadProgress(`Processing... (${result.status})`);

          if (result.status === 'complete') {
            setUploadProgress('Complete!');
            setPhase('complete');
            setLastCompletedRecordingId(id);
            return;
          }
          if (result.status === 'failed') {
            const msg = result.errorMessage
              ? `Recording processing failed: ${result.errorMessage}.`
              : 'Recording processing failed.';
            throw new Error(msg);
          }

          const delay = Math.min(baseDelay * Math.pow(2, Math.floor(attempts / 5)), 30000);
          await new Promise((r) => setTimeout(r, delay));
          attempts++;
        } catch (err) {
          if (pollCancelledRef.current) return;
          if (err instanceof ApiClientError && err.statusCode === 404) {
            const delay = Math.min(baseDelay * Math.pow(2, Math.floor(attempts / 5)), 30000);
            await new Promise((r) => setTimeout(r, delay));
            attempts++;
            continue;
          }
          throw err;
        }
      }

      if (pollCancelledRef.current) return;
      setError('Processing is taking longer than expected. You can check status later.');
      setPhase('error');
    },
    [userId]
  );

  const uploadFlow = useCallback(
    async (fileUri: string) => {
      if (!userId) return;
      try {
        AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});

        setPhase('uploading');
        setUploadProgress('Creating recording...');

        const extension = fileUri.split('.').pop()?.toLowerCase();
        const mimeType = extension === 'caf' ? 'audio/x-caf' : 'audio/m4a';

        const createResult = await createRecording(userId, {
          title: `Recording ${new Date().toLocaleTimeString()}`,
          mode: 'general',
          mimeType,
        });

        setCurrentRecordingId(createResult.recordingId);
        setUploadProgress('Uploading audio...');

        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        const fileSize = fileInfo.exists
          ? ((fileInfo as { size?: number }).size ?? undefined)
          : undefined;

        try {
          const headers: Record<string, string> = {};
          if (createResult.requiredHeaders) {
            Object.assign(headers, createResult.requiredHeaders);
          } else if (createResult.contentType) {
            headers['Content-Type'] = createResult.contentType;
          } else {
            headers['Content-Type'] = mimeType;
          }

          const resp = await FileSystem.uploadAsync(createResult.uploadUrl, fileUri, {
            httpMethod: 'PUT',
            headers,
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          });

          if (resp.status < 200 || resp.status >= 300) {
            throw new Error(`Upload failed: ${resp.status}\n${resp.body || ''}`);
          }
          setUploadProgress('Upload complete, processing...');
        } catch (presignedErr) {
          console.error('Presigned upload failed, trying direct API:', presignedErr);

          const direct = await FileSystem.uploadAsync(
            `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/recordings/${createResult.recordingId}/upload`,
            fileUri,
            {
              httpMethod: 'POST',
              headers: { 'x-user-id': userId, 'Content-Type': mimeType },
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
            }
          );

          if (direct.status < 200 || direct.status >= 300) {
            throw new Error(`Direct upload failed: ${direct.status}\n${direct.body || ''}`);
          }
          setUploadProgress('Upload complete, processing...');
        }

        // On-device transcription before finalizing — file still exists on disk.
        // Server skips Whisper when transcript is provided.
        setUploadProgress('Transcribing on device...');
        const transcript = await transcribeOnDevice(fileUri);

        await completeUpload(userId, createResult.recordingId, {
          fileSize,
          ...(transcript && { transcript }),
        });

        resetRecordingLimits();
        setPhase('processing');
        await pollForCompletion(createResult.recordingId);
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 402) {
          setError(err.error || err.code || 'audio_minutes_limit_reached');
          setPhase('error');
          return;
        }
        console.error('Error in upload flow:', err);
        setError(
          err instanceof ApiClientError
            ? `API Error: ${err.message} (${err.statusCode})`
            : err instanceof Error
              ? err.message
              : 'Upload flow failed'
        );
        setPhase('error');
      }
    },
    [pollForCompletion, resetRecordingLimits, transcribeOnDevice, userId]
  );

  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;

    try {
      setPhase('stopping');
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      const result = await nativeStop();
      if (!result) throw new Error('No recording URI returned');

      deactivateKeepAwake(KEEP_AWAKE_TAG);
      resetRecordingLimits();

      await uploadFlow(result.uri);
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setPhase('error');
    }
  }, [resetRecordingLimits, uploadFlow]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const maxDurationSec = maxRecordingDurationSecRef.current;
    if (maxDurationSec == null || duration < maxDurationSec) return;
    if (autoStopTriggeredRef.current) return;

    autoStopTriggeredRef.current = true;
    setUploadProgress('Free recording limit reached. Stopping and processing...');
    stop().catch((err) => {
      console.error('Auto-stop failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setPhase('error');
    });
  }, [duration, phase, stop]);

  const cancel = useCallback(async () => {
    if (durationTimeoutRef.current) {
      clearTimeout(durationTimeoutRef.current);
      durationTimeoutRef.current = null;
    }
    isRecordingRef.current = false;

    try {
      const result = await nativeStop();
      if (result?.uri) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
      }
    } catch {
      /* ignore */
    }

    deactivateKeepAwake(KEEP_AWAKE_TAG);
    resetRecordingLimits();
    await AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});

    setPhase('idle');
    setDuration(0);
    setCurrentRecordingId(null);
    setUploadProgress('');
    setError(null);
  }, [resetRecordingLimits]);

  const retry = useCallback(async () => {
    if (!userId || !currentRecordingId) {
      setError(null);
      setPhase('idle');
      setDuration(0);
      resetRecordingLimits();
      return;
    }
    setError(null);
    setPhase('processing');
    setUploadProgress('Retrying transcription...');
    try {
      const status = await getRecordingStatus(userId, currentRecordingId);
      if (status.status === 'failed') {
        await retryTranscription(userId, currentRecordingId);
        setUploadProgress('Transcription job requeued. Processing...');
      }
      await pollForCompletion(currentRecordingId);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? `API Error: ${err.message} (${err.statusCode})`
          : err instanceof Error
            ? err.message
            : 'Retry failed'
      );
      setPhase('error');
    }
  }, [userId, currentRecordingId, pollForCompletion, resetRecordingLimits]);

  const acknowledgeComplete = useCallback(() => {
    resetRecordingLimits();
    setLastCompletedRecordingId(null);
    setPhase('idle');
    setDuration(0);
    setCurrentRecordingId(null);
    setUploadProgress('');
  }, [resetRecordingLimits]);

  const acknowledgeError = useCallback(() => {
    resetRecordingLimits();
    setError(null);
    if (phase === 'error') {
      setPhase('idle');
    }
  }, [phase, resetRecordingLimits]);

  // Provider unmount: stop polling but DO NOT stop native recording — that
  // would defeat the whole purpose of this context. The native recorder lives
  // until stop() / cancel() is called or the app is killed.
  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      if (durationTimeoutRef.current) clearTimeout(durationTimeoutRef.current);
    };
  }, []);

  const value: RecordingContextValue = {
    phase,
    duration,
    isRecording: phase === 'recording',
    currentRecordingId,
    uploadProgress,
    error,
    lastCompletedRecordingId,
    micExplainerSeen,
    start,
    stop,
    cancel,
    retry,
    acknowledgeComplete,
    acknowledgeError,
    markExplainerSeen,
  };

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}
