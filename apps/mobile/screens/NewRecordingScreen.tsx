/* global setTimeout, clearTimeout */
/**
 * NewRecordingScreen
 *
 * Presentational screen for starting / monitoring a recording. All recorder
 * lifecycle (native recorder, chunk rotation, upload, polling, crash recovery)
 * lives in `RecordingContext` so the recording survives navigation away from
 * this screen.
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
  Animated,
} from 'react-native';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useConsent } from '../contexts/ConsentContext';
import { useRecording } from '../contexts/RecordingContext';
import { getMe } from '@komuchi/shared';

type LocalState = 'mic-explainer' | 'mic-denied' | 'requesting-permission' | null;

interface NewRecordingScreenProps {
  onComplete: (recordingId: string) => void;
  onCancel: () => void;
  onPaywall?: (reason: string) => void;
}

export default function NewRecordingScreen({
  onComplete,
  onCancel,
  onPaywall,
}: NewRecordingScreenProps) {
  const { user } = useAuth();
  const consent = useConsent();
  const recording = useRecording();
  const userId = user!.uid;

  const [localState, setLocalState] = useState<LocalState>(null);
  const [usedRecordings, setUsedRecordings] = useState<number | null>(null);
  const [recordingLimit, setRecordingLimit] = useState<number | null>(null);
  const [usedAudioMinutes, setUsedAudioMinutes] = useState<number | null>(null);
  const [audioMinuteLimit, setAudioMinuteLimit] = useState<number | null>(null);
  const [maxMinutesPerRecording, setMaxMinutesPerRecording] = useState<number | null>(null);

  const pulseScale = useRef(new Animated.Value(1)).current;
  const recDotOpacity = useRef(new Animated.Value(1)).current;
  const waveformAnims = useRef(Array.from({ length: 10 }, () => new Animated.Value(6))).current;

  // ─── Effects ──────────────────────────────────────────────────

  useEffect(() => {
    getMe(userId)
      .then((me) => {
        if (me.subscription) {
          setUsedRecordings(me.subscription.usage.recordingsThisMonth);
          setRecordingLimit(me.subscription.limits.recordingsPerMonth);
          setUsedAudioMinutes(me.subscription.usage.audioMinutesThisMonth);
          setAudioMinuteLimit(me.subscription.limits.maxAudioMinutesPerMonth);
          setMaxMinutesPerRecording(me.subscription.limits.maxMinutesPerRecording);
        }
      })
      .catch(() => {});
  }, [userId]);

  // Hand-off to parent when the recording finishes (and is acknowledged here).
  useEffect(() => {
    if (recording.lastCompletedRecordingId) {
      const id = recording.lastCompletedRecordingId;
      const t = setTimeout(() => {
        recording.acknowledgeComplete();
        onComplete(id);
      }, 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [recording.lastCompletedRecordingId, recording, onComplete]);

  // Surface subscription-limit 402s → paywall
  useEffect(() => {
    if (
      recording.error === 'recording_limit_reached' ||
      recording.error === 'audio_minutes_limit_reached'
    ) {
      const reason = recording.error;
      recording.acknowledgeError();
      onPaywall?.(reason);
    }
  }, [recording.error, recording, onPaywall]);

  // ─── Animations ───────────────────────────────────────────────

  useEffect(() => {
    if (recording.phase === 'idle' && !localState) {
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
  }, [recording.phase, localState, pulseScale]);

  useEffect(() => {
    if (recording.phase === 'recording') {
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
  }, [recording.phase, recDotOpacity, waveformAnims]);

  // ─── Helpers ──────────────────────────────────────────────────

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRecordPress = async () => {
    if (!consent.hasConsent) {
      Alert.alert(
        'Consent Required',
        'You must accept the data processing consent before recording. Go to Settings → Data & Consent.'
      );
      return;
    }
    setLocalState('requesting-permission');
    const result = await recording.start({ hasConsent: consent.hasConsent });
    if (result.ok) {
      setLocalState(null);
      return;
    }
    if (result.reason === 'mic_explainer_required') {
      setLocalState('mic-explainer');
    } else if (result.reason === 'mic_denied') {
      setLocalState('mic-denied');
    } else {
      setLocalState(null);
    }
  };

  const handleExplainerContinue = async () => {
    await recording.markExplainerSeen();
    setLocalState('requesting-permission');
    const result = await recording.start({ hasConsent: consent.hasConsent });
    if (result.ok) {
      setLocalState(null);
    } else if (result.reason === 'mic_denied') {
      setLocalState('mic-denied');
    } else {
      setLocalState(null);
    }
  };

  const handleStop = () => {
    recording.stop();
  };

  const handleCancel = () => {
    if (recording.isRecording) {
      Alert.alert('Discard Recording?', 'Are you sure you want to discard this recording?', [
        { text: 'Keep Recording', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await recording.cancel();
            onCancel();
          },
        },
      ]);
    } else {
      onCancel();
    }
  };

  const handleRetry = async () => {
    if (recording.currentRecordingId) {
      await recording.retry();
    } else {
      recording.acknowledgeError();
      setLocalState(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────

  const renderMainContent = () => {
    if (localState === 'mic-explainer') {
      return (
        <View style={styles.mainContent}>
          <Text style={styles.explainerIcon}>🎙️</Text>
          <Text style={styles.explainerTitle}>Microphone Access</Text>
          <Text style={styles.explainerBody}>
            Twin needs microphone access to record your conversation and generate your debrief.
          </Text>
          <TouchableOpacity style={styles.explainerCta} onPress={handleExplainerContinue}>
            <Text style={styles.explainerCtaText}>Continue</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (localState === 'mic-denied') {
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
            onPress={handleRecordPress}
          >
            <Text style={[styles.explainerCtaText, { color: theme.textPrimary }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (recording.phase === 'idle' || localState === 'requesting-permission') {
      return (
        <View style={styles.mainContent}>
          {usedRecordings !== null && recordingLimit !== null && (
            <>
              <View style={styles.usagePill}>
                <Text style={styles.usagePillText}>
                  {usedRecordings} of {recordingLimit} recordings
                </Text>
              </View>
              {usedAudioMinutes !== null && audioMinuteLimit !== null && (
                <View style={[styles.usagePill, styles.usagePillSecondary]}>
                  <Text style={styles.usagePillText}>
                    {usedAudioMinutes} of {audioMinuteLimit} free minutes used
                  </Text>
                </View>
              )}
              {maxMinutesPerRecording !== null && (
                <Text style={styles.limitHint}>
                  Free recordings auto-stop at {maxMinutesPerRecording} minutes and process
                  automatically.
                </Text>
              )}
            </>
          )}

          <Animated.View style={[styles.ringOuter, { transform: [{ scale: pulseScale }] }]}>
            <View style={styles.ringMid}>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={handleRecordPress}
                disabled={localState === 'requesting-permission'}
                activeOpacity={0.85}
              >
                {localState === 'requesting-permission' ? (
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

    if (recording.phase === 'recording') {
      return (
        <View style={styles.mainContent}>
          <View style={styles.recRow}>
            <Animated.View style={[styles.recDot, { opacity: recDotOpacity }]} />
            <Text style={styles.recLabel}>REC</Text>
            <Text style={styles.timerText}>{formatDuration(recording.duration)}</Text>
          </View>

          <View style={styles.waveformContainer}>
            {waveformAnims.map((anim, i) => (
              <Animated.View key={i} style={[styles.waveBar, { height: anim }]} />
            ))}
          </View>

          <TouchableOpacity style={styles.stopButton} onPress={handleStop} activeOpacity={0.85}>
            <View style={styles.stopButtonInner} />
          </TouchableOpacity>
        </View>
      );
    }

    if (
      recording.phase === 'stopping' ||
      recording.phase === 'uploading' ||
      recording.phase === 'processing'
    ) {
      return (
        <View style={styles.mainContent}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.statusText}>{recording.uploadProgress || 'Processing...'}</Text>
          {recording.phase === 'uploading' && (
            <Text style={styles.helperText}>This may take a moment...</Text>
          )}
        </View>
      );
    }

    if (recording.phase === 'complete') {
      return (
        <View style={styles.mainContent}>
          <View style={styles.successCircle}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.statusText}>Recording complete!</Text>
        </View>
      );
    }

    if (recording.phase === 'error') {
      return (
        <View style={styles.mainContent}>
          <Text style={styles.errorIcon}>✗</Text>
          <Text style={styles.errorText}>{recording.error || 'An error occurred'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>
              {recording.currentRecordingId ? 'Retry Processing' : 'Try Again'}
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
            {recording.phase === 'recording' ? 'Cancel' : 'Back'}
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
  usagePillSecondary: {
    marginTop: 10,
  },
  limitHint: {
    marginTop: 12,
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 240,
  },
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
