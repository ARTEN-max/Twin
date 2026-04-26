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
  maxMinutesPerRecording: number | null; // null = unlimited
  /**
   * Monthly cap on total transcribed audio minutes. This is the cost-bound
   * limit — Whisper is $0.006/min, so a 1800-minute (30 hour) PRO cap holds
   * transcription cost at ~$10.80/user/month. Tune these as on-device
   * transcription is rolled out.
   */
  maxAudioMinutesPerMonth: number | null;
  chatMessagesPerDay: number | null;
  historyLimit: number | null; // null = unlimited
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  FREE: {
    recordingsPerMonth: 5,
    maxMinutesPerRecording: 20, // Enough to experience the product without funding all-day free sessions
    maxAudioMinutesPerMonth: 120, // 2 hours/month — multiple real trials without uncapped spend
    chatMessagesPerDay: 20,
    historyLimit: 10,
  },
  PRO: {
    recordingsPerMonth: null,
    maxMinutesPerRecording: null,
    maxAudioMinutesPerMonth: 1800, // 30 hours/month — caps transcription at ~$11/user/month
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

// ─── Audio-minute cap (cost-bound) ────────────────────────────

/**
 * Check whether the user has minutes remaining in their monthly audio budget.
 * Resets the counter if the calendar month has rolled over. Read-only — does
 * not increment. Use `incrementAudioMinutes` after successful transcription.
 *
 * Pre-checked at chunk upload (POST /recordings) so we can reject before
 * spending Whisper minutes on audio that puts the user over their cap.
 */
export async function checkAudioMinutesAllowed(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  tier: string;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      audioMinutesThisMonth: true,
      audioMinutesMonthResetAt: true,
    },
  });

  if (!user) return { allowed: false, used: 0, limit: 0, tier: 'FREE' };

  if (isTester(userId)) {
    return { allowed: true, used: user.audioMinutesThisMonth, limit: null, tier: 'PRO' };
  }

  const limits = getTierLimits(user.subscriptionTier);

  if (limits.maxAudioMinutesPerMonth === null) {
    return {
      allowed: true,
      used: user.audioMinutesThisMonth,
      limit: null,
      tier: user.subscriptionTier,
    };
  }

  const now = new Date();
  const needsReset =
    !user.audioMinutesMonthResetAt ||
    now.getMonth() !== user.audioMinutesMonthResetAt.getMonth() ||
    now.getFullYear() !== user.audioMinutesMonthResetAt.getFullYear();

  if (needsReset) {
    await db.user.update({
      where: { id: userId },
      data: { audioMinutesThisMonth: 0, audioMinutesMonthResetAt: now },
    });
    return {
      allowed: true,
      used: 0,
      limit: limits.maxAudioMinutesPerMonth,
      tier: user.subscriptionTier,
    };
  }

  const used = user.audioMinutesThisMonth;
  const allowed = used < limits.maxAudioMinutesPerMonth;
  return {
    allowed,
    used,
    limit: limits.maxAudioMinutesPerMonth,
    tier: user.subscriptionTier,
  };
}

/**
 * Add transcribed minutes to the user's monthly counter. Called by the
 * transcription worker after a chunk's duration is known. Idempotent-friendly:
 * the worker may retry a chunk; small over-counting is acceptable as a safety
 * margin against runaway costs.
 */
export async function incrementAudioMinutes(userId: string, minutes: number): Promise<void> {
  if (minutes <= 0) return;
  // Round up so we don't undercount partial minutes.
  const delta = Math.max(1, Math.ceil(minutes));
  await db.user.update({
    where: { id: userId },
    data: { audioMinutesThisMonth: { increment: delta } },
  });
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
