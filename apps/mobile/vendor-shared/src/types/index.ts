import { z } from 'zod';
import {
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
  audioUploadSchema,
} from '../schemas/index.js';

// ============================================
// Enum Types (inferred from Zod schemas)
// ============================================

export type RecordingModeType = z.infer<typeof RecordingMode>;
export type RecordingStatusType = z.infer<typeof RecordingStatus>;
export type JobTypeType = z.infer<typeof JobType>;
export type JobStatusType = z.infer<typeof JobStatus>;

// ============================================
// User Types
// ============================================

export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;

// ============================================
// Recording Types
// ============================================

export type Recording = z.infer<typeof recordingSchema>;
export type CreateRecording = z.infer<typeof createRecordingSchema>;
export type UpdateRecording = z.infer<typeof updateRecordingSchema>;

// ============================================
// Transcript Types
// ============================================

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type CreateTranscript = z.infer<typeof createTranscriptSchema>;

// ============================================
// Debrief Types
// ============================================

export type DebriefSection = z.infer<typeof debriefSectionSchema>;
export type Debrief = z.infer<typeof debriefSchema>;
export type CreateDebrief = z.infer<typeof createDebriefSchema>;

// ============================================
// Job Types
// ============================================

export type Job = z.infer<typeof jobSchema>;
export type CreateJob = z.infer<typeof createJobSchema>;

// ============================================
// API Types
// ============================================

export type ApiError = z.infer<typeof apiErrorSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type AudioUpload = z.infer<typeof audioUploadSchema>;

// ============================================
// Generic Response Types
// ============================================

export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  success: false;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
  success: true;
}

// ============================================
// Entity with Relations (for API responses)
// ============================================

export interface RecordingWithRelations extends Recording {
  transcript?: Transcript | null;
  debrief?: Debrief | null;
  jobs?: Job[];
}

export interface UserWithRecordings extends User {
  recordings?: Recording[];
}
