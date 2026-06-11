/**
 * Floating pill rendered above the tab bar whenever a recording is active.
 * Lets the user see "Recording 1:23" from any screen and tap to return to the
 * recording controls. Visibility is gated by `useRecording().isRecording`.
 */

import React from 'react';
import { Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { theme } from '../theme';
import { useRecording } from '../contexts/RecordingContext';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface RecordingPillProps {
  onTap: () => void;
}

export default function RecordingPill({ onTap }: RecordingPillProps) {
  const recording = useRecording();
  const dotOpacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!recording.isRecording) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recording.isRecording, dotOpacity]);

  if (!recording.isRecording) return null;

  return (
    <TouchableOpacity style={styles.pill} onPress={onTap} activeOpacity={0.8}>
      <Animated.View style={[styles.dot, { opacity: dotOpacity }]} />
      <Text style={styles.label}>REC</Text>
      <Text style={styles.timer}>{formatDuration(recording.duration)}</Text>
      <Text style={styles.hint}>Tap to view</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderWidth: 1,
    borderColor: theme.error,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.error,
  },
  label: {
    fontFamily: theme.fontMono,
    fontSize: 11,
    color: theme.error,
    letterSpacing: 1.5,
  },
  timer: {
    fontFamily: theme.fontMono,
    fontSize: 14,
    color: theme.textPrimary,
    letterSpacing: 1,
  },
  hint: {
    fontSize: 12,
    color: theme.textSecondary,
    marginLeft: 4,
  },
});
