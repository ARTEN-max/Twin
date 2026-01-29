import { z } from 'zod';

function extractOpenAIKey(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  // If someone accidentally pasted a command or extra text, grab the first sk- token.
  const match = trimmed.match(/sk-[A-Za-z0-9_-]{10,}/);
  return match?.[0] ?? trimmed;
}

/**
 * Environment Configuration with Zod Validation
 * 
 * Validates all environment variables at startup.
 * Fails fast with clear error messages if configuration is invalid.
 */

// ============================================
// Environment Schema
// ============================================

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // API Server
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Redis
  REDIS_URL: z.string().url().startsWith('redis://').or(z.string().url().startsWith('rediss://')),

  // S3-compatible Storage
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),

  // AI Services
  OPENAI_API_KEY: z.preprocess(
    extractOpenAIKey,
    z
      .string()
      .trim()
      .startsWith('sk-')
      .min(20, 'OPENAI_API_KEY looks invalid (expected something like sk-... )')
  ),
  TRANSCRIPTION_PROVIDER: z.enum(['deepgram', 'openai', 'whisper-local', 'mock']).default('deepgram'),
  DEBRIEF_PROVIDER: z.enum(['openai', 'mock']).default('openai'),
  DEEPGRAM_API_KEY: z.string().min(1).optional(),

  // Local Whisper (optional)
  WHISPER_MODEL_PATH: z.string().optional(),
  WHISPER_BINARY_PATH: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // Upload Limits
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(500),

  // Optional server-side transcoding (for MediaRecorder webm/ogg compatibility)
  ENABLE_FFMPEG_TRANSCODE: z.coerce.boolean().default(false),

  // Sentry (optional)
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),

  // OpenTelemetry (optional)
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_SERVICE_NAME: z.string().default('komuchi-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

// ============================================
// Type Exports
// ============================================

export type Env = z.infer<typeof envSchema>;

// ============================================
// Validation
// ============================================

let validatedEnv: Env | null = null;

/**
 * Validate and parse environment variables
 * Call this at application startup
 */
export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment validation failed:');
    console.error('');

    const errors = result.error.flatten();
    
    // Field errors
    for (const [field, messages] of Object.entries(errors.fieldErrors)) {
      console.error(`  ${field}:`);
      messages?.forEach((msg) => console.error(`    - ${msg}`));
    }

    // Form errors
    if (errors.formErrors.length > 0) {
      console.error('  General errors:');
      errors.formErrors.forEach((msg) => console.error(`    - ${msg}`));
    }

    console.error('');
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  // Additional validation for provider-specific requirements
  const env = result.data;

  if (env.TRANSCRIPTION_PROVIDER === 'deepgram' && !env.DEEPGRAM_API_KEY) {
    console.error('❌ DEEPGRAM_API_KEY is required when TRANSCRIPTION_PROVIDER=deepgram');
    process.exit(1);
  }

  validatedEnv = env;
  return env;
}

/**
 * Get validated environment (must call validateEnv first)
 */
export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return getEnv().NODE_ENV === 'test';
}
