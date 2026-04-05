/* global setTimeout, clearTimeout, console, process */
/**
 * NewRecordingScreen
 *
 * Native-feeling recording UI for creating new recordings.
 * Features:
 * - Big circular Record button with mic icon
 * - Live timer during recording
 * - Stop/Cancel controls
 * - Upload progress and processing states
 * - Auto-navigation to detail screen when complete
 */

import React, { useState, useEffect, useRef } from 'react';
import type { AppStateStatus } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
  Animated,
} from 'react-native';
import { theme } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system/legacy';
import {
  createRecording,
  completeUpload,
  getRecordingStatus,
  retryTranscription,
  getMe,
  createSession,
  triggerSessionDebrief,
  ApiClientError,
} from '@komuchi/shared';
import { useAuth } from '../contexts/AuthContext';
import { useConsent } from '../contexts/ConsentContext';

const MIC_EXPLAINED_KEY = 'twin_mic_permission_explained';
const STALE_RECORDING_KEY = 'twin:stale_recording';
const KEEP_AWAKE_TAG = 'twin-recording';
// Chunk duration: rotate every 60 s so iOS can only kill the last chunk (max 60 s loss)
// The JS thread is killed ~2.5 min after manual phone lock even with background audio mode.
const CHUNK_DURATION_MS = 60 * 1000;

type RecordingState =
  | 'idle'
  | 'mic-explainer'
  | 'mic-denied'
  | 'requesting-permission'
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error';

interface NewRecordingScreenProps {
  onComplete: (recordingId: string) => void;
  onCancel: () => void;
  onPaywall?: () => void;
}

export default function NewRecordingScreen({
  onComplete,
  onCancel,
  onPaywall,
}: NewRecordingScreenProps) {
  const { user } = useAuth();
  const consent = useConsent();
  const userId = user!.uid;
  const [state, setState] = useState<RecordingState>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0); // in seconds
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [usedRecordings, setUsedRecordings] = useState<number | null>(null);
  const [recordingLimit, setRecordingLimit] = useState<number | null>(null);
  const durationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef(0); // Track duration in ref to avoid closure issues
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isRecordingRef = useRef(false);
  const pollCancelledRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null); // For use in callbacks without stale closure
  const recordingStartTimeRef = useRef<number>(0); // Wall-clock start time for accurate timer
  const chunkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Auto-chunk timer
  const chunkIndexRef = useRef(0); // Which chunk we're about to start (increments per rotation)
  const sessionStartTimeRef = useRef(''); // Time label for chunk upload titles
  const sessionIdRef = useRef<string | null>(null); // Created on first chunk rotation; null for short recordings

  // Animations
  const pulseScale = useRef(new Animated.Value(1)).current;
  const recDotOpacity = useRef(new Animated.Value(1)).current;
  const waveformAnims = useRef(Array.from({ length: 10 }, () => new Animated.Value(6))).current;

  // Fetch usage info on mount
  useEffect(() => {
    getMe(userId)
      .then((me) => {
        if (me.subscription) {
          setUsedRecordings(me.subscription.usage.recordingsThisMonth);
          setRecordingLimit(me.subscription.limits.recordingsPerMonth);
        }
      })
      .catch(() => {}); // non-critical, fail silently
  }, [userId]);

  // Crash recovery: if iOS killed the app mid-recording, the audio file still
  // exists on disk. On next mount we detect it and offer to upload it.
  useEffect(() => {
    AsyncStorage.getItem(STALE_RECORDING_KEY)
      .then(async (saved) => {
        if (!saved) return;
        try {
          const { uri, startTime } = JSON.parse(saved) as { uri: string; startTime: number };
          const info = await FileSystem.getInfoAsync(uri);
          const fileSize = (info as { size?: number }).size ?? 0;
          if (info.exists && fileSize > 1000) {
            const durationSec = Math.floor((Date.now() - startTime) / 1000);
            Alert.alert(
              'Interrupted Recording Found',
              `A ${formatDuration(durationSec)} recording was cut short when the app was closed. Upload it now?`,
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
                    uploadFlow(uri);
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

  // Keep recordingRef in sync so AppState handler can access it without stale closure
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  // Handle app backgrounding during recording
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;

      // When coming back to foreground, verify recording is still running
      if (
        nextAppState === 'active' &&
        prev.match(/background|inactive/) &&
        isRecordingRef.current &&
        recordingRef.current
      ) {
        const verifyRecordingStillRunning = (attempt: number) => {
          setTimeout(
            () => {
              if (!recordingRef.current || !isRecordingRef.current) return;

              recordingRef.current
                .getStatusAsync()
                .then((status) => {
                  if (status.isRecording) {
                    const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
                    durationRef.current = elapsed;
                    setDuration(elapsed);
                    return;
                  }

                  if (attempt < 4) {
                    verifyRecordingStillRunning(attempt + 1);
                    return;
                  }

                  // After several checks, treat it as a genuine OS stop.
                  isRecordingRef.current = false;
                  if (durationTimeoutRef.current) {
                    clearTimeout(durationTimeoutRef.current);
                    durationTimeoutRef.current = null;
                  }
                  deactivateKeepAwake(KEEP_AWAKE_TAG);
                  setRecording(null);
                  recordingRef.current = null;
                  setState('idle');
                  setDuration(0);
                  durationRef.current = 0;
                })
                .catch(() => {
                  if (attempt < 4) {
                    verifyRecordingStillRunning(attempt + 1);
                  }
                });
            },
            attempt === 0 ? 1500 : 1000
          );
        };

        verifyRecordingStillRunning(0);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Handle timer based on recording state.
  // Uses wall-clock time (Date.now) so the counter stays accurate after the app
  // is backgrounded — JS setTimeout is paused in background, but Date.now is not.
  useEffect(() => {
    if (state === 'recording' && recording) {
      if (!durationTimeoutRef.current && isRecordingRef.current) {
        const scheduleNextTick = () => {
          if (isRecordingRef.current) {
            // Read elapsed seconds from wall clock, not from a counter
            const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
            durationRef.current = elapsed;
            setDuration(elapsed);
            durationTimeoutRef.current = setTimeout(scheduleNextTick, 500); // 500ms for snappier updates
          } else {
            durationTimeoutRef.current = null;
          }
        };
        durationTimeoutRef.current = setTimeout(scheduleNextTick, 500);
      }
    } else if (state !== 'recording') {
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
    }
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
      if (chunkTimeoutRef.current) {
        clearTimeout(chunkTimeoutRef.current);
        chunkTimeoutRef.current = null;
      }
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Idle pulse ring animation
  useEffect(() => {
    if (state === 'idle' || state === 'requesting-permission') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }

    return undefined;
  }, [state]);

  // Recording: REC dot blink + waveform bars
  useEffect(() => {
    if (state === 'recording') {
      const dotLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(recDotOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(recDotOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      dotLoop.start();

      const waveLoops = waveformAnims.map((anim, i) => {
        const maxH = 8 + Math.random() * 24;
        const dur = 300 + i * 80;
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: maxH, duration: dur, useNativeDriver: false }),
            Animated.timing(anim, { toValue: 4, duration: dur, useNativeDriver: false }),
          ])
        );
      });
      waveLoops.forEach((l) => l.start());
      return () => {
        dotLoop.stop();
        waveLoops.forEach((l) => l.stop());
        waveformAnims.forEach((a) => a.setValue(6));
      };
    }

    return undefined;
  }, [state]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const requestPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setState('mic-denied');
        return false;
      }
      // Mark explainer as shown so we don't show it again
      await AsyncStorage.setItem(MIC_EXPLAINED_KEY, '1').catch(() => {});
      return true;
    } catch (err) {
      console.error('Error requesting permission:', err);
      setError('Failed to request microphone permission');
      return false;
    }
  };

  const startRecording = async () => {
    try {
      // Check consent before starting
      if (!consent.hasConsent) {
        Alert.alert(
          'Consent Required',
          'You must accept the data processing consent before recording. Go to Settings → Data & Consent.'
        );
        return;
      }

      // Show mic explainer on first use
      const explained = await AsyncStorage.getItem(MIC_EXPLAINED_KEY).catch(() => null);
      if (!explained) {
        setState('mic-explainer');
        return;
      }

      await proceedToRecord();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof ApiClientError
          ? `API Error: ${err.message} (${err.statusCode})`
          : err instanceof Error
            ? err.message
            : 'Failed to start recording';
      setError(errorMessage);
      setState('error');
    }
  };

  /** Called after mic explainer or directly if already explained */
  const proceedToRecord = async () => {
    try {
      setState('requesting-permission');
      setError(null);
      setDuration(0);

      const hasPermission = await requestPermission();
      if (!hasPermission) {
        return; // state is already set to 'mic-denied'
      }

      // Configure audio mode for background recording.
      // DoNotMix tells iOS this is a high-priority audio session that should not be
      // interrupted by notifications, music, or other apps playing audio.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
      });

      // Create and start recording.
      // No status callback — iOS briefly fires isRecording=false during screen lock
      // even when background audio is active, causing false positives. The AppState
      // foreground handler is the correct place to detect genuine stops.
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      // Clear any existing timeout first
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      setRecording(newRecording);
      recordingRef.current = newRecording;
      durationRef.current = 0;
      recordingStartTimeRef.current = Date.now();
      isRecordingRef.current = true;
      pollCancelledRef.current = false;

      // Keep screen alive so iOS never suspends the JS thread mid-recording
      activateKeepAwakeAsync(KEEP_AWAKE_TAG);

      // Persist URI so we can recover if iOS kills the app mid-recording
      const uri = newRecording.getURI();
      if (uri) {
        AsyncStorage.setItem(
          STALE_RECORDING_KEY,
          JSON.stringify({ uri, startTime: Date.now() })
        ).catch(() => {});
      }

      setState('recording');

      // Start auto-chunking so each segment is uploaded before iOS can kill the JS thread
      sessionStartTimeRef.current = new Date().toLocaleTimeString();
      sessionIdRef.current = null; // session is created lazily on first chunk rotation
      chunkIndexRef.current = 1; // chunk 1 will be uploaded after the first rotation
      chunkTimeoutRef.current = setTimeout(autoChunk, CHUNK_DURATION_MS);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setState('error');
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
    }
  };

  /**
   * Upload a completed chunk silently in the background.
   * Does NOT change any UI state — the user stays in the 'recording' view.
   * Each chunk becomes a separate Recording entry in the API.
   */
  const silentChunkUpload = async (fileUri: string, partIndex: number, sessionId: string) => {
    try {
      const extension = fileUri.split('.').pop()?.toLowerCase();
      const mimeType = extension === 'caf' ? 'audio/x-caf' : 'audio/m4a';

      const createResult = await createRecording(userId, {
        title: `Recording ${sessionStartTimeRef.current} (Part ${partIndex})`,
        mode: 'general',
        mimeType,
        sessionId,
        chunkIndex: partIndex,
      });

      const headers: Record<string, string> = {};
      if (createResult.requiredHeaders) {
        Object.assign(headers, createResult.requiredHeaders);
      } else {
        headers['Content-Type'] = createResult.contentType ?? mimeType;
      }

      const uploadResp = await FileSystem.uploadAsync(createResult.uploadUrl, fileUri, {
        httpMethod: 'PUT',
        headers,
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      });

      if (uploadResp.status >= 200 && uploadResp.status < 300) {
        await completeUpload(userId, createResult.recordingId, {});
      }
      // Clean up the chunk file from disk after successful upload
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    } catch (err) {
      // Non-fatal — the file stays on disk; crash recovery will find it if needed
      console.warn(`Chunk ${partIndex} background upload failed:`, err);
    }
  };

  /**
   * Rotate to a new recording chunk:
   * 1. Stop the current chunk and get its URI
   * 2. Start a new chunk immediately (minimal audio gap)
   * 3. Upload the old chunk silently in the background
   * 4. Schedule the next rotation
   *
   * This keeps individual chunks under CHUNK_DURATION_MS so iOS can only kill
   * the in-progress chunk (≤60 s) — all completed chunks are safely uploaded.
   */
  const autoChunk = async () => {
    if (!isRecordingRef.current || !recordingRef.current) return;

    const oldRecording = recordingRef.current;
    const partIndex = chunkIndexRef.current;
    chunkIndexRef.current += 1;

    // Stop the finished chunk
    try {
      await oldRecording.stopAndUnloadAsync();
    } catch {
      /* already stopped — continue */
    }
    const oldUri = oldRecording.getURI();

    // If user stopped recording while we were chunking, bail out
    if (!isRecordingRef.current) return;

    try {
      // Re-apply audio mode — iOS can reset it during the stop/start transition
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      recordingRef.current = newRecording;

      // Update stale key so crash recovery always finds the latest chunk
      const newUri = newRecording.getURI();
      if (newUri) {
        AsyncStorage.setItem(
          STALE_RECORDING_KEY,
          JSON.stringify({ uri: newUri, startTime: recordingStartTimeRef.current })
        ).catch(() => {});
      }

      // Schedule the next rotation
      chunkTimeoutRef.current = setTimeout(autoChunk, CHUNK_DURATION_MS);
    } catch (err) {
      // Could not start new chunk — stop recording gracefully
      console.warn('autoChunk: could not start next chunk', err);
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      setRecording(null);
      recordingRef.current = null;
      setState('idle');
    }

    // Create session on the first chunk rotation (lazy — only for long recordings)
    if (!sessionIdRef.current) {
      try {
        const sess = await createSession(userId, `Recording ${sessionStartTimeRef.current}`);
        sessionIdRef.current = sess.sessionId;
      } catch (err) {
        console.warn(
          'autoChunk: could not create session (uploads will proceed without grouping)',
          err
        );
      }
    }

    // Fire-and-forget upload of the completed chunk
    if (oldUri && sessionIdRef.current) {
      silentChunkUpload(oldUri, partIndex, sessionIdRef.current).catch(() => {});
    }
  };

  const handleStop = async () => {
    // Cancel pending auto-chunk first so we always process the current chunk as the final one
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }

    // Use ref so we get the latest chunk even if React state hasn't flushed yet
    const rec = recordingRef.current;
    if (!rec) return;

    try {
      setState('stopping');
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      let uri: string | null = null;

      // Try to stop and unload, but handle "already unloaded" error gracefully
      try {
        await rec.stopAndUnloadAsync();
        uri = rec.getURI();
      } catch (err) {
        // If error is about already unloaded, try to get URI anyway
        if (err instanceof Error && err.message.includes('already been unloaded')) {
          console.log('Recording already unloaded, getting URI directly');
          uri = rec.getURI();
        } else {
          // For other errors, try to get URI before throwing
          uri = rec.getURI();
          if (!uri) {
            throw err;
          }
        }
      }

      if (!uri) {
        throw new Error('No recording URI returned');
      }

      deactivateKeepAwake(KEEP_AWAKE_TAG);
      setRecording(null);
      recordingRef.current = null;

      // Start upload flow
      await uploadFlow(uri);
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setState('error');
    }
  };

  const handleCancel = () => {
    if (state === 'recording' && recording) {
      Alert.alert('Discard Recording?', 'Are you sure you want to discard this recording?', [
        { text: 'Keep Recording', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              if (durationTimeoutRef.current) {
                clearTimeout(durationTimeoutRef.current);
                durationTimeoutRef.current = null;
              }
              if (chunkTimeoutRef.current) {
                clearTimeout(chunkTimeoutRef.current);
                chunkTimeoutRef.current = null;
              }
              isRecordingRef.current = false;
              if (recording) {
                await recording.stopAndUnloadAsync();
                const uri = recording.getURI();
                if (uri) {
                  await FileSystem.deleteAsync(uri, { idempotent: true });
                }
                deactivateKeepAwake(KEEP_AWAKE_TAG);
                setRecording(null);
                recordingRef.current = null;
              }
              await AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});
              sessionIdRef.current = null;
              onCancel();
            } catch (err) {
              console.error('Error discarding recording:', err);
              onCancel(); // Still navigate back
            }
          },
        },
      ]);
    } else {
      onCancel();
    }
  };

  const uploadFlow = async (fileUri: string) => {
    try {
      // Clear stale recording key — we are now actively processing this file
      AsyncStorage.removeItem(STALE_RECORDING_KEY).catch(() => {});

      // Step 1: Create recording
      setState('uploading');
      setUploadProgress('Creating recording...');

      // Determine MIME type
      const extension = fileUri.split('.').pop()?.toLowerCase();
      let mimeType = 'audio/m4a';
      if (extension === 'caf') {
        mimeType = 'audio/x-caf';
      } else if (extension === 'm4a') {
        mimeType = 'audio/m4a';
      }

      // Tag the final chunk with the session so the backend can group all chunks
      const finalChunkIndex = chunkIndexRef.current;
      console.log('Creating recording with API URL:', process.env.EXPO_PUBLIC_API_BASE_URL);
      const createResult = await createRecording(userId, {
        title: `Recording ${new Date().toLocaleTimeString()}`,
        mode: 'general',
        mimeType,
        ...(sessionIdRef.current != null && {
          sessionId: sessionIdRef.current,
          chunkIndex: finalChunkIndex,
        }),
      });
      console.log('Recording created:', createResult.recordingId);

      setRecordingId(createResult.recordingId);
      setUploadProgress('Uploading audio...');

      // Step 2: Read file metadata once and upload the file natively from disk.
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      const fileSize = fileInfo.exists
        ? ((fileInfo as { size?: number }).size ?? undefined)
        : undefined;

      // Step 3: Upload file from disk (presigned first, direct API fallback).
      try {
        const headers: Record<string, string> = {};
        if (createResult.requiredHeaders) {
          Object.assign(headers, createResult.requiredHeaders);
        } else if (createResult.contentType) {
          headers['Content-Type'] = createResult.contentType;
        } else {
          headers['Content-Type'] = mimeType;
        }

        const uploadResponse = await FileSystem.uploadAsync(createResult.uploadUrl, fileUri, {
          httpMethod: 'PUT',
          headers,
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
        });

        if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
          const errorText = uploadResponse.body || '';
          throw new Error(`Upload failed: ${uploadResponse.status}\n${errorText}`);
        }
        setUploadProgress('Upload complete, processing...');
      } catch (presignedUploadError) {
        console.error('Presigned upload failed, trying direct API upload:', presignedUploadError);

        const directUploadResponse = await FileSystem.uploadAsync(
          `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/recordings/${createResult.recordingId}/upload`,
          fileUri,
          {
            httpMethod: 'POST',
            headers: {
              'x-user-id': userId,
              'Content-Type': mimeType,
            },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          }
        );

        if (directUploadResponse.status < 200 || directUploadResponse.status >= 300) {
          const errorText = directUploadResponse.body || '';
          throw new Error(`Direct upload failed: ${directUploadResponse.status}\n${errorText}`);
        }
        setUploadProgress('Upload complete, processing...');
      }

      await completeUpload(userId, createResult.recordingId, {
        fileSize,
      });

      // Step 4: Poll for completion
      setState('processing');
      await pollForCompletion(createResult.recordingId);
    } catch (err) {
      // 402 = recording limit reached → show paywall instead of error
      if (err instanceof ApiClientError && err.statusCode === 402) {
        onPaywall?.();
        return;
      }

      console.error('Error in upload flow:', err);
      console.error('Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
      });

      // If recording failed during processing, make sure we have the recordingId set
      // so the retry button will work
      if (err instanceof Error && err.message.includes('Recording processing failed')) {
        // recordingId should already be set from createResult, but ensure it's preserved
        // The error state will show the retry button
      }

      const errorMessage =
        err instanceof ApiClientError
          ? `API Error: ${err.message} (${err.statusCode})`
          : err instanceof Error
            ? err.message
            : 'Upload flow failed';
      setError(errorMessage);
      setState('error');
    }
  };

  const pollForCompletion = async (id: string) => {
    setState('processing');
    setUploadProgress('Processing your recording...');

    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (increased from 5)
    const baseDelay = 2000; // Start with 2 seconds

    while (attempts < maxAttempts) {
      // Stop polling if component was unmounted
      if (pollCancelledRef.current) return;

      try {
        const statusResult = await getRecordingStatus(userId, id);
        if (pollCancelledRef.current) return;

        setUploadProgress(`Processing... (${statusResult.status})`);

        if (statusResult.status === 'complete') {
          setState('complete');
          setUploadProgress('Complete!');

          // If this was the final chunk of a long session, kick off the session debrief.
          // Fire-and-forget: the backend may return 202 if earlier chunks are still processing
          // (backend handles that gracefully). The user navigates to the recording detail
          // immediately; the session debrief appears when they revisit the recordings list.
          if (sessionIdRef.current) {
            triggerSessionDebrief(userId, sessionIdRef.current).catch(() => {});
            sessionIdRef.current = null;
          }

          // Navigate to detail screen
          setTimeout(() => {
            if (!pollCancelledRef.current) onComplete(id);
          }, 500);
          return;
        }

        if (statusResult.status === 'failed') {
          // Recording failed - use actual error message if available
          const errorMsg = statusResult.errorMessage
            ? `Recording processing failed: ${statusResult.errorMessage}. You can retry using the "Retry Processing" button.`
            : 'Recording processing failed. You can retry using the "Retry Processing" button.';
          throw new Error(errorMsg);
        }

        // Exponential backoff with max 30 seconds
        const delay = Math.min(baseDelay * Math.pow(2, Math.floor(attempts / 5)), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempts++;
      } catch (err) {
        if (pollCancelledRef.current) return;
        console.error('Error polling:', err);
        if (err instanceof ApiClientError && err.statusCode === 404) {
          // Recording not found yet, keep polling
          const delay = Math.min(baseDelay * Math.pow(2, Math.floor(attempts / 5)), 30000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempts++;
          continue;
        }
        // For other errors, throw to show error state
        throw err;
      }
    }

    if (pollCancelledRef.current) return;

    // Timeout - but don't throw error, just show a message and allow navigation
    setError(
      'Processing is taking longer than expected. You can check the recording status later.'
    );
    setState('error');
    // Still set recordingId so user can navigate to detail screen
    setRecordingId(id);
  };

  const handleRetry = async () => {
    if (recordingId) {
      // Retry transcription for failed recording
      setError(null);
      setState('processing');
      setUploadProgress('Retrying transcription...');

      try {
        // First, check the current status
        const statusResult = await getRecordingStatus(userId, recordingId);

        if (statusResult.status === 'failed') {
          // Recording failed - retry transcription
          await retryTranscription(userId, recordingId);
          setUploadProgress('Transcription job requeued. Processing...');
        }

        // Poll for completion
        await pollForCompletion(recordingId);
      } catch (err) {
        const errorMessage =
          err instanceof ApiClientError
            ? `API Error: ${err.message} (${err.statusCode})`
            : err instanceof Error
              ? err.message
              : 'Retry failed';
        setError(errorMessage);
        setState('error');
      }
    } else {
      // Start over
      setError(null);
      setState('idle');
      setDuration(0);
    }
  };

  const renderMainContent = () => {
    // ── Mic explainer (first-time) ──
    if (state === 'mic-explainer') {
      return (
        <View style={styles.mainContent}>
          <Text style={styles.explainerIcon}>🎙️</Text>
          <Text style={styles.explainerTitle}>Microphone Access</Text>
          <Text style={styles.explainerBody}>
            Twin needs microphone access to record your conversation and generate your debrief.
          </Text>
          <TouchableOpacity
            style={styles.explainerCta}
            onPress={async () => {
              await AsyncStorage.setItem(MIC_EXPLAINED_KEY, '1').catch(() => {});
              await proceedToRecord();
            }}
          >
            <Text style={styles.explainerCtaText}>Continue</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── Mic denied ──
    if (state === 'mic-denied') {
      return (
        <View style={styles.mainContent}>
          <Text style={styles.explainerIcon}>🔇</Text>
          <Text style={styles.explainerTitle}>Microphone Denied</Text>
          <Text style={styles.explainerBody}>
            Twin cannot record without microphone permission. Please enable it in your device
            Settings.
          </Text>
          <TouchableOpacity style={styles.explainerCta} onPress={() => Linking.openSettings()}>
            <Text style={styles.explainerCtaText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.explainerCta, { backgroundColor: theme.surface, marginTop: 12 }]}
            onPress={async () => {
              await proceedToRecord();
            }}
          >
            <Text style={[styles.explainerCtaText, { color: theme.textPrimary }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (state === 'idle' || state === 'requesting-permission') {
      return (
        <View style={styles.mainContent}>
          {usedRecordings !== null && recordingLimit !== null && (
            <View style={styles.usagePill}>
              <Text style={styles.usagePillText}>
                {usedRecordings} of {recordingLimit} recordings
              </Text>
            </View>
          )}

          {/* Concentric pulse rings + record button */}
          <Animated.View style={[styles.ringOuter, { transform: [{ scale: pulseScale }] }]}>
            <View style={styles.ringMid}>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={startRecording}
                disabled={state === 'requesting-permission'}
                activeOpacity={0.85}
              >
                {state === 'requesting-permission' ? (
                  <ActivityIndicator color={theme.bg} size="large" />
                ) : (
                  <Text style={styles.recordButtonIcon}>🎙</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Text style={styles.tapHint}>Tap to begin recording</Text>

          <View style={styles.helperDivider} />
          <Text style={styles.helperText}>Audio is processed securely for AI transcription.</Text>
        </View>
      );
    }

    if (state === 'recording') {
      return (
        <View style={styles.mainContent}>
          {/* REC indicator */}
          <View style={styles.recRow}>
            <Animated.View style={[styles.recDot, { opacity: recDotOpacity }]} />
            <Text style={styles.recLabel}>REC</Text>
            <Text style={styles.timerText}>{formatDuration(duration)}</Text>
          </View>

          {/* Animated waveform */}
          <View style={styles.waveformContainer}>
            {waveformAnims.map((anim, i) => (
              <Animated.View key={i} style={[styles.waveBar, { height: anim }]} />
            ))}
          </View>

          {/* Stop button */}
          <TouchableOpacity style={styles.stopButton} onPress={handleStop} activeOpacity={0.85}>
            <View style={styles.stopButtonInner} />
          </TouchableOpacity>
        </View>
      );
    }

    if (state === 'stopping' || state === 'uploading' || state === 'processing') {
      return (
        <View style={styles.mainContent}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.statusText}>{uploadProgress || 'Processing...'}</Text>
          {state === 'uploading' && (
            <Text style={styles.helperText}>This may take a moment...</Text>
          )}
        </View>
      );
    }

    if (state === 'complete') {
      return (
        <View style={styles.mainContent}>
          <View style={styles.successCircle}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.statusText}>Recording complete!</Text>
        </View>
      );
    }

    if (state === 'error') {
      return (
        <View style={styles.mainContent}>
          <Text style={styles.errorIcon}>✗</Text>
          <Text style={styles.errorText}>{error || 'An error occurred'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>
              {recordingId ? 'Retry Processing' : 'Try Again'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>{state === 'recording' ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Recording</Text>
        <View style={styles.headerSpacer} />
      </View>

      {renderMainContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  cancelButton: {
    padding: 8,
  },
  cancelButtonText: {
    color: theme.accent,
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 60,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  // Usage pill
  usagePill: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 48,
  },
  usagePillText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
  },
  // Concentric rings
  ringOuter: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: 'rgba(201,168,76,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
  },
  ringMid: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: 'rgba(201,168,76,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  recordButtonIcon: {
    fontSize: 44,
  },
  tapHint: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 32,
  },
  helperDivider: {
    width: 40,
    height: 1,
    backgroundColor: theme.border,
    marginBottom: 16,
  },
  helperText: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Recording state
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.error,
  },
  recLabel: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.error,
    letterSpacing: 1.5,
    marginRight: 8,
  },
  timerText: {
    fontFamily: theme.fontMono,
    fontSize: 36,
    color: theme.textPrimary,
    letterSpacing: 2,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    marginBottom: 44,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.accent,
  },
  stopButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(192,96,96,0.2)',
    borderWidth: 1.5,
    borderColor: theme.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: theme.error,
  },
  statusText: {
    fontFamily: theme.fontMono,
    fontSize: 15,
    color: theme.textSecondary,
    marginTop: 20,
    textAlign: 'center',
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(109,170,122,0.15)',
    borderWidth: 1,
    borderColor: theme.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 28,
    color: theme.success,
  },
  errorIcon: {
    fontSize: 52,
    color: theme.error,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: theme.error,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  retryButtonText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: '600',
  },
  // Mic explainer
  explainerIcon: {
    fontSize: 56,
    marginBottom: 16,
    textAlign: 'center',
  },
  explainerTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 26,
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  explainerBody: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  explainerCta: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  explainerCtaText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.bg,
  },
});
