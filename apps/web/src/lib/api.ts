/**
 * API Client for Komuchi Backend
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================
// Types
// ============================================

export interface Recording {
  id: string;
  userId: string;
  title: string;
  mode: 'general' | 'sales' | 'interview' | 'meeting';
  status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
  objectKey: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface Transcript {
  id: string;
  recordingId: string;
  text: string;
  segments: TranscriptSegment[] | null;
  language: string;
  createdAt: string;
}

export interface DebriefSection {
  title: string;
  content: string;
  order: number;
}

export interface Debrief {
  id: string;
  recordingId: string;
  markdown: string;
  sections: DebriefSection[];
  createdAt: string;
}

export interface RecordingWithRelations extends Recording {
  transcript: Transcript | null;
  debrief: Debrief | null;
}

export interface Job {
  id: string;
  recordingId: string;
  type: 'TRANSCRIBE' | 'DEBRIEF';
  status: 'pending' | 'running' | 'complete' | 'failed';
  error: string | null;
  createdAt: string;
}

export interface CreateRecordingResponse {
  recordingId: string;
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  success: boolean;
}

// ============================================
// API Error
// ============================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public error?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================
// Fetch Helper
// ============================================

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  userId?: string
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set JSON content-type when we actually have a body.
  // Fastify will reject requests with `Content-Type: application/json` + empty body.
  if (options.body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Add user ID header for auth (mock auth)
  if (userId) {
    headers['x-user-id'] = userId;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || 'An error occurred',
      response.status,
      data.error
    );
  }

  return data;
}

// ============================================
// Recordings API
// ============================================

export async function createRecording(
  userId: string,
  data: {
    title: string;
    mode: string;
    mimeType: string;
  }
): Promise<CreateRecordingResponse> {
  const response = await apiFetch<{ data: CreateRecordingResponse }>(
    '/api/recordings',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    userId
  );
  return response.data;
}

export async function completeUpload(
  userId: string,
  recordingId: string,
  fileSize?: number
): Promise<{ recordingId: string; status: string }> {
  const response = await apiFetch<{ data: { recordingId: string; status: string } }>(
    `/api/recordings/${recordingId}/complete-upload`,
    {
      method: 'POST',
      body: JSON.stringify({ fileSize }),
    },
    userId
  );
  return response.data;
}

export async function getRecordings(
  userId: string,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Recording>> {
  return apiFetch<PaginatedResponse<Recording>>(
    `/api/recordings?page=${page}&limit=${limit}`,
    { method: 'GET' },
    userId
  );
}

export async function getRecording(
  userId: string,
  recordingId: string,
  includeRelations = false
): Promise<RecordingWithRelations> {
  const include = includeRelations ? '?include=all' : '';
  const response = await apiFetch<{ data: RecordingWithRelations }>(
    `/api/recordings/${recordingId}${include}`,
    { method: 'GET' },
    userId
  );
  return response.data;
}

export async function getRecordingJobs(
  userId: string,
  recordingId: string
): Promise<Job[]> {
  const response = await apiFetch<{ data: Job[] }>(
    `/api/recordings/${recordingId}/jobs`,
    { method: 'GET' },
    userId
  );
  return response.data;
}

export async function retryDebrief(
  userId: string,
  recordingId: string
): Promise<void> {
  await apiFetch(
    `/api/recordings/${recordingId}/retry-debrief`,
    { method: 'POST' },
    userId
  );
}

export async function retryTranscription(
  userId: string,
  recordingId: string
): Promise<void> {
  await apiFetch(
    `/api/recordings/${recordingId}/retry-transcription`,
    { method: 'POST' },
    userId
  );
}

export async function getDownloadUrl(
  userId: string,
  recordingId: string
): Promise<{ downloadUrl: string; filename: string; mimeType: string }> {
  const response = await apiFetch<{
    data: { downloadUrl: string; filename: string; mimeType: string };
  }>(
    `/api/recordings/${recordingId}/download-url`,
    { method: 'GET' },
    userId
  );
  return response.data;
}

// ============================================
// Upload Helper
// ============================================

export async function uploadToS3(
  uploadUrl: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  const { uploadToPresignedUrl } = await import('./upload');
  const result = await uploadToPresignedUrl(file, uploadUrl, {
    contentType: file.type,
    maxRetries: 3,
    onProgress: (p) => {
      if (typeof p.percent === 'number' && onProgress) onProgress(p.percent);
    },
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
}
