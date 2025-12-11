import type { UDSLPlugin } from "@udsl/core";
import {
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Context,
} from "@opentelemetry/api";

export interface TelemetryPluginOptions {
  /** Service name for tracing */
  serviceName?: string;
  /** Service version for tracing */
  serviceVersion?: string;
  /** Custom span attributes to add to all spans */
  defaultAttributes?: Record<string, string | number | boolean>;
  /** Whether to trace cache operations */
  traceCacheOperations?: boolean;
  /** Whether to trace plugin executions */
  tracePluginExecution?: boolean;
  /** Custom span name formatter */
  spanNameFormatter?: (
    operation: string,
    resourceKey: string,
    method?: string,
  ) => string;
}

const DEFAULT_OPTIONS: Required<TelemetryPluginOptions> = {
  serviceName: "udsl-client",
  serviceVersion: "0.1.0",
  defaultAttributes: {},
  traceCacheOperations: true,
  tracePluginExecution: true,
  spanNameFormatter: (operation, resourceKey, method) =>
    method
      ? `${operation} ${resourceKey} ${method}`
      : `${operation} ${resourceKey}`,
};

export class TelemetryPlugin implements UDSLPlugin {
  private tracer;
  private options: Required<TelemetryPluginOptions>;
  private activeSpans = new WeakMap<any, Span>();

  constructor(options: TelemetryPluginOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.tracer = trace.getTracer(
      this.options.serviceName,
      this.options.serviceVersion,
    );
  }

  async beforeFetch(url: string, init: RequestInit): Promise<void> {
    const method = init.method || "GET";
    const resourceKey = this.extractResourceKey(url);

    // Create span for HTTP request
    const spanName = this.options.spanNameFormatter(
      "HTTP",
      resourceKey,
      method,
    );
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        "http.method": method,
        "http.url": url,
        "udsl.resource_key": resourceKey,
        "udsl.operation": "fetch",
        ...this.options.defaultAttributes,
      },
    });

    // Store span for later use
    this.activeSpans.set(init, span);

    // Inject trace context into headers for distributed tracing
    const headers = new Headers(init.headers);
    propagation.inject(context.active(), headers, {
      set: (headers: Headers, key: string, value: string) => headers.set(key, value),
    });
    init.headers = headers;

    // Add span context to the request
    context.with(trace.setSpan(context.active(), span), () => {
      span.addEvent("udsl.fetch.start", {
        "http.method": method,
        "http.url": url,
        timestamp: Date.now(),
      });
    });
  }

  async afterFetch(url: string, response: Response): Promise<void> {
    // Find the corresponding span
    const span = this.findActiveSpan(url);
    if (!span) return;

    try {
      // Add response attributes
      span.setAttributes({
        "http.status_code": response.status,
        "http.status_text": response.statusText,
        "http.response_size": response.headers.get("content-length") || "0",
      });

      // Add success/error events
      if (response.ok) {
        span.setStatus({ code: SpanStatusCode.OK });
        span.addEvent("udsl.fetch.success", {
          "http.status_code": response.status,
          timestamp: Date.now(),
        });
      } else {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
        span.addEvent("udsl.fetch.error", {
          "http.status_code": response.status,
          "http.status_text": response.statusText,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      span.recordException(error as Error);
    } finally {
      span.end();
    }
  }

  /**
   * Create spans for UDSL operations like cache hits, revalidation, etc.
   */
  traceOperation<T>(
    operation: string,
    resourceKey: string,
    fn: (span: Span) => Promise<T> | T,
    attributes: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    const spanName = this.options.spanNameFormatter(operation, resourceKey);
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        "udsl.operation": operation,
        "udsl.resource_key": resourceKey,
        ...this.options.defaultAttributes,
        ...attributes,
      },
    });

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        span.addEvent(`udsl.${operation}.start`, { timestamp: Date.now() });
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        span.addEvent(`udsl.${operation}.success`, { timestamp: Date.now() });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        span.recordException(error as Error);
        span.addEvent(`udsl.${operation}.error`, {
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Trace cache operations
   */
  traceCacheHit(resourceKey: string, isStale: boolean = false): void {
    if (!this.options.traceCacheOperations) return;

    const span = this.tracer.startSpan(
      this.options.spanNameFormatter("CACHE_HIT", resourceKey),
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          "udsl.operation": "cache_hit",
          "udsl.resource_key": resourceKey,
          "udsl.cache.is_stale": isStale,
          ...this.options.defaultAttributes,
        },
      },
    );

    span.addEvent("udsl.cache.hit", {
      "udsl.resource_key": resourceKey,
      "udsl.cache.is_stale": isStale,
      timestamp: Date.now(),
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  /**
   * Trace cache miss operations
   */
  traceCacheMiss(resourceKey: string): void {
    if (!this.options.traceCacheOperations) return;

    const span = this.tracer.startSpan(
      this.options.spanNameFormatter("CACHE_MISS", resourceKey),
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          "udsl.operation": "cache_miss",
          "udsl.resource_key": resourceKey,
          ...this.options.defaultAttributes,
        },
      },
    );

    span.addEvent("udsl.cache.miss", {
      "udsl.resource_key": resourceKey,
      timestamp: Date.now(),
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  /**
   * Trace background revalidation
   */
  traceBackgroundRevalidation(resourceKey: string): Span {
    const span = this.tracer.startSpan(
      this.options.spanNameFormatter("REVALIDATION", resourceKey),
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          "udsl.operation": "background_revalidation",
          "udsl.resource_key": resourceKey,
          ...this.options.defaultAttributes,
        },
      },
    );

    span.addEvent("udsl.revalidation.start", {
      "udsl.resource_key": resourceKey,
      timestamp: Date.now(),
    });

    return span;
  }

  /**
   * Get current active span
   */
  getCurrentSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  /**
   * Create a child span
   */
  createChildSpan(
    name: string,
    attributes: Record<string, string | number | boolean> = {},
  ): Span {
    return this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...this.options.defaultAttributes,
        ...attributes,
      },
    });
  }

  private extractResourceKey(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Extract meaningful resource identifier from URL
      const segments = pathname.split("/").filter(Boolean);
      return segments.length > 0 ? segments.join(".") : "unknown";
    } catch {
      return "unknown";
    }
  }

  private findActiveSpan(url: string): Span | undefined {
    // This is a simplified implementation
    // In a real scenario, you might need a more sophisticated way to match spans
    return trace.getActiveSpan();
  }
}

/**
 * Create a telemetry plugin with OpenTelemetry instrumentation
 */
export function createTelemetryPlugin(
  options: TelemetryPluginOptions = {},
): TelemetryPlugin {
  return new TelemetryPlugin(options);
}

/**
 * Helper to initialize OpenTelemetry with common settings
 */
export function initializeOpenTelemetry(options: {
  serviceName: string;
  serviceVersion?: string;
  endpoint?: string;
  environment?: string;
}) {
  // This would typically be called at application startup
  // Implementation would depend on the specific OpenTelemetry setup
  console.log("Initializing OpenTelemetry with options:", options);

  // Example initialization (would need actual OpenTelemetry SDK setup)
  /*
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  
  const sdk = new NodeSDK({
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion || '1.0.0',
    instrumentations: [getNodeAutoInstrumentations()],
  });
  
  sdk.start();
  */
}

export * from "@opentelemetry/api";
