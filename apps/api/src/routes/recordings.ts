import type { FastifyPluginAsync } from 'fastify';
import type { RecordingStatus } from '@prisma/client';
import { z } from 'zod';
import { RecordingMode } from '@komuchi/shared';
import {
  createRecording,
  setRecordingObjectKey,
  completeUpload,
  getRecordingByUser,
  listRecordingsByUser,
  updateRecordingStatus,
  deleteRecording as deleteRecordingRow,
} from '../services/recordings.service.js';
import { createJob } from '../services/jobs.service.js';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  objectExists,
  isAllowedMimeType,
  getExtensionFromMimeType,
  uploadObject,
  generateObjectKey,
  deleteObject,
} from '../lib/storage.js';
import { enqueueTranscriptionJob, type TranscriptionJobData } from '../queues/index.js';
import { uploadRateLimit } from '../plugins/rate-limit.js';
import { db } from '../lib/db.js';

// ============================================
// Request Schemas
// ============================================

const createRecordingSchema = z.object({
  title: z.string().min(1).max(255),
  mode: RecordingMode.default('general'),
  mimeType: z.string().min(1),
});

// ============================================
// Helper Functions
// ============================================

import type { FirebaseUser } from '../plugins/firebase-auth.js';

/**
 * Ensure a user exists in the database.
 * Creates or updates the user record so the email stays in sync with Firebase.
 */
async function ensureUserExists(uid: string, email?: string): Promise<void> {
  const existing = await db.user.findUnique({ where: { id: uid } });
  if (!existing) {
    await db.user.create({
      data: {
        id: uid,
        email: email || `${uid.slice(0, 20)}@local`,
      },
    });
  } else if (email && existing.email !== email) {
    await db.user.update({ where: { id: uid }, data: { email } });
  }
}

/** Helper: extract & validate the authenticated user from the request */
function requireUser(request: { firebaseUser?: FirebaseUser | null }): FirebaseUser {
  const user = request.firebaseUser;
  if (!user) {
    const err = new Error('Authentication required') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return user;
}

/**
 * Helper: verify consent has been accepted and not revoked.
 * Used on endpoints that create/upload/process recordings.
 * Returns true if consented, throws 403 if not.
 */
async function requireConsent(uid: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: uid },
    select: { consentAcceptedAt: true, consentRevokedAt: true },
  });

  if (!user || !user.consentAcceptedAt || user.consentRevokedAt) {
    const err = new Error('Consent is required before creating or uploading recordings.') as Error & { statusCode: number };
    (err as any).error = 'consent_required';
    err.statusCode = 403;
    throw err;
  }
}

const listRecordingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'uploaded', 'processing', 'complete', 'failed']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  cursor: z.string().optional(),
});

const completeUploadBodySchema = z.object({
  fileSize: z.number().int().positive().optional(), // Actual file size after upload
});

// ============================================
// Routes
// ============================================

export const recordingsRoutes: FastifyPluginAsync = async (app) => {
  function normalizeMimeType(mimeType: string): string {
    return mimeType.split(';')[0]?.trim().toLowerCase();
  }

  /**
   * POST /recordings
   * Create a new recording and get a presigned upload URL
   */
  app.post<{
    Body: z.infer<typeof createRecordingSchema>;
  }>('/recordings', { config: { rateLimit: uploadRateLimit } }, async (request, reply) => {
    const { uid: userId, email } = requireUser(request);

    // Consent gate — must accept before creating recordings
    await requireConsent(userId);

    // Validate request body
    const parseResult = createRecordingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      });
    }

    const { title, mode, mimeType: rawMimeType } = parseResult.data;
    const mimeType = normalizeMimeType(rawMimeType);

    // Validate MIME type
    if (!isAllowedMimeType(mimeType)) {
      return reply.status(400).send({
        error: 'Invalid File Type',
        message: `MIME type '${rawMimeType}' is not allowed. Supported: audio/mpeg, audio/wav, audio/webm, audio/ogg, audio/mp4, audio/m4a, audio/flac`,
      });
    }

    const ext = getExtensionFromMimeType(mimeType);
    const safeTitle = title
      .trim()
      .replace(/[^a-zA-Z0-9._ -]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);
    const filename = `${safeTitle || 'recording'}.${ext}`;

    try {
      // 0. Ensure user exists in the database
      await ensureUserExists(userId, email);

      // 1. Create recording in pending status
      const recording = await createRecording({
        userId,
        title,
        mode,
        originalFilename: filename,
        mimeType,
      });

      // 2. Generate presigned upload URL
      const { uploadUrl, objectKey, expiresIn } = await getPresignedUploadUrl(
        userId,
        recording.id,
        mimeType,
        filename
      );

      // 3. Save object key to recording
      await setRecordingObjectKey(recording.id, objectKey);

      // 4. Return recording ID and upload URL
      return reply.status(201).send({
        data: {
          recordingId: recording.id,
          uploadUrl,
          objectKey,
          expiresIn,
        },
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to create recording');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create recording',
      });
    }
  });

  /**
   * POST /recordings/:id/complete-upload
   * Mark upload as complete and enqueue transcription job
   */
  app.post<{
    Params: { id: string };
    Body: z.infer<typeof completeUploadBodySchema>;
  }>('/recordings/:id/complete-upload', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    // Consent gate
    await requireConsent(userId);

    const { id } = request.params;

    // Validate body
    const parseResult = completeUploadBodySchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      });
    }

    try {
      // 1. Check recording exists and belongs to user
      const recording = await getRecordingByUser(id, userId);
      if (!recording) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Recording not found',
        });
      }

      // 2. Check recording is in 'pending' status
      if (recording.status !== 'pending') {
        return reply.status(400).send({
          error: 'Invalid State',
          message: `Recording is in '${recording.status}' status, expected 'pending'`,
        });
      }

      // 3. Verify file exists in S3
      if (!recording.objectKey) {
        return reply.status(400).send({
          error: 'Invalid State',
          message: 'Recording has no object key',
        });
      }

      const exists = await objectExists(recording.objectKey);
      if (!exists) {
        return reply.status(400).send({
          error: 'Upload Not Found',
          message: 'File not found in storage. Please upload the file first.',
        });
      }

      // 4. Mark as uploaded
      const { fileSize } = parseResult.data;
      await completeUpload(id, fileSize);

      // 5. Create transcription job in database
      const dbJob = await createJob({
        recordingId: id,
        type: 'TRANSCRIBE',
      });

      // 6. Enqueue transcription job to BullMQ
      const jobData: TranscriptionJobData = {
        recordingId: id,
        jobId: dbJob.id,
        objectKey: recording.objectKey,
        mimeType: recording.mimeType || 'audio/mpeg',
        userId,
      };

      await enqueueTranscriptionJob(jobData);

      // 7. Update recording status to processing
      await updateRecordingStatus(id, 'processing');

      return reply.status(200).send({
        data: {
          recordingId: id,
          jobId: dbJob.id,
          status: 'processing',
          message: 'Upload complete. Transcription job queued.',
        },
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to complete upload');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to complete upload',
      });
    }
  });

  /**
   * POST /recordings/:id/upload
   * Proxy upload endpoint - receives raw audio and uploads to S3
   * This avoids CORS issues with direct S3 uploads
   */
  app.post<{
    Params: { id: string };
  }>(
    '/recordings/:id/upload',
    {
      config: {
        rateLimit: uploadRateLimit,
        rawBody: true,
      } as Record<string, unknown>,
    },
    async (request, reply) => {
      const { uid: userId } = requireUser(request);

      // Consent gate
      await requireConsent(userId);

      const { id } = request.params;

      try {
        // 1. Check recording exists and belongs to user
        const recording = await getRecordingByUser(id, userId);
        if (!recording) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recording not found',
          });
        }

        // 2. Check recording is in 'pending' status
        if (recording.status !== 'pending') {
          return reply.status(400).send({
            error: 'Invalid State',
            message: `Recording is in '${recording.status}' status, expected 'pending'`,
          });
        }

        // 3. Get the raw body as buffer
        const body = request.body;
        if (!body) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No file data received',
          });
        }

        // Handle different body types
        let buffer: Buffer;
        if (Buffer.isBuffer(body)) {
          buffer = body;
        } else if (body instanceof Uint8Array) {
          buffer = Buffer.from(body);
        } else if (typeof body === 'string') {
          buffer = Buffer.from(body, 'base64');
        } else {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid body format',
          });
        }
        const mimeType = (request.headers['content-type'] as string) || 'audio/webm';
        const filename = `recording.${getExtensionFromMimeType(mimeType)}`;

        // 4. Validate MIME type
        if (!isAllowedMimeType(mimeType)) {
          return reply.status(400).send({
            error: 'Invalid File Type',
            message: `MIME type '${mimeType}' is not allowed`,
          });
        }

        // 5. Ensure bucket exists, then generate object key and upload to S3
        const { ensureBucketExists } = await import('../lib/storage.js');
        await ensureBucketExists();
        
        const objectKey = generateObjectKey(userId, id, filename);
        await uploadObject(objectKey, buffer, mimeType, {
          'user-id': userId,
          'recording-id': id,
          'original-filename': filename,
        });

        // 6. Update recording with object key
        await setRecordingObjectKey(id, objectKey);

        // 7. Mark as uploaded and create transcription job
        await completeUpload(id, buffer.length);

        const dbJob = await createJob({
          recordingId: id,
          type: 'TRANSCRIBE',
        });

        const jobData: TranscriptionJobData = {
          recordingId: id,
          jobId: dbJob.id,
          objectKey,
          mimeType,
          userId,
        };

        await enqueueTranscriptionJob(jobData);
        await updateRecordingStatus(id, 'processing');

        return reply.status(200).send({
          data: {
            recordingId: id,
            jobId: dbJob.id,
            status: 'processing',
            message: 'Upload complete. Transcription job queued.',
          },
          success: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        request.log.error({ error, errorMessage, errorStack }, 'Failed to upload file');
        
        // Return more detailed error in development, generic in production
        const isDev = process.env.NODE_ENV !== 'production';
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: isDev ? errorMessage : 'Failed to upload file',
          ...(isDev && errorStack ? { stack: errorStack } : {}),
        });
      }
    }
  );

  /**
   * GET /recordings
   * List recordings for the authenticated user
   */
  app.get<{
    Querystring: z.infer<typeof listRecordingsQuerySchema>;
  }>('/recordings', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    const parseResult = listRecordingsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      });
    }

    const { page, limit, status, date, cursor } = parseResult.data;

    try {
      const result = await listRecordingsByUser(userId, {
        page,
        limit,
        status: status as RecordingStatus | undefined,
        date,
        cursor,
      });

      return reply.status(200).send({
        data: result.data,
        pagination: result.pagination,
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to list recordings');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list recordings',
      });
    }
  });

  /**
   * GET /recordings/:id
   * Get a single recording with optional relations
   */
  app.get<{
    Params: { id: string };
    Querystring: { include?: string };
  }>('/recordings/:id', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    const { id } = request.params;
    const includeRelations = request.query.include === 'all';

    try {
      const recording = await getRecordingByUser(id, userId, includeRelations);
      if (!recording) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Recording not found',
        });
      }

      return reply.status(200).send({
        data: recording,
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to get recording');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get recording',
      });
    }
  });

  /**
   * GET /recordings/:id/download-url
   * Get a presigned download URL for the audio file
   */
  app.get<{
    Params: { id: string };
  }>('/recordings/:id/download-url', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    const { id } = request.params;

    try {
      const recording = await getRecordingByUser(id, userId);
      if (!recording) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Recording not found',
        });
      }

      if (!recording.objectKey) {
        return reply.status(400).send({
          error: 'No File',
          message: 'Recording has no associated file',
        });
      }

      const { downloadUrl, expiresIn } = await getPresignedDownloadUrl(recording.objectKey);

      return reply.status(200).send({
        data: {
          downloadUrl,
          expiresIn,
          filename: recording.originalFilename,
          mimeType: recording.mimeType,
        },
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to get download URL');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get download URL',
      });
    }
  });

  /**
   * GET /recordings/:id/jobs
   * Get jobs for a recording
   */
  app.get<{
    Params: { id: string };
  }>('/recordings/:id/jobs', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    const { id } = request.params;

    try {
      // Verify recording belongs to user
      const recording = await getRecordingByUser(id, userId);
      if (!recording) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Recording not found',
        });
      }

      // Get jobs from database
      const { getJobsByRecording } = await import('../services/jobs.service.js');
      const jobs = await getJobsByRecording(id);

      return reply.status(200).send({
        data: jobs,
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to get jobs');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get jobs',
      });
    }
  });

  /**
   * POST /recordings/:id/retry-debrief
   * Retry debrief generation for a recording
   */
  app.post<{
    Params: { id: string };
  }>('/recordings/:id/retry-debrief', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    const { id } = request.params;

    try {
      // Verify recording belongs to user
      const recording = await getRecordingByUser(id, userId, true);
      if (!recording) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Recording not found',
        });
      }

      // Check if transcript exists
      if (!recording.transcript) {
        return reply.status(400).send({
          error: 'No Transcript',
          message: 'Recording must have a transcript before generating a debrief',
        });
      }

      // Retry debrief generation
      const { retryDebriefJob } = await import('../queues/index.js');
      const queueJobId = await retryDebriefJob(id);

      if (!queueJobId) {
        return reply.status(400).send({
          error: 'Retry Failed',
          message: 'Failed to enqueue debrief job',
        });
      }

      return reply.status(200).send({
        data: {
          recordingId: id,
          queueJobId,
          message: 'Debrief job requeued',
        },
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to retry debrief');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retry debrief',
      });
    }
  });

  /**
   * POST /recordings/:id/retry-transcription
   * Retry transcription (and subsequently debrief) for a recording.
   */
  app.post<{
    Params: { id: string };
  }>('/recordings/:id/retry-transcription', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    const { id } = request.params;

    try {
      const recording = await getRecordingByUser(id, userId);
      if (!recording) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Recording not found',
        });
      }

      if (!recording.objectKey) {
        return reply.status(400).send({
          error: 'No File',
          message: 'Recording has no associated file',
        });
      }

      const { retryTranscriptionJob } = await import('../queues/index.js');
      const queueJobId = await retryTranscriptionJob(id);

      if (!queueJobId) {
        return reply.status(400).send({
          error: 'Retry Failed',
          message: 'Failed to enqueue transcription job',
        });
      }

      return reply.status(200).send({
        data: {
          recordingId: id,
          queueJobId,
          message: 'Transcription job requeued',
        },
        success: true,
      });
    } catch (error) {
      request.log.error(error, 'Failed to retry transcription');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retry transcription',
      });
    }
  });

  /**
   * DELETE /recordings/:id
   * Delete a recording, its S3 audio object, and all derived artifacts.
   * Ownership is enforced.
   */
  app.delete<{
    Params: { id: string };
  }>('/recordings/:id', async (request, reply) => {
    const { uid: userId } = requireUser(request);
    const { id } = request.params;

    try {
      // 1. Verify ownership
      const recording = await getRecordingByUser(id, userId);
      if (!recording) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Recording not found',
        });
      }

      // 2. Delete S3 audio object (best-effort)
      if (recording.objectKey) {
        try {
          await deleteObject(recording.objectKey);
        } catch (err) {
          request.log.warn({ objectKey: recording.objectKey, err }, 'Failed to delete S3 object');
        }
      }

      // 3. Delete recording row — cascade deletes transcript, debrief, jobs, chat session
      await deleteRecordingRow(id);

      return reply.status(200).send({ ok: true, success: true });
    } catch (error) {
      request.log.error(error, 'Failed to delete recording');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to delete recording',
      });
    }
  });
};
