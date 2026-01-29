import type { Prisma, Recording, RecordingStatus, RecordingMode } from '@prisma/client';
import { db } from '../lib/db.js';
import type { TranscriptSegment, DebriefSection } from '@komuchi/shared';

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
    },
  });
}

/**
 * Mark recording as having received the S3 object key
 */
export async function setRecordingObjectKey(
  id: string,
  objectKey: string
): Promise<Recording> {
  return db.recording.update({
    where: { id },
    data: { objectKey },
  });
}

/**
 * Mark upload as complete and change status to 'uploaded'
 */
export async function completeUpload(
  id: string,
  fileSize?: number
): Promise<Recording> {
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

  const recording = await db.recording.findFirst({
    where: { id, userId },
  });

  return recording as RecordingWithRelations | null;
}

/**
 * List recordings for a user with pagination
 */
export async function listRecordingsByUser(
  userId: string,
  options: ListRecordingsOptions = {}
): Promise<PaginatedRecordings> {
  const { page = 1, limit = 20, status } = options;
  const skip = (page - 1) * limit;

  const where: Prisma.RecordingWhereInput = {
    userId,
    ...(status && { status }),
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
    const segmentsData = segments as unknown as Parameters<typeof tx.transcript.create>[0]['data']['segments'];

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
export async function getPendingRecordings(
  olderThanMinutes = 60
): Promise<Recording[]> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  
  return db.recording.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
  });
}
