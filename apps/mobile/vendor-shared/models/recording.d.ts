import { z } from 'zod';

/**
 * Recording Data Models
 *
 * Domain models for recording summaries and details used in the mobile app.
 */

declare const recordingSummarySchema: z.ZodObject<
  {
    id: z.ZodString;
    createdAt: z.ZodString;
    durationSec: z.ZodNullable<z.ZodNumber>;
    status: z.ZodEnum<['pending', 'uploaded', 'processing', 'complete', 'failed']>;
    title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    hasDebrief: z.ZodBoolean;
    hasTranscript: z.ZodBoolean;
  },
  'strip',
  z.ZodTypeAny,
  {
    id: string;
    status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
    createdAt: string;
    durationSec: number | null;
    hasDebrief: boolean;
    hasTranscript: boolean;
    title?: string | null | undefined;
  },
  {
    id: string;
    status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
    createdAt: string;
    durationSec: number | null;
    hasDebrief: boolean;
    hasTranscript: boolean;
    title?: string | null | undefined;
  }
>;
type RecordingSummary = z.infer<typeof recordingSummarySchema>;
declare const transcriptSegmentDetailSchema: z.ZodObject<
  {
    startMs: z.ZodNumber;
    endMs: z.ZodNumber;
    speaker: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    text: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    text: string;
    speaker: string;
    startMs: number;
    endMs: number;
    label?: string | undefined;
  },
  {
    text: string;
    speaker: string;
    startMs: number;
    endMs: number;
    label?: string | undefined;
  }
>;
type TranscriptSegmentDetail = z.infer<typeof transcriptSegmentDetailSchema>;
declare const recordingDetailSchema: z.ZodObject<
  {
    id: z.ZodString;
    createdAt: z.ZodString;
    durationSec: z.ZodNullable<z.ZodNumber>;
    status: z.ZodEnum<['pending', 'uploaded', 'processing', 'complete', 'failed']>;
    title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    hasDebrief: z.ZodBoolean;
    hasTranscript: z.ZodBoolean;
  } & {
    transcript: z.ZodNullable<
      z.ZodObject<
        {
          text: z.ZodString;
          segments: z.ZodArray<
            z.ZodObject<
              {
                startMs: z.ZodNumber;
                endMs: z.ZodNumber;
                speaker: z.ZodString;
                label: z.ZodOptional<z.ZodString>;
                text: z.ZodString;
              },
              'strip',
              z.ZodTypeAny,
              {
                text: string;
                speaker: string;
                startMs: number;
                endMs: number;
                label?: string | undefined;
              },
              {
                text: string;
                speaker: string;
                startMs: number;
                endMs: number;
                label?: string | undefined;
              }
            >,
            'many'
          >;
          language: z.ZodOptional<z.ZodString>;
        },
        'strip',
        z.ZodTypeAny,
        {
          text: string;
          segments: {
            text: string;
            speaker: string;
            startMs: number;
            endMs: number;
            label?: string | undefined;
          }[];
          language?: string | undefined;
        },
        {
          text: string;
          segments: {
            text: string;
            speaker: string;
            startMs: number;
            endMs: number;
            label?: string | undefined;
          }[];
          language?: string | undefined;
        }
      >
    >;
    debriefMarkdown: z.ZodNullable<z.ZodString>;
    speakers: z.ZodOptional<z.ZodArray<z.ZodString, 'many'>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    id: string;
    status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
    createdAt: string;
    durationSec: number | null;
    hasDebrief: boolean;
    hasTranscript: boolean;
    transcript: {
      text: string;
      segments: {
        text: string;
        speaker: string;
        startMs: number;
        endMs: number;
        label?: string | undefined;
      }[];
      language?: string | undefined;
    } | null;
    debriefMarkdown: string | null;
    title?: string | null | undefined;
    speakers?: string[] | undefined;
  },
  {
    id: string;
    status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
    createdAt: string;
    durationSec: number | null;
    hasDebrief: boolean;
    hasTranscript: boolean;
    transcript: {
      text: string;
      segments: {
        text: string;
        speaker: string;
        startMs: number;
        endMs: number;
        label?: string | undefined;
      }[];
      language?: string | undefined;
    } | null;
    debriefMarkdown: string | null;
    title?: string | null | undefined;
    speakers?: string[] | undefined;
  }
>;
type RecordingDetail = z.infer<typeof recordingDetailSchema>;
/**
 * Convert API recording response to RecordingSummary
 */
declare function toRecordingSummary(recording: {
  id: string;
  createdAt: string | Date;
  duration: number | null;
  status: string;
  title: string | null;
  debrief?: {
    id: string;
  } | null;
  transcript?: {
    id: string;
  } | null;
}): RecordingSummary;
/**
 * Convert API recording response to RecordingDetail
 * Handles missing fields gracefully
 */
declare function toRecordingDetail(recording: {
  id: string;
  createdAt: string | Date;
  duration: number | null;
  status: string;
  title: string | null;
  transcript?: {
    id?: string;
    text: string;
    segments?: Array<{
      start: number;
      end: number;
      text: string;
      speaker?: string;
    }> | null;
    language?: string;
  } | null;
  debrief?: {
    id?: string;
    markdown: string;
  } | null;
}): RecordingDetail;

export {
  type RecordingDetail,
  type RecordingSummary,
  type TranscriptSegmentDetail,
  recordingDetailSchema,
  recordingSummarySchema,
  toRecordingDetail,
  toRecordingSummary,
  transcriptSegmentDetailSchema,
};
