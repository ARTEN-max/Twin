import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from './env.js';

// ============================================
// S3 Client Configuration
// ============================================

function createS3Client(): S3Client {
  const env = getEnv();

  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };

  // For S3-compatible services (R2, MinIO)
  if (env.S3_ENDPOINT) {
    config.endpoint = env.S3_ENDPOINT;
    config.forcePathStyle = true; // Required for MinIO
  }

  return new S3Client(config);
}

// Singleton client
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = createS3Client();
  }
  return s3Client;
}

// ============================================
// Configuration
// ============================================

function getBucket(): string {
  return getEnv().S3_BUCKET;
}

const UPLOAD_EXPIRES_IN = 60 * 60; // 1 hour for uploads
const DOWNLOAD_EXPIRES_IN = 60 * 60 * 24; // 24 hours for downloads

// Allowed audio MIME types
const ALLOWED_MIME_TYPES = [
  'audio/mpeg',      // .mp3
  'audio/wav',       // .wav
  'audio/webm',      // .webm
  'audio/ogg',       // .ogg
  'audio/mp4',       // .mp4 audio
  'audio/m4a',       // .m4a
  'audio/x-m4a',     // .m4a (alternative)
  'audio/flac',      // .flac
];

// ============================================
// Types
// ============================================

export interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresIn: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a unique object key for audio files
 * Format: recordings/{userId}/{recordingId}/{timestamp}-{filename}
 */
export function generateObjectKey(
  userId: string,
  recordingId: string,
  filename: string
): string {
  const sanitizedFilename = filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .substring(0, 100);
  const timestamp = Date.now();
  return `recordings/${userId}/${recordingId}/${timestamp}-${sanitizedFilename}`;
}

/**
 * Validate MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/flac': 'flac',
  };
  return mimeToExt[mimeType] || 'audio';
}

// ============================================
// Presigned URL Functions
// ============================================

/**
 * Generate a presigned URL for uploading a file to S3
 * Client uploads directly to S3, bypassing the server
 */
export async function getPresignedUploadUrl(
  userId: string,
  recordingId: string,
  mimeType: string,
  filename?: string
): Promise<PresignedUploadResult> {
  // Validate MIME type
  if (!isAllowedMimeType(mimeType)) {
    throw new Error(`Invalid MIME type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  const finalFilename = filename ?? `recording.${getExtensionFromMimeType(mimeType)}`;

  const objectKey = generateObjectKey(userId, recordingId, finalFilename);
  const client = getS3Client();
  const bucket = getBucket();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimeType,
    Metadata: {
      'user-id': userId,
      'recording-id': recordingId,
      'original-filename': finalFilename,
    },
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: UPLOAD_EXPIRES_IN,
  });

  return {
    uploadUrl,
    objectKey,
    expiresIn: UPLOAD_EXPIRES_IN,
  };
}

/**
 * Generate a presigned URL for downloading a file from S3
 */
export async function getPresignedDownloadUrl(
  objectKey: string
): Promise<PresignedDownloadResult> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  const downloadUrl = await getSignedUrl(client, command, {
    expiresIn: DOWNLOAD_EXPIRES_IN,
  });

  return {
    downloadUrl,
    expiresIn: DOWNLOAD_EXPIRES_IN,
  };
}

/**
 * Check if an object exists in S3
 */
export async function objectExists(objectKey: string): Promise<boolean> {
  const client = getS3Client();
  const bucket = getBucket();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get object metadata from S3
 */
export async function getObjectMetadata(objectKey: string): Promise<{
  contentLength: number;
  contentType: string;
  metadata: Record<string, string>;
} | null> {
  const client = getS3Client();
  const bucket = getBucket();

  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })
    );

    return {
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType ?? 'application/octet-stream',
      metadata: response.Metadata ?? {},
    };
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete an object from S3
 */
export async function deleteObject(objectKey: string): Promise<void> {
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    })
  );
}
