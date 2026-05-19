/**
 * Recording Model Tests
 *
 * Tests for parsing API responses into RecordingSummary and RecordingDetail models.
 */

import { toRecordingSummary, toRecordingDetail } from '@twin/shared';

describe('Recording Models', () => {
  describe('toRecordingSummary', () => {
    it('should convert API response to RecordingSummary', () => {
      const apiResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: '2026-02-15T10:30:00Z',
        duration: 120,
        status: 'complete',
        title: 'Test Recording',
        debrief: { id: 'deb-123' },
        transcript: { id: 'trans-123' },
      };

      const summary = toRecordingSummary(apiResponse);

      expect(summary.id).toBe(apiResponse.id);
      expect(summary.createdAt).toBe(apiResponse.createdAt);
      expect(summary.durationSec).toBe(120);
      expect(summary.status).toBe('complete');
      expect(summary.title).toBe('Test Recording');
      expect(summary.hasDebrief).toBe(true);
      expect(summary.hasTranscript).toBe(true);
    });

    it('should handle null title and missing relations', () => {
      const apiResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: new Date('2026-02-15T10:30:00Z'),
        duration: null,
        status: 'processing',
        title: null,
        debrief: null,
        transcript: null,
      };

      const summary = toRecordingSummary(apiResponse);

      expect(summary.title).toBeUndefined();
      expect(summary.durationSec).toBeNull();
      expect(summary.hasDebrief).toBe(false);
      expect(summary.hasTranscript).toBe(false);
      expect(summary.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    });
  });

  describe('toRecordingDetail', () => {
    it('should convert API response with transcript and debrief', () => {
      const apiResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: '2026-02-15T10:30:00Z',
        duration: 120,
        status: 'complete',
        title: 'Test Recording',
        transcript: {
          text: 'Hello world',
          segments: [
            {
              start: 0,
              end: 2,
              text: 'Hello',
              speaker: 'speaker_0',
            },
            {
              start: 2,
              end: 5,
              text: 'world',
              speaker: 'speaker_0',
            },
          ],
          language: 'en',
        },
        debrief: {
          markdown: '# Summary\n\nThis is a test.',
        },
      };

      const detail = toRecordingDetail(apiResponse);

      expect(detail.id).toBe(apiResponse.id);
      expect(detail.transcript).not.toBeNull();
      expect(detail.transcript?.text).toBe('Hello world');
      expect(detail.transcript?.segments).toHaveLength(2);
      expect(detail.transcript?.segments[0].startMs).toBe(0);
      expect(detail.transcript?.segments[0].endMs).toBe(2000);
      expect(detail.transcript?.segments[0].speaker).toBe('speaker_0');
      expect(detail.debriefMarkdown).toBe('# Summary\n\nThis is a test.');
      expect(detail.speakers).toEqual(['speaker_0']);
    });

    it('should handle missing transcript and debrief gracefully', () => {
      const apiResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: '2026-02-15T10:30:00Z',
        duration: null,
        status: 'processing',
        title: null,
        transcript: null,
        debrief: null,
      };

      const detail = toRecordingDetail(apiResponse);

      expect(detail.transcript).toBeNull();
      expect(detail.debriefMarkdown).toBeNull();
      expect(detail.speakers).toBeUndefined();
    });

    it('should convert segment timestamps from seconds to milliseconds', () => {
      const apiResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: '2026-02-15T10:30:00Z',
        duration: 10,
        status: 'complete',
        title: 'Test',
        transcript: {
          text: 'Test',
          segments: [
            {
              start: 1.5,
              end: 3.7,
              text: 'Test segment',
              speaker: 'speaker_0',
            },
          ],
        },
        debrief: null,
      };

      const detail = toRecordingDetail(apiResponse);

      expect(detail.transcript?.segments[0].startMs).toBe(1500);
      expect(detail.transcript?.segments[0].endMs).toBe(3700);
    });
  });
});
