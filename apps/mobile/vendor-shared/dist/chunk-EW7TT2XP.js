// src/schemas/index.ts
import { z } from "zod";
var RecordingMode = z.enum(["general", "sales", "interview", "meeting"]);
var RecordingStatus = z.enum(["pending", "uploaded", "processing", "complete", "failed"]);
var JobType = z.enum(["TRANSCRIBE", "DEBRIEF"]);
var JobStatus = z.enum(["pending", "running", "complete", "failed"]);
var userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email()
});
var createUserSchema = userSchema.omit({ id: true });
var recordingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(255),
  mode: RecordingMode,
  status: RecordingStatus,
  createdAt: z.coerce.date()
});
var createRecordingSchema = recordingSchema.omit({
  id: true,
  status: true,
  createdAt: true
});
var updateRecordingSchema = recordingSchema.pick({ title: true, mode: true }).partial();
var transcriptSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  text: z.string(),
  speaker: z.string().optional()
});
var transcriptSchema = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  text: z.string(),
  segments: z.array(transcriptSegmentSchema).optional(),
  createdAt: z.coerce.date()
});
var createTranscriptSchema = transcriptSchema.omit({
  id: true,
  createdAt: true
});
var debriefSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  order: z.number().int().nonnegative()
});
var debriefSchema = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  markdown: z.string(),
  sections: z.array(debriefSectionSchema),
  createdAt: z.coerce.date()
});
var createDebriefSchema = debriefSchema.omit({
  id: true,
  createdAt: true
});
var jobSchema = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  type: JobType,
  status: JobStatus,
  error: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});
var createJobSchema = jobSchema.omit({
  id: true,
  status: true,
  error: true,
  createdAt: true,
  updatedAt: true
});
var apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number().int()
});
var paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative()
});
var paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
var audioUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.enum([
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a"
  ]),
  size: z.number().positive().max(100 * 1024 * 1024)
  // Max 100MB
});

export {
  RecordingMode,
  RecordingStatus,
  JobType,
  JobStatus,
  userSchema,
  createUserSchema,
  recordingSchema,
  createRecordingSchema,
  updateRecordingSchema,
  transcriptSegmentSchema,
  transcriptSchema,
  createTranscriptSchema,
  debriefSectionSchema,
  debriefSchema,
  createDebriefSchema,
  jobSchema,
  createJobSchema,
  apiErrorSchema,
  paginationSchema,
  paginationQuerySchema,
  audioUploadSchema
};
//# sourceMappingURL=chunk-EW7TT2XP.js.map