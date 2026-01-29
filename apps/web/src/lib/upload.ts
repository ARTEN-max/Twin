export type UploadFailureReason =
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'http_error'
  | 'unknown';

export type UploadResult =
  | {
      ok: true;
      status: number;
      etag?: string;
      attempts: number;
    }
  | {
      ok: false;
      status?: number;
      reason: UploadFailureReason;
      retriable: boolean;
      message: string;
      attempts: number;
    };

export interface UploadProgress {
  loaded: number;
  total?: number;
  percent?: number;
}

export interface UploadToPresignedUrlOptions {
  contentType?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number; // retries after the first attempt
  onProgress?: (progress: UploadProgress) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function getBackoffMs(attemptIndex: number): number {
  // attemptIndex: 0=first attempt, 1=second...
  // jittered exponential backoff: 500ms, 1000ms, 2000ms...
  const base = 500 * Math.pow(2, Math.max(0, attemptIndex - 1));
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

function normalizeContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim() || contentType;
}

function uploadOnce(
  url: string,
  blob: Blob,
  options: UploadToPresignedUrlOptions
): Promise<UploadResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const contentType = normalizeContentType(options.contentType || blob.type || 'application/octet-stream');

  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    let finished = false;

    const finish = (result: UploadResult) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        finish({
          ok: false,
          reason: 'aborted',
          retriable: false,
          message: 'Upload aborted',
          attempts: 1,
        });
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.open('PUT', url);
    xhr.responseType = 'text';
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (evt) => {
      if (!options.onProgress) return;
      if (evt.lengthComputable) {
        const percent = Math.round((evt.loaded / evt.total) * 100);
        options.onProgress({ loaded: evt.loaded, total: evt.total, percent });
      } else {
        options.onProgress({ loaded: evt.loaded });
      }
    };

    xhr.onload = () => {
      const status = xhr.status;
      const etag = xhr.getResponseHeader('etag') ?? undefined;
      if (status >= 200 && status < 300) {
        finish({ ok: true, status, etag, attempts: 1 });
      } else {
        finish({
          ok: false,
          status,
          reason: 'http_error',
          retriable: isRetriableStatus(status),
          message: `Upload failed with status ${status}`,
          attempts: 1,
        });
      }
    };

    xhr.onerror = () => {
      // XHR uses status=0 for network errors.
      finish({
        ok: false,
        status: xhr.status || undefined,
        reason: 'network',
        retriable: true,
        message: 'Network error while uploading',
        attempts: 1,
      });
    };

    xhr.ontimeout = () => {
      finish({
        ok: false,
        status: xhr.status || undefined,
        reason: 'timeout',
        retriable: true,
        message: 'Upload timed out',
        attempts: 1,
      });
    };

    xhr.onabort = () => {
      finish({
        ok: false,
        status: xhr.status || undefined,
        reason: 'aborted',
        retriable: false,
        message: 'Upload aborted',
        attempts: 1,
      });
    };

    try {
      xhr.send(blob);
    } catch (e) {
      finish({
        ok: false,
        reason: 'unknown',
        retriable: true,
        message: e instanceof Error ? e.message : 'Failed to start upload',
        attempts: 1,
      });
    } finally {
      // cleanup abort listener
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    }
  });
}

/**
 * Upload a Blob to a presigned PUT URL with progress + retries.
 *
 * - Uses XHR to support upload progress.
 * - Retries transient failures (network/timeout/408/429/5xx) up to maxRetries.
 */
export async function uploadToPresignedUrl(
  blob: Blob,
  url: string,
  options: UploadToPresignedUrlOptions = {}
): Promise<UploadResult> {
  const maxRetries = options.maxRetries ?? 3;

  let attempt = 0;
  let lastFailure: UploadResult | null = null;

  while (attempt <= maxRetries) {
    attempt += 1;
    const result = await uploadOnce(url, blob, options);

    if (result.ok) {
      return { ...result, attempts: attempt };
    }

    lastFailure = { ...result, attempts: attempt };

    if (!result.retriable || attempt > maxRetries) {
      return lastFailure;
    }

    await sleep(getBackoffMs(attempt));
  }

  return (
    lastFailure ?? {
      ok: false,
      reason: 'unknown',
      retriable: false,
      message: 'Upload failed',
      attempts: maxRetries + 1,
    }
  );
}

