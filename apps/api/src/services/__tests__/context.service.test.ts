import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanupDatabase,
  createTestUser,
  createTestRecording,
  createTestTranscript,
} from '../../__tests__/helpers/test-utils.js';
import { getDayContext, getRecordingContext } from '../context.service.js';

describe('Context Service', () => {
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

  describe('getDayContext', () => {
    it('should return empty context when no recordings exist', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = await getDayContext({ userId: testUser.id, date: today });

      expect(result).toMatchObject({
        context: '',
        recordingCount: 0,
        hasContent: false,
      });
    });

    it('should aggregate transcripts from day recordings', async () => {
      const today = new Date();
      const recording1 = await createTestRecording(testUser.id, {
        title: 'Recording 1',
        status: 'complete',
      });
      await createTestTranscript(recording1.id, { text: 'First transcript' });

      const recording2 = await createTestRecording(testUser.id, {
        title: 'Recording 2',
        status: 'complete',
      });
      await createTestTranscript(recording2.id, { text: 'Second transcript' });

      const result = await getDayContext({
        userId: testUser.id,
        date: today.toISOString().slice(0, 10),
      });

      expect(result.hasContent).toBe(true);
      expect(result.recordingCount).toBeGreaterThan(0);
      expect(result.context).toContain('First transcript');
      expect(result.context).toContain('Second transcript');
    });
  });

  describe('getRecordingContext', () => {
    it('should return context for recording with transcript', async () => {
      const recording = await createTestRecording(testUser.id, { status: 'complete' });
      await createTestTranscript(recording.id, { text: 'Test transcript text' });

      const result = await getRecordingContext(recording.id, testUser.id);

      expect(result.hasContent).toBe(true);
      expect(result.context).toContain('Test transcript text');
    });

    it('should return empty context for recording without transcript', async () => {
      const recording = await createTestRecording(testUser.id);

      const result = await getRecordingContext(recording.id, testUser.id);

      expect(result.hasContent).toBe(false);
    });
  });
});
