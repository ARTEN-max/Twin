import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateEnv, isProduction, isDevelopment, isTest, resetValidatedEnv } from '../env.js';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    resetValidatedEnv();
  });

  it('should validate environment with required fields', () => {
    Reflect.deleteProperty(process.env, 'NODE_ENV');
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY_ID = 'test-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret';

    const env = validateEnv();

    expect(env.DATABASE_URL).toBe('file:./test.db');
    expect(env.S3_BUCKET).toBe('test-bucket');
    expect(env.NODE_ENV).toBe('development');
  });

  it('should use default values for optional fields', () => {
    Reflect.deleteProperty(process.env, 'NODE_ENV');
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY_ID = 'test-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret';

    const env = validateEnv();

    expect(env.API_PORT).toBe(3001);
    expect(env.TRANSCRIPTION_PROVIDER).toBe('mock');
    expect(env.DEBRIEF_PROVIDER).toBe('mock');
  });

  it('should detect production environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY_ID = 'test-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
    process.env.REDIS_URL = 'redis://localhost:6379';

    validateEnv();

    expect(isProduction()).toBe(true);
    expect(isDevelopment()).toBe(false);
    expect(isTest()).toBe(false);
  });

  it('should detect test environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY_ID = 'test-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret';

    validateEnv();

    expect(isTest()).toBe(true);
    expect(isProduction()).toBe(false);
  });
});
