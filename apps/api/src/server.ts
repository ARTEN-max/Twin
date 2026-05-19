/**
 * Twin API Server Entry Point
 *
 * Initialization order:
 * 1. Load environment variables
 * 2. Initialize OpenTelemetry (must be before other imports for auto-instrumentation)
 * 3. Validate environment configuration
 * 4. Build and start the application
 */

// Load environment variables first (must run before other imports that read process.env)
import './lib/load-env.js';

// Initialize telemetry before other imports (required for auto-instrumentation)
import { initTelemetry } from './lib/telemetry.js';
initTelemetry();

// Now import the rest
import { buildApp } from './app.js';
import { validateEnv, getEnv } from './lib/env.js';

async function start() {
  console.log('🔧 Starting Twin API server...\n');

  // Validate environment configuration
  console.log('📋 Validating environment configuration...');
  validateEnv();
  console.log('✅ Environment configuration valid\n');

  const env = getEnv();

  // Build the application
  const app = await buildApp();

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });

    console.log('\n========================================');
    console.log(`🚀 Twin API server started`);
    console.log(`   URL: http://${env.API_HOST}:${env.API_PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Rate Limit: ${env.RATE_LIMIT_MAX} req/${env.RATE_LIMIT_WINDOW_MS}ms`);
    console.log(`   Max Upload: ${env.MAX_UPLOAD_SIZE_MB}MB`);
    console.log(`   Telemetry: ${env.OTEL_ENABLED ? 'enabled' : 'disabled'}`);
    console.log(`   Sentry: ${env.SENTRY_DSN ? 'enabled' : 'disabled'}`);
    console.log('========================================\n');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
