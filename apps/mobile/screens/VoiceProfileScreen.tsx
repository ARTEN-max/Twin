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
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { useAuth } from '../contexts/AuthContext';
import { getExpoPublicEnv } from '../lib/expoPublicEnv';
import { getVoiceProfileStatus, deleteVoiceProfile, ApiClientError } from '@twin/shared';
import { theme } from '../theme';

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

  // Handle app state changes during recording
  // Do NOT stop recording when screen locks or app backgrounds — background audio is enabled.
  // Only check on foreground restore to detect if iOS killed the session unexpectedly.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;

      if (
        nextAppState === 'active' &&
        prev.match(/background|inactive/) &&
        isRecordingRef.current &&
        recording
      ) {
        recording
          .getStatusAsync()
          .then((status) => {
            if (!status.isRecording && isRecordingRef.current) {
              // Recording was genuinely killed by the OS — clean up
              isRecordingRef.current = false;
              if (durationTimeoutRef.current) {
                clearTimeout(durationTimeoutRef.current);
                durationTimeoutRef.current = null;
              }
              setRecording(null);
              setState('idle');
              setDuration(durationRef.current); // Keep final duration for enroll
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [recording]);

  // Cleanup timeout when state changes away from recording
  useEffect(() => {
    if (state !== 'recording') {
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
    } else {
      // When state becomes 'recording', ensure ref is true and timeout is running
      isRecordingRef.current = true;
      // Don't start timeout here - it should already be started in startRecording
      // But verify it exists
      if (!durationTimeoutRef.current) {
        const scheduleNextTick = () => {
          if (isRecordingRef.current) {
            durationRef.current += 1;
            const newDuration = durationRef.current;
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
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }
      // Abort any in-flight upload
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (recording) {
        try {
          recording.stopAndUnloadAsync().catch(() => {});
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
    try {
      setState('requesting-permission');
      setError(null);
      // Reset duration and audioUri when starting a NEW recording
      setDuration(0);
      setAudioUri(null);

      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setState('idle');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
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

      setRecording(newRecording);
      durationRef.current = 0; // Reset ref
      setDuration(0); // Reset duration when starting
      isRecordingRef.current = true;

      // Start duration timer using recursive setTimeout (more reliable in React Native)
      const scheduleNextTick = () => {
        if (isRecordingRef.current) {
          durationRef.current += 1;
          const newDuration = durationRef.current;
          setDuration(newDuration);

          // Schedule next tick
          durationTimeoutRef.current = setTimeout(scheduleNextTick, 1000);
        } else {
          durationTimeoutRef.current = null;
        }
      };

      // Start the first tick immediately
      durationTimeoutRef.current = setTimeout(scheduleNextTick, 1000);

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
    if (!recording) return;

    try {
      setState('stopping');
      isRecordingRef.current = false;
      if (durationTimeoutRef.current) {
        clearTimeout(durationTimeoutRef.current);
        durationTimeoutRef.current = null;
      }

      // Get URI before stopping (it's available while recording)
      const uri = recording.getURI();

      // Stop and unload the recording
      await recording.stopAndUnloadAsync();

      if (!uri) {
        throw new Error('No recording URI returned');
      }

      // Preserve duration from ref (more reliable than state)
      const finalDuration = durationRef.current;

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
          // Ignore - recording may already be stopped/unloaded.
        }
        setRecording(null);
      }
    } catch (err) {
      // Ignore errors if recording is already unloaded
      if (__DEV__) {
        console.log('Recording reset error (ignored):', err);
      }
    } finally {
      setAudioUri(null);
      durationRef.current = 0;
      setDuration(0);
      setError(null);
      setState('idle');
    }
  };

  const handleEnroll = async () => {
    if (!audioUri) {
      Alert.alert('Error', 'No recording available. Please record a voice sample first.');
      setError('No recording available. Please record a voice sample first.');
      return;
    }

    // Use durationRef for more reliable duration check
    const durationSeconds = durationRef.current || duration;

    if (durationSeconds < 5) {
      const msg = `Recording too short (${durationSeconds}s). Please record at least 5 seconds of your voice.`;
      Alert.alert('Recording Too Short', msg);
      setError(msg);
      return;
    }
    if (durationSeconds > 60) {
      const msg = `Recording too long (${durationSeconds}s). Please keep it under 60 seconds.`;
      Alert.alert('Recording Too Long', msg);
      setError(msg);
      return;
    }

    try {
      setState('uploading');
      setError(null);

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(audioUri);

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

      // Get API base URL from config (set in app.json extra or EXPO_PUBLIC_API_BASE_URL env var)
      // On simulator: localhost works. On physical device: use your computer's LAN IP.
      const baseUrl = getExpoPublicEnv(
        'EXPO_PUBLIC_API_BASE_URL',
        Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001'
      );
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
          'Unable to reach the server. Please check your internet connection and try again.'
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
      const uploadHeaders: Record<string, string> = {};
      try {
        const idToken = await user!.getIdToken();
        if (idToken) {
          uploadHeaders['Authorization'] = `Bearer ${idToken}`;
        }
      } catch {
        if (__DEV__) {
          console.warn('Could not get Firebase ID token for enrollment');
        }
      }
      if (__DEV__) {
        uploadHeaders['x-user-id'] = userId;
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
          throw new Error('Upload timed out. Please try again.');
        }
        if (
          fetchError.message?.includes('Network request failed') ||
          fetchError.message?.includes('Failed to connect')
        ) {
          throw new Error(
            'Connection failed. Please check your internet connection and try again.'
          );
        }
        throw fetchError;
      }

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
          if (contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          }
        } catch (parseErr) {
          if (__DEV__) {
            console.error('Error parsing voice profile error response:', parseErr);
          }
          errorMessage = response.statusText || errorMessage;
        }
        throw new ApiClientError(errorMessage, response.status);
      }

      const result = await response.json();

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
          <ActivityIndicator size="large" color={theme.accent} />
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
                if (state === 'uploading') {
                  return;
                }
                void handleEnroll();
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
              <Text style={[styles.helperText, { color: theme.success }]}>
                ✓ Duration: {durationRef.current || duration}s - Ready to enroll!
              </Text>
            )}
            {state === 'uploading' && (
              <View style={{ marginTop: 10, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text
                  style={[
                    styles.helperText,
                    { color: theme.accent, marginTop: 10, fontSize: 16, fontWeight: '600' },
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
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: theme.accent,
    fontFamily: theme.fontMono,
    fontSize: 14,
  },
  headerTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 20,
    color: theme.textPrimary,
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
    fontFamily: theme.fontMono,
    fontSize: 15,
    color: theme.textSecondary,
    marginTop: 20,
    textAlign: 'center',
  },
  helperText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  recordingHelperText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.accent,
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  successIcon: {
    fontSize: 64,
    color: theme.success,
    marginBottom: 20,
  },
  section: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 16,
    color: theme.textPrimary,
    marginBottom: 14,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  instructionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.accentDim,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    color: theme.accent,
    fontSize: 11,
    fontFamily: theme.fontMono,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    marginRight: 12,
  },
  instructionText: {
    flex: 1,
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: theme.errorDim,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(184,92,92,0.25)',
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: theme.fontMono,
    color: theme.error,
    fontSize: 13,
    lineHeight: 19,
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  timerText: {
    fontFamily: theme.fontMono,
    fontSize: 18,
    color: theme.accent,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: theme.error,
    shadowColor: theme.error,
  },
  recordButtonIcon: {
    fontSize: 30,
  },
  stopButtonInner: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: theme.textPrimary,
  },
  resetButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
  },
  resetButtonText: {
    fontFamily: theme.fontMono,
    color: theme.textPrimary,
    fontSize: 13,
  },
  previewContainer: {
    marginTop: 14,
    padding: 12,
    backgroundColor: theme.surfaceHigh,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  previewLabel: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  previewDuration: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
  },
  enrollButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  enrollButtonDisabled: {
    backgroundColor: theme.surfaceHigh,
    opacity: 0.5,
  },
  enrollButtonText: {
    fontFamily: theme.fontMono,
    color: theme.bg,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  uploadText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  deleteButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.errorDim,
    borderWidth: 1,
    borderColor: 'rgba(184,92,92,0.3)',
  },
  deleteButtonText: {
    fontFamily: theme.fontMono,
    color: theme.error,
    fontSize: 13,
    textAlign: 'center',
  },
});
