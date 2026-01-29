'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  getRecordings,
  getRecording,
  getRecordingJobs,
  createRecording,
  completeUpload,
  uploadToS3,
  retryDebrief,
  retryTranscription,
  type RecordingWithRelations,
  type Job,
} from '@/lib/api';
import { useUserId } from '@/lib/auth';

// ============================================
// Query Keys
// ============================================

export const recordingKeys = {
  all: ['recordings'] as const,
  lists: () => [...recordingKeys.all, 'list'] as const,
  list: (page: number) => [...recordingKeys.lists(), page] as const,
  details: () => [...recordingKeys.all, 'detail'] as const,
  detail: (id: string) => [...recordingKeys.details(), id] as const,
  jobs: (id: string) => [...recordingKeys.all, 'jobs', id] as const,
};

// ============================================
// Hooks
// ============================================

/**
 * Fetch paginated recordings list
 */
export function useRecordings(page = 1) {
  const userId = useUserId();

  return useQuery({
    queryKey: recordingKeys.list(page),
    queryFn: () => getRecordings(userId, page),
  });
}

/**
 * Fetch single recording with relations
 */
export function useRecording(recordingId: string, enabled = true) {
  const userId = useUserId();

  return useQuery({
    queryKey: recordingKeys.detail(recordingId),
    queryFn: () => getRecording(userId, recordingId, true),
    enabled,
  });
}

/**
 * Fetch recording with polling until complete/failed
 */
export function useRecordingWithPolling(recordingId: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: recordingKeys.detail(recordingId),
    queryFn: () => getRecording(userId, recordingId, true),
    refetchInterval: (query) => {
      const data = query.state.data as RecordingWithRelations | undefined;
      // Stop polling only when complete AND we have the debrief,
      // or when failed
      if (data?.status === 'failed') {
        return false;
      }
      if (data?.status === 'complete' && data?.debrief) {
        return false;
      }
      // Poll every 2 seconds while processing or waiting for debrief
      return 2000;
    },
  });
}

function backoffDelayMs(attempt: number): number {
  // 1.5s, 3s, 6s, 12s, 20s (cap) + jitter
  const base = Math.min(1500 * Math.pow(2, Math.max(0, attempt)), 20000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function isTerminalRecordingState(data?: RecordingWithRelations): boolean {
  if (!data) return false;
  if (data.status === 'failed') return true;
  return data.status === 'complete' && !!data.debrief;
}

/**
 * Fetch recording and auto-refetch with exponential backoff until:
 * - failed, or
 * - complete AND debrief exists
 *
 * Designed for the Recording detail page.
 */
export function useRecordingWithBackoffPolling(recordingId: string) {
  const userId = useUserId();

  const query = useQuery({
    queryKey: recordingKeys.detail(recordingId),
    queryFn: () => getRecording(userId, recordingId, true),
  });

  const attemptRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    attemptRef.current = 0;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    lastKeyRef.current = '';
  }, [recordingId]);

  useEffect(() => {
    const key = `${query.data?.status ?? ''}-${query.data?.transcript ? 't' : 'f'}-${query.data?.debrief ? 't' : 'f'}`;
    // If we observe meaningful progress, reset backoff so the UI feels responsive.
    if (key && key !== lastKeyRef.current) {
      attemptRef.current = 0;
      lastKeyRef.current = key;
    }

    if (isTerminalRecordingState(query.data)) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const delay = backoffDelayMs(attemptRef.current);
    timeoutRef.current = window.setTimeout(async () => {
      attemptRef.current += 1;
      await query.refetch();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [query.data, query.refetch]);

  return query;
}

/**
 * Fetch jobs for a recording
 */
export function useRecordingJobs(recordingId: string) {
  const userId = useUserId();

  return useQuery({
    queryKey: recordingKeys.jobs(recordingId),
    queryFn: () => getRecordingJobs(userId, recordingId),
    refetchInterval: (query) => {
      const data = query.state.data as Job[] | undefined;
      // Stop polling when all jobs are done
      const hasActiveJob = data?.some(
        (job) => job.status === 'pending' || job.status === 'running'
      );
      return hasActiveJob ? 3000 : false;
    },
  });
}

function isTerminalJobsState(jobs?: Job[]): boolean {
  if (!jobs || jobs.length === 0) return false;
  const hasActiveJob = jobs.some((j) => j.status === 'pending' || j.status === 'running');
  return !hasActiveJob;
}

/**
 * Fetch jobs and auto-refetch with exponential backoff until all jobs are done.
 * Designed for the Recording detail page.
 */
export function useRecordingJobsWithBackoffPolling(recordingId: string) {
  const userId = useUserId();

  const query = useQuery({
    queryKey: recordingKeys.jobs(recordingId),
    queryFn: () => getRecordingJobs(userId, recordingId),
  });

  const attemptRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    attemptRef.current = 0;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    lastKeyRef.current = '';
  }, [recordingId]);

  useEffect(() => {
    const key =
      query.data
        ?.map((j) => `${j.type}:${j.status}`)
        .sort()
        .join('|') ?? '';
    if (key && key !== lastKeyRef.current) {
      attemptRef.current = 0;
      lastKeyRef.current = key;
    }

    if (isTerminalJobsState(query.data)) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const delay = backoffDelayMs(attemptRef.current);
    timeoutRef.current = window.setTimeout(async () => {
      attemptRef.current += 1;
      await query.refetch();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [query.data, query.refetch]);

  return query;
}

/**
 * Upload recording mutation
 */
export function useUploadRecording() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      title,
      mode,
      onProgress,
    }: {
      file: File;
      title: string;
      mode: string;
      onProgress?: (progress: number) => void;
    }) => {
      // Step 1: Create recording and get presigned URL
      const { recordingId, uploadUrl } = await createRecording(userId, {
        title,
        mode,
        mimeType: file.type,
      });

      // Step 2: Upload to S3
      await uploadToS3(uploadUrl, file, onProgress);

      // Step 3: Complete upload
      await completeUpload(userId, recordingId, file.size);

      return { recordingId };
    },
    onSuccess: () => {
      // Invalidate recordings list
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}

/**
 * Retry debrief mutation
 */
export function useRetryDebrief() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordingId: string) => retryDebrief(userId, recordingId),
    onSuccess: (_, recordingId) => {
      // Invalidate the specific recording
      queryClient.invalidateQueries({
        queryKey: recordingKeys.detail(recordingId),
      });
      queryClient.invalidateQueries({
        queryKey: recordingKeys.jobs(recordingId),
      });
    },
  });
}

/**
 * Retry transcription mutation (re-runs transcription + debrief)
 */
export function useRetryTranscription() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordingId: string) => retryTranscription(userId, recordingId),
    onSuccess: (_, recordingId) => {
      queryClient.invalidateQueries({ queryKey: recordingKeys.detail(recordingId) });
      queryClient.invalidateQueries({ queryKey: recordingKeys.jobs(recordingId) });
    },
  });
}
