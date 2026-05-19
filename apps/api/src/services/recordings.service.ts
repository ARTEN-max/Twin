import type { Prisma, Recording, RecordingStatus, RecordingMode } from '@prisma/client';
import { db } from '../lib/db.js';
import type { TranscriptSegment, DebriefSection } from '@twin/shared';

// ============================================
// Types
// ============================================

export interface CreateRecordingInput {
  userId: string;
  title: string;
  mode: RecordingMode;
  originalFilename?: string;
  mimeType: string;
  fileSize?: number;
  sessionId?: string;
  chunkIndex?: number;
}

export interface RecordingWithRelations {
  id: string;
  userId: string;
  title: string;
  mode: string;
  status: string;
  objectKey: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string | null; // Error message from failed job
  transcript?: {
    id: string;
    text: string;
    segments: TranscriptSegment[] | null;
    language: string;
    createdAt: Date;
  } | null;
  debrief?: {
    id: string;
    markdown: string;
    sections: DebriefSection[];
    createdAt: Date;
  } | null;
}

export interface ListRecordingsOptions {
  page?: number;
  limit?: number;
  status?: RecordingStatus;
  date?: string; // YYYY-MM-DD format
  cursor?: string; // For cursor-based pagination
}

export interface PaginatedRecordings {
  data: Recording[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// Service Functions
// ============================================

/**
 * Create a new recording (status: pending, awaiting upload)
 */
export async function createRecording(data: CreateRecordingInput): Promise<Recording> {
  return db.recording.create({
    data: {
      userId: data.userId,
      title: data.title,
      mode: data.mode,
      status: 'pending',
      originalFilename: data.originalFilename,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      sessionId: data.sessionId,
      chunkIndex: data.chunkIndex,
    },
  });
}

/**
 * Mark recording as having received the S3 object key
 */
export async function setRecordingObjectKey(id: string, objectKey: string): Promise<Recording> {
  return db.recording.update({
    where: { id },
    data: { objectKey },
  });
}

/**
 * Mark upload as complete and change status to 'uploaded'
 */
export async function completeUpload(id: string, fileSize?: number): Promise<Recording> {
  return db.recording.update({
    where: { id },
    data: {
      status: 'uploaded',
      ...(fileSize !== undefined && { fileSize }),
    },
  });
}

/**
 * Get a single recording by ID with optional relations
 */
export async function getRecording(
  id: string,
  includeRelations = false
): Promise<RecordingWithRelations | null> {
  if (includeRelations) {
    const recording = await db.recording.findUnique({
      where: { id },
      include: {
        transcript: true,
        debrief: true,
      },
    });

    if (!recording) return null;

    // Transform Prisma JSON types to proper types
    return {
      ...recording,
      transcript: recording.transcript
        ? {
            ...recording.transcript,
            segments: recording.transcript.segments as TranscriptSegment[] | null,
          }
        : null,
      debrief: recording.debrief
        ? {
            ...recording.debrief,
            sections: recording.debrief.sections as DebriefSection[],
          }
        : null,
    } as RecordingWithRelations;
  }

  const recording = await db.recording.findUnique({
    where: { id },
  });

  return recording as RecordingWithRelations | null;
}

/**
 * Get a recording by ID, ensuring it belongs to the user
 */
export async function getRecordingByUser(
  id: string,
  userId: string,
  includeRelations = false
): Promise<RecordingWithRelations | null> {
  if (includeRelations) {
    const recording = await db.recording.findFirst({
      where: { id, userId },
      include: {
        transcript: true,
        debrief: true,
      },
    });

    if (!recording) return null;

    // Get error message from failed job if recording status is 'failed'
    let errorMessage: string | null = null;
    if (recording.status === 'failed') {
      const { getJobsByRecording } = await import('./jobs.service.js');
      const jobs = await getJobsByRecording(id);
      // Find the most recent failed job
      const failedJob = jobs
        .filter((job) => job.status === 'failed' && job.error)
        .sort((a, b) => {
          const aTime = a.completedAt || a.createdAt;
          const bTime = b.completedAt || b.createdAt;
          return bTime.getTime() - aTime.getTime();
        })[0];
      errorMessage = failedJob?.error || null;
    }

    // Session enrichment: when this recording is part of a session, the
    // per-chunk debrief is intentionally skipped (the session-level debrief
    // covers the whole conversation). Surface the session's debrief and
    // combined transcript on every chunk's detail response so the mobile
    // detail screen renders session content regardless of which chunk it's
    // pointed at.
    let mergedTranscript: RecordingWithRelations['transcript'] = recording.transcript
      ? {
          id: recording.transcript.id,
          text: recording.transcript.text,
          segments: recording.transcript.segments as TranscriptSegment[] | null,
          language: recording.transcript.language,
          createdAt: recording.transcript.createdAt,
        }
      : null;
    let mergedDebrief: RecordingWithRelations['debrief'] = recording.debrief
      ? {
          id: recording.debrief.id,
          markdown: recording.debrief.markdown,
          sections: recording.debrief.sections as DebriefSection[],
          createdAt: recording.debrief.createdAt,
        }
      : null;

    if (recording.sessionId) {
      const session = await db.session.findUnique({
        where: { id: recording.sessionId },
        select: {
          debriefMarkdown: true,
          debriefSections: true,
          recordings: {
            select: { id: true, chunkIndex: true, transcript: { select: { text: true } } },
            orderBy: { chunkIndex: 'asc' },
          },
        },
      });

      if (session?.debriefMarkdown) {
        mergedDebrief = {
          id: recording.id,
          markdown: session.debriefMarkdown,
          sections: (session.debriefSections ?? []) as DebriefSection[],
          createdAt: recording.createdAt,
        };
      }

      if (session?.recordings.length) {
        const combinedText = session.recordings
          .map((r) => r.transcript?.text)
          .filter((t): t is string => !!t)
          .join('\n\n');
        if (combinedText.length > 0) {
          mergedTranscript = mergedTranscript
            ? { ...mergedTranscript, text: combinedText }
            : {
                id: recording.id,
                text: combinedText,
                segments: null,
                language: 'en',
                createdAt: recording.createdAt,
              };
        }
      }
    }

    return {
      ...recording,
      errorMessage,
      transcript: mergedTranscript,
      debrief: mergedDebrief,
    } as RecordingWithRelations;
  }

  const recording = await db.recording.findFirst({
    where: { id, userId },
  });

  if (!recording) return null;

  // Get error message from failed job if recording status is 'failed'
  let errorMessage: string | null = null;
  if (recording.status === 'failed') {
    const { getJobsByRecording } = await import('./jobs.service.js');
    const jobs = await getJobsByRecording(id);
    // Find the most recent failed job
    const failedJob = jobs
      .filter((job) => job.status === 'failed' && job.error)
      .sort((a, b) => {
        const aTime = a.completedAt || a.createdAt;
        const bTime = b.completedAt || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      })[0];
    errorMessage = failedJob?.error || null;
  }

  return {
    ...recording,
    errorMessage,
  } as RecordingWithRelations;
}

/**
 * List recordings for a user with pagination
 */
export async function listRecordingsByUser(
  userId: string,
  options: ListRecordingsOptions = {}
): Promise<PaginatedRecordings> {
  const { page = 1, limit = 20, status, date, cursor } = options;
  const skip = (page - 1) * limit;

  // Hide session continuation chunks (chunkIndex > 1) from the list — only the
  // first chunk acts as the session entry. A 4-hour session produces ~240
  // chunk rows in the DB; without this filter, the user's recordings list
  // becomes unusable. The detail-fetch enrichment renders the session's
  // combined debrief on whichever chunk the user opens.
  const where: Prisma.RecordingWhereInput = {
    userId,
    OR: [{ chunkIndex: null }, { chunkIndex: 1 }],
    ...(status && { status }),
    ...(date &&
      (() => {
        // Parse date string (YYYY-MM-DD) and create date range for that day
        const [year, month, day] = date.split('-').map(Number);
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        return {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        };
      })()),
    ...(cursor && {
      id: {
        lt: cursor, // For cursor-based pagination (assuming descending order by createdAt)
      },
    }),
  };

  const [recordings, total] = await Promise.all([
    db.recording.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.recording.count({ where }),
  ]);

  return {
    data: recordings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update recording status
 */
export async function updateRecordingStatus(
  id: string,
  status: RecordingStatus
): Promise<Recording> {
  return db.recording.update({
    where: { id },
    data: { status },
  });
}

/**
 * Update recording metadata
 */
export async function updateRecording(
  id: string,
  data: Partial<Pick<Recording, 'title' | 'mode' | 'duration'>>
): Promise<Recording> {
  return db.recording.update({
    where: { id },
    data,
  });
}

/**
 * Save transcript for a recording
 */
export async function saveTranscript(
  recordingId: string,
  text: string,
  segments?: TranscriptSegment[],
  language = 'en'
): Promise<void> {
  await db.$transaction(async (tx) => {
    // Cast segments for Prisma JSON field
    const segmentsData = segments as unknown as Parameters<
      typeof tx.transcript.create
    >[0]['data']['segments'];

    // Upsert transcript
    await tx.transcript.upsert({
      where: { recordingId },
      create: {
        recordingId,
        text,
        segments: segmentsData,
        language,
      },
      update: {
        text,
        segments: segmentsData,
        language,
      },
    });

    // Update recording status if still processing
    await tx.recording.updateMany({
      where: {
        id: recordingId,
        status: 'processing',
      },
      data: {
        status: 'complete',
      },
    });
  });
}

/**
 * Save debrief for a recording
 */
export async function saveDebrief(
  recordingId: string,
  markdown: string,
  sections: DebriefSection[]
): Promise<void> {
  await db.debrief.upsert({
    where: { recordingId },
    create: {
      recordingId,
      markdown,
      sections,
    },
    update: {
      markdown,
      sections,
    },
  });
}

/**
 * Delete a recording and all related data
 */
export async function deleteRecording(id: string): Promise<Recording> {
  return db.recording.delete({
    where: { id },
  });
}

/**
 * Check if a recording exists and belongs to a user
 */
export async function recordingBelongsToUser(
  recordingId: string,
  userId: string
): Promise<boolean> {
  const count = await db.recording.count({
    where: { id: recordingId, userId },
  });
  return count > 0;
}

/**
 * Get pending recordings (for cleanup jobs)
 */
export async function getPendingRecordings(olderThanMinutes = 60): Promise<Recording[]> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  return db.recording.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
  });
}
