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
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import {
  createRecording,
  uploadRecordingFile,
  completeUpload,
  getRecordingStatus,
  retryTranscription,
  ApiClientError,
} from '@komuchi/shared';
import { useAuth } from '../contexts/AuthContext';
import { useConsent } from '../contexts/ConsentContext';

const MIC_EXPLAINED_KEY = 'twin_mic_permission_explained';

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
}

export default function NewRecordingScreen({
  onComplete,
  onCancel,
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
  const durationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef(0); // Track duration in ref to avoid closure issues
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isRecordingRef = useRef(false);

  // Handle app backgrounding during recording
  // Note: We allow recording to continue in background - user must manually stop
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;
      // Don't stop recording when app goes to background - allow continuous recording
      // User must manually stop recording
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Handle timer based on recording state
  useEffect(() => {
    if (state === 'recording' && recording) {
      // Start timer when recording state is active (only if not already running)
      if (!durationTimeoutRef.current && isRecordingRef.current) {
        durationRef.current = 0;
        setDuration(0);
        const scheduleNextTick = () => {
          // Check both ref and state to ensure we're still recording
          if (isRecordingRef.current) {
            durationRef.current += 1;
            const newDuration = durationRef.current;
            console.log('⏱️ Timer tick - Setting duration to:', newDuration);
            setDuration(newDuration);
            
            // Schedule next tick
            durationTimeoutRef.current = setTimeout(scheduleNextTick, 1000);
          } else {
            console.log('⏱️ Timer stopped - isRecordingRef is false');
            durationTimeoutRef.current = null;
          }
        };
        // Start the first tick
        durationTimeoutRef.current = setTimeout(scheduleNextTick, 1000);
        console.log('✅ Duration timer started in useEffect');
      }
    } else if (state !== 'recording') {
      // Cleanup when not recording
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
      if (recording) {
        recording.stopAndUnloadAsync().catch(console.error);
      }
    };
  }, [recording]);

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
          'You must accept the data processing consent before recording. Go to Settings → Data & Consent.',
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
    } catch (err: any) {
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

      // Configure audio mode for background recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true, // Allow recording when app is in background
      });

      // Create and start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      // Clear any existing timeout first
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      // Clear any existing timeout first
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      setRecording(newRecording);
      durationRef.current = 0; // Reset ref
      setDuration(0); // Reset duration when starting
      isRecordingRef.current = true;
      
      // Set state - useEffect will handle starting the timer
      setState('recording');
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

  const handleStop = async () => {
    if (!recording) return;

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
        await recording.stopAndUnloadAsync();
        uri = recording.getURI();
      } catch (err) {
        // If error is about already unloaded, try to get URI anyway
        if (err instanceof Error && err.message.includes('already been unloaded')) {
          console.log('Recording already unloaded, getting URI directly');
          uri = recording.getURI();
        } else {
          // For other errors, try to get URI before throwing
          uri = recording.getURI();
          if (!uri) {
            throw err;
          }
        }
      }

      if (!uri) {
        throw new Error('No recording URI returned');
      }

      setRecording(null);

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
      Alert.alert(
        'Discard Recording?',
        'Are you sure you want to discard this recording?',
        [
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
                if (recording) {
                  await recording.stopAndUnloadAsync();
                  // Delete the file
                  const uri = recording.getURI();
                  if (uri) {
                    await FileSystem.deleteAsync(uri, { idempotent: true });
                  }
                  setRecording(null);
                }
                onCancel();
              } catch (err) {
                console.error('Error discarding recording:', err);
                onCancel(); // Still navigate back
              }
            },
          },
        ]
      );
    } else {
      onCancel();
    }
  };

  const uploadFlow = async (fileUri: string) => {
    try {
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

      console.log('Creating recording with API URL:', process.env.EXPO_PUBLIC_API_BASE_URL);
      const createResult = await createRecording(userId, {
        title: `Recording ${new Date().toLocaleTimeString()}`,
        mode: 'general',
        mimeType,
      });
      console.log('Recording created:', createResult.recordingId);

      setRecordingId(createResult.recordingId);
      setUploadProgress('Uploading audio...');

      // Step 2: Read file and convert to bytes
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'base64',
      });

      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Step 3: Upload file (try direct API upload first, fallback to presigned)
      try {
        await uploadRecordingFile(
          userId,
          createResult.recordingId,
          bytes.buffer,
          mimeType
        );
        setUploadProgress('Upload complete, processing...');
      } catch (directUploadError) {
        console.error('Direct upload failed, trying presigned URL:', directUploadError);
        
        // Fallback to presigned URL
        const headers: Record<string, string> = {};
        if (createResult.requiredHeaders) {
          Object.assign(headers, createResult.requiredHeaders);
        } else if (createResult.contentType) {
          headers['Content-Type'] = createResult.contentType;
        } else {
          headers['Content-Type'] = mimeType;
        }

        const uploadResponse = await fetch(createResult.uploadUrl, {
          method: 'PUT',
          body: bytes.buffer,
          headers,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(
            `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}\n${errorText}`
          );
        }

        // Complete upload for presigned flow
        await completeUpload(userId, createResult.recordingId, {
          fileSize: bytes.length,
        });
        setUploadProgress('Upload complete, processing...');
      }

      // Step 4: Poll for completion
      setState('processing');
      await pollForCompletion(createResult.recordingId);
    } catch (err) {
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
      try {
        const statusResult = await getRecordingStatus(userId, id);
        setUploadProgress(
          `Processing... (${statusResult.status})`
        );

        if (statusResult.status === 'complete') {
          setState('complete');
          setUploadProgress('Complete!');
          // Navigate to detail screen
          setTimeout(() => {
            onComplete(id);
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

    // Timeout - but don't throw error, just show a message and allow navigation
    setError('Processing is taking longer than expected. You can check the recording status later.');
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
            Twin needs microphone access to record your conversation and
            generate your debrief.
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
            Twin cannot record without microphone permission. Please enable it
            in your device Settings.
          </Text>
          <TouchableOpacity
            style={styles.explainerCta}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.explainerCtaText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.explainerCta, { backgroundColor: '#333', marginTop: 12 }]}
            onPress={async () => {
              await proceedToRecord();
            }}
          >
            <Text style={[styles.explainerCtaText, { color: '#fff' }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (state === 'idle' || state === 'requesting-permission') {
      return (
        <View style={styles.mainContent}>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={startRecording}
            disabled={state === 'requesting-permission'}
          >
            {state === 'requesting-permission' ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={styles.recordButtonIcon}>🎤</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.helperText}>
            Audio stays private. Upload starts after you stop.
          </Text>
        </View>
      );
    }

    if (state === 'recording') {
      return (
        <View style={styles.mainContent}>
          <TouchableOpacity
            style={[styles.recordButton, styles.stopButton]}
            onPress={handleStop}
          >
            <View style={styles.stopButtonInner} />
          </TouchableOpacity>
          <Text style={styles.timerText}>{formatDuration(duration)}</Text>
          <Text style={styles.recordingText}>Recording...</Text>
        </View>
      );
    }

    if (state === 'stopping' || state === 'uploading' || state === 'processing') {
      return (
        <View style={styles.mainContent}>
          <ActivityIndicator size="large" color="#0ff" />
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
          <Text style={styles.successIcon}>✓</Text>
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
          <Text style={styles.cancelButtonText}>
            {state === 'recording' ? 'Cancel' : 'Back'}
          </Text>
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
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  cancelButton: {
    padding: 8,
  },
  cancelButtonText: {
    color: '#0ff',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSpacer: {
    width: 60, // Balance the cancel button
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  recordButtonIcon: {
    fontSize: 48,
  },
  stopButton: {
    backgroundColor: '#f00',
    shadowColor: '#f00',
  },
  stopButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  timerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    fontVariant: ['tabular-nums'],
  },
  recordingText: {
    fontSize: 16,
    color: '#888',
  },
  helperText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
  statusText: {
    fontSize: 18,
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  successIcon: {
    fontSize: 64,
    color: '#0f0',
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 64,
    color: '#f00',
    marginBottom: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#f88',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#0ff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  // ── Mic explainer styles ──
  explainerIcon: {
    fontSize: 64,
    marginBottom: 16,
    textAlign: 'center',
  },
  explainerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  explainerBody: {
    fontSize: 15,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  explainerCta: {
    backgroundColor: '#0ff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  explainerCtaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
});
