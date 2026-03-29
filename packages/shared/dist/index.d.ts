export { JobStatus, JobType, RecordingMode, RecordingStatus, apiErrorSchema, audioUploadSchema, createDebriefSchema, createJobSchema, createRecordingSchema, createTranscriptSchema, createUserSchema, debriefSchema, debriefSectionSchema, jobSchema, paginationQuerySchema, paginationSchema, recordingSchema, transcriptSchema, transcriptSegmentSchema, updateRecordingSchema, userSchema } from './schemas/index.js';
import { Recording, TranscriptSegment, PaginatedResponse } from './types/index.js';
export { ApiError, ApiErrorResponse, ApiResponse, AudioUpload, CreateDebrief, CreateJob, CreateRecording, CreateTranscript, CreateUser, Debrief, DebriefSection, Job, JobStatusType, JobTypeType, Pagination, PaginationQuery, RecordingModeType, RecordingStatusType, RecordingWithRelations, Transcript, UpdateRecording, User, UserWithRecordings } from './types/index.js';
export { z } from 'zod';
export { RecordingDetail, RecordingSummary, TranscriptSegmentDetail, recordingDetailSchema, recordingSummarySchema, toRecordingDetail, toRecordingSummary, transcriptSegmentDetailSchema } from './models/recording.js';

/**
 * Shared API Client for Mobile and Web
 *
 * Provides typed wrappers around fetch for the Komuchi API.
 * All endpoint strings are centralized here.
 */

/**
 * Function that returns the current Firebase ID token (or null).
 * Set this once from AuthProvider so every request is authenticated.
 */
type TokenProvider = () => Promise<string | null>;
/**
 * Configure a token provider for automatic Authorization header injection.
 * Pass `null` to clear (e.g. on sign-out).
 */
declare function setTokenProvider(provider: TokenProvider | null): void;
declare class ApiClientError extends Error {
    statusCode?: number | undefined;
    error?: string | undefined;
    code?: string;
    constructor(message: string, statusCode?: number | undefined, error?: string | undefined, code?: string);
}
interface CreateRecordingParams {
    title: string;
    mode?: 'general' | 'sales' | 'interview' | 'meeting';
    mimeType: string;
}
interface CreateRecordingResponse {
    recordingId: string;
    uploadUrl: string;
    objectKey: string;
    expiresIn: number;
    contentType?: string;
    requiredHeaders?: Record<string, string>;
}
/**
 * Create a new recording and get presigned upload URL
 */
declare function createRecording(userId: string, params: CreateRecordingParams): Promise<CreateRecordingResponse>;
interface CompleteUploadParams {
    fileSize?: number;
}
interface CompleteUploadResponse {
    recordingId: string;
    jobId: string;
    status: string;
    message: string;
}
/**
 * Upload file directly to API (alternative to presigned URL)
 * Use this when presigned URLs aren't accessible (e.g., MinIO on localhost)
 */
declare function uploadRecordingFile(userId: string, recordingId: string, fileData: ArrayBuffer | Uint8Array, contentType: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Mark upload as complete and start processing
 */
declare function completeUpload(userId: string, recordingId: string, params?: CompleteUploadParams): Promise<CompleteUploadResponse>;
interface RecordingStatusResponse {
    id: string;
    status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
    title: string;
    mode: string;
    createdAt: string;
    updatedAt: string;
    errorMessage?: string | null;
}
/**
 * Get recording status
 */
declare function getRecordingStatus(userId: string, recordingId: string): Promise<RecordingStatusResponse>;
interface RecordingResultResponse extends Recording {
    transcript?: {
        id: string;
        text: string;
        segments: TranscriptSegment[] | null;
        language: string;
        createdAt: string;
    } | null;
    debrief?: {
        id: string;
        markdown: string;
        sections: Array<{
            title: string;
            content: string;
            order: number;
        }>;
        createdAt: string;
    } | null;
}
/**
 * Get recording with transcript and debrief (include=all)
 */
declare function getRecordingResult(userId: string, recordingId: string): Promise<RecordingResultResponse>;
interface ListRecordingsByDayParams {
    page?: number;
    limit?: number;
    status?: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
}
/**
 * List recordings for a user (server-side filtered by day if needed)
 * @deprecated Use listRecordings instead
 */
declare function listRecordingsByDay(userId: string, params?: ListRecordingsByDayParams): Promise<PaginatedResponse<Recording>>;
interface ListRecordingsParams {
    date?: string;
    cursor?: string;
    limit?: number;
    status?: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
}
/**
 * List recordings with date filtering and optional cursor-based pagination
 * Includes retry logic with exponential backoff
 */
declare function listRecordings(userId: string, params?: ListRecordingsParams): Promise<PaginatedResponse<Recording>>;
/**
 * Get a single recording by ID
 * Includes retry logic with exponential backoff
 */
declare function getRecording(userId: string, recordingId: string, includeAll?: boolean): Promise<RecordingResultResponse>;
/**
 * Retry transcription for a failed recording
 */
declare function retryTranscription(userId: string, recordingId: string): Promise<{
    recordingId: string;
    queueJobId: string;
    message: string;
}>;
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}
interface ChatSession {
    sessionId: string;
    sessionDate: string | null;
    recordingId: string | null;
    messages: ChatMessage[];
}
/**
 * Get or create a chat session for a date
 */
declare function getChatSession(userId: string, date: string): Promise<ChatSession>;
interface SendChatMessageParams {
    messages: Array<{
        id?: string;
        role: 'user' | 'assistant';
        content?: string;
        parts?: Array<{
            type: string;
            text: string;
        }>;
    }>;
    date: string;
}
/**
 * Send a chat message and get streaming response
 * Returns the full response text after streaming completes
 */
declare function sendChatMessage(userId: string, params: SendChatMessageParams): Promise<string>;
interface VoiceProfileStatusResponse {
    hasVoiceProfile: boolean;
}
/**
 * Check if user has a voice profile
 */
declare function getVoiceProfileStatus(userId: string): Promise<VoiceProfileStatusResponse>;
/**
 * Enroll voice profile by uploading audio sample
 */
declare function enrollVoiceProfile(userId: string, audioBlob: Blob, mimeType?: string): Promise<{
    success: boolean;
    message: string;
    hasVoiceProfile: boolean;
}>;
/**
 * Delete voice profile
 */
declare function deleteVoiceProfile(userId: string): Promise<{
    success: boolean;
    message: string;
}>;
interface MeResponse {
    uid: string;
    email: string;
    consentAcceptedAt: string | null;
    consentRevokedAt: string | null;
    subscription?: {
        tier: string;
        expiresAt: string | null;
        limits: {
            recordingsPerMonth: number | null;
            maxRecordingMinutes: number | null;
            chatMessagesPerDay: number | null;
            historyLimit: number | null;
        };
        usage: {
            recordingsThisMonth: number;
            chatMessagesToday: number;
        };
    };
}
/**
 * Get current user profile (consent status, email, uid)
 */
declare function getMe(userId: string): Promise<MeResponse>;
/**
 * Accept consent — sets consentAcceptedAt, clears consentRevokedAt
 */
declare function acceptConsent(userId: string): Promise<MeResponse>;
/**
 * Revoke consent — sets consentRevokedAt
 */
declare function revokeConsent(userId: string): Promise<MeResponse>;
/**
 * Delete user account and all associated data
 */
declare function deleteAccountApi(userId: string): Promise<{
    ok: boolean;
}>;
/**
 * Delete a single recording (with S3 + artifacts)
 */
declare function deleteRecordingApi(userId: string, recordingId: string): Promise<{
    ok: boolean;
}>;
/**
 * Register push notification token
 */
declare function registerPushToken(_userId: string, token: string): Promise<{
    success: boolean;
    message: string;
}>;

export { ApiClientError, type ChatMessage, type ChatSession, type CompleteUploadParams, type CompleteUploadResponse, type CreateRecordingParams, type CreateRecordingResponse, type ListRecordingsByDayParams, type ListRecordingsParams, type MeResponse, PaginatedResponse, Recording, type RecordingResultResponse, type RecordingStatusResponse, type SendChatMessageParams, TranscriptSegment, type VoiceProfileStatusResponse, acceptConsent, completeUpload, createRecording, deleteAccountApi, deleteRecordingApi, deleteVoiceProfile, enrollVoiceProfile, getChatSession, getMe, getRecording, getRecordingResult, getRecordingStatus, getVoiceProfileStatus, listRecordings, listRecordingsByDay, registerPushToken, retryTranscription, revokeConsent, sendChatMessage, setTokenProvider, uploadRecordingFile };
