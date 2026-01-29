declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      API_PORT?: string;
      API_HOST?: string;
      CORS_ORIGIN?: string;
      DATABASE_URL: string;

      // S3-compatible storage (AWS S3, Cloudflare R2, MinIO)
      S3_BUCKET: string;
      S3_REGION: string;
      S3_ACCESS_KEY_ID: string;
      S3_SECRET_ACCESS_KEY: string;
      S3_ENDPOINT?: string;

      // Redis (for BullMQ)
      REDIS_URL: string;

      // Transcription Provider: 'deepgram' (default) | 'openai' | 'whisper-local' | 'mock'
      TRANSCRIPTION_PROVIDER?: string;
      
      // Deepgram (recommended for production)
      DEEPGRAM_API_KEY?: string;

      // OpenAI (Whisper API + GPT for debrief)
      OPENAI_API_KEY: string;

      // Local Whisper (optional, for on-premise)
      WHISPER_MODEL_PATH?: string;
      WHISPER_BINARY_PATH?: string;

      // Rate Limiting
      RATE_LIMIT_MAX?: string;
      RATE_LIMIT_WINDOW_MS?: string;

      // Upload Limits
      MAX_UPLOAD_SIZE_MB?: string;

      // Optional server-side transcoding
      ENABLE_FFMPEG_TRANSCODE?: string;

      // Sentry (Error Tracking)
      SENTRY_DSN?: string;
      SENTRY_ENVIRONMENT?: string;

      // OpenTelemetry
      OTEL_ENABLED?: string;
      OTEL_SERVICE_NAME?: string;
      OTEL_EXPORTER_OTLP_ENDPOINT?: string;

      // Health Check
      HEALTH_CHECK_TOKEN?: string;
    }
  }
}

export {};
