"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/models/recording.ts
var recording_exports = {};
__export(recording_exports, {
  recordingDetailSchema: () => recordingDetailSchema,
  recordingSummarySchema: () => recordingSummarySchema,
  toRecordingDetail: () => toRecordingDetail,
  toRecordingSummary: () => toRecordingSummary,
  transcriptSegmentDetailSchema: () => transcriptSegmentDetailSchema
});
module.exports = __toCommonJS(recording_exports);
var import_zod2 = require("zod");

// src/schemas/index.ts
var import_zod = require("zod");
var RecordingMode = import_zod.z.enum(["general", "sales", "interview", "meeting"]);
var RecordingStatus = import_zod.z.enum(["pending", "uploaded", "processing", "complete", "failed"]);
var JobType = import_zod.z.enum(["TRANSCRIBE", "DEBRIEF"]);
var JobStatus = import_zod.z.enum(["pending", "running", "complete", "failed"]);
var userSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  email: import_zod.z.string().email()
});
var createUserSchema = userSchema.omit({ id: true });
var recordingSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  userId: import_zod.z.string().uuid(),
  title: import_zod.z.string().min(1).max(255),
  mode: RecordingMode,
  status: RecordingStatus,
  createdAt: import_zod.z.coerce.date()
});
var createRecordingSchema = recordingSchema.omit({
  id: true,
  status: true,
  createdAt: true
});
var updateRecordingSchema = recordingSchema.pick({ title: true, mode: true }).partial();
var transcriptSegmentSchema = import_zod.z.object({
  start: import_zod.z.number().nonnegative(),
  end: import_zod.z.number().positive(),
  text: import_zod.z.string(),
  speaker: import_zod.z.string().optional()
});
var transcriptSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  recordingId: import_zod.z.string().uuid(),
  text: import_zod.z.string(),
  segments: import_zod.z.array(transcriptSegmentSchema).optional(),
  createdAt: import_zod.z.coerce.date()
});
var createTranscriptSchema = transcriptSchema.omit({
  id: true,
  createdAt: true
});
var debriefSectionSchema = import_zod.z.object({
  title: import_zod.z.string(),
  content: import_zod.z.string(),
  order: import_zod.z.number().int().nonnegative()
});
var debriefSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  recordingId: import_zod.z.string().uuid(),
  markdown: import_zod.z.string(),
  sections: import_zod.z.array(debriefSectionSchema),
  createdAt: import_zod.z.coerce.date()
});
var createDebriefSchema = debriefSchema.omit({
  id: true,
  createdAt: true
});
var jobSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  recordingId: import_zod.z.string().uuid(),
  type: JobType,
  status: JobStatus,
  error: import_zod.z.string().nullable(),
  createdAt: import_zod.z.coerce.date(),
  updatedAt: import_zod.z.coerce.date()
});
var createJobSchema = jobSchema.omit({
  id: true,
  status: true,
  error: true,
  createdAt: true,
  updatedAt: true
});
var apiErrorSchema = import_zod.z.object({
  error: import_zod.z.string(),
  message: import_zod.z.string(),
  statusCode: import_zod.z.number().int()
});
var paginationSchema = import_zod.z.object({
  page: import_zod.z.number().int().positive().default(1),
  limit: import_zod.z.number().int().positive().max(100).default(20),
  total: import_zod.z.number().int().nonnegative(),
  totalPages: import_zod.z.number().int().nonnegative()
});
var paginationQuerySchema = import_zod.z.object({
  page: import_zod.z.coerce.number().int().positive().default(1),
  limit: import_zod.z.coerce.number().int().positive().max(100).default(20)
});
var audioUploadSchema = import_zod.z.object({
  filename: import_zod.z.string().min(1),
  mimeType: import_zod.z.enum([
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a"
  ]),
  size: import_zod.z.number().positive().max(100 * 1024 * 1024)
  // Max 100MB
});

// src/models/recording.ts
var recordingSummarySchema = import_zod2.z.object({
  id: import_zod2.z.string().uuid(),
  createdAt: import_zod2.z.string().datetime(),
  // ISO 8601 string
  durationSec: import_zod2.z.number().nullable(),
  status: RecordingStatus,
  title: import_zod2.z.string().nullable().optional(),
  hasDebrief: import_zod2.z.boolean(),
  hasTranscript: import_zod2.z.boolean()
});
var transcriptSegmentDetailSchema = import_zod2.z.object({
  startMs: import_zod2.z.number().nonnegative(),
  endMs: import_zod2.z.number().positive(),
  speaker: import_zod2.z.string(),
  label: import_zod2.z.string().optional(),
  // Optional speaker label/name
  text: import_zod2.z.string()
});
var recordingDetailSchema = recordingSummarySchema.extend({
  transcript: import_zod2.z.object({
    text: import_zod2.z.string(),
    segments: import_zod2.z.array(transcriptSegmentDetailSchema),
    language: import_zod2.z.string().optional()
  }).nullable(),
  debriefMarkdown: import_zod2.z.string().nullable(),
  speakers: import_zod2.z.array(import_zod2.z.string()).optional()
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  recordingDetailSchema,
  recordingSummarySchema,
  toRecordingDetail,
  toRecordingSummary,
  transcriptSegmentDetailSchema
});
//# sourceMappingURL=recording.cjs.map