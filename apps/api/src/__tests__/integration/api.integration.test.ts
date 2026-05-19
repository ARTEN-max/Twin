import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  createTestApp,
  closeTestApp,
  setupTestDatabase,
  teardownTestDatabase,
  cleanupDatabase,
  createTestUser,
  getAuthHeaders,
  mockS3StorageSetup,
  mockS3StoragePut,
  mockS3StorageExists,
} from '../../__tests__/helpers/test-utils.js';

// Mock transcription and debrief providers
vi.mock('../../lib/ai/transcription', () => ({
  transcribeUrl: vi.fn(() =>
    Promise.resolve({
      text: 'Test transcript text',
      segments: [{ start: 0, end: 5, text: 'Test transcript text' }],
      language: 'en',
      duration: 5,
    })
  ),
}));

vi.mock('../../lib/ai/debrief', () => ({
  generateDebrief: vi.fn(() =>
    Promise.resolve({
      markdown: '# Test Debrief\n\nTest content',
      sections: [{ title: 'Summary', content: 'Test summary', order: 0 }],
    })
  ),
}));

describe('API Integration Tests', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
    mockS3StorageSetup();
  });

  afterAll(async () => {
    await closeTestApp();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    mockS3StorageSetup();
    testUser = await createTestUser();
  });

  describe('Recording Upload Flow', () => {
    it('should complete full upload flow', async () => {
      // Step 1: Create recording
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/recordings',
        headers: getAuthHeaders(testUser.id),
        payload: {
          title: 'Integration Test Recording',
          mode: 'general',
          mimeType: 'audio/mpeg',
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const { recordingId, objectKey } = JSON.parse(createResponse.body).data;

      // Step 2: Mock S3 upload (simulate file upload)
      mockS3StoragePut(objectKey, {
        key: objectKey,
        body: Buffer.from('test audio data'),
        contentType: 'audio/mpeg',
      });
      mockS3StorageExists(objectKey);

      // Step 3: Complete upload
      const completeResponse = await app.inject({
        method: 'POST',
        url: `/api/recordings/${recordingId}/complete-upload`,
        headers: getAuthHeaders(testUser.id),
        payload: {
          fileSize: 1024,
        },
      });

      expect(completeResponse.statusCode).toBe(200);
      const completeBody = JSON.parse(completeResponse.body);
      expect(completeBody.data.status).toBe('processing');

      // Step 4: Verify recording status
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/recordings/${recordingId}`,
        headers: getAuthHeaders(testUser.id),
      });

      expect(getResponse.statusCode).toBe(200);
      const recording = JSON.parse(getResponse.body).data;
      expect(recording.status).toBe('processing');
    });
  });

  describe('Chat Session Flow', () => {
    it('should create and use chat session', async () => {
      const today = new Date().toISOString().slice(0, 10);

      // Create session
      const sessionResponse = await app.inject({
        method: 'GET',
        url: `/api/chat/session?date=${today}`,
        headers: getAuthHeaders(testUser.id),
      });

      expect(sessionResponse.statusCode).toBe(200);
      const session = JSON.parse(sessionResponse.body);
      expect(session.sessionId).toBeDefined();
      expect(session.messages).toEqual([]);
    });
  });
});
