import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { enqueueSessionDebriefJob } from '../queues/index.js';
import type { FirebaseUser } from '../plugins/firebase-auth.js';

function requireUser(request: { firebaseUser?: FirebaseUser | null }): FirebaseUser {
  const user = request.firebaseUser;
  if (!user) {
    const err = new Error('Authentication required') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return user;
}

const createSessionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

export const sessionsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /sessions
   * Create a new recording session (groups multiple chunks for a long recording)
   */
  app.post('/sessions', async (request, reply) => {
    const { uid: userId } = requireUser(request);

    const parseResult = createSessionSchema.safeParse(request.body);
    const title =
      parseResult.success && parseResult.data.title
        ? parseResult.data.title
        : `Session ${new Date().toLocaleString()}`;

    const session = await db.session.create({
      data: { userId, title },
    });

    return reply.status(201).send({
      sessionId: session.id,
      title: session.title,
      status: session.status,
    });
  });

  /**
   * GET /sessions/:id
   * Get session status, recording count, total duration, and debrief if ready
   */
  app.get<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const { uid: userId } = requireUser(request);
    const { id } = request.params;

    const session = await db.session.findUnique({
      where: { id },
      include: {
        recordings: {
          select: { id: true, status: true, duration: true, chunkIndex: true, title: true },
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    type SessionRecording = (typeof session.recordings)[number];
    const totalDuration = session.recordings.reduce(
      (sum: number, r: SessionRecording) => sum + (r.duration ?? 0),
      0
    );
    const completeCount = session.recordings.filter(
      (r: SessionRecording) => r.status === 'complete'
    ).length;

    return reply.send({
      sessionId: session.id,
      title: session.title,
      status: session.status,
      recordingCount: session.recordings.length,
      completeCount,
      totalDuration,
      recordings: session.recordings,
      debrief:
        session.status === 'complete'
          ? { markdown: session.debriefMarkdown, sections: session.debriefSections }
          : null,
      createdAt: session.createdAt,
    });
  });

  /**
   * POST /sessions/:id/debrief
   * Trigger session-level debrief generation across all chunks.
   * Returns 202 if some chunks are still processing (safe to retry).
   * Returns 200 if debrief job was enqueued.
   */
  app.post<{ Params: { id: string } }>('/sessions/:id/debrief', async (request, reply) => {
    const { uid: userId } = requireUser(request);
    const { id } = request.params;

    const session = await db.session.findUnique({
      where: { id },
      include: {
        recordings: {
          select: { id: true, status: true },
        },
      },
    });

    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    // If already complete or processing, return current state
    if (session.status === 'complete') {
      return reply.send({ status: 'complete', message: 'Session debrief already complete' });
    }
    if (session.status === 'processing') {
      return reply.send({ status: 'processing', message: 'Session debrief is being generated' });
    }

    // Record the client's intent to debrief regardless of chunk state. The
    // debrief worker will fire the session debrief once all chunks finish.
    // This makes the trigger durable across app kills and chunk-still-processing
    // races — the client doesn't need to retry.
    await db.session.update({
      where: { id },
      data: { debriefRequestedAt: new Date() },
    });

    // Check if all chunks have completed processing
    type SessionChunk = (typeof session.recordings)[number];
    const pendingChunks = session.recordings.filter((r: SessionChunk) => r.status !== 'complete');
    if (pendingChunks.length > 0) {
      return reply.status(202).send({
        status: 'pending',
        message: `${pendingChunks.length} recording(s) still processing. Debrief will start automatically when ready.`,
        pendingCount: pendingChunks.length,
        totalCount: session.recordings.length,
      });
    }

    if (session.recordings.length === 0) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Session has no recordings' });
    }

    // All chunks already complete — race-safe transition + enqueue.
    const claim = await db.session.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'processing' },
    });

    if (claim.count === 1) {
      await enqueueSessionDebriefJob({ sessionId: id, userId });
    }

    return reply.send({
      status: 'processing',
      message: 'Session debrief generation started',
    });
  });
};
