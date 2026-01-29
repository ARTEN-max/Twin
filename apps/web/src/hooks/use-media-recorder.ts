'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type PermissionState = 'unknown' | 'granted' | 'denied';
export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'error';

export interface UseMediaRecorderState {
  status: RecorderStatus;
  permission: PermissionState;
  mimeType: string | null;
  error: string | null;
  elapsedMs: number;
  blob: Blob | null;
  audioUrl: string | null;
}

export interface UseMediaRecorderControls {
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

function nowMs() {
  return performance.now();
}

function pickSupportedMimeType(): string | null {
  if (typeof window === 'undefined') return null;
  const MR = window.MediaRecorder;
  if (!MR) return null;

  const candidates = [
    // Prefer formats most widely supported and accepted by our API
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    // Safari sometimes supports mp4
    'audio/mp4',
  ];

  for (const t of candidates) {
    if (MR.isTypeSupported?.(t)) return t;
  }
  return null;
}

export function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase();
}

export function getExtensionForMime(mimeType: string): string {
  const mt = normalizeMimeType(mimeType);
  if (mt === 'audio/webm') return 'webm';
  if (mt === 'audio/ogg') return 'ogg';
  if (mt === 'audio/mp4') return 'mp4';
  // Fallback
  return 'webm';
}

export function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * In-browser audio recorder using MediaRecorder (no external libs).
 * Produces a single Blob on stop and manages permissions + cleanup.
 */
export function useMediaRecorder(): [UseMediaRecorderState, UseMediaRecorderControls] {
  const supportedMime = useMemo(() => pickSupportedMimeType(), []);

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const revokeAudioUrl = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const reset = useCallback(() => {
    setError(null);
    setElapsedMs(0);
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
    chunksRef.current = [];
    setBlob(null);
    revokeAudioUrl();
    setAudioUrl(null);
    setStatus('idle');
  }, [revokeAudioUrl]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    setStatus('paused');
    // Accumulate elapsed time up to pause
    if (startedAtRef.current !== null) {
      accumulatedMsRef.current += nowMs() - startedAtRef.current;
      startedAtRef.current = null;
    }
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    setStatus('recording');
    startedAtRef.current = nowMs();
    clearTimer();
    timerRef.current = window.setInterval(() => {
      const base = accumulatedMsRef.current;
      const delta = startedAtRef.current ? nowMs() - startedAtRef.current : 0;
      setElapsedMs(base + delta);
    }, 200);
  }, [clearTimer]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'inactive') return;
    try {
      recorder.stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop recording');
      setStatus('error');
    }
  }, []);

  const start = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!window.MediaRecorder) {
      setError('This browser does not support in-browser recording (MediaRecorder unavailable).');
      setStatus('error');
      return;
    }
    if (!supportedMime) {
      setError('No supported audio recording MIME type found in this browser.');
      setStatus('error');
      return;
    }

    // Reset any previous blob/url
    revokeAudioUrl();
    setAudioUrl(null);
    setBlob(null);
    chunksRef.current = [];
    setElapsedMs(0);
    accumulatedMsRef.current = 0;
    startedAtRef.current = null;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission('granted');

      const recorder = new MediaRecorder(stream, { mimeType: supportedMime });
      recorderRef.current = recorder;

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunksRef.current.push(evt.data);
        }
      };

      recorder.onerror = (evt) => {
        const msg =
          (evt as unknown as { error?: { message?: string } }).error?.message ||
          'Recording error occurred';
        setError(msg);
        setStatus('error');
        clearTimer();
        stopTracks();
      };

      recorder.onstop = () => {
        clearTimer();
        // finalize elapsed time
        if (startedAtRef.current !== null) {
          accumulatedMsRef.current += nowMs() - startedAtRef.current;
          startedAtRef.current = null;
        }
        setElapsedMs(accumulatedMsRef.current);

        const finalMime = recorder.mimeType || supportedMime;
        const b = new Blob(chunksRef.current, { type: finalMime });
        setBlob(b);
        const url = URL.createObjectURL(b);
        setAudioUrl(url);
        setStatus('stopped');

        // Clean up stream tracks (we don't need them after stop)
        stopTracks();
      };

      setStatus('recording');
      startedAtRef.current = nowMs();
      timerRef.current = window.setInterval(() => {
        const base = accumulatedMsRef.current;
        const delta = startedAtRef.current ? nowMs() - startedAtRef.current : 0;
        setElapsedMs(base + delta);
      }, 200);

      // timeslice to avoid large memory spikes on long recordings
      recorder.start(1000);
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied');
        setError('Microphone permission was denied. Please allow mic access and try again.');
      } else if (name === 'NotFoundError') {
        setError('No microphone device was found.');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to access microphone');
      }
      setStatus('error');
    }
  }, [clearTimer, revokeAudioUrl, stopTracks, supportedMime]);

  // Query initial mic permission if supported
  useEffect(() => {
    let cancelled = false;
    async function initPerm() {
      try {
        // permissions API not supported everywhere
        const anyNav = navigator as unknown as { permissions?: Permissions };
        const perms = anyNav.permissions;
        if (!perms?.query) return;
        const res = await perms.query({ name: 'microphone' as PermissionName });
        if (cancelled) return;
        setPermission(res.state === 'granted' ? 'granted' : res.state === 'denied' ? 'denied' : 'unknown');
        const handler = () => {
          setPermission(res.state === 'granted' ? 'granted' : res.state === 'denied' ? 'denied' : 'unknown');
        };
        res.addEventListener?.('change', handler);
      } catch {
        // ignore
      }
    }
    initPerm();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
      recorderRef.current = null;
      stopTracks();
      chunksRef.current = [];
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl, clearTimer, stopTracks]);

  return [
    {
      status,
      permission,
      mimeType: supportedMime,
      error,
      elapsedMs,
      blob,
      audioUrl,
    },
    { start, pause, resume, stop, reset },
  ];
}

