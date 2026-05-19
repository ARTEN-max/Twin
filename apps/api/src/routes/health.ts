import type { FastifyPluginAsync } from 'fastify';
import { checkDbConnection } from '../lib/db.js';
import { checkRedisConnection } from '../lib/redis.js';
import { getEnv, isProduction } from '../lib/env.js';

// ============================================
// Types
// ============================================

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks?: Record<string, HealthCheck>;
}

// ============================================
// Health Check Helpers
// ============================================

const startTime = Date.now();

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const healthy = await checkDbConnection();
    return {
      status: healthy ? 'healthy' : 'unhealthy',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const healthy = await checkRedisConnection();
    return {
      status: healthy ? 'healthy' : 'unhealthy',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function getOverallStatus(checks: Record<string, HealthCheck>): 'ok' | 'degraded' | 'unhealthy' {
  const statuses = Object.values(checks).map((c) => c.status);

  if (statuses.every((s) => s === 'healthy')) {
    return 'ok';
  }

  if (statuses.some((s) => s === 'unhealthy')) {
    // If critical services are down, return unhealthy
    const criticalServices = ['database', 'redis'];
    for (const service of criticalServices) {
      if (checks[service]?.status === 'unhealthy') {
        return 'unhealthy';
      }
    }
    return 'degraded';
  }

  return 'degraded';
}

// ============================================
// Routes
// ============================================

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const env = getEnv();

  /**
   * GET /health
   *
   * Basic liveness probe - returns 200 if the server is running.
   * Does NOT check dependencies (use /ready for that).
   *
   * Use for: Kubernetes liveness probe, load balancer health check
   */
  app.get('/health', async () => {
    const response: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'twin-api',
      version: process.env.npm_package_version || '0.0.1',
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };

    return response;
  });

  /**
   * GET /ready
   *
   * Readiness probe - checks all dependencies.
   * Returns 200 only if all critical dependencies are healthy.
   *
   * Use for: Kubernetes readiness probe, deployment verification
   */
  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, HealthCheck> = {
      database: await checkDatabase(),
      redis: await checkRedis(),
    };

    const overallStatus = getOverallStatus(checks);
    const httpStatus = overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'twin-api',
      version: process.env.npm_package_version || '0.0.1',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
    };

    return reply.status(httpStatus).send(response);
  });

  /**
   * GET /health/detailed
   *
   * Detailed health information including configuration.
   * Only available in non-production or with auth.
   */
  app.get('/health/detailed', async (request, reply) => {
    // In production, require some form of auth
    if (isProduction()) {
      const authHeader = request.headers['x-health-token'];
      const expectedToken = process.env.HEALTH_CHECK_TOKEN;

      if (!expectedToken || authHeader !== expectedToken) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Health check token required in production',
        });
      }
    }

    const checks: Record<string, HealthCheck> = {
      database: await checkDatabase(),
      redis: await checkRedis(),
    };

    const overallStatus = getOverallStatus(checks);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'twin-api',
      version: process.env.npm_package_version || '0.0.1',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
      config: {
        environment: env.NODE_ENV,
        port: env.API_PORT,
        rateLimit: {
          max: env.RATE_LIMIT_MAX,
          windowMs: env.RATE_LIMIT_WINDOW_MS,
        },
        maxUploadSizeMB: env.MAX_UPLOAD_SIZE_MB,
        transcriptionProvider: env.TRANSCRIPTION_PROVIDER,
        telemetryEnabled: env.OTEL_ENABLED,
        sentryEnabled: !!env.SENTRY_DSN,
      },
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    };
  });
};
