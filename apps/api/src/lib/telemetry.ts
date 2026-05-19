import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, type Span, type SpanStatusCode, type SpanKind } from '@opentelemetry/api';

// ============================================
// OpenTelemetry Setup
// ============================================

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry SDK
 * Call this BEFORE importing other modules for auto-instrumentation to work
 */
export function initTelemetry(): void {
  if (isInitialized) return;

  // Check if telemetry is enabled
  const enabled = process.env.OTEL_ENABLED === 'true';
  if (!enabled) {
    console.log('ℹ️  OpenTelemetry disabled (set OTEL_ENABLED=true to enable)');
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'twin-api';
  const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  // Configure exporter
  const traceExporter = exporterEndpoint
    ? new OTLPTraceExporter({ url: `${exporterEndpoint}/v1/traces` })
    : undefined;

  // Create SDK
  sdk = new NodeSDK({
    serviceName,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Configure HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) => {
            // Ignore health checks
            const url = request.url || '';
            return url.includes('/health') || url.includes('/ready');
          },
        },
      }),
    ],
  });

  // Start SDK
  sdk.start();
  isInitialized = true;

  console.log(`✅ OpenTelemetry initialized (service: ${serviceName})`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk?.shutdown().catch(console.error);
  });
}

/**
 * Shutdown OpenTelemetry SDK
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
    isInitialized = false;
  }
}

// ============================================
// Tracing Helpers
// ============================================

/**
 * Get the tracer for creating custom spans
 */
export function getTracer(name = 'twin-api') {
  return trace.getTracer(name);
}

/**
 * Create a span for a custom operation
 */
export function createSpan(
  name: string,
  fn: (span: Span) => Promise<void> | void,
  options?: { kind?: SpanKind; attributes?: Record<string, string | number | boolean> }
): Promise<void> {
  const tracer = getTracer();

  return tracer.startActiveSpan(name, { kind: options?.kind }, async (span) => {
    if (options?.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        span.setAttribute(key, value);
      }
    }

    try {
      await fn(span);
      span.end();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2 as SpanStatusCode }); // ERROR
      span.end();
      throw error;
    }
  });
}

/**
 * Add attributes to the current active span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }
}

/**
 * Record an event on the current active span
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Mark the current span as having an error
 */
export function recordSpanError(error: Error): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: 2 as SpanStatusCode, message: error.message });
  }
}
