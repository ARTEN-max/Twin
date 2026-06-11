import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {
  listRecordings,
  type RecordingSummary,
  toRecordingSummary,
  ApiClientError,
} from '@twin/shared';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';

type RecordingApiItem = Parameters<typeof toRecordingSummary>[0];

type FeedItem =
  | { type: 'date-header'; date: string; key: string }
  | { type: 'recording'; data: RecordingSummary; key: string };

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const today = todayString();
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function buildFeedItems(recordings: RecordingSummary[]): FeedItem[] {
  const sorted = [...recordings].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const items: FeedItem[] = [];
  let lastDate = '';
  for (const rec of sorted) {
    const date = rec.createdAt.split('T')[0];
    if (date !== lastDate) {
      items.push({ type: 'date-header', date, key: `header-${date}` });
      lastDate = date;
    }
    items.push({ type: 'recording', data: rec, key: rec.id });
  }
  return items;
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

  const feedItems = useMemo(() => buildFeedItems(recordings), [recordings]);

  const loadRecordings = useCallback(
    async (showRefreshing = false) => {
      if (!user?.uid) {
        setLoading(false);
        setRefreshing(false);
        setError('Please sign in again to load recordings.');
        return;
      }
      try {
        if (showRefreshing) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const response = await listRecordings(user.uid, { limit: 100 });
        const recordingsArray = response?.data || [];
        const summaries = (recordingsArray as unknown as RecordingApiItem[]).map((r) =>
          toRecordingSummary(r)
        );
        setRecordings(summaries);
      } catch (err) {
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
    loadRecordings();
  }, [loadRecordings]);

  useEffect(() => {
    if (onMount) onMount(() => loadRecordings(true));
  }, [onMount, loadRecordings]);

  const onRefresh = useCallback(() => loadRecordings(true), [loadRecordings]);

  const formatTime = (isoString: string): string =>
    new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

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

  const renderDateHeader = (date: string) => (
    <View style={styles.dateHeader}>
      <Text style={styles.dateHeaderText}>{formatDateLabel(date)}</Text>
      <View style={styles.dateHeaderLine} />
    </View>
  );

  const renderRecordingItem = (item: RecordingSummary) => (
    <TouchableOpacity
      style={styles.recordingItem}
      onPress={() => onSelectRecording(item.id)}
      activeOpacity={0.75}
    >
      <View style={[styles.recordingAccentBar, { backgroundColor: getStatusColor(item.status) }]} />
      <View style={styles.recordingItemContent}>
        <View style={styles.recordingItemHeader}>
          <Text style={styles.recordingTime}>{formatTime(item.createdAt)}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusLabel, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.recordingTitle} numberOfLines={1}>
          {item.title || 'Untitled recording'}
        </Text>
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

  const renderItem = ({ item }: { item: FeedItem }) => {
    if (item.type === 'date-header') return renderDateHeader(item.date);
    return renderRecordingItem(item.data);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyWaveform}>
        {[14, 8, 20, 12, 24, 10, 18, 6, 16].map((h, i) => (
          <View key={i} style={[styles.emptyWaveBar, { height: h }]} />
        ))}
      </View>
      <Text style={styles.emptyStateTitle}>No recordings yet</Text>
      <Text style={styles.emptyStateText}>Tap + to capture your first recording</Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Twin</Text>
          <View style={styles.headerButtons}>
            {onSettings && (
              <TouchableOpacity style={styles.iconButton} onPress={onSettings}>
                <Text style={styles.iconButtonText}>⚙</Text>
              </TouchableOpacity>
            )}
            {onVoiceProfile && (
              <TouchableOpacity style={styles.iconButton} onPress={onVoiceProfile}>
                <Text style={styles.iconButtonText}>🎙</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.newButton} onPress={onNewRecording}>
              <Text style={styles.newButtonText}>+</Text>
            </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Twin</Text>
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
          data={feedItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          contentContainerStyle={feedItems.length === 0 ? styles.emptyList : styles.listContent}
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
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 30,
    color: theme.textPrimary,
    letterSpacing: 0.5,
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
  listContent: {
    paddingBottom: 120,
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
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    gap: 12,
  },
  dateHeaderText: {
    fontFamily: theme.fontMono,
    fontSize: 11,
    color: theme.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
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
