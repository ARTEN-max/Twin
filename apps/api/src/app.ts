import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { healthRoutes } from './routes/health.js';
import { recordingsRoutes } from './routes/recordings.js';
import { voiceProfileRoutes } from './routes/voice-profile.js';
import { chatRoutes } from './routes/chat.js';
import { meRoutes } from './routes/me.js';
import { webhookRoutes } from './routes/webhooks.js';
import { sessionsRoutes } from './routes/sessions.js';
import { disconnectDb } from './lib/db.js';
import { disconnectRedis } from './lib/redis.js';
import { getEnv, isProduction } from './lib/env.js';
import { initSentry, flushSentry, registerSentryHooks } from './lib/sentry.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerUploadGuard } from './plugins/upload-guard.js';
import { registerRequestLogger } from './plugins/request-logger.js';
import { registerFirebaseAuth } from './plugins/firebase-auth.js';

function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function buildApp() {
  const env = getEnv();

  // Initialize Sentry
  initSentry();

  const app = Fastify({
    logger: {
      level: isProduction() ? 'info' : 'debug',
      transport: !isProduction()
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      // Structured logging configuration
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          hostname: req.hostname,
          remoteAddress: req.ip,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      // Redact sensitive fields
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
        censor: '[REDACTED]',
      },
    },
    // Request ID generation
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    // Body size limit
    bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  });

  // Add content type parser for audio files (for proxy upload endpoint)
  app.addContentTypeParser(
    [
      'audio/webm',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/x-caf', // iOS Core Audio Format
      'audio/flac',
    ],
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // Register error tracking hooks
  registerSentryHooks(app);

  // Register plugins
  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGIN);
  await app.register(cors, {
    origin: (origin, cb) => {
      // allow non-browser tools (no origin header)
      if (!origin) return cb(null, true);
      // Allow all if explicitly configured (not recommended for prod)
      if (allowedOrigins.includes('*')) return cb(null, true);

      // In dev, allow localhost and Tauri origins
      if (!isProduction()) {
        if (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:') ||
          origin.startsWith('tauri://') ||
          origin.startsWith('https://tauri.localhost') ||
          origin === 'null'
        ) {
          // Tauri sometimes sends null origin
          return cb(null, true);
        }
      }

      const ok = allowedOrigins.includes(origin);
      cb(null, ok);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-User-ID'],
  });

  await app.register(helmet, {
    contentSecurityPolicy: isProduction() ? undefined : false,
  });

  await app.register(sensible);

  // Register multipart for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    },
  });

  // Register rate limiting
  await registerRateLimit(app);

  // Register upload guard
  await registerUploadGuard(app);

  // Register enhanced request logging
  await registerRequestLogger(app);

  // Register Firebase auth middleware (must be before routes)
  await registerFirebaseAuth(app);

  // Register routes
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(meRoutes, { prefix: '/api' });
  await app.register(recordingsRoutes, { prefix: '/api' });
  await app.register(voiceProfileRoutes);
  await app.register(chatRoutes, { prefix: '/api' });
  await app.register(sessionsRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/api' });

  // Global error handler
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Log the error
    request.log.error({
      type: 'unhandled_error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      statusCode,
    });

    // Send appropriate response
    if (statusCode >= 500) {
      // Don't leak internal errors in production
      reply.status(statusCode).send({
        error: 'Internal Server Error',
        message: isProduction() ? 'An unexpected error occurred' : error.message,
        statusCode,
      });
    } else {
      reply.status(statusCode).send({
        error: error.name,
        message: error.message,
        statusCode,
      });
    }
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received shutdown signal, closing gracefully...');

    try {
      // Close server (stop accepting new connections)
      await app.close();

      // Flush Sentry events
      await flushSentry();

      // Close Redis connections
      await disconnectRedis();

      // Close database connections
      await disconnectDb();

      app.log.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Unhandled rejection handler
  process.on('unhandledRejection', (reason, promise) => {
    app.log.error({ reason, promise }, 'Unhandled promise rejection');
  });

  // Uncaught exception handler
  process.on('uncaughtException', (error) => {
    app.log.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  return app;
}
