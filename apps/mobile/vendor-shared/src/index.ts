// Re-export schemas (zod objects)
export * from './schemas/index.js';

// Re-export types (TypeScript types inferred from schemas)
export type {
  // Enum types (renamed to avoid conflict with schema exports)
  RecordingModeType,
  RecordingStatusType,
  JobTypeType,
  JobStatusType,
  // User
  User,
  CreateUser,
  // Recording
  Recording,
  CreateRecording,
  UpdateRecording,
  // Transcript
  TranscriptSegment,
  Transcript,
  CreateTranscript,
  // Debrief
  DebriefSection,
  Debrief,
  CreateDebrief,
  // Job
  Job,
  CreateJob,
  // API
  ApiError,
  Pagination,
  PaginationQuery,
  AudioUpload,
  // Response types
  ApiResponse,
  ApiErrorResponse,
  PaginatedResponse,
  // Relations
  RecordingWithRelations,
  UserWithRecordings,
} from './types/index.js';

// Re-export zod for convenience
export { z } from 'zod';

// Re-export API client
export * from './apiClient.js';

// Re-export recording models
export * from './models/recording.js';
