import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanupDatabase,
  createTestUser,
  createTestRecording,
} from '../../__tests__/helpers/test-utils.js';
import {
  getOrCreateChatSession,
  getOrCreateRecordingChatSession,
  addChatMessage,
} from '../chat.service.js';

describe('Chat Service', () => {
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    testUser = await createTestUser();
  });

  describe('getOrCreateChatSession', () => {
    it('should create new daily session', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const session = await getOrCreateChatSession(testUser.id, today);

      expect(session).toMatchObject({
        userId: testUser.id,
        sessionDate: expect.any(Date),
        recordingId: null,
      });
    });

    it('should return existing session', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const session1 = await getOrCreateChatSession(testUser.id, today);
      const session2 = await getOrCreateChatSession(testUser.id, today);

      expect(session1.id).toBe(session2.id);
    });
  });

  describe('getOrCreateRecordingChatSession', () => {
    it('should create new recording-scoped session', async () => {
      const recording = await createTestRecording(testUser.id);
      const session = await getOrCreateRecordingChatSession(testUser.id, recording.id);

      expect(session).toMatchObject({
        userId: testUser.id,
        recordingId: recording.id,
        sessionDate: null,
      });
    });

    it('should return existing session', async () => {
      const recording = await createTestRecording(testUser.id);
      const session1 = await getOrCreateRecordingChatSession(testUser.id, recording.id);
      const session2 = await getOrCreateRecordingChatSession(testUser.id, recording.id);

      expect(session1.id).toBe(session2.id);
    });
  });

  describe('addChatMessage', () => {
    it('should add message to session', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const session = await getOrCreateChatSession(testUser.id, today);

      const message = await addChatMessage(session.id, 'user', 'Hello');

      expect(message).toMatchObject({
        sessionId: session.id,
        role: 'user',
        content: 'Hello',
      });
    });
  });
});
