/**
 * Subscription tier helpers
 *
 * Defines limits per tier and provides checked helpers for
 * recording creation and chat message sending.
 */

import { db } from './db.js';
import { getEnv } from './env.js';

// UIDs listed in TESTER_UIDS (comma-separated) always get PRO limits
function isTester(userId: string): boolean {
  const raw = getEnv().TESTER_UIDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

// ─── Tier limits ──────────────────────────────────────────────

export interface TierLimits {
  recordingsPerMonth: number | null; // null = unlimited
  maxRecordingMinutes: number | null;
  chatMessagesPerDay: number | null;
  historyLimit: number | null; // null = unlimited
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  FREE: {
    recordingsPerMonth: 5,
    maxRecordingMinutes: 30,
    chatMessagesPerDay: 20,
    historyLimit: 10,
  },
  PRO: {
    recordingsPerMonth: null,
    maxRecordingMinutes: 120,
    chatMessagesPerDay: null,
    historyLimit: null,
  },
};

export function getTierLimits(tier: string): TierLimits {
  return TIER_LIMITS[tier] ?? TIER_LIMITS['FREE']!;
}

// ─── Recording limit ──────────────────────────────────────────

/**
 * Returns true if the user is allowed to create a new recording.
 * Resets the monthly counter if the calendar month has rolled over.
 * Increments the counter if allowed.
 */
export async function checkAndIncrementRecordingCount(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  tier: string;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      recordingsThisMonth: true,
      recordingsMonthResetAt: true,
    },
  });

  if (!user) {
    return { allowed: false, used: 0, limit: 0, tier: 'FREE' };
  }

  if (isTester(userId)) {
    return { allowed: true, used: user.recordingsThisMonth, limit: null, tier: 'PRO' };
  }

  const limits = getTierLimits(user.subscriptionTier);

  // PRO = unlimited
  if (limits.recordingsPerMonth === null) {
    return {
      allowed: true,
      used: user.recordingsThisMonth,
      limit: null,
      tier: user.subscriptionTier,
    };
  }

  const now = new Date();
  const needsReset =
    !user.recordingsMonthResetAt ||
    now.getMonth() !== user.recordingsMonthResetAt.getMonth() ||
    now.getFullYear() !== user.recordingsMonthResetAt.getFullYear();

  if (needsReset) {
    // Reset counter for the new month
    await db.user.update({
      where: { id: userId },
      data: { recordingsThisMonth: 1, recordingsMonthResetAt: now },
    });
    return {
      allowed: true,
      used: 1,
      limit: limits.recordingsPerMonth,
      tier: user.subscriptionTier,
    };
  }

  if (user.recordingsThisMonth >= limits.recordingsPerMonth) {
    return {
      allowed: false,
      used: user.recordingsThisMonth,
      limit: limits.recordingsPerMonth,
      tier: user.subscriptionTier,
    };
  }

  await db.user.update({
    where: { id: userId },
    data: { recordingsThisMonth: { increment: 1 } },
  });

  return {
    allowed: true,
    used: user.recordingsThisMonth + 1,
    limit: limits.recordingsPerMonth,
    tier: user.subscriptionTier,
  };
}

// ─── Chat message limit ───────────────────────────────────────

/**
 * Returns true if the user is allowed to send a chat message.
 * Resets the daily counter if the calendar day has rolled over.
 * Increments the counter if allowed.
 */
export async function checkAndIncrementChatCount(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  tier: string;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      chatMessagesToday: true,
      chatMessagesDayResetAt: true,
    },
  });

  if (!user) {
    return { allowed: false, used: 0, limit: 0, tier: 'FREE' };
  }

  const limits = getTierLimits(user.subscriptionTier);

  // PRO = unlimited
  if (limits.chatMessagesPerDay === null) {
    return {
      allowed: true,
      used: user.chatMessagesToday,
      limit: null,
      tier: user.subscriptionTier,
    };
  }

  const now = new Date();
  const needsReset =
    !user.chatMessagesDayResetAt ||
    now.toDateString() !== user.chatMessagesDayResetAt.toDateString();

  if (needsReset) {
    await db.user.update({
      where: { id: userId },
      data: { chatMessagesToday: 1, chatMessagesDayResetAt: now },
    });
    return {
      allowed: true,
      used: 1,
      limit: limits.chatMessagesPerDay,
      tier: user.subscriptionTier,
    };
  }

  if (user.chatMessagesToday >= limits.chatMessagesPerDay) {
    return {
      allowed: false,
      used: user.chatMessagesToday,
      limit: limits.chatMessagesPerDay,
      tier: user.subscriptionTier,
    };
  }

  await db.user.update({
    where: { id: userId },
    data: { chatMessagesToday: { increment: 1 } },
  });

  return {
    allowed: true,
    used: user.chatMessagesToday + 1,
    limit: limits.chatMessagesPerDay,
    tier: user.subscriptionTier,
  };
}

// ─── Subscription update (called by RevenueCat webhook) ──────

export async function setUserSubscription(
  userId: string,
  tier: 'FREE' | 'PRO',
  expiresAt: Date | null
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionExpiresAt: expiresAt,
    },
  });
}
