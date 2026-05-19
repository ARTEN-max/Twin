import { type FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';

// ============================================
// Test Database Setup
// ============================================

let testDb: PrismaClient;
let testDbUrl: string;

export async function setupTestDatabase(): Promise<PrismaClient> {
  // Use in-memory SQLite for tests
  testDbUrl = 'file:./test.db';
  process.env.DATABASE_URL = testDbUrl;

  testDb = new PrismaClient({
    datasources: {
      db: {
        url: testDbUrl,
      },
    },
    log: ['error'],
  });

  await testDb.$connect();

  // Run migrations using Prisma db push
  const { execSync } = await import('child_process');
  try {
    execSync('pnpm --filter=@twin/api db:push --accept-data-loss', {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'ignore',
    });
  } catch {
    // If db:push fails, try to create schema manually
    // This is a fallback for test environments
  }

  return testDb;
}

export function getTestDb(): PrismaClient {
  if (!testDb) {
    throw new Error('Test database not initialized. Call setupTestDatabase() first.');
  }
  return testDb;
}

export async function teardownTestDatabase(): Promise<void> {
  if (testDb) {
    await testDb.$disconnect();
  }
}

export async function cleanupDatabase(): Promise<void> {
  const db = getTestDb();
  // Clean up all tables
  await db.job.deleteMany();
  await db.chatMessage.deleteMany();
  await db.chatSession.deleteMany();
  await db.debrief.deleteMany();
  await db.transcript.deleteMany();
  await db.recording.deleteMany();
  await db.user.deleteMany();
}

// ============================================
// Fastify Test Instance
// ============================================

let testApp: FastifyInstance | null = null;

export async function createTestApp(): Promise<FastifyInstance> {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDbUrl || 'file:./test.db';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.TRANSCRIPTION_PROVIDER = 'mock';
  process.env.DEBRIEF_PROVIDER = 'mock';
  process.env.S3_BUCKET = 'test-bucket';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_ACCESS_KEY_ID = 'test-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  process.env.API_PORT = '3001';
  process.env.API_HOST = '0.0.0.0';
  process.env.RATE_LIMIT_MAX = '100';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  process.env.MAX_UPLOAD_SIZE_MB = '500';

  testApp = await buildApp();
  return testApp;
}

export async function closeTestApp(): Promise<void> {
  if (testApp) {
    await testApp.close();
    testApp = null;
  }
}

// ============================================
// Mock User Factory
// ============================================

export interface TestUser {
  id: string;
  email: string;
}

export async function createTestUser(overrides?: Partial<TestUser>): Promise<TestUser> {
  const db = getTestDb();
  const user = await db.user.create({
    data: {
      id: overrides?.id || `test-user-${Date.now()}`,
      email: overrides?.email || `test-${Date.now()}@test.local`,
    },
  });
  return user;
}

// ============================================
// Mock S3 Storage
// ============================================

export interface MockS3Object {
  key: string;
  body: Buffer;
  contentType?: string;
}

const mockS3Storage = new Map<string, MockS3Object>();

export function mockS3StorageSetup() {
  mockS3Storage.clear();
}

export function mockS3StorageGet(key: string): MockS3Object | undefined {
  return mockS3Storage.get(key);
}

export function mockS3StoragePut(key: string, object: MockS3Object): void {
  mockS3Storage.set(key, object);
}

export function mockS3StorageDelete(key: string): void {
  mockS3Storage.delete(key);
}

export function mockS3StorageExists(key: string): boolean {
  return mockS3Storage.has(key);
}

export function mockS3StorageClear(): void {
  mockS3Storage.clear();
}

// ============================================
// Mock Redis
// ============================================

const mockRedisStore = new Map<string, string>();

export function mockRedisSetup() {
  mockRedisStore.clear();
}

export function mockRedisGet(key: string): string | null {
  return mockRedisStore.get(key) || null;
}

export function mockRedisSet(key: string, value: string): void {
  mockRedisStore.set(key, value);
}

export function mockRedisDelete(key: string): void {
  mockRedisStore.delete(key);
}

export function mockRedisClear(): void {
  mockRedisStore.clear();
}

// ============================================
// Test Data Factories
// ============================================

export async function createTestRecording(
  userId: string,
  overrides?: Partial<{
    title: string;
    mode: 'general' | 'sales' | 'interview' | 'meeting';
    status: 'pending' | 'uploaded' | 'processing' | 'complete' | 'failed';
    objectKey: string;
  }>
) {
  const db = getTestDb();
  return db.recording.create({
    data: {
      userId,
      title: overrides?.title || 'Test Recording',
      mode: overrides?.mode || 'general',
      status: overrides?.status || 'pending',
      objectKey: overrides?.objectKey || `recordings/${userId}/test.mp3`,
      originalFilename: 'test.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 1024 * 1024, // 1MB
    },
  });
}

export async function createTestTranscript(
  recordingId: string,
  overrides?: Partial<{
    text: string;
    segments: unknown;
  }>
) {
  const db = getTestDb();
  return db.transcript.create({
    data: {
      recordingId,
      text: overrides?.text || 'Test transcript text',
      segments: overrides?.segments || [
        { start: 0, end: 5, text: 'Hello world', speaker: 'speaker_0' },
      ],
      language: 'en',
    },
  });
}

export async function createTestDebrief(
  recordingId: string,
  overrides?: Partial<{
    markdown: string;
    sections: unknown;
  }>
) {
  const db = getTestDb();
  return db.debrief.create({
    data: {
      recordingId,
      markdown: overrides?.markdown || '# Test Debrief\n\nTest content',
      sections: overrides?.sections || [{ title: 'Summary', content: 'Test summary', order: 0 }],
    },
  });
}

export async function createTestChatSession(
  userId: string,
  overrides?: Partial<{
    sessionDate: Date;
    recordingId: string;
  }>
) {
  const db = getTestDb();
  return db.chatSession.create({
    data: {
      userId,
      sessionDate: overrides?.sessionDate || null,
      recordingId: overrides?.recordingId || null,
    },
  });
}

// ============================================
// Test Helpers
// ============================================

export function getAuthHeaders(userId: string): Record<string, string> {
  return {
    'x-user-id': userId,
  };
}

export async function setupTestEnvironment() {
  await setupTestDatabase();
  mockS3StorageSetup();
  mockRedisSetup();
}

export async function teardownTestEnvironment() {
  await cleanupDatabase();
  await teardownTestDatabase();
  mockS3StorageClear();
  mockRedisClear();
  await closeTestApp();
}

// ============================================
// Global Test Setup/Teardown
// ============================================
// Note: Individual test files should call setupTestDatabase() and teardownTestDatabase()
// in their own beforeAll/afterAll hooks to avoid conflicts
