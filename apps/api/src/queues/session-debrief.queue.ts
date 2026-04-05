import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  getWorkerOptions,
  type SessionDebriefJobData,
  type SessionDebriefResult,
} from './config.js';
import { generateDebrief } from '../lib/ai/index.js';
import { db } from '../lib/db.js';
import { sessionDebriefQueue } from './queues.js';

export { sessionDebriefQueue };

let sessionDebriefWorker: Worker<SessionDebriefJobData, SessionDebriefResult> | null = null;

export function startSessionDebriefWorker(): Worker<
  SessionDebriefJobData,
  SessionDebriefResult
> | null {
  if (!sessionDebriefQueue) return null;
  if (sessionDebriefWorker) return sessionDebriefWorker;

  sessionDebriefWorker = new Worker<SessionDebriefJobData, SessionDebriefResult>(
    QUEUE_NAMES.SESSION_DEBRIEF,
    async (job: Job<SessionDebriefJobData, SessionDebriefResult>) => {
      const { sessionId } = job.data;
      const log = (msg: string) => console.log(`[SessionDebrief:${job.id}] ${msg}`);

      log(`Starting session debrief for session ${sessionId}`);

      // Fetch session + all complete recordings with transcripts, ordered by chunk index
      const session = await db.session.findUnique({
        where: { id: sessionId },
        include: {
          recordings: {
            where: { status: 'complete' },
            include: { transcript: true },
            orderBy: { chunkIndex: 'asc' },
          },
        },
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      type ChunkRecording = (typeof session.recordings)[number];
      const chunks = session.recordings.filter(
        (r: ChunkRecording) => r.transcript !== null
      ) as (ChunkRecording & { transcript: NonNullable<ChunkRecording['transcript']> })[];

      if (chunks.length === 0) {
        throw new Error(`Session ${sessionId} has no transcribed recordings`);
      }

      log(`Combining ${chunks.length} chunks`);
      await job.updateProgress(10);

      // Build combined transcript with part markers
      const combinedText = chunks
        .map((r, i) => {
          const label = r.chunkIndex != null ? `Part ${r.chunkIndex}` : `Part ${i + 1}`;
          return `[${label}]\n${r.transcript.text}`;
        })
        .join('\n\n');

      log(`Combined transcript: ${combinedText.length} chars`);
      await job.updateProgress(30);

      // Generate session-level debrief
      const debriefResult = await generateDebrief(combinedText, 'general', session.title);
      log(`Debrief generated: ${debriefResult.sections.length} sections`);
      await job.updateProgress(80);

      // Persist to session
      await db.session.update({
        where: { id: sessionId },
        data: {
          status: 'complete',
          debriefMarkdown: debriefResult.markdown,
          debriefSections: debriefResult.sections,
        },
      });
      await job.updateProgress(100);

      log('Session debrief complete');

      return {
        sessionId,
        markdown: debriefResult.markdown,
        sectionCount: debriefResult.sections.length,
      };
    },
    getWorkerOptions()
  );

  sessionDebriefWorker.on('completed', (job) => {
    console.log(`[SessionDebrief:${job.id}] Completed`);
  });

  sessionDebriefWorker.on('failed', async (job, error) => {
    console.error(`[SessionDebrief:${job?.id}] Failed:`, error.message);
    if (job?.data.sessionId) {
      await db.session
        .update({ where: { id: job.data.sessionId }, data: { status: 'failed' } })
        .catch(() => {});
    }
  });

  return sessionDebriefWorker;
}

export async function stopSessionDebriefWorker(): Promise<void> {
  if (sessionDebriefWorker) {
    await sessionDebriefWorker.close();
    sessionDebriefWorker = null;
  }
}

/**
 * Enqueue a session-level debrief job.
 * Should be called after all chunk recordings in the session are complete.
 */
export async function enqueueSessionDebriefJob(data: SessionDebriefJobData): Promise<string> {
  if (!sessionDebriefQueue) {
    throw new Error('Job queue is not available (Redis not configured).');
  }
  const job = await sessionDebriefQueue.add(`session-debrief-${data.sessionId}`, data, {
    jobId: `session-debrief-${data.sessionId}-${Date.now()}`,
  });
  return job.id!;
}
