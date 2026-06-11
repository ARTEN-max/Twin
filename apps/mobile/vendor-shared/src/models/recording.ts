/**
 * Recording Data Models
 *
 * Domain models for recording summaries and details used in the mobile app.
 */

import { z } from 'zod';
import { RecordingStatus } from '../schemas/index.js';

// ============================================
// Recording Summary (for list views)
// ============================================

export const recordingSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(), // ISO 8601 string
  durationSec: z.number().nullable(),
  status: RecordingStatus,
  title: z.string().nullable().optional(),
  hasDebrief: z.boolean(),
  hasTranscript: z.boolean(),
});

export type RecordingSummary = z.infer<typeof recordingSummarySchema>;

// ============================================
// Transcript Segment (with milliseconds)
// ============================================

export const transcriptSegmentDetailSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  speaker: z.string(),
  label: z.string().optional(), // Optional speaker label/name
  text: z.string(),
});

export type TranscriptSegmentDetail = z.infer<typeof transcriptSegmentDetailSchema>;

// ============================================
// Recording Detail (full recording with transcript and debrief)
// ============================================

export const recordingDetailSchema = recordingSummarySchema.extend({
  transcript: z
    .object({
      text: z.string(),
      segments: z.array(transcriptSegmentDetailSchema),
      language: z.string().optional(),
    })
    .nullable(),
  debriefMarkdown: z.string().nullable(),
  speakers: z.array(z.string()).optional(), // List of unique speaker IDs
});

export type RecordingDetail = z.infer<typeof recordingDetailSchema>;

// ============================================
// Helper: Convert API response to RecordingSummary
// ============================================

/**
 * Convert API recording response to RecordingSummary
 */
export function toRecordingSummary(recording: {
  id: string;
  createdAt: string | Date;
  duration?: number | null;
  status: string;
  title: string | null;
  debrief?: { id: string } | null;
  transcript?: { id: string } | null;
}): RecordingSummary {
  return {
    id: recording.id,
    createdAt:
      typeof recording.createdAt === 'string'
        ? recording.createdAt
        : recording.createdAt.toISOString(),
    durationSec: recording.duration ?? null,
    status: recording.status as RecordingSummary['status'],
    title: recording.title || undefined,
    hasDebrief: !!recording.debrief,
    hasTranscript: !!recording.transcript,
  };
}

// ============================================
// Helper: Convert API response to RecordingDetail
// ============================================

/**
 * Convert API recording response to RecordingDetail
 * Handles missing fields gracefully
 */
export function toRecordingDetail(recording: {
  id: string;
  createdAt: string | Date;
  duration?: number | null;
  status: string;
  title: string | null;
  transcript?: {
    id?: string;
    text: string;
    segments?: Array<{
      start: number; // seconds
      end: number; // seconds
      text: string;
      speaker?: string;
    }> | null;
    language?: string;
  } | null;
  debrief?: {
    id?: string;
    markdown: string;
  } | null;
}): RecordingDetail {
  // Create summary with proper structure
  const summary: RecordingSummary = {
    id: recording.id,
    createdAt:
      typeof recording.createdAt === 'string'
        ? recording.createdAt
        : recording.createdAt.toISOString(),
    durationSec: recording.duration ?? null,
    status: recording.status as RecordingSummary['status'],
    title: recording.title || undefined,
    hasDebrief: !!recording.debrief,
    hasTranscript: !!recording.transcript,
  };

  // Convert transcript segments from seconds to milliseconds
  const segments: TranscriptSegmentDetail[] = recording.transcript?.segments
    ? recording.transcript.segments.map((seg) => ({
        startMs: Math.round(seg.start * 1000),
        endMs: Math.round(seg.end * 1000),
        speaker: seg.speaker || 'unknown',
        text: seg.text,
      }))
    : [];

  // Extract unique speakers
  const speakers = Array.from(new Set(segments.map((s) => s.speaker)));

  return {
    ...summary,
    transcript: recording.transcript
      ? {
          text: recording.transcript.text,
          segments,
          language: recording.transcript.language,
        }
      : null,
    debriefMarkdown: recording.debrief?.markdown || null,
    speakers: speakers.length > 0 ? speakers : undefined,
  };
}
