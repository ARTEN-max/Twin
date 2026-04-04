import { db } from '../lib/db.js';

// ============================================
// Types
// ============================================

export interface DayContextInput {
  userId: string;
  /** Date as YYYY-MM-DD or Date; day is interpreted in UTC */
  date: string | Date;
}

export interface DayContextResult {
  /** Combined transcript context for the day, ready for LLM injection */
  context: string;
  /** Number of recordings included */
  recordingCount: number;
  /** Whether any transcripts were found */
  hasContent: boolean;
}

// ============================================
// Helpers
// ============================================

function toUtcDayStart(date: string | Date): Date {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00.000Z') : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function toUtcDayEnd(date: string | Date): Date {
  const start = toUtcDayStart(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

// ============================================
// Service
// ============================================

/**
 * Aggregates all transcripts from a user's recordings for a given day
 * into a single context string for the chat LLM.
 */
export async function getDayContext(input: DayContextInput): Promise<DayContextResult> {
  const start = toUtcDayStart(input.date);
  const end = toUtcDayEnd(input.date);

  const recordings = await db.recording.findMany({
    where: {
      userId: input.userId,
      createdAt: { gte: start, lt: end },
      status: 'complete',
    },
    orderBy: { createdAt: 'asc' },
    include: {
      transcript: true,
    },
  });

  const parts: string[] = [];

  for (const rec of recordings) {
    const timeLabel = rec.createdAt.toISOString().slice(11, 16); // HH:MM
    const dateLabel = rec.createdAt.toISOString().slice(0, 10);
    const header = `--- Recording: "${rec.title}" (${dateLabel} ${timeLabel} UTC) ---`;
    if (rec.transcript?.text?.trim()) {
      parts.push(header);
      parts.push(rec.transcript.text.trim());
      parts.push('');
    }
  }

  const context = parts.length ? parts.join('\n') : '';
  return {
    context,
    recordingCount: recordings.length,
    hasContent: context.length > 0,
  };
}

export interface RecordingContextResult {
  context: string;
  hasContent: boolean;
  title?: string;
}

/**
 * Fetches the transcript for a single recording for use as chat context.
 */
export async function getRecordingContext(
  recordingId: string,
  userId?: string
): Promise<RecordingContextResult> {
  const recording = await db.recording.findFirst({
    where: {
      id: recordingId,
      ...(userId ? { userId } : {}),
      status: 'complete',
    },
    include: { transcript: true },
  });

  if (!recording?.transcript?.text?.trim()) {
    return { context: '', hasContent: false, title: recording?.title };
  }

  const dateLabel = recording.createdAt.toISOString().slice(0, 10);
  const timeLabel = recording.createdAt.toISOString().slice(11, 16);
  const header = `--- Recording: "${recording.title}" (${dateLabel} ${timeLabel} UTC) ---`;
  const context = `${header}\n${recording.transcript.text.trim()}`;

  return {
    context,
    hasContent: true,
    title: recording.title,
  };
}

/**
 * Fetches compressed debrief context from the last N days before a given date.
 * Used to give the chat AI cross-day pattern awareness without injecting full transcripts.
 */
export async function getRecentDebriefs(
  userId: string,
  beforeDate: string | Date,
  days = 7
): Promise<string> {
  const end = toUtcDayStart(beforeDate);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const recordings = await db.recording.findMany({
    where: {
      userId,
      createdAt: { gte: start, lt: end },
      status: 'complete',
    },
    orderBy: { createdAt: 'asc' },
    include: { debrief: true },
  });

  const byDate = new Map<string, Array<(typeof recordings)[number]>>();
  for (const rec of recordings) {
    const key = rec.createdAt.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(rec);
  }

  const parts: string[] = [];
  for (const [date, recs] of [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const dayParts = recs
      .filter((r) => r.debrief?.markdown?.trim())
      .map((r) => `**${r.title}**\n${r.debrief!.markdown.trim()}`);
    if (dayParts.length) {
      parts.push(`### ${date}\n\n${dayParts.join('\n\n')}`);
    }
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Fetches all debrief markdown from a user's recordings for a given day.
 * Used to repurpose debriefs as the chat's opening message.
 */
export async function getDayDebriefs(input: DayContextInput): Promise<{
  markdown: string;
  recordingCount: number;
  hasContent: boolean;
}> {
  const start = toUtcDayStart(input.date);
  const end = toUtcDayEnd(input.date);

  const recordings = await db.recording.findMany({
    where: {
      userId: input.userId,
      createdAt: { gte: start, lt: end },
      status: 'complete',
    },
    orderBy: { createdAt: 'asc' },
    include: { debrief: true },
  });

  const parts: string[] = [];
  for (const rec of recordings) {
    if (rec.debrief?.markdown?.trim()) {
      parts.push(`### ${rec.title}\n\n${rec.debrief.markdown.trim()}`);
    }
  }
  const markdown = parts.length ? parts.join('\n\n---\n\n') : '';
  return {
    markdown,
    recordingCount: recordings.length,
    hasContent: markdown.length > 0,
  };
}
