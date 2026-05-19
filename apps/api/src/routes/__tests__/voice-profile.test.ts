import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  createTestApp,
  closeTestApp,
  setupTestDatabase,
  teardownTestDatabase,
  cleanupDatabase,
  createTestUser,
  getAuthHeaders,
  getTestDb,
} from '../../__tests__/helpers/test-utils.js';

// Mock the diarization service
vi.mock('node-fetch', () => {
  return {
    default: vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ embedding: new Array(512).fill(0.1) }),
      })
    ),
  };
});

describe('Voice Profile Routes', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    testUser = await createTestUser();
  });

  describe('GET /api/voice-profile/status', () => {
    it('should return false when user has no voice profile', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/voice-profile/status',
        headers: getAuthHeaders(testUser.id),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        hasVoiceProfile: false,
      });
    });

    it('should return true when user has voice profile', async () => {
      const testDb = getTestDb();
      await testDb.user.update({
        where: { id: testUser.id },
        data: {
          hasVoiceProfile: true,
          voiceEmbedding: new Array(512).fill(0.1),
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/voice-profile/status',
        headers: getAuthHeaders(testUser.id),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        hasVoiceProfile: true,
      });
    });

    it('should reject request without user ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/voice-profile/status',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('DELETE /api/voice-profile', () => {
    it('should delete voice profile', async () => {
      // Create voice profile first
      const testDb = getTestDb();
      await testDb.user.update({
        where: { id: testUser.id },
        data: {
          hasVoiceProfile: true,
          voiceEmbedding: new Array(512).fill(0.1),
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/voice-profile',
        headers: getAuthHeaders(testUser.id),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: true,
        message: 'Voice profile deleted successfully',
      });

      // Verify it's deleted
      const db = getTestDb();
      const user = await db.user.findUnique({
        where: { id: testUser.id },
        select: { hasVoiceProfile: true },
      });
      expect(user?.hasVoiceProfile).toBe(false);
    });

    it('should reject request without user ID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/voice-profile',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
