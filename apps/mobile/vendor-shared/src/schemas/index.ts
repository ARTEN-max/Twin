import { z } from 'zod';

// ============================================
// Enums
// ============================================

export const RecordingMode = z.enum(['general', 'sales', 'interview', 'meeting']);

export const RecordingStatus = z.enum(['pending', 'uploaded', 'processing', 'complete', 'failed']);

export const JobType = z.enum(['TRANSCRIBE', 'DEBRIEF']);

export const JobStatus = z.enum(['pending', 'running', 'complete', 'failed']);

// ============================================
// User Schema
// ============================================

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});

export const createUserSchema = userSchema.omit({ id: true });

// ============================================
// Recording Schema
// ============================================

export const recordingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(255),
  mode: RecordingMode,
  status: RecordingStatus,
  createdAt: z.coerce.date(),
});

export const createRecordingSchema = recordingSchema.omit({
  id: true,
  status: true,
  createdAt: true,
});

export const updateRecordingSchema = recordingSchema.pick({ title: true, mode: true }).partial();

// ============================================
// Transcript Schema
// ============================================

export const transcriptSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  text: z.string(),
  speaker: z.string().optional(),
});

export const transcriptSchema = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  text: z.string(),
  segments: z.array(transcriptSegmentSchema).optional(),
  createdAt: z.coerce.date(),
});

export const createTranscriptSchema = transcriptSchema.omit({
  id: true,
  createdAt: true,
});

// ============================================
// Debrief Schema
// ============================================

export const debriefSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  order: z.number().int().nonnegative(),
});

export const debriefSchema = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  markdown: z.string(),
  sections: z.array(debriefSectionSchema),
  createdAt: z.coerce.date(),
});

export const createDebriefSchema = debriefSchema.omit({
  id: true,
  createdAt: true,
});

// ============================================
// Job Schema
// ============================================

export const jobSchema = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  type: JobType,
  status: JobStatus,
  error: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createJobSchema = jobSchema.omit({
  id: true,
  status: true,
  error: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================
// API Response Schemas
// ============================================

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number().int(),
});

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ============================================
// Audio Upload Schema (for multipart validation)
// ============================================

export const audioUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.enum([
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
  ]),
  size: z
    .number()
    .positive()
    .max(100 * 1024 * 1024), // Max 100MB
});
