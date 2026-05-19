/**
 * Worker Process Entry Point
 *
 * Run this separately from the API server to process background jobs.
 *
 * Usage:
 *   pnpm --filter=@twin/api dev:worker   # Development
 *   node dist/worker.js                      # Production
 */

// Load environment variables first (must run before other imports that read process.env)
import './lib/load-env.js';

// Initialize telemetry before other imports (required for auto-instrumentation)
import { initTelemetry } from './lib/telemetry.js';
initTelemetry();

// Now import the rest
import { startAllWorkers, stopAllWorkers, closeAllQueues } from './queues/index.js';
import { disconnectDb } from './lib/db.js';
import { disconnectRedis } from './lib/redis.js';
import { validateEnv, getEnv } from './lib/env.js';
import { initSentry, flushSentry, captureException } from './lib/sentry.js';

console.log('🔧 Twin Worker Process Starting...\n');

// Validate environment configuration
console.log('📋 Validating environment configuration...');
validateEnv();
console.log('✅ Environment configuration valid\n');

const env = getEnv();

// Initialize Sentry
initSentry();

console.log('========================================');
console.log(`🔧 Twin Worker Process`);
console.log(`   Environment: ${env.NODE_ENV}`);
console.log(`   Transcription Provider: ${env.TRANSCRIPTION_PROVIDER}`);
console.log(`   Telemetry: ${env.OTEL_ENABLED ? 'enabled' : 'disabled'}`);
console.log(`   Sentry: ${env.SENTRY_DSN ? 'enabled' : 'disabled'}`);
console.log('========================================\n');

// Start workers
startAllWorkers();

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`\n📥 Received ${signal}, shutting down gracefully...`);

  try {
    // Stop processing new jobs
    await stopAllWorkers();

    // Close queue connections
    await closeAllQueues();

    // Flush Sentry events
    await flushSentry();

    // Disconnect from Redis
    await disconnectRedis();

    // Disconnect from database
    await disconnectDb();

    console.log('👋 Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    if (error instanceof Error) {
      captureException(error, { phase: 'shutdown', signal });
      await flushSentry();
    }
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  captureException(error, { phase: 'uncaughtException' });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  if (reason instanceof Error) {
    captureException(reason, { phase: 'unhandledRejection' });
  }
  shutdown('unhandledRejection');
});

console.log('✅ Worker process ready and listening for jobs');
