/**
 * Shared API Client for Mobile and Web
 * 
 * Provides typed wrappers around fetch for the Komuchi API.
 * All endpoint strings are centralized here.
 */

import type {
  Recording,
  TranscriptSegment,
  ApiError,
  ApiResponse,
  PaginatedResponse,
} from './types/index.js';

// ============================================
// Configuration
// ============================================

const getBaseUrl = (): string => {
  // Check process.env (works in both development and built Expo apps)
  // Expo bakes EXPO_PUBLIC_ variables from app.json into process.env at build time
  // This is the recommended way and avoids module resolution issues
  if (typeof process !== 'undefined') {
    // @ts-expect-error - process.env may not be typed in all environments
    if (process.env?.EXPO_PUBLIC_API_BASE_URL) {
      const url = process.env.EXPO_PUBLIC_API_BASE_URL;
      if (typeof console !== 'undefined' && console.log) {
        // eslint-disable-next-line no-console
        console.log('[API Client] Using API URL from process.env:', url);
      }
      // @ts-expect-error
      return url;
    }
    // @ts-expect-error
    if (process.env?.NEXT_PUBLIC_API_URL) {
      const url = process.env.NEXT_PUBLIC_API_URL;
      if (typeof console !== 'undefined' && console.log) {
        // eslint-disable-next-line no-console
        console.log('[API Client] Using API URL from NEXT_PUBLIC_API_URL:', url);
      }
      // @ts-expect-error
      return url;
    }
  }
  
  // For browser environments
  if (typeof globalThis !== 'undefined' && 'window' in globalThis && (globalThis as { window?: unknown }).window) {
    const win = (globalThis as { window?: { __API_BASE_URL__?: string } }).window;
    if (win?.__API_BASE_URL__) {
      if (typeof console !== 'undefined' && console.log) {
        // eslint-disable-next-line no-console
        console.log('[API Client] Using API URL from window.__API_BASE_URL__:', win.__API_BASE_URL__);
      }
      return win.__API_BASE_URL__;
    }
  }
  
  // Default fallback - use Railway URL for production
  const fallbackUrl = 'https://twin-production-a0e4.up.railway.app';
  if (typeof console !== 'undefined' && console.warn) {
    // eslint-disable-next-line no-console
    console.warn('[API Client] No API URL found in env, using fallback:', fallbackUrl);
  }
  return fallbackUrl;
};

// ============================================
// Auth Token Provider
// ============================================

/**
 * Function that returns the current Firebase ID token (or null).
 * Set this once from AuthProvider so every request is authenticated.
 */
type TokenProvider = () => Promise<string | null>;

let _tokenProvider: TokenProvider | null = null;

/**
 * Configure a token provider for automatic Authorization header injection.
 * Pass `null` to clear (e.g. on sign-out).
 */
export function setTokenProvider(provider: TokenProvider | null): void {
  _tokenProvider = provider;
}

// ============================================
// Error Handling
// ============================================

export class ApiClientError extends Error {
  public code?: string;
  
  constructor(
    message: string,
    public statusCode?: number,
    public error?: string,
    code?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let errorCode: string | undefined;

    if (isJson) {
      try {
        const errorData = (await response.json()) as ApiError | { error?: string; message?: string };
        errorMessage = errorData.message || errorData.error || errorMessage;
        errorCode = 'error' in errorData ? errorData.error : undefined;
      } catch {
        // Fallback to status text
        errorMessage = response.statusText || errorMessage;
      }
    } else {
      errorMessage = response.statusText || errorMessage;
    }

    throw new ApiClientError(errorMessage, response.status, errorCode);
  }

  if (isJson) {
    const data = (await response.json()) as ApiResponse<T> | PaginatedResponse<T> | T;
    // Handle { data: T, success: true } responses
    if (typeof data === 'object' && data !== null && 'data' in data && 'success' in data) {
      // Check if it's a PaginatedResponse (has pagination field)
      if ('pagination' in data) {
        // Return the full PaginatedResponse, not just data
        return data as T;
      }
      // Regular ApiResponse - extract data field
      return (data as ApiResponse<T>).data;
    }
    return data as T;
  }

  // For non-JSON responses, return response as-is (shouldn't happen for our API)
  return response as unknown as T;
}

// ============================================
// Request Helpers
// ============================================

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  
  // Debug logging in development
  if (typeof console !== 'undefined' && console.log) {
    console.log('[API Client] Request:', { method: options.method || 'GET', url, baseUrl });
  }

  // Only set Content-Type for requests that have a body
  const hasBody = options.body !== undefined && options.body !== null;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  
  // Only set Content-Type if we have a body and it's not already set
  if (hasBody && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach Firebase ID token if a provider has been set
  if (_tokenProvider && !headers['Authorization'] && !headers['authorization']) {
    try {
      const token = await _tokenProvider();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Token retrieval failed – continue without auth header
    }
  }

  // Add timeout to prevent long hangs (10 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return handleResponse<T>(response);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiClientError(
        'Request timed out. Please check your network connection.',
        0,
        'TIMEOUT'
      );
    }
    throw error;
  }
}

// ============================================
// API Functions
// ============================================

export interface CreateRecordingParams {
  title: string;
  mode?: 'general' | 'sales' | 'interview' | 'meeting';
  mimeType: string;
}

export interface CreateRecordingResponse {
  recordingId: string;
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
  // Optional: backend may return these for presigned URL requirements
  contentType?: string;
  requiredHeaders?: Record<string, string>;
}

/**
 * Create a new recording and get presigned upload URL
 */
export async function createRecording(
  userId: string,
  params: CreateRecordingParams
): Promise<CreateRecordingResponse> {
  return apiRequest<CreateRecordingResponse>('/api/recordings', {
    method: 'POST',
    headers: {
      'x-user-id': userId,
    },
    body: JSON.stringify({
      title: params.title,
      mode: params.mode || 'general',
      mimeType: params.mimeType,
    }),
  });
}

export interface CompleteUploadParams {
  fileSize?: number;
}

export interface CompleteUploadResponse {
  recordingId: string;
  jobId: string;
  status: string;
  message: string;
}

/**
 * Upload file directly to API (alternative to presigned URL)
 * Use this when presigned URLs aren't accessible (e.g., MinIO on localhost)
 */
export async function uploadRecordingFile(
  userId: string,
  recordingId: string,
  fileData: ArrayBuffer | Uint8Array,
  contentType: string
): Promise<{ success: boolean; message: string }> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/recordings/${recordingId}/upload`;

  console.log('[API Client] Upload request:', {
    baseUrl,
    url,
    recordingId,
    contentType,
    fileSize: fileData.byteLength || (fileData as Uint8Array).length,
  });

  // Build headers – include auth token if available
  const uploadHeaders: Record<string, string> = {
    'x-user-id': userId,
    'Content-Type': contentType,
  };
  if (_tokenProvider) {
    try {
      const token = await _tokenProvider();
      if (token) uploadHeaders['Authorization'] = `Bearer ${token}`;
    } catch { /* continue without token */ }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for uploads

    const response = await fetch(url, {
      method: 'POST',
      headers: uploadHeaders,
      body: fileData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return handleResponse<{ success: boolean; message: string }>(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('Upload request timed out after 60 seconds', 408);
    }
    if (error instanceof Error && error.message.includes('Network request failed')) {
      console.error('[API Client] Network error details:', {
        url,
        baseUrl,
        error: error.message,
        stack: error.stack,
      });
      throw new ApiClientError(
        `Cannot reach API server at ${baseUrl}. Check your internet connection and ensure the API is running.`,
        0,
        'NETWORK_ERROR'
      );
    }
    throw error;
  }
}

/**
 * Mark upload as complete and start processing
 */
export async function completeUpload(
  userId: string,
  recordingId: string,
  params?: CompleteUploadParams
): Promise<CompleteUploadResponse> {
  return apiRequest<CompleteUploadResponse>(`/api/recordings/${recordingId}/complete-upload`, {
    method: 'POST',
    headers: {
      'x-user-id': userId,
    },
    body: JSON.stringify({
      fileSize: params?.fileSize,
    }),
  });
}

export interface RecordingStatusResponse {
  id: string;
  status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string | null; // Error message from failed job
}

/**
 * Get recording status
 */
export async function getRecordingStatus(
  userId: string,
  recordingId: string
): Promise<RecordingStatusResponse> {
  return apiRequest<RecordingStatusResponse>(`/api/recordings/${recordingId}`, {
    method: 'GET',
    headers: {
      'x-user-id': userId,
    },
  });
}

export interface RecordingResultResponse extends Recording {
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
export async function getRecordingResult(
  userId: string,
  recordingId: string
): Promise<RecordingResultResponse> {
  return apiRequest<RecordingResultResponse>(`/api/recordings/${recordingId}?include=all`, {
    method: 'GET',
    headers: {
      'x-user-id': userId,
    },
  });
}

export interface ListRecordingsByDayParams {
  page?: number;
  limit?: number;
  status?: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
}

/**
 * List recordings for a user (server-side filtered by day if needed)
 * @deprecated Use listRecordings instead
 */
export async function listRecordingsByDay(
  userId: string,
  params?: ListRecordingsByDayParams
): Promise<PaginatedResponse<Recording>> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set('page', params.page.toString());
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.status) queryParams.set('status', params.status);

  const query = queryParams.toString();
  const endpoint = `/api/recordings${query ? `?${query}` : ''}`;

  return apiRequest<PaginatedResponse<Recording>>(endpoint, {
    method: 'GET',
    headers: {
      'x-user-id': userId,
    },
  });
}

// ============================================
// New Recording Library API Functions
// ============================================

export interface ListRecordingsParams {
  date?: string; // YYYY-MM-DD format
  cursor?: string; // For cursor-based pagination
  limit?: number;
  status?: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
}

/**
 * List recordings with date filtering and optional cursor-based pagination
 * Includes retry logic with exponential backoff
 */
export async function listRecordings(
  userId: string,
  params?: ListRecordingsParams
): Promise<PaginatedResponse<Recording>> {
  const queryParams = new URLSearchParams();
  if (params?.date) queryParams.set('date', params.date);
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.status) queryParams.set('status', params.status);

  const query = queryParams.toString();
  const endpoint = `/api/recordings${query ? `?${query}` : ''}`;

  // Retry logic with exponential backoff
  let lastError: Error | null = null;
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest<PaginatedResponse<Recording>>(endpoint, {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors (4xx)
      if (error instanceof ApiClientError && error.statusCode && error.statusCode < 500) {
        throw error;
      }

      // Retry on server errors or network failures
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error('Failed to list recordings after retries');
}

/**
 * Get a single recording by ID
 * Includes retry logic with exponential backoff
 */
export async function getRecording(
  userId: string,
  recordingId: string,
  includeAll = false
): Promise<RecordingResultResponse> {
  const endpoint = `/api/recordings/${recordingId}${includeAll ? '?include=all' : ''}`;

  // Retry logic with exponential backoff
  let lastError: Error | null = null;
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest<RecordingResultResponse>(endpoint, {
        method: 'GET',
        headers: {
          'x-user-id': userId,
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors (4xx)
      if (error instanceof ApiClientError && error.statusCode && error.statusCode < 500) {
        throw error;
      }

      // Retry on server errors or network failures
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error('Failed to get recording after retries');
}

/**
 * Retry transcription for a failed recording
 */
export async function retryTranscription(
  userId: string,
  recordingId: string
): Promise<{ recordingId: string; queueJobId: string; message: string }> {
  return apiRequest<{ recordingId: string; queueJobId: string; message: string }>(
    `/api/recordings/${recordingId}/retry-transcription`,
    {
      method: 'POST',
      headers: {
        'x-user-id': userId,
      },
    }
  );
}

// ============================================
// Chat API Functions
// ============================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatSession {
  sessionId: string;
  sessionDate: string | null;
  recordingId: string | null;
  messages: ChatMessage[];
}

/**
 * Get or create a chat session for a date
 */
export async function getChatSession(
  userId: string,
  date: string
): Promise<ChatSession> {
  return apiRequest<ChatSession>(`/api/chat/session?date=${date}`, {
    method: 'GET',
    headers: {
      'x-user-id': userId,
    },
  });
}

export interface SendChatMessageParams {
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant';
    content?: string;
    parts?: Array<{ type: string; text: string }>;
  }>;
  date: string;
}

/**
 * Send a chat message and get streaming response
 * Returns the full response text after streaming completes
 */
export async function sendChatMessage(
  userId: string,
  params: SendChatMessageParams
): Promise<string> {
  if (!params || !params.messages || !Array.isArray(params.messages)) {
    throw new Error('Messages array is required');
  }
  
  if (!params.messages.length) {
    throw new Error('At least one message is required');
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/chat`;

  // Build headers – include auth token if available
  const chatHeaders: Record<string, string> = {
    'x-user-id': userId,
    'Content-Type': 'application/json',
    'Accept': 'application/json', // Request JSON instead of streaming
  };
  if (_tokenProvider) {
    try {
      const token = await _tokenProvider();
      if (token) chatHeaders['Authorization'] = `Bearer ${token}`;
    } catch { /* continue without token */ }
  }

  let response: Response;
  try {
    // Send messages in UIMessage format (with parts array) as expected by backend
    // Request non-streaming response for better fetch API compatibility
    response = await fetch(url, {
      method: 'POST',
      headers: chatHeaders,
      body: JSON.stringify({
        messages: params.messages,
        date: params.date,
      }),
    });
  } catch (fetchError) {
    // Network error - API server likely not running
    throw new ApiClientError(
      `Network error: ${fetchError instanceof Error ? fetchError.message : 'Failed to connect to API server'}. Make sure the API server is running.`,
      0,
      'NETWORK_ERROR'
    );
  }

  // Check response status and content type
  const contentType = response.headers.get('content-type') || '';
  
  if (!response.ok) {
    let errorData: { message?: string; error?: string } = {};
    try {
      // Try to read error response
      if (contentType.includes('application/json')) {
        const text = await response.text();
        if (text) {
          errorData = JSON.parse(text);
        }
      } else {
        const text = await response.text();
        if (text) {
          errorData = { message: text };
        }
      }
    } catch {
      // Ignore parse errors
    }
    throw new ApiClientError(
      errorData.message || `Request failed with status ${response.status}`,
      response.status,
      errorData.error
    );
  }

  // Check if this is a JSON response (non-streaming) or streaming response
  // Accept both 'application/json' and empty content-type (Fastify defaults to JSON)
  const isJsonResponse = contentType.includes('application/json') || 
                        contentType === '' || 
                        contentType.includes('text/json');
  
  if (isJsonResponse || !contentType.includes('text/event-stream')) {
    // Non-streaming JSON response - much simpler!
    try {
      const data = await response.json() as { text?: string; message?: string; error?: string };
      
      // Check for error in response
      if (data.error) {
        throw new ApiClientError(
          data.message || data.error || 'Server returned an error',
          response.status,
          data.error
        );
      }
      
      const responseText = data.text || data.message || '';
      
      if (!responseText.trim()) {
        throw new ApiClientError(
          'Received empty response from server',
          response.status,
          'EMPTY_RESPONSE'
        );
      }
      
      return responseText;
    } catch (parseError) {
      // If JSON parsing fails, it might be a streaming response
      if (parseError instanceof SyntaxError) {
        // Try to read as text to see what we got
        const text = await response.text();
        throw new ApiClientError(
          `Invalid JSON response: ${text.substring(0, 100)}`,
          response.status,
          'INVALID_JSON'
        );
      }
      throw parseError;
    }
  }

  // Fallback to streaming for backwards compatibility
  
  if (!response.body) {
    throw new ApiClientError(
      'No response body received',
      response.status,
      'NO_BODY'
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            const data = JSON.parse(jsonStr);
            if (data.type === 'text-delta' && data.textDelta) {
              fullText += data.textDelta;
            } else if (data.type === 'text' && data.text) {
              fullText += data.text;
            } else if (data.textDelta) {
              fullText += data.textDelta;
            } else if (data.text) {
              fullText += data.text;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            const data = JSON.parse(jsonStr);
            if (data.type === 'text-delta' && data.textDelta) {
              fullText += data.textDelta;
            } else if (data.type === 'text' && data.text) {
              fullText += data.text;
            } else if (data.textDelta) {
              fullText += data.textDelta;
            } else if (data.text) {
              fullText += data.text;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!fullText.trim()) {
    throw new ApiClientError(
      'Received empty response from server',
      response.status,
      'EMPTY_RESPONSE'
    );
  }

  return fullText;
}

// ============================================
// Voice Profile API Functions
// ============================================

export interface VoiceProfileStatusResponse {
  hasVoiceProfile: boolean;
}

/**
 * Check if user has a voice profile
 */
export async function getVoiceProfileStatus(
  userId: string
): Promise<VoiceProfileStatusResponse> {
  return apiRequest<VoiceProfileStatusResponse>('/api/voice-profile/status', {
    method: 'GET',
    headers: {
      'x-user-id': userId,
    },
  });
}

/**
 * Enroll voice profile by uploading audio sample
 */
export async function enrollVoiceProfile(
  userId: string,
  audioBlob: Blob,
  mimeType: string = 'audio/webm'
): Promise<{ success: boolean; message: string; hasVoiceProfile: boolean }> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/voice-profile/enroll`;

  const formData = new FormData();
  const file = new File([audioBlob], 'voice-sample.webm', { type: mimeType });
  formData.append('audio', file);

  // Build headers – include auth token if available
  const enrollHeaders: Record<string, string> = {
    'x-user-id': userId,
  };
  if (_tokenProvider) {
    try {
      const token = await _tokenProvider();
      if (token) enrollHeaders['Authorization'] = `Bearer ${token}`;
    } catch { /* continue without token */ }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: enrollHeaders,
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = 'Failed to enroll voice profile';
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorData = (await response.json()) as { error?: string; message?: string };
        errorMessage = errorData.error || errorData.message || errorMessage;
      } else {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new ApiClientError(errorMessage, response.status);
  }

  return (await response.json()) as { success: boolean; message: string; hasVoiceProfile: boolean };
}

/**
 * Delete voice profile
 */
export async function deleteVoiceProfile(
  userId: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/api/voice-profile', {
    method: 'DELETE',
    headers: {
      'x-user-id': userId,
    },
  });
}

// ============================================
// User Profile & Consent API Functions
// ============================================

export interface MeResponse {
  uid: string;
  email: string;
  consentAcceptedAt: string | null;
  consentRevokedAt: string | null;
}

/**
 * Get current user profile (consent status, email, uid)
 */
export async function getMe(userId: string): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/me', {
    method: 'GET',
    headers: { 'x-user-id': userId },
  });
}

/**
 * Accept consent — sets consentAcceptedAt, clears consentRevokedAt
 */
export async function acceptConsent(userId: string): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/me/consent/accept', {
    method: 'POST',
    headers: { 'x-user-id': userId },
  });
}

/**
 * Revoke consent — sets consentRevokedAt
 */
export async function revokeConsent(userId: string): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/me/consent/revoke', {
    method: 'POST',
    headers: { 'x-user-id': userId },
  });
}

/**
 * Delete user account and all associated data
 */
export async function deleteAccountApi(userId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/me', {
    method: 'DELETE',
    headers: { 'x-user-id': userId },
  });
}

/**
 * Delete a single recording (with S3 + artifacts)
 */
export async function deleteRecordingApi(
  userId: string,
  recordingId: string
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/recordings/${recordingId}`, {
    method: 'DELETE',
    headers: { 'x-user-id': userId },
  });
}

/**
 * Register push notification token
 */
export async function registerPushToken(
  userId: string,
  token: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/api/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
