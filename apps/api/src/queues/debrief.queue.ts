import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  getWorkerOptions,
  type DebriefJobData,
  type DebriefResult,
} from './config.js';
import { generateDebrief } from '../lib/ai/index.js';
import { db } from '../lib/db.js';
import { debriefQueue } from './queues.js';

// Re-export queue for convenience
export { debriefQueue };

// ============================================
// Worker
// ============================================

let debriefWorker: Worker<DebriefJobData, DebriefResult> | null = null;

export function startDebriefWorker(): Worker<DebriefJobData, DebriefResult> {
  if (debriefWorker) {
    return debriefWorker;
  }

  debriefWorker = new Worker<DebriefJobData, DebriefResult>(
    QUEUE_NAMES.DEBRIEF,
    async (job: Job<DebriefJobData, DebriefResult>) => {
      const { recordingId, jobId, transcriptText, recordingMode, recordingTitle } = job.data;
      const log = (msg: string) => console.log(`[Debrief:${job.id}] ${msg}`);

      try {
        log(`Starting debrief generation for recording ${recordingId}`);

        // Step 1: Update job status to running
        await updateJobStatus(jobId, 'running');
        await job.updateProgress(10);

        // Step 2: Generate debrief using AI
        log(`Generating debrief (mode: ${recordingMode})`);
        const debriefResult = await generateDebrief(
          transcriptText,
          recordingMode,
          recordingTitle
        );
        log(`Debrief generated: ${debriefResult.sections.length} sections`);
        await job.updateProgress(70);

        // Step 3: Save debrief to database (upsert so retries overwrite old/mock debriefs)
        log('Saving debrief to database');
        const debrief = await db.debrief.upsert({
          where: { recordingId },
          create: {
            recordingId,
            markdown: debriefResult.markdown,
            sections: debriefResult.sections,
          },
          update: {
            markdown: debriefResult.markdown,
            sections: debriefResult.sections,
          },
        });
        await job.updateProgress(85);

        // Step 4: Mark debrief job as complete
        await updateJobStatus(jobId, 'complete');

        // Step 5: Mark recording as complete
        log('Marking recording as complete');
        await db.recording.update({
          where: { id: recordingId },
          data: { status: 'complete' },
        });
        await job.updateProgress(100);

        log('Debrief job complete');

        return {
          debriefId: debrief.id,
          markdown: debriefResult.markdown,
          sectionCount: debriefResult.sections.length,
        };
      } catch (error) {
        log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

        // Update job status to failed
        await updateJobStatus(
          jobId,
          'failed',
          error instanceof Error ? error.message : 'Unknown error'
        );

        // Mark the recording as failed so the UI doesn't get stuck in "processing".
        // The transcript is still available and the user can retry debrief generation.
        await db.recording.update({
          where: { id: recordingId },
          data: { status: 'failed' },
        });

        throw error;
      }
    },
    getWorkerOptions()
  );

  // Event handlers
  debriefWorker.on('completed', (job) => {
    console.log(`[Debrief:${job.id}] Completed successfully`);
  });

  debriefWorker.on('failed', (job, error) => {
    console.error(`[Debrief:${job?.id}] Failed:`, error.message);
  });

  debriefWorker.on('progress', (job, progress) => {
    console.log(`[Debrief:${job.id}] Progress: ${progress}%`);
  });

  return debriefWorker;
}

export async function stopDebriefWorker(): Promise<void> {
  if (debriefWorker) {
    await debriefWorker.close();
    debriefWorker = null;
  }
}

// ============================================
// Helper Functions
// ============================================

async function updateJobStatus(
  jobId: string,
  status: 'pending' | 'running' | 'complete' | 'failed',
  error?: string
): Promise<void> {
  const data: {
    status: typeof status;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
  } = { status };

  if (status === 'running') {
    data.startedAt = new Date();
  }

  if (status === 'complete' || status === 'failed') {
    data.completedAt = new Date();
  }

  if (error) {
    data.error = error;
  }

  await db.job.update({
    where: { id: jobId },
    data,
  });
}

// ============================================
// Queue Helper
// ============================================

/**
 * Add a debrief job to the queue
 */
export async function enqueueDebriefJob(
  data: DebriefJobData
): Promise<string> {
  const job = await debriefQueue.add(
    `debrief-${data.recordingId}`,
    data,
    {
      jobId: `debrief-${data.recordingId}-${Date.now()}`,
    }
  );
  return job.id!;
}

/**
 * Retry a failed debrief job
 */
export async function retryDebriefJob(recordingId: string): Promise<string | null> {
  // Get the recording with transcript
  const recording = await db.recording.findUnique({
    where: { id: recordingId },
    include: { transcript: true },
  });

  if (!recording || !recording.transcript) {
    return null;
  }

  // Flip status back to processing while we retry
  await db.recording.update({
    where: { id: recordingId },
    data: { status: 'processing' },
  });

  // Create a new debrief job in database
  const debriefDbJob = await db.job.create({
    data: {
      recordingId,
      type: 'DEBRIEF',
      status: 'pending',
    },
  });

  // Enqueue the job
  const jobData: DebriefJobData = {
    recordingId,
    jobId: debriefDbJob.id,
    transcriptId: recording.transcript.id,
    transcriptText: recording.transcript.text,
    recordingMode: recording.mode,
    recordingTitle: recording.title,
    userId: recording.userId,
  };

  return enqueueDebriefJob(jobData);
}
