import type { QueueOptions, WorkerOptions } from 'bullmq';
import { getRedisConnection } from '../lib/redis.js';

// ============================================
// Queue Names
// ============================================

export const QUEUE_NAMES = {
  TRANSCRIPTION: 'transcription',
  DEBRIEF: 'debrief',
  SESSION_DEBRIEF: 'session-debrief',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================
// Default Options
// ============================================

/**
 * Default queue options
 */
export function getQueueOptions(): QueueOptions {
  return {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 seconds
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  };
}

/**
 * Default worker options
 */
export function getWorkerOptions(): WorkerOptions {
  return {
    connection: getRedisConnection(),
    concurrency: 2, // Process 2 jobs at a time per worker
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 60000, // Per minute
    },
  };
}

// ============================================
// Job Data Types
// ============================================

export interface TranscriptionJobData {
  recordingId: string;
  jobId: string; // DB job ID for status updates
  objectKey: string;
  mimeType: string;
  userId: string;
}

export interface DebriefJobData {
  recordingId: string;
  jobId: string;
  transcriptId: string;
  transcriptText: string;
  recordingMode: string;
  recordingTitle: string;
  userId: string;
  recordingDuration?: number; // Duration in seconds (from transcription)
}

// ============================================
// Job Result Types
// ============================================

export interface TranscriptionResult {
  transcriptId: string;
  text: string;
  segmentCount: number;
  language: string;
}

export interface DebriefResult {
  debriefId: string;
  markdown: string;
  sectionCount: number;
}

export interface SessionDebriefJobData {
  sessionId: string;
  userId: string;
}

export interface SessionDebriefResult {
  sessionId: string;
  markdown: string;
  sectionCount: number;
}
