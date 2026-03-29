import { z } from 'zod';
import { apiErrorSchema, audioUploadSchema, createDebriefSchema, createJobSchema, createRecordingSchema, createTranscriptSchema, createUserSchema, debriefSchema, debriefSectionSchema, jobSchema, JobStatus, JobType, paginationSchema, paginationQuerySchema, recordingSchema, RecordingMode, transcriptSegmentSchema, RecordingStatus, transcriptSchema, updateRecordingSchema, userSchema } from '../schemas/index.js';

type RecordingModeType = z.infer<typeof RecordingMode>;
type RecordingStatusType = z.infer<typeof RecordingStatus>;
type JobTypeType = z.infer<typeof JobType>;
type JobStatusType = z.infer<typeof JobStatus>;
type User = z.infer<typeof userSchema>;
type CreateUser = z.infer<typeof createUserSchema>;
type Recording = z.infer<typeof recordingSchema>;
type CreateRecording = z.infer<typeof createRecordingSchema>;
type UpdateRecording = z.infer<typeof updateRecordingSchema>;
type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
type Transcript = z.infer<typeof transcriptSchema>;
type CreateTranscript = z.infer<typeof createTranscriptSchema>;
type DebriefSection = z.infer<typeof debriefSectionSchema>;
type Debrief = z.infer<typeof debriefSchema>;
type CreateDebrief = z.infer<typeof createDebriefSchema>;
type Job = z.infer<typeof jobSchema>;
type CreateJob = z.infer<typeof createJobSchema>;
type ApiError = z.infer<typeof apiErrorSchema>;
type Pagination = z.infer<typeof paginationSchema>;
type PaginationQuery = z.infer<typeof paginationQuerySchema>;
type AudioUpload = z.infer<typeof audioUploadSchema>;
interface ApiResponse<T> {
    data: T;
    success: true;
}
interface ApiErrorResponse {
    error: string;
    message: string;
    success: false;
}
interface PaginatedResponse<T> {
    data: T[];
    pagination: Pagination;
    success: true;
}
interface RecordingWithRelations extends Recording {
    transcript?: Transcript | null;
    debrief?: Debrief | null;
    jobs?: Job[];
}
interface UserWithRecordings extends User {
    recordings?: Recording[];
}

export type { ApiError, ApiErrorResponse, ApiResponse, AudioUpload, CreateDebrief, CreateJob, CreateRecording, CreateTranscript, CreateUser, Debrief, DebriefSection, Job, JobStatusType, JobTypeType, PaginatedResponse, Pagination, PaginationQuery, Recording, RecordingModeType, RecordingStatusType, RecordingWithRelations, Transcript, TranscriptSegment, UpdateRecording, User, UserWithRecordings };
