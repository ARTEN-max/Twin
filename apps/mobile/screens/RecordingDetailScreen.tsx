/**
 * RecordingDetailScreen
 *
 * Displays full details of a recording including:
 * - Status card
 * - Transcript (collapsible)
 * - Segments list (speaker + timestamp + text)
 * - Debrief rendered as a beautiful premium document
 * - Auto-polling if still processing
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  getRecording,
  toRecordingDetail,
  type RecordingDetail,
  ApiClientError,
  deleteRecordingApi,
} from '@twin/shared';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';

interface RecordingDetailScreenProps {
  recordingId: string;
  onBack: () => void;
  onDeleted?: () => void;
}

// ─── Debrief parser ───────────────────────────────────────────

interface DebriefSection {
  title: string | null;
  content: string;
}

function parseDebrief(markdown: string): DebriefSection[] {
  const lines = markdown.split('\n');
  const sections: DebriefSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content) sections.push({ title: currentTitle, content });
    currentTitle = null;
    currentLines = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);
    if (h2 || h1) {
      flush();
      currentTitle = (h2 || h1)![1].trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

// ─── Status helpers ───────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'complete':
      return theme.success;
    case 'processing':
    case 'uploaded':
      return theme.warning;
    case 'failed':
      return theme.error;
    default:
      return theme.textSecondary;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'complete':
      return 'DONE';
    case 'processing':
      return 'PROCESSING';
    case 'uploaded':
      return 'QUEUED';
    case 'failed':
      return 'FAILED';
    case 'pending':
      return 'PENDING';
    default:
      return status.toUpperCase();
  }
}

// ─── Component ────────────────────────────────────────────────

export default function RecordingDetailScreen({
  recordingId,
  onBack,
  onDeleted,
}: RecordingDetailScreenProps) {
  const { user } = useAuth();
  const userId = user!.uid;
  const [recording, setRecording] = useState<RecordingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'debrief' | 'transcript'>('debrief');
  const [isPolling, setIsPolling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isMountedRef = useRef(true);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending poll and mark unmounted on cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  const loadRecording = useCallback(
    async (showPolling = false) => {
      try {
        if (!showPolling) setLoading(true);
        else setIsPolling(true);
        setError(null);

        const response = await getRecording(userId, recordingId, true);
        const detail = toRecordingDetail(response);

        if (!isMountedRef.current) return; // Component unmounted, don't update state
        setRecording(detail);

        if (
          detail.status === 'processing' ||
          detail.status === 'pending' ||
          detail.status === 'uploaded'
        ) {
          pollTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) loadRecording(true);
          }, 3000);
        } else {
          setIsPolling(false);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        const msg =
          err instanceof ApiClientError
            ? `${err.message} (${err.statusCode})`
            : err instanceof Error
              ? err.message
              : 'Failed to load recording';
        setError(msg);
        setIsPolling(false);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [recordingId]
  );

  useEffect(() => {
    loadRecording();
  }, [loadRecording]);

  // Default to debrief tab if available, else transcript
  useEffect(() => {
    if (recording) {
      if (recording.debriefMarkdown) setActiveTab('debrief');
      else if (recording.transcript) setActiveTab('transcript');
    }
  }, [recording?.id]);

  const handleDelete = () => {
    Alert.alert('Delete Recording', 'Delete this recording? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteRecordingApi(userId, recordingId);
            onDeleted?.();
            onBack();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete recording.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (ms: number): string => {
    const total = Math.floor(ms / 1000);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Loading ──
  if (loading && !recording) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </View>
    );
  }

  // ── Error ──
  if (error && !recording) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!recording) return null;

  const isProcessing =
    recording.status === 'processing' ||
    recording.status === 'pending' ||
    recording.status === 'uploaded';

  const hasContent = recording.transcript || recording.debriefMarkdown;
  const debriefSections = recording.debriefMarkdown ? parseDebrief(recording.debriefMarkdown) : [];

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        {isProcessing && isPolling && (
          <View style={styles.pollingBadge}>
            <ActivityIndicator size="small" color={theme.warning} />
            <Text style={styles.pollingText}>updating</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ── Hero: title + meta ── */}
        <View style={styles.heroSection}>
          {/* Status pill */}
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: statusColor(recording.status) + '22',
                borderColor: statusColor(recording.status) + '55',
              },
            ]}
          >
            <View style={[styles.statusDot, { backgroundColor: statusColor(recording.status) }]} />
            <Text style={[styles.statusPillText, { color: statusColor(recording.status) }]}>
              {statusLabel(recording.status)}
            </Text>
          </View>

          {recording.title ? <Text style={styles.heroTitle}>{recording.title}</Text> : null}

          <View style={styles.heroMeta}>
            {recording.durationSec ? (
              <Text style={styles.heroMetaText}>{formatDuration(recording.durationSec)}</Text>
            ) : null}
            {recording.speakers && recording.speakers.length > 0 ? (
              <>
                <View style={styles.heroDot} />
                <Text style={styles.heroMetaText}>{recording.speakers.join(', ')}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* ── Processing state ── */}
        {isProcessing && (
          <View style={styles.processingCard}>
            <ActivityIndicator size="small" color={theme.warning} />
            <Text style={styles.processingText}>
              Processing your recording — this screen updates automatically.
            </Text>
          </View>
        )}

        {/* ── Tabs ── */}
        {hasContent && (
          <View style={styles.tabRow}>
            {recording.debriefMarkdown && (
              <TouchableOpacity
                style={[styles.tabPill, activeTab === 'debrief' && styles.tabPillActive]}
                onPress={() => setActiveTab('debrief')}
              >
                <Text
                  style={[styles.tabPillText, activeTab === 'debrief' && styles.tabPillTextActive]}
                >
                  Debrief
                </Text>
              </TouchableOpacity>
            )}
            {recording.transcript && (
              <TouchableOpacity
                style={[styles.tabPill, activeTab === 'transcript' && styles.tabPillActive]}
                onPress={() => setActiveTab('transcript')}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    activeTab === 'transcript' && styles.tabPillTextActive,
                  ]}
                >
                  Transcript
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Debrief tab ── */}
        {activeTab === 'debrief' && recording.debriefMarkdown && (
          <View style={styles.debriefContainer}>
            {debriefSections.length > 0 ? (
              debriefSections.map((section, i) => (
                <View key={i} style={styles.debriefSection}>
                  {section.title && (
                    <>
                      <View style={styles.sectionRule} />
                      <Text style={styles.sectionHeading}>{section.title}</Text>
                    </>
                  )}
                  <Text style={styles.debriefBody}>{section.content}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.debriefBody}>{recording.debriefMarkdown}</Text>
            )}
          </View>
        )}

        {/* ── Transcript tab ── */}
        {activeTab === 'transcript' && recording.transcript && (
          <View style={styles.transcriptContainer}>
            {/* Full text */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Full Transcript</Text>
              {recording.transcript.language && (
                <Text style={styles.metaChip}>{recording.transcript.language}</Text>
              )}
              <Text style={styles.transcriptText}>{recording.transcript.text}</Text>
            </View>

            {/* Segments */}
            {recording.transcript.segments.length > 0 && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.cardLabel}>Segments</Text>
                {recording.transcript.segments.map((seg, i) => (
                  <View key={i} style={styles.segment}>
                    <View style={styles.segmentHeader}>
                      <Text style={styles.segmentTime}>
                        {formatTimestamp(seg.startMs)} — {formatTimestamp(seg.endMs)}
                      </Text>
                      <View style={styles.speakerChip}>
                        <Text style={styles.speakerChipText}>{seg.label || seg.speaker}</Text>
                      </View>
                    </View>
                    <Text style={styles.segmentText}>{seg.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Delete ── */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
          {deleting ? (
            <ActivityIndicator color={theme.error} size="small" />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Recording</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    paddingVertical: 6,
  },
  backButtonText: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.accent,
    letterSpacing: 0.3,
  },
  pollingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.warningDim,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  pollingText: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    color: theme.warning,
    letterSpacing: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    margin: 20,
    padding: 16,
    backgroundColor: theme.errorDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(184,92,92,0.25)',
  },
  errorBoxText: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.error,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // ── Hero ──
  heroSection: {
    marginBottom: 24,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 28,
    color: theme.textPrimary,
    lineHeight: 36,
    marginBottom: 10,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMetaText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
  },
  heroDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.textMuted,
  },

  // ── Processing ──
  processingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.warningDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    padding: 14,
    marginBottom: 20,
  },
  processingText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.warning,
    flex: 1,
    lineHeight: 18,
  },

  // ── Tabs ──
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  tabPillActive: {
    backgroundColor: theme.accentDim,
    borderColor: theme.borderStrong,
  },
  tabPillText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
  tabPillTextActive: {
    color: theme.accent,
  },

  // ── Debrief ──
  debriefContainer: {
    marginBottom: 24,
  },
  debriefSection: {
    marginBottom: 24,
  },
  sectionRule: {
    height: 1,
    backgroundColor: theme.border,
    marginBottom: 14,
  },
  sectionHeading: {
    fontFamily: theme.fontDisplay,
    fontSize: 20,
    color: theme.textPrimary,
    marginBottom: 12,
    lineHeight: 26,
  },
  debriefBody: {
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 26,
    letterSpacing: 0.1,
  },

  // ── Transcript ──
  transcriptContainer: {
    marginBottom: 24,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  cardLabel: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  metaChip: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    color: theme.textSecondary,
    backgroundColor: theme.surfaceHigh,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  transcriptText: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.textPrimary,
    lineHeight: 22,
  },
  segment: {
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    paddingTop: 12,
    marginTop: 12,
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  segmentTime: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 0.5,
  },
  speakerChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: theme.accentDim,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  speakerChipText: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    color: theme.accent,
    letterSpacing: 0.3,
  },
  segmentText: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.textPrimary,
    lineHeight: 20,
  },

  // ── Delete ──
  deleteButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(184,92,92,0.3)',
    backgroundColor: theme.errorDim,
  },
  deleteButtonText: {
    fontFamily: theme.fontMono,
    fontSize: 13,
    color: theme.error,
    letterSpacing: 0.5,
  },
});
