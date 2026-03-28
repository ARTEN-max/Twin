/**
 * /api/me routes
 *
 * User profile, consent management and account deletion.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { FirebaseUser } from '../plugins/firebase-auth.js';
import { db } from '../lib/db.js';
import { deleteObject } from '../lib/storage.js';
import { getTierLimits } from '../lib/subscription.js';

// ============================================
// Helpers
// ============================================

function requireUser(request: { firebaseUser?: FirebaseUser | null }): FirebaseUser {
  const user = request.firebaseUser;
  if (!user) {
    const err = new Error('Authentication required') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return user;
}

async function ensureUserExists(uid: string, email?: string) {
  const existing = await db.user.findUnique({ where: { id: uid } });
  if (!existing) {
    return db.user.create({
      data: {
        id: uid,
        email: email || `${uid.slice(0, 20)}@local`,
      },
    });
  }
  if (email && existing.email !== email) {
    return db.user.update({ where: { id: uid }, data: { email } });
  }
  return existing;
}

// ============================================
// Routes
// ============================================

export const meRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /me
   * Returns the current user profile including consent timestamps.
   */
  app.get('/me', async (request, reply) => {
    const { uid, email } = requireUser(request);

    const user = await ensureUserExists(uid, email);

    const limits = getTierLimits(user.subscriptionTier);

    return reply.status(200).send({
      data: {
        uid: user.id,
        email: user.email,
        consentAcceptedAt: user.consentAcceptedAt?.toISOString() ?? null,
        consentRevokedAt: user.consentRevokedAt?.toISOString() ?? null,
        subscription: {
          tier: user.subscriptionTier,
          expiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
          limits: {
            recordingsPerMonth: limits.recordingsPerMonth,
            maxRecordingMinutes: limits.maxRecordingMinutes,
            chatMessagesPerDay: limits.chatMessagesPerDay,
            historyLimit: limits.historyLimit,
          },
          usage: {
            recordingsThisMonth: user.recordingsThisMonth,
            chatMessagesToday: user.chatMessagesToday,
          },
        },
      },
      success: true,
    });
  });

  /**
   * POST /me/consent/accept
   * Records consent acceptance. Clears any prior revocation.
   */
  app.post('/me/consent/accept', async (request, reply) => {
    const { uid, email } = requireUser(request);

    await ensureUserExists(uid, email);

    const user = await db.user.update({
      where: { id: uid },
      data: {
        consentAcceptedAt: new Date(),
        consentRevokedAt: null,
      },
    });

    return reply.status(200).send({
      data: {
        uid: user.id,
        consentAcceptedAt: user.consentAcceptedAt?.toISOString() ?? null,
        consentRevokedAt: null,
      },
      success: true,
    });
  });

  /**
   * POST /me/consent/revoke
   * Records consent revocation. Does not clear the original acceptance date.
   */
  app.post('/me/consent/revoke', async (request, reply) => {
    const { uid, email } = requireUser(request);

    await ensureUserExists(uid, email);

    const user = await db.user.update({
      where: { id: uid },
      data: {
        consentRevokedAt: new Date(),
      },
    });

    return reply.status(200).send({
      data: {
        uid: user.id,
        consentAcceptedAt: user.consentAcceptedAt?.toISOString() ?? null,
        consentRevokedAt: user.consentRevokedAt?.toISOString() ?? null,
      },
      success: true,
    });
  });

  /**
   * DELETE /me
   * Deletes the user account and ALL associated data:
   *   - S3 audio objects (best-effort)
   *   - Recordings, transcripts, debriefs, jobs (cascade)
   *   - Chat sessions + messages (cascade)
   *   - User row
   */
  app.delete('/me', async (request, reply) => {
    const { uid } = requireUser(request);

    try {
      // 1. Gather all recordings so we can delete S3 objects
      const recordings = await db.recording.findMany({
        where: { userId: uid },
        select: { objectKey: true },
      });

      // 2. Best-effort S3 cleanup
      for (const rec of recordings) {
        if (rec.objectKey) {
          try {
            await deleteObject(rec.objectKey);
          } catch (err) {
            request.log.warn(
              { objectKey: rec.objectKey, err },
              'Failed to delete S3 object during account deletion'
            );
          }
        }
      }

      // 3. Delete user row — cascade deletes recordings, transcripts, debriefs, jobs, chat sessions
      await db.user.delete({ where: { id: uid } });

      return reply.status(200).send({ ok: true, success: true });
    } catch (error) {
      // User might not exist in DB yet (e.g. never created a recording)
      const userExists = await db.user.findUnique({ where: { id: uid } });
      if (!userExists) {
        // Nothing to delete — that's fine
        return reply.status(200).send({ ok: true, success: true });
      }

      request.log.error(error, 'Failed to delete user account');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to delete account',
      });
    }
  });
};
