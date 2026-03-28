/* global setTimeout, clearTimeout, AbortController, console, fetch, Response, FormData, __DEV__, process */
/**
 * VoiceProfileScreen
 *
 * Voice enrollment UI for creating a voice profile.
 * Features:
 * - Record voice sample (10-30 seconds recommended)
 * - Upload to create voice profile
 * - Check enrollment status
 * - Delete voice profile
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
  ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { useAuth } from '../contexts/AuthContext';
import { getVoiceProfileStatus, deleteVoiceProfile, ApiClientError } from '@komuchi/shared';

// User ID is now provided by Firebase Auth via useAuth()

type VoiceProfileState =
  | 'checking'
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'stopping'
  | 'uploading'
  | 'complete'
  | 'error';

interface VoiceProfileScreenProps {
  onBack: () => void;
  onPaywall?: () => void;
}

export default function VoiceProfileScreen({ onBack, onPaywall }: VoiceProfileScreenProps) {
  const { user } = useAuth();
  const userId = user!.uid;
  const [state, setState] = useState<VoiceProfileState>('checking');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [duration, setDuration] = useState(0); // in seconds
  const [error, setError] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const durationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef(0); // Track duration in ref to avoid closure issues
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isRecordingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check voice profile status on mount
  useEffect(() => {
    checkVoiceProfile();
  }, []);

  // Handle app backgrounding during recording
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        if (state === 'recording' && recording) {
          handleStop();
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [state, recording]);

  // Cleanup timeout when state changes away from recording
  useEffect(() => {
    console.log('State changed to:', state);
    if (state !== 'recording') {
      console.log('State is not recording, clearing timeout');
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        console.log('Clearing duration timeout, final duration:', durationRef.current);
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
    } else {
      // When state becomes 'recording', ensure ref is true and timeout is running
      console.log('State is recording, ensuring ref is true');
      isRecordingRef.current = true;
      // Don't start timeout here - it should already be started in startRecording
      // But verify it exists
      if (!durationTimeoutRef.current) {
        console.warn('⚠️ State is recording but timeout is null! Starting timeout...');
        const scheduleNextTick = () => {
          if (isRecordingRef.current) {
            durationRef.current += 1;
            const newDuration = durationRef.current;
            console.log('⏱️ Recording duration:', newDuration, 'seconds');
            setDuration(newDuration);
            durationTimeoutRef.current = setTimeout(scheduleNextTick, 1000);
          } else {
            durationTimeoutRef.current = null;
          }
        };
        durationTimeoutRef.current = setTimeout(scheduleNextTick, 1000);
      }
    }
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
      if (recording) {
        // Safely unload recording on unmount
        // Use a simpler approach to avoid async issues in cleanup
        try {
          recording.stopAndUnloadAsync().catch(() => {
            // Ignore errors - recording may already be unloaded
          });
        } catch {
          // Ignore errors in cleanup
        }
      }
    };
  }, [recording]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const checkVoiceProfile = async () => {
    try {
      setState('checking');
      setError(null);
      const status = await getVoiceProfileStatus(userId);
      setHasProfile(status.hasVoiceProfile);
      setState('idle');
    } catch (err) {
      console.error('Error checking voice profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to check voice profile');
      setState('error');
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Microphone Permission Required',
          'This app needs access to your microphone to record your voice. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ]
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error requesting permission:', err);
      setError('Failed to request microphone permission');
      return false;
    }
  };

  const startRecording = async () => {
    console.log('startRecording called');
    try {
      setState('requesting-permission');
      setError(null);
      // Reset duration and audioUri when starting a NEW recording
      setDuration(0);
      setAudioUri(null);

      console.log('Requesting microphone permission...');
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        console.log('Permission denied');
        setState('idle');
        return;
      }

      console.log('Permission granted, configuring audio mode...');
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('Creating recording...');
      // Create and start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      console.log('Recording started successfully');

      // Clear any existing timeout first
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      setRecording(newRecording);
      durationRef.current = 0; // Reset ref
      setDuration(0); // Reset duration when starting
      isRecordingRef.current = true;

      // Start duration timer using recursive setTimeout (more reliable in React Native)
      const scheduleNextTick = () => {
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

      // Start the first tick immediately
      durationTimeoutRef.current = setTimeout(scheduleNextTick, 1000);
      console.log('✅ Duration timer started using recursive setTimeout');

      // Now set state - useEffect will see timeout already exists
      setState('recording');
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setState('idle');
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
    }
  };

  const handleStop = async () => {
    console.log('handleStop called', { recording: !!recording, duration });
    if (!recording) return;

    try {
      setState('stopping');
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      console.log('Stopping recording...');
      // Get URI before stopping (it's available while recording)
      const uri = recording.getURI();

      // Stop and unload the recording
      await recording.stopAndUnloadAsync();

      console.log('Recording stopped, URI:', uri);

      if (!uri) {
        throw new Error('No recording URI returned');
      }

      // Preserve duration from ref (more reliable than state)
      const finalDuration = durationRef.current;
      console.log('Recording saved, final duration:', finalDuration, 'seconds');

      setAudioUri(uri);
      setRecording(null);
      setState('idle');

      // Ensure duration is preserved from ref
      setDuration(finalDuration);
    } catch (err) {
      console.error('Error stopping recording:', err);
      // If error is about already unloaded, try to get URI anyway
      if (err instanceof Error && err.message.includes('already been unloaded')) {
        try {
          const uri = recording.getURI();
          if (uri) {
            setAudioUri(uri);
            setRecording(null);
            setState('idle');
            return;
          }
        } catch {
          // Ignore
        }
      }
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setState('idle');
    }
  };

  const handleReset = async () => {
    try {
      if (recording) {
        // Try to stop and unload, but don't fail if already unloaded
        try {
          await recording.stopAndUnloadAsync();
        } catch {
          // Recording might already be stopped/unloaded, try just unloading
          try {
            await recording.unloadAsync();
          } catch {
            // Ignore - recording is already unloaded
          }
        }
        setRecording(null);
      }
    } catch (err) {
      // Ignore errors if recording is already unloaded
      console.log('Recording reset error (ignored):', err);
    } finally {
      setAudioUri(null);
      durationRef.current = 0;
      setDuration(0);
      setError(null);
      setState('idle');
    }
  };

  const handleEnroll = async () => {
    console.log('🚀 handleEnroll called', {
      audioUri,
      duration,
      state,
      durationRef: durationRef.current,
    });

    if (!audioUri) {
      console.error('❌ No audioUri available');
      Alert.alert('Error', 'No recording available. Please record a voice sample first.');
      setError('No recording available. Please record a voice sample first.');
      return;
    }

    // Use durationRef for more reliable duration check
    const durationSeconds = durationRef.current || duration;
    console.log('📏 Duration check:', {
      durationSeconds,
      duration,
      durationRef: durationRef.current,
    });

    if (durationSeconds < 5) {
      const msg = `Recording too short (${durationSeconds}s). Please record at least 5 seconds of your voice.`;
      console.error('❌', msg);
      Alert.alert('Recording Too Short', msg);
      setError(msg);
      return;
    }
    if (durationSeconds > 60) {
      const msg = `Recording too long (${durationSeconds}s). Please keep it under 60 seconds.`;
      console.error('❌', msg);
      Alert.alert('Recording Too Long', msg);
      setError(msg);
      return;
    }

    try {
      console.log('📤 Starting upload process...');
      setState('uploading');
      setError(null);

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      console.log('📁 File info:', fileInfo);

      if (!fileInfo.exists) {
        throw new Error('Audio file not found. Please record again.');
      }

      // Determine MIME type
      const extension = audioUri.split('.').pop()?.toLowerCase();
      let mimeType = 'audio/m4a';
      if (extension === 'caf') {
        mimeType = 'audio/x-caf';
      } else if (extension === 'm4a') {
        mimeType = 'audio/m4a';
      }

      console.log('📋 Preparing upload', {
        audioUri,
        mimeType,
        durationSeconds,
        fileSize: fileInfo.size,
      });

      // Get API base URL from config (set in app.json extra or EXPO_PUBLIC_API_BASE_URL env var)
      // On simulator: localhost works. On physical device: use your computer's LAN IP.
      const configUrl =
        Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ||
        (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_BASE_URL : null);
      const baseUrl = configUrl || 'http://localhost:3001';
      const url = `${baseUrl}/api/voice-profile/enroll`;

      // Health check before uploading
      try {
        const healthController = new AbortController();
        const healthTimeout = setTimeout(() => healthController.abort(), 10000);
        const healthResponse = await fetch(`${baseUrl}/api/health`, {
          method: 'GET',
          signal: healthController.signal,
        });
        clearTimeout(healthTimeout);
        if (!healthResponse.ok) {
          throw new Error(`API responded with ${healthResponse.status}`);
        }
      } catch {
        throw new Error(
          `Cannot reach API server at ${baseUrl}.\n\n` +
            `Please check:\n` +
            `1. API server is running (test: curl ${baseUrl}/api/health)\n` +
            `2. Device and server are on the same network\n` +
            `3. Correct IP in app.json extra.EXPO_PUBLIC_API_BASE_URL`
        );
      }

      const formData = new FormData();
      // React Native FormData format - URI should already be correct from expo-av
      formData.append('audio', {
        uri: audioUri,
        type: mimeType,
        name: `voice-sample.${extension || 'm4a'}`,
      } as any);

      // Upload with timeout (120s to allow model cold-start)
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

      // Build headers with Firebase auth token
      const uploadHeaders: Record<string, string> = {
        'x-user-id': userId,
      };
      try {
        const idToken = await user!.getIdToken();
        if (idToken) {
          uploadHeaders['Authorization'] = `Bearer ${idToken}`;
        }
      } catch {
        console.warn('⚠️ Could not get Firebase ID token for enrollment');
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: uploadHeaders,
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        abortControllerRef.current = null;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        abortControllerRef.current = null;
        if (fetchError.name === 'AbortError') {
          throw new Error(
            'Upload cancelled or timed out.\n\nIf this keeps happening, the diarization service may not be running.\nStart it with: docker compose up diarization -d'
          );
        }
        if (
          fetchError.message?.includes('Network request failed') ||
          fetchError.message?.includes('Failed to connect')
        ) {
          throw new Error(
            `Cannot connect to API server.\n\nPlease check:\n1. API server is running (${baseUrl})\n2. Device and computer are on the same network\n3. Firewall allows connections\n4. Diarization service is running (port 8001)`
          );
        }
        throw fetchError;
      }

      console.log('📥 Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      if (!response.ok) {
        // 402 = pro required for re-enrollment → show paywall
        if (response.status === 402) {
          setState('idle');
          onPaywall?.();
          return;
        }

        let errorMessage = 'Failed to enroll voice profile';
        try {
          const contentType = response.headers.get('content-type') || '';
          console.log('📄 Response content-type:', contentType);
          if (contentType.includes('application/json')) {
            const errorData = await response.json();
            console.error('❌ Error response JSON:', errorData);
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            const errorText = await response.text();
            console.error('❌ Error response text:', errorText);
            errorMessage = errorText || errorMessage;
          }
        } catch (parseErr) {
          console.error('❌ Error parsing error response:', parseErr);
          errorMessage = response.statusText || errorMessage;
        }
        throw new ApiClientError(errorMessage, response.status);
      }

      const result = await response.json();
      console.log('✅ Enrollment successful:', result);

      setHasProfile(result.hasVoiceProfile);
      setState('complete');
      setAudioUri(null);
      setDuration(0);
      durationRef.current = 0;

      Alert.alert('Success', 'Voice profile enrolled successfully!');

      // Reset after showing success
      setTimeout(() => {
        setState('idle');
        checkVoiceProfile(); // Refresh status
      }, 2000);
    } catch (err) {
      console.error('❌ Error enrolling voice profile:', err);
      const errorMessage =
        err instanceof ApiClientError
          ? `API Error: ${err.message} (${err.statusCode})`
          : err instanceof Error
            ? err.message
            : 'Failed to enroll voice profile';
      console.error('❌ Error message:', errorMessage);
      Alert.alert('Enrollment Failed', errorMessage);
      setError(errorMessage);
      setState('error');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Voice Profile?',
      'Are you sure you want to delete your voice profile? Future recordings will not use personalized diarization.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setState('uploading');
              setError(null);
              await deleteVoiceProfile(userId);
              setHasProfile(false);
              setState('idle');
            } catch (err) {
              console.error('Error deleting voice profile:', err);
              const errorMessage =
                err instanceof ApiClientError
                  ? `API Error: ${err.message} (${err.statusCode})`
                  : err instanceof Error
                    ? err.message
                    : 'Failed to delete voice profile';
              setError(errorMessage);
              setState('error');
            }
          },
        },
      ]
    );
  };

  const renderContent = () => {
    if (state === 'checking') {
      return (
        <View style={styles.mainContent}>
          <ActivityIndicator size="large" color="#0ff" />
          <Text style={styles.statusText}>Checking voice profile status...</Text>
        </View>
      );
    }

    if (hasProfile && state !== 'uploading') {
      return (
        <View style={styles.mainContent}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.statusText}>Voice Profile Enrolled</Text>
          <Text style={styles.helperText}>
            Your voice profile is active. All new recordings will use personalized diarization to
            identify your voice as "YOU".
          </Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete Voice Profile</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.instructionItem}>
            <Text style={styles.instructionNumber}>1</Text>
            <Text style={styles.instructionText}>
              Record 10-30 seconds of yourself speaking clearly
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <Text style={styles.instructionNumber}>2</Text>
            <Text style={styles.instructionText}>
              Upload your voice sample to create your profile
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <Text style={styles.instructionNumber}>3</Text>
            <Text style={styles.instructionText}>
              Future recordings will automatically identify you as "YOU"
            </Text>
          </View>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Recording Controls */}
        <View style={styles.section}>
          <View style={styles.recordingHeader}>
            <Text style={styles.sectionTitle}>Voice Sample</Text>
            <Text style={styles.timerText}>{formatDuration(duration)}</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.recordButton, state === 'recording' && styles.recordButtonActive]}
              onPress={state === 'recording' ? handleStop : startRecording}
              disabled={state === 'requesting-permission' || state === 'uploading'}
              activeOpacity={0.8}
            >
              {state === 'requesting-permission' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : state === 'recording' ? (
                <View style={styles.stopButtonInner} />
              ) : (
                <Text style={styles.recordButtonIcon}>🎤</Text>
              )}
            </TouchableOpacity>

            {audioUri && (
              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleReset}
                disabled={state === 'uploading'}
              >
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>

          {state === 'idle' && !audioUri && (
            <Text style={styles.helperText}>Tap the microphone to start recording</Text>
          )}
          {state === 'recording' && (
            <Text style={styles.recordingHelperText}>Recording... Tap again to stop</Text>
          )}

          {audioUri && state === 'idle' && (
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>Preview</Text>
              <Text style={styles.previewDuration}>
                Duration: {duration}s (recommended: 10-30s)
              </Text>
            </View>
          )}
        </View>

        {/* Upload Button - Show when idle OR uploading */}
        {audioUri && (state === 'idle' || state === 'uploading') && (
          <View style={styles.section}>
            {/* Debug info */}
            {__DEV__ && (
              <Text style={[styles.helperText, { color: '#888', fontSize: 12 }]}>
                Debug: duration={duration}, durationRef={durationRef.current}, state={state},
                audioUri={audioUri ? 'yes' : 'no'}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.enrollButton,
                ((durationRef.current || duration) < 5 ||
                  (durationRef.current || duration) > 60 ||
                  state === 'uploading') &&
                  styles.enrollButtonDisabled,
                state === 'uploading' && { opacity: 0.7 },
              ]}
              onPress={() => {
                console.log('🔵🔵🔵 Enroll button PRESSED!', {
                  duration,
                  durationRef: durationRef.current,
                  state,
                  audioUri,
                  buttonDisabled:
                    state === 'uploading' ||
                    (durationRef.current || duration) < 5 ||
                    (durationRef.current || duration) > 60,
                });
                if (state === 'uploading') {
                  console.warn('⚠️ Button pressed but state is uploading - ignoring');
                  return;
                }
                handleEnroll();
              }}
              disabled={
                state === 'uploading' ||
                (durationRef.current || duration) < 5 ||
                (durationRef.current || duration) > 60
              }
              activeOpacity={0.7}
            >
              {state === 'uploading' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color="#000" size="small" />
                  <Text style={styles.enrollButtonText}>Uploading...</Text>
                </View>
              ) : (
                <Text style={styles.enrollButtonText}>Enroll Voice Profile</Text>
              )}
            </TouchableOpacity>
            {(durationRef.current || duration) < 5 && (durationRef.current || duration) > 0 && (
              <Text style={styles.helperText}>
                Record at least 5 seconds to enroll (current: {durationRef.current || duration}s)
              </Text>
            )}
            {(durationRef.current || duration) === 0 && audioUri && (
              <Text style={styles.helperText}>
                ⚠️ Duration is 0. Please record again (at least 5 seconds).
              </Text>
            )}
            {(durationRef.current || duration) > 60 && (
              <Text style={styles.helperText}>
                Recording is too long (max 60 seconds, current: {durationRef.current || duration}s)
              </Text>
            )}
            {(durationRef.current || duration) >= 5 && (durationRef.current || duration) <= 60 && (
              <Text style={[styles.helperText, { color: '#0ff' }]}>
                ✓ Duration: {durationRef.current || duration}s - Ready to enroll!
              </Text>
            )}
            {state === 'uploading' && (
              <View style={{ marginTop: 10, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0ff" />
                <Text
                  style={[
                    styles.helperText,
                    { color: '#0ff', marginTop: 10, fontSize: 16, fontWeight: '600' },
                  ]}
                >
                  Uploading and processing voice sample...
                </Text>
                <Text style={[styles.helperText, { color: '#888', marginTop: 5, fontSize: 12 }]}>
                  This may take a few minutes. Please wait...
                </Text>
                <TouchableOpacity
                  style={[
                    styles.enrollButton,
                    { backgroundColor: '#f44', marginTop: 15, minWidth: 120 },
                  ]}
                  onPress={() => {
                    console.log('🛑 Cancel button pressed');
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort();
                      abortControllerRef.current = null;
                    }
                    setState('idle');
                    setError('Upload cancelled by user.');
                  }}
                >
                  <Text style={[styles.enrollButtonText, { color: '#fff' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
            {__DEV__ && audioUri && (
              <TouchableOpacity
                style={[styles.enrollButton, { backgroundColor: '#ff0', marginTop: 10 }]}
                onPress={() => {
                  console.log('🧪 TEST BUTTON PRESSED - Force calling handleEnroll');
                  handleEnroll();
                }}
              >
                <Text style={[styles.enrollButtonText, { color: '#000' }]}>
                  🧪 TEST ENROLL (Always Enabled)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {renderContent()}
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
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#0ff',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  statusText: {
    fontSize: 18,
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  helperText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
  },
  recordingHelperText: {
    fontSize: 14,
    color: '#0ff',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
  },
  successIcon: {
    fontSize: 64,
    color: '#0f0',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0ff',
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: '#2a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  errorText: {
    color: '#f88',
    fontSize: 14,
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  timerText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0ff',
    fontVariant: ['tabular-nums'],
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonActive: {
    backgroundColor: '#f00',
  },
  recordButtonIcon: {
    fontSize: 32,
  },
  stopButtonInner: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  resetButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  previewDuration: {
    fontSize: 12,
    color: '#888',
  },
  enrollButton: {
    backgroundColor: '#0ff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  enrollButtonDisabled: {
    backgroundColor: '#444',
    opacity: 0.5,
  },
  enrollButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
  },
  deleteButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2a1a1a',
    borderWidth: 1,
    borderColor: '#f44',
  },
  deleteButtonText: {
    color: '#f88',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
