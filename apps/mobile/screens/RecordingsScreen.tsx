/**
 * RecordingsScreen
 *
 * Displays a list of recordings for a selected date.
 * Features:
 * - Date picker (defaults to today)
 * - List of recordings (most recent first)
 * - Pull-to-refresh
 * - Empty state
 * - Navigation to detail screen
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  listRecordings,
  type RecordingSummary,
  toRecordingSummary,
  ApiClientError,
} from '@twin/shared';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';

const DATE_KEY = 'twin:selected_date';
type RecordingApiItem = Parameters<typeof toRecordingSummary>[0];

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

interface RecordingsScreenProps {
  onSelectRecording: (recordingId: string) => void;
  onNewRecording: () => void;
  onVoiceProfile?: () => void;
  onSettings?: () => void;
  onMount?: (refreshFn: () => void) => void;
}

export default function RecordingsScreen({
  onSelectRecording,
  onNewRecording,
  onVoiceProfile,
  onSettings,
  onMount,
}: RecordingsScreenProps) {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayString);

  // Restore last-viewed date on mount, but never a future date
  useEffect(() => {
    AsyncStorage.getItem(DATE_KEY).then((saved) => {
      if (saved && saved <= todayString()) {
        setSelectedDate(saved);
      }
    });
  }, []);

  const changeDate = useCallback((newDate: string) => {
    setSelectedDate(newDate);
    AsyncStorage.setItem(DATE_KEY, newDate);
  }, []);

  const loadRecordings = useCallback(
    async (date: string, showRefreshing = false) => {
      if (!user?.uid) {
        setRecordings([]);
        setLoading(false);
        setRefreshing(false);
        setError('Please sign in again to load recordings.');
        return;
      }

      try {
        if (showRefreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const response = await listRecordings(user.uid, {
          date,
          limit: 50, // Load enough for a day
        });

        // Convert API response to RecordingSummary
        // Response structure: { data: Recording[], pagination: {...} }
        // handleResponse now returns the full PaginatedResponse for paginated endpoints
        const recordingsArray = response?.data || [];
        if (!Array.isArray(recordingsArray)) {
          console.error('Unexpected response format:', response);
          throw new Error('Invalid response format: expected array in data field');
        }
        const summaries = recordingsArray.map((recording: RecordingApiItem) =>
          toRecordingSummary(recording)
        );
        setRecordings(summaries);
      } catch (err) {
        console.error('Error loading recordings:', err);
        const errorMessage =
          err instanceof ApiClientError
            ? `API Error: ${err.message} (${err.statusCode})`
            : err instanceof Error
              ? err.message
              : 'Failed to load recordings';
        setError(errorMessage);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.uid]
  );

  useEffect(() => {
    loadRecordings(selectedDate);
  }, [selectedDate, loadRecordings]);

  // Expose refresh function to parent (for when returning from NewRecording)
  useEffect(() => {
    if (onMount) {
      onMount(() => {
        loadRecordings(selectedDate, false);
      });
    }
  }, [onMount, loadRecordings, selectedDate]);

  const onRefresh = useCallback(() => {
    loadRecordings(selectedDate, true);
  }, [selectedDate, loadRecordings]);

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'complete':
        return theme.success;
      case 'processing':
        return theme.warning;
      case 'failed':
        return theme.error;
      default:
        return theme.textMuted;
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'complete':
        return 'done';
      case 'processing':
        return 'processing';
      case 'failed':
        return 'failed';
      case 'uploaded':
        return 'queued';
      default:
        return status;
    }
  };

  const renderRecordingItem = ({ item }: { item: RecordingSummary }) => (
    <TouchableOpacity
      style={styles.recordingItem}
      onPress={() => onSelectRecording(item.id)}
      activeOpacity={0.75}
    >
      {/* Left accent bar */}
      <View style={[styles.recordingAccentBar, { backgroundColor: getStatusColor(item.status) }]} />
      <View style={styles.recordingItemContent}>
        {/* Top row: time + status */}
        <View style={styles.recordingItemHeader}>
          <Text style={styles.recordingTime}>{formatTime(item.createdAt)}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusLabel, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.recordingTitle} numberOfLines={1}>
          {item.title || 'Untitled recording'}
        </Text>

        {/* Meta row: duration + badges */}
        <View style={styles.recordingItemMeta}>
          <Text style={styles.recordingDuration}>{formatDuration(item.durationSec)}</Text>
          {item.hasTranscript && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Transcript</Text>
            </View>
          )}
          {item.hasDebrief && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Debrief</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
      <View style={{ width: 6 }} />
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyWaveform}>
        {[14, 8, 20, 12, 24, 10, 18, 6, 16].map((h, i) => (
          <View key={i} style={[styles.emptyWaveBar, { height: h }]} />
        ))}
      </View>
      <Text style={styles.emptyStateTitle}>No recordings yet</Text>
      <Text style={styles.emptyStateText}>
        {formatDate(selectedDate) === 'Today'
          ? 'Tap + to capture your first recording today'
          : `No recordings for ${formatDate(selectedDate)}`}
      </Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.dateLabelWrap}>
            <Text style={styles.headerTitle}>{formatDate(selectedDate)}</Text>
            <Text style={styles.headerDate}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.dateNav}>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={() => changeDate(offsetDate(selectedDate, -1))}
            accessibilityLabel="Previous day"
          >
            <Text style={styles.navArrowText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.dateLabelWrap}>
            <Text style={styles.headerTitle}>{formatDate(selectedDate)}</Text>
            <Text style={styles.headerDate}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.navArrow, selectedDate >= todayString() && styles.navArrowDisabled]}
            onPress={() => {
              if (selectedDate < todayString()) changeDate(offsetDate(selectedDate, 1));
            }}
            accessibilityLabel="Next day"
            disabled={selectedDate >= todayString()}
          >
            <Text
              style={[
                styles.navArrowText,
                selectedDate >= todayString() && styles.navArrowTextDisabled,
              ]}
            >
              ›
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerButtons}>
          {onSettings && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onSettings}
              accessibilityLabel="Settings"
            >
              <Text style={styles.iconButtonText}>⚙</Text>
            </TouchableOpacity>
          )}
          {onVoiceProfile && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onVoiceProfile}
              accessibilityLabel="Voice Profile"
            >
              <Text style={styles.iconButtonText}>🎙</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.newButton}
            onPress={onNewRecording}
            accessibilityLabel="New Recording"
          >
            <Text style={styles.newButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={recordings}
          renderItem={renderRecordingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={recordings.length === 0 ? styles.emptyList : undefined}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
        />
      )}
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
    paddingHorizontal: 12,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dateLabelWrap: {
    flex: 1,
  },
  navArrow: {
    width: 32,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowDisabled: {
    opacity: 0.25,
  },
  navArrowText: {
    fontSize: 28,
    color: theme.textPrimary,
    lineHeight: 32,
  },
  navArrowTextDisabled: {
    color: theme.textMuted,
  },
  headerTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 30,
    color: theme.textPrimary,
  },
  headerDate: {
    fontFamily: theme.fontMono,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  iconButtonText: {
    fontSize: 17,
  },
  newButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newButtonText: {
    fontSize: 24,
    color: theme.bg,
    fontWeight: '500',
    lineHeight: 26,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: 'rgba(192,96,96,0.1)',
    margin: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192,96,96,0.3)',
  },
  errorText: {
    color: theme.error,
    fontSize: 13,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyWaveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginBottom: 24,
  },
  emptyWaveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(201,168,76,0.2)',
  },
  emptyStateTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 22,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptyStateText: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Recording list item — card style
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  recordingAccentBar: {
    width: 3,
    alignSelf: 'stretch',
    opacity: 0.7,
  },
  recordingItemContent: {
    flex: 1,
    padding: 14,
  },
  recordingItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  recordingTime: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontFamily: theme.fontMono,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  recordingTitle: {
    fontSize: 15,
    color: theme.textPrimary,
    fontWeight: '500',
    marginBottom: 8,
  },
  recordingItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingDuration: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: theme.accentDim,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
  },
  badgeText: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    color: theme.accent,
  },
  chevron: {
    fontSize: 20,
    color: theme.textMuted,
    marginLeft: 10,
  },
});
