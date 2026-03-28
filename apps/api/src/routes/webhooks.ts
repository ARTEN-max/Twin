/**
 * Webhook routes
 *
 * POST /webhooks/revenuecat — receives subscription lifecycle events from RevenueCat
 * and updates the user's subscription tier in the database.
 *
 * Security: RevenueCat signs webhook payloads with a shared secret sent in the
 * Authorization header. Set REVENUECAT_WEBHOOK_SECRET in your environment.
 */

import type { FastifyPluginAsync } from 'fastify';
import { db } from '../lib/db.js';
import { setUserSubscription } from '../lib/subscription.js';

// RevenueCat event types that affect the subscription tier
const PRO_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'TRANSFER',
]);

const FREE_EVENTS = new Set(['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE']);

interface RevenueCatWebhookBody {
  event: {
    type: string;
    app_user_id: string;
    expiration_at_ms?: number;
    original_app_user_id?: string;
  };
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /webhooks/revenuecat
   * No Firebase auth — verified via shared secret in Authorization header.
   */
  app.post<{ Body: RevenueCatWebhookBody }>('/webhooks/revenuecat', async (request, reply) => {
    // Verify shared secret
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (secret) {
      const authHeader = request.headers['authorization'];
      if (authHeader !== secret) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }

    const body = request.body as RevenueCatWebhookBody;
    if (!body?.event?.type || !body?.event?.app_user_id) {
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const { type, app_user_id, expiration_at_ms } = body.event;
    const userId = app_user_id;

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      // User may not exist yet (edge case) — acknowledge and ignore
      return reply.status(200).send({ ok: true });
    }

    if (PRO_EVENTS.has(type)) {
      const expiresAt = expiration_at_ms ? new Date(expiration_at_ms) : null;
      await setUserSubscription(userId, 'PRO', expiresAt);
      request.log.info({ userId, type, expiresAt }, 'User upgraded to PRO');
    } else if (FREE_EVENTS.has(type)) {
      await setUserSubscription(userId, 'FREE', null);
      request.log.info({ userId, type }, 'User downgraded to FREE');
    }
    // Other event types (e.g. TEST, SUBSCRIBER_ALIAS) — acknowledge, no action

    return reply.status(200).send({ ok: true });
  });
};
