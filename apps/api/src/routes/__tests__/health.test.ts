import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestApp,
  closeTestApp,
  setupTestDatabase,
  teardownTestDatabase,
} from '../../__tests__/helpers/test-utils.js';

describe('Health Routes', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
    await teardownTestDatabase();
  });

  describe('GET /api/health', () => {
    it('should return 200 with health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: 'ok',
        service: 'twin-api',
        version: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /api/ready', () => {
    it('should return 200 with readiness checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: expect.stringMatching(/^(ok|degraded|unhealthy)$/),
        service: 'twin-api',
        version: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        checks: expect.objectContaining({
          database: expect.objectContaining({
            status: expect.stringMatching(/^(healthy|unhealthy|degraded)$/),
          }),
          redis: expect.objectContaining({
            status: expect.stringMatching(/^(healthy|unhealthy|degraded)$/),
          }),
        }),
      });
    });
  });

  describe('GET /api/health/detailed', () => {
    it('should return detailed health info in test environment', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health/detailed',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: expect.stringMatching(/^(ok|degraded|unhealthy)$/),
        service: 'twin-api',
        version: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        checks: expect.any(Object),
        config: expect.objectContaining({
          environment: 'test',
          port: expect.any(Number),
          rateLimit: expect.any(Object),
          maxUploadSizeMB: expect.any(Number),
          transcriptionProvider: expect.any(String),
        }),
        memory: expect.objectContaining({
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
          rss: expect.any(Number),
        }),
      });
    });
  });
});
