import {
  RecordingStatus
} from "./chunk-EW7TT2XP.js";

// src/models/recording.ts
import { z } from "zod";
var recordingSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  // ISO 8601 string
  durationSec: z.number().nullable(),
  status: RecordingStatus,
  title: z.string().nullable().optional(),
  hasDebrief: z.boolean(),
  hasTranscript: z.boolean()
});
var transcriptSegmentDetailSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  speaker: z.string(),
  label: z.string().optional(),
  // Optional speaker label/name
  text: z.string()
});
var recordingDetailSchema = recordingSummarySchema.extend({
  transcript: z.object({
    text: z.string(),
    segments: z.array(transcriptSegmentDetailSchema),
    language: z.string().optional()
  }).nullable(),
  debriefMarkdown: z.string().nullable(),
  speakers: z.array(z.string()).optional()
  // List of unique speaker IDs
});
function toRecordingSummary(recording) {
  return {
    id: recording.id,
    createdAt: typeof recording.createdAt === "string" ? recording.createdAt : recording.createdAt.toISOString(),
    durationSec: recording.duration,
    status: recording.status,
    title: recording.title || void 0,
    hasDebrief: !!recording.debrief,
    hasTranscript: !!recording.transcript
  };
}
function toRecordingDetail(recording) {
  const summary = {
    id: recording.id,
    createdAt: typeof recording.createdAt === "string" ? recording.createdAt : recording.createdAt.toISOString(),
    durationSec: recording.duration,
    status: recording.status,
    title: recording.title || void 0,
    hasDebrief: !!recording.debrief,
    hasTranscript: !!recording.transcript
  };
  const segments = recording.transcript?.segments ? recording.transcript.segments.map((seg) => ({
    startMs: Math.round(seg.start * 1e3),
    endMs: Math.round(seg.end * 1e3),
    speaker: seg.speaker || "unknown",
    text: seg.text
  })) : [];
  const speakers = Array.from(
    new Set(segments.map((s) => s.speaker))
  );
  return {
    ...summary,
    transcript: recording.transcript ? {
      text: recording.transcript.text,
      segments,
      language: recording.transcript.language
    } : null,
    debriefMarkdown: recording.debrief?.markdown || null,
    speakers: speakers.length > 0 ? speakers : void 0
  };
}

export {
  recordingSummarySchema,
  transcriptSegmentDetailSchema,
  recordingDetailSchema,
  toRecordingSummary,
  toRecordingDetail
};
//# sourceMappingURL=chunk-6ADLA7ZV.js.map