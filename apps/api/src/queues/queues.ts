/**
 * Queue instances
 *
 * Separate file to avoid circular dependencies between workers.
 * When Redis is not configured, queues are null (Chat works; recording jobs are disabled).
 */
import { Queue } from 'bullmq';
import { isRedisAvailable } from '../lib/redis.js';
import {
  QUEUE_NAMES,
  getQueueOptions,
  type TranscriptionJobData,
  type TranscriptionResult,
  type DebriefJobData,
  type DebriefResult,
  type SessionDebriefJobData,
  type SessionDebriefResult,
} from './config.js';

// ============================================
// Queue Instances (null when Redis not configured)
// ============================================

export const transcriptionQueue: Queue<TranscriptionJobData, TranscriptionResult> | null =
  isRedisAvailable()
    ? new Queue<TranscriptionJobData, TranscriptionResult>(
        QUEUE_NAMES.TRANSCRIPTION,
        getQueueOptions()
      )
    : null;

export const debriefQueue: Queue<DebriefJobData, DebriefResult> | null = isRedisAvailable()
  ? new Queue<DebriefJobData, DebriefResult>(QUEUE_NAMES.DEBRIEF, getQueueOptions())
  : null;

export const sessionDebriefQueue: Queue<SessionDebriefJobData, SessionDebriefResult> | null =
  isRedisAvailable()
    ? new Queue<SessionDebriefJobData, SessionDebriefResult>(
        QUEUE_NAMES.SESSION_DEBRIEF,
        getQueueOptions()
      )
    : null;
