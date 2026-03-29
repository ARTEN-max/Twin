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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ApiClientError: () => ApiClientError,
  JobStatus: () => JobStatus,
  JobType: () => JobType,
  RecordingMode: () => RecordingMode,
  RecordingStatus: () => RecordingStatus,
  acceptConsent: () => acceptConsent,
  apiErrorSchema: () => apiErrorSchema,
  audioUploadSchema: () => audioUploadSchema,
  completeUpload: () => completeUpload,
  createDebriefSchema: () => createDebriefSchema,
  createJobSchema: () => createJobSchema,
  createRecording: () => createRecording,
  createRecordingSchema: () => createRecordingSchema,
  createTranscriptSchema: () => createTranscriptSchema,
  createUserSchema: () => createUserSchema,
  debriefSchema: () => debriefSchema,
  debriefSectionSchema: () => debriefSectionSchema,
  deleteAccountApi: () => deleteAccountApi,
  deleteRecordingApi: () => deleteRecordingApi,
  deleteVoiceProfile: () => deleteVoiceProfile,
  enrollVoiceProfile: () => enrollVoiceProfile,
  getChatSession: () => getChatSession,
  getMe: () => getMe,
  getRecording: () => getRecording,
  getRecordingResult: () => getRecordingResult,
  getRecordingStatus: () => getRecordingStatus,
  getVoiceProfileStatus: () => getVoiceProfileStatus,
  jobSchema: () => jobSchema,
  listRecordings: () => listRecordings,
  listRecordingsByDay: () => listRecordingsByDay,
  paginationQuerySchema: () => paginationQuerySchema,
  paginationSchema: () => paginationSchema,
  recordingDetailSchema: () => recordingDetailSchema,
  recordingSchema: () => recordingSchema,
  recordingSummarySchema: () => recordingSummarySchema,
  registerPushToken: () => registerPushToken,
  retryTranscription: () => retryTranscription,
  revokeConsent: () => revokeConsent,
  sendChatMessage: () => sendChatMessage,
  setTokenProvider: () => setTokenProvider,
  toRecordingDetail: () => toRecordingDetail,
  toRecordingSummary: () => toRecordingSummary,
  transcriptSchema: () => transcriptSchema,
  transcriptSegmentDetailSchema: () => transcriptSegmentDetailSchema,
  transcriptSegmentSchema: () => transcriptSegmentSchema,
  updateRecordingSchema: () => updateRecordingSchema,
  uploadRecordingFile: () => uploadRecordingFile,
  userSchema: () => userSchema,
  z: () => import_zod3.z
});
module.exports = __toCommonJS(index_exports);

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

// src/index.ts
var import_zod3 = require("zod");

// src/apiClient.ts
var getBaseUrl = () => {
  if (typeof process !== "undefined") {
    if (process.env?.EXPO_PUBLIC_API_BASE_URL) {
      const url = process.env.EXPO_PUBLIC_API_BASE_URL;
      if (typeof console !== "undefined" && console.log) {
        console.log("[API Client] Using API URL from process.env:", url);
      }
      return url;
    }
    if (process.env?.NEXT_PUBLIC_API_URL) {
      const url = process.env.NEXT_PUBLIC_API_URL;
      if (typeof console !== "undefined" && console.log) {
        console.log("[API Client] Using API URL from NEXT_PUBLIC_API_URL:", url);
      }
      return url;
    }
  }
  if (typeof globalThis !== "undefined" && "window" in globalThis && globalThis.window) {
    const win = globalThis.window;
    if (win?.__API_BASE_URL__) {
      if (typeof console !== "undefined" && console.log) {
        console.log(
          "[API Client] Using API URL from window.__API_BASE_URL__:",
          win.__API_BASE_URL__
        );
      }
      return win.__API_BASE_URL__;
    }
  }
  const fallbackUrl = "https://twin-production-a0e4.up.railway.app";
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[API Client] No API URL found in env, using fallback:", fallbackUrl);
  }
  return fallbackUrl;
};
var _tokenProvider = null;
function setTokenProvider(provider) {
  _tokenProvider = provider;
}
var ApiClientError = class extends Error {
  constructor(message, statusCode, error, code) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    this.name = "ApiClientError";
    this.code = code;
  }
  code;
};
async function handleResponse(response) {
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let errorCode;
    let errorBody;
    if (isJson) {
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
        errorCode = "error" in errorData ? errorData.error : void 0;
        errorBody = JSON.stringify(errorData);
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
    } else {
      try {
        errorBody = await response.clone().text();
        errorMessage = response.statusText || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
    }
    console.error("[API Client] Request failed:", {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      errorMessage,
      errorCode,
      errorBody: errorBody?.substring(0, 500),
      // Limit to first 500 chars
      headers: Object.fromEntries(response.headers.entries())
    });
    throw new ApiClientError(errorMessage, response.status, errorCode);
  }
  if (isJson) {
    const data = await response.json();
    if (typeof data === "object" && data !== null && "data" in data && "success" in data) {
      if ("pagination" in data) {
        return data;
      }
      return data.data;
    }
    return data;
  }
  return response;
}
async function apiRequest(endpoint, options = {}) {
  const baseUrl = getBaseUrl();
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;
  if (typeof console !== "undefined" && console.log) {
    console.log("[API Client] Request:", { method: options.method || "GET", url, baseUrl });
  }
  const hasBody = options.body !== void 0 && options.body !== null;
  const headers = {
    ...options.headers
  };
  if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (_tokenProvider && !headers["Authorization"] && !headers["authorization"]) {
    try {
      const token = await _tokenProvider();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
    }
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1e4);
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return handleResponse(response);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new ApiClientError(
        "Request timed out. Please check your network connection.",
        0,
        "TIMEOUT"
      );
    }
    throw error;
  }
}
async function createRecording(userId, params) {
  return apiRequest("/api/recordings", {
    method: "POST",
    headers: {
      "x-user-id": userId
    },
    body: JSON.stringify({
      title: params.title,
      mode: params.mode || "general",
      mimeType: params.mimeType
    })
  });
}
async function uploadRecordingFile(userId, recordingId, fileData, contentType) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/recordings/${recordingId}/upload`;
  console.log("[API Client] Upload request:", {
    baseUrl,
    url,
    recordingId,
    contentType,
    fileSize: fileData.byteLength || fileData.length
  });
  const uploadHeaders = {
    "x-user-id": userId,
    "Content-Type": contentType
  };
  if (_tokenProvider) {
    try {
      const token = await _tokenProvider();
      if (token) {
        uploadHeaders["Authorization"] = `Bearer ${token}`;
        console.log("[API Client] Auth token included in upload headers");
      } else {
        console.warn("[API Client] No auth token available for upload");
      }
    } catch (error) {
      console.warn("[API Client] Failed to get auth token:", error);
    }
  } else {
    console.warn("[API Client] No token provider set for upload");
  }
  console.log("[API Client] Upload headers:", {
    "x-user-id": userId.substring(0, 8) + "...",
    "Content-Type": contentType,
    "has-auth": !!uploadHeaders["Authorization"]
  });
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6e4);
    const body = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
    console.log("[API Client] Starting upload fetch:", {
      url,
      contentType,
      bodyType: body instanceof Uint8Array ? "Uint8Array" : typeof body,
      bodySize: body.length,
      hasAuth: !!uploadHeaders["Authorization"],
      userId: userId.substring(0, 8) + "..."
    });
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: uploadHeaders,
        body,
        signal: controller.signal
      });
      console.log("[API Client] Upload fetch completed:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error("[API Client] Fetch failed (network error):", {
        url,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        name: fetchError instanceof Error ? fetchError.name : void 0,
        stack: fetchError instanceof Error ? fetchError.stack : void 0
      });
      throw fetchError;
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      let errorText;
      try {
        errorText = await response.clone().text();
      } catch {
        errorText = "Could not read error response";
      }
      console.error("[API Client] Upload failed:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        errorBody: errorText.substring(0, 500)
        // Limit to first 500 chars
      });
    }
    return handleResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiClientError("Upload request timed out after 60 seconds", 408);
    }
    if (error instanceof Error && error.message.includes("Network request failed")) {
      console.error("[API Client] Network error details:", {
        url,
        baseUrl,
        error: error.message,
        stack: error.stack
      });
      throw new ApiClientError(
        `Cannot reach API server at ${baseUrl}. Check your internet connection and ensure the API is running.`,
        0,
        "NETWORK_ERROR"
      );
    }
    throw error;
  }
}
async function completeUpload(userId, recordingId, params) {
  return apiRequest(`/api/recordings/${recordingId}/complete-upload`, {
    method: "POST",
    headers: {
      "x-user-id": userId
    },
    body: JSON.stringify({
      fileSize: params?.fileSize
    })
  });
}
async function getRecordingStatus(userId, recordingId) {
  return apiRequest(`/api/recordings/${recordingId}`, {
    method: "GET",
    headers: {
      "x-user-id": userId
    }
  });
}
async function getRecordingResult(userId, recordingId) {
  return apiRequest(`/api/recordings/${recordingId}?include=all`, {
    method: "GET",
    headers: {
      "x-user-id": userId
    }
  });
}
async function listRecordingsByDay(userId, params) {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set("page", params.page.toString());
  if (params?.limit) queryParams.set("limit", params.limit.toString());
  if (params?.status) queryParams.set("status", params.status);
  const query = queryParams.toString();
  const endpoint = `/api/recordings${query ? `?${query}` : ""}`;
  return apiRequest(endpoint, {
    method: "GET",
    headers: {
      "x-user-id": userId
    }
  });
}
async function listRecordings(userId, params) {
  const queryParams = new URLSearchParams();
  if (params?.date) queryParams.set("date", params.date);
  if (params?.cursor) queryParams.set("cursor", params.cursor);
  if (params?.limit) queryParams.set("limit", params.limit.toString());
  if (params?.status) queryParams.set("status", params.status);
  const query = queryParams.toString();
  const endpoint = `/api/recordings${query ? `?${query}` : ""}`;
  let lastError = null;
  const maxRetries = 3;
  const baseDelay = 1e3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest(endpoint, {
        method: "GET",
        headers: {
          "x-user-id": userId
        }
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ApiClientError && error.statusCode && error.statusCode < 500) {
        throw error;
      }
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  throw lastError || new Error("Failed to list recordings after retries");
}
async function getRecording(userId, recordingId, includeAll = false) {
  const endpoint = `/api/recordings/${recordingId}${includeAll ? "?include=all" : ""}`;
  let lastError = null;
  const maxRetries = 3;
  const baseDelay = 1e3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest(endpoint, {
        method: "GET",
        headers: {
          "x-user-id": userId
        }
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ApiClientError && error.statusCode && error.statusCode < 500) {
        throw error;
      }
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  throw lastError || new Error("Failed to get recording after retries");
}
async function retryTranscription(userId, recordingId) {
  return apiRequest(
    `/api/recordings/${recordingId}/retry-transcription`,
    {
      method: "POST",
      headers: {
        "x-user-id": userId
      }
    }
  );
}
async function getChatSession(userId, date) {
  return apiRequest(`/api/chat/session?date=${date}`, {
    method: "GET",
    headers: {
      "x-user-id": userId
    }
  });
}
async function sendChatMessage(userId, params) {
  if (!params || !params.messages || !Array.isArray(params.messages)) {
    throw new Error("Messages array is required");
  }
  if (!params.messages.length) {
    throw new Error("At least one message is required");
  }
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/chat`;
  const chatHeaders = {
    "x-user-id": userId,
    "Content-Type": "application/json",
    Accept: "application/json"
    // Request JSON instead of streaming
  };
  if (_tokenProvider) {
    try {
      const token = await _tokenProvider();
      if (token) chatHeaders["Authorization"] = `Bearer ${token}`;
    } catch {
    }
  }
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: chatHeaders,
      body: JSON.stringify({
        messages: params.messages,
        date: params.date
      })
    });
  } catch (fetchError) {
    throw new ApiClientError(
      `Network error: ${fetchError instanceof Error ? fetchError.message : "Failed to connect to API server"}. Make sure the API server is running.`,
      0,
      "NETWORK_ERROR"
    );
  }
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    let errorData = {};
    try {
      if (contentType.includes("application/json")) {
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
    }
    throw new ApiClientError(
      errorData.message || `Request failed with status ${response.status}`,
      response.status,
      errorData.error
    );
  }
  const isJsonResponse = contentType.includes("application/json") || contentType === "" || contentType.includes("text/json");
  if (isJsonResponse || !contentType.includes("text/event-stream")) {
    try {
      const data = await response.json();
      if (data.error) {
        throw new ApiClientError(
          data.message || data.error || "Server returned an error",
          response.status,
          data.error
        );
      }
      const responseText = data.text || data.message || "";
      if (!responseText.trim()) {
        throw new ApiClientError(
          "Received empty response from server",
          response.status,
          "EMPTY_RESPONSE"
        );
      }
      return responseText;
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        const text = await response.text();
        throw new ApiClientError(
          `Invalid JSON response: ${text.substring(0, 100)}`,
          response.status,
          "INVALID_JSON"
        );
      }
      throw parseError;
    }
  }
  if (!response.body) {
    throw new ApiClientError("No response body received", response.status, "NO_BODY");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            const data = JSON.parse(jsonStr);
            if (data.type === "text-delta" && data.textDelta) {
              fullText += data.textDelta;
            } else if (data.type === "text" && data.text) {
              fullText += data.text;
            } else if (data.textDelta) {
              fullText += data.textDelta;
            } else if (data.text) {
              fullText += data.text;
            }
          } catch {
          }
        }
      }
    }
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            const data = JSON.parse(jsonStr);
            if (data.type === "text-delta" && data.textDelta) {
              fullText += data.textDelta;
            } else if (data.type === "text" && data.text) {
              fullText += data.text;
            } else if (data.textDelta) {
              fullText += data.textDelta;
            } else if (data.text) {
              fullText += data.text;
            }
          } catch {
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!fullText.trim()) {
    throw new ApiClientError(
      "Received empty response from server",
      response.status,
      "EMPTY_RESPONSE"
    );
  }
  return fullText;
}
async function getVoiceProfileStatus(userId) {
  return apiRequest("/api/voice-profile/status", {
    method: "GET",
    headers: {
      "x-user-id": userId
    }
  });
}
async function enrollVoiceProfile(userId, audioBlob, mimeType = "audio/webm") {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/voice-profile/enroll`;
  const formData = new FormData();
  const file = new File([audioBlob], "voice-sample.webm", { type: mimeType });
  formData.append("audio", file);
  const enrollHeaders = {
    "x-user-id": userId
  };
  if (_tokenProvider) {
    try {
      const token = await _tokenProvider();
      if (token) enrollHeaders["Authorization"] = `Bearer ${token}`;
    } catch {
    }
  }
  const response = await fetch(url, {
    method: "POST",
    headers: enrollHeaders,
    body: formData
  });
  if (!response.ok) {
    let errorMessage = "Failed to enroll voice profile";
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorData = await response.json();
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
  return await response.json();
}
async function deleteVoiceProfile(userId) {
  return apiRequest("/api/voice-profile", {
    method: "DELETE",
    headers: {
      "x-user-id": userId
    }
  });
}
async function getMe(userId) {
  return apiRequest("/api/me", {
    method: "GET",
    headers: { "x-user-id": userId }
  });
}
async function acceptConsent(userId) {
  return apiRequest("/api/me/consent/accept", {
    method: "POST",
    headers: { "x-user-id": userId }
  });
}
async function revokeConsent(userId) {
  return apiRequest("/api/me/consent/revoke", {
    method: "POST",
    headers: { "x-user-id": userId }
  });
}
async function deleteAccountApi(userId) {
  return apiRequest("/api/me", {
    method: "DELETE",
    headers: { "x-user-id": userId }
  });
}
async function deleteRecordingApi(userId, recordingId) {
  return apiRequest(`/api/recordings/${recordingId}`, {
    method: "DELETE",
    headers: { "x-user-id": userId }
  });
}
async function registerPushToken(_userId, token) {
  return apiRequest("/api/me/push-token", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

// src/models/recording.ts
var import_zod2 = require("zod");
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
  ApiClientError,
  JobStatus,
  JobType,
  RecordingMode,
  RecordingStatus,
  acceptConsent,
  apiErrorSchema,
  audioUploadSchema,
  completeUpload,
  createDebriefSchema,
  createJobSchema,
  createRecording,
  createRecordingSchema,
  createTranscriptSchema,
  createUserSchema,
  debriefSchema,
  debriefSectionSchema,
  deleteAccountApi,
  deleteRecordingApi,
  deleteVoiceProfile,
  enrollVoiceProfile,
  getChatSession,
  getMe,
  getRecording,
  getRecordingResult,
  getRecordingStatus,
  getVoiceProfileStatus,
  jobSchema,
  listRecordings,
  listRecordingsByDay,
  paginationQuerySchema,
  paginationSchema,
  recordingDetailSchema,
  recordingSchema,
  recordingSummarySchema,
  registerPushToken,
  retryTranscription,
  revokeConsent,
  sendChatMessage,
  setTokenProvider,
  toRecordingDetail,
  toRecordingSummary,
  transcriptSchema,
  transcriptSegmentDetailSchema,
  transcriptSegmentSchema,
  updateRecordingSchema,
  uploadRecordingFile,
  userSchema,
  z
});
//# sourceMappingURL=index.cjs.map