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

// src/schemas/index.ts
var schemas_exports = {};
__export(schemas_exports, {
  JobStatus: () => JobStatus,
  JobType: () => JobType,
  RecordingMode: () => RecordingMode,
  RecordingStatus: () => RecordingStatus,
  apiErrorSchema: () => apiErrorSchema,
  audioUploadSchema: () => audioUploadSchema,
  createDebriefSchema: () => createDebriefSchema,
  createJobSchema: () => createJobSchema,
  createRecordingSchema: () => createRecordingSchema,
  createTranscriptSchema: () => createTranscriptSchema,
  createUserSchema: () => createUserSchema,
  debriefSchema: () => debriefSchema,
  debriefSectionSchema: () => debriefSectionSchema,
  jobSchema: () => jobSchema,
  paginationQuerySchema: () => paginationQuerySchema,
  paginationSchema: () => paginationSchema,
  recordingSchema: () => recordingSchema,
  transcriptSchema: () => transcriptSchema,
  transcriptSegmentSchema: () => transcriptSegmentSchema,
  updateRecordingSchema: () => updateRecordingSchema,
  userSchema: () => userSchema
});
module.exports = __toCommonJS(schemas_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  JobStatus,
  JobType,
  RecordingMode,
  RecordingStatus,
  apiErrorSchema,
  audioUploadSchema,
  createDebriefSchema,
  createJobSchema,
  createRecordingSchema,
  createTranscriptSchema,
  createUserSchema,
  debriefSchema,
  debriefSectionSchema,
  jobSchema,
  paginationQuerySchema,
  paginationSchema,
  recordingSchema,
  transcriptSchema,
  transcriptSegmentSchema,
  updateRecordingSchema,
  userSchema
});
//# sourceMappingURL=index.cjs.map