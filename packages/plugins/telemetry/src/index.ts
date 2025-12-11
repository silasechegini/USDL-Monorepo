import type { UDSLPlugin } from "@udsl/core";
import {
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  type Span,
  SpanOptions,
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

/**
 * TelemetryPlugin provides comprehensive OpenTelemetry instrumentation for UDSL operations.
 *
 * This plugin automatically traces HTTP requests, cache operations, and custom UDSL operations,
 * providing distributed tracing capabilities and performance monitoring.
 *
 * @remarks
 * The plugin integrates with OpenTelemetry to create spans for:
 * - HTTP fetch requests (via beforeFetch/afterFetch hooks)
 * - Cache hits and misses
 * - Background revalidation operations
 * - Custom UDSL operations
 *
 * Spans are automatically managed with proper context propagation for distributed tracing.
 *
 * @example
 * ```typescript
 * const telemetry = new TelemetryPlugin({
 *   serviceName: 'my-service',
 *   serviceVersion: '1.0.0',
 *   traceCacheOperations: true
 * });
 *
 * // Trace a custom operation
 * await telemetry.traceOperation('data-fetch', 'user.123', async (span) => {
 *   // Your operation here
 *   return fetchUserData();
 * });
 *
 * // Trace cache operations
 * telemetry.traceCacheHit('user.123', false);
 * ```
 *
 * @implements {UDSLPlugin}
 */
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

  /**
   * Hook called before a fetch request is made.
   * Creates a span for the HTTP request and injects trace context into headers.
   *
   * @param url - The URL being fetched
   * @param init - The fetch request initialization options
   * @returns A promise that resolves when the span is created and context is injected
   *
   * @remarks
   * This method:
   * - Creates a CLIENT span for the HTTP request
   * - Adds HTTP method, URL, and resource key as span attributes
   * - Injects W3C trace context headers for distributed tracing
   * - Stores the span for later retrieval in afterFetch
   */
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
    const headers = new Headers(init.headers || {});
    propagation.inject(context.active(), headers, {
      set: (headers: Headers, key: string, value: string) =>
        headers.set(key, value),
    });
    init.headers = headers;

    // Add span context to the request
    context.with(trace.setSpan(context.active(), span), () => {
      span.addEvent("udsl.fetch.start", {
        "http.method": method,
        "http.url": url,
      });
    });
  }

  /**
   * Hook called after a fetch request completes.
   * Finalizes the span with response data and status.
   *
   * @param url - The URL that was fetched
   * @param response - The Response object returned by fetch
   * @param init - The RequestInit object used for the fetch request
   * @returns A promise that resolves when the span is finalized
   *
   * @remarks
   * This method:
   * - Retrieves the span created in beforeFetch using the RequestInit object
   * - Adds response status code, status text, and size as attributes
   * - Sets span status to OK or ERROR based on response.ok
   * - Adds success or error events with timestamps
   * - Ends the span
   *
   * The RequestInit parameter ensures correct span matching for concurrent requests
   * by using the WeakMap keyed by the RequestInit object.
   */
  async afterFetch(
    url: string,
    response: Response,
    init: RequestInit,
  ): Promise<void> {
    // Retrieve the corresponding span using the RequestInit object
    const span = this.activeSpans.get(init);
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
        });
      } else {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
        span.addEvent("udsl.fetch.error", {
          "http.status_code": response.status,
          "http.status_text": response.statusText,
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
      this.activeSpans.delete(init);
    }
  }

  /**
   * Traces a custom UDSL operation with automatic span lifecycle management.
   *
   * @template T - The return type of the operation function
   * @param operation - Name of the operation (e.g., 'cache', 'validate', 'transform')
   * @param resourceKey - Resource identifier for the operation
   * @param fn - Function to execute within the span context, receives the span as parameter
   * @param attributes - Additional attributes to add to the span
   * @returns A promise resolving to the result of the operation function
   *
   * @remarks
   * This method automatically:
   * - Creates an INTERNAL span with the specified operation name
   * - Manages span lifecycle (start, events, end)
   * - Records exceptions and sets error status on failure
   * - Adds start and success/error events with timestamps
   * - Propagates context to child operations
   *
   * @throws Re-throws any error from the operation function after recording it in the span
   *
   * @example
   * ```typescript
   * const result = await telemetry.traceOperation(
   *   'validate',
   *   'user.123',
   *   async (span) => {
   *     span.addEvent('validation.start');
   *     return validateUser(userId);
   *   },
   *   { 'validation.type': 'schema' }
   * );
   * ```
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
        span.addEvent(`udsl.${operation}.start`);
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        span.addEvent(`udsl.${operation}.success`);
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        span.recordException(error as Error);
        span.addEvent(`udsl.${operation}.error`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Creates a span for a cache hit operation.
   *
   * @param resourceKey - Resource identifier that was found in cache
   * @param isStale - Whether the cached data is stale (default: false)
   *
   * @remarks
   * Only creates a span if `traceCacheOperations` option is enabled.
   * The span is automatically ended after creation and event recording.
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
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  /**
   * Creates a span for a cache miss operation.
   *
   * @param resourceKey - Resource identifier that was not found in cache
   *
   * @remarks
   * Only creates a span if `traceCacheOperations` option is enabled.
   * The span is automatically ended after creation and event recording.
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
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  /**
   * Starts a span for background revalidation.
   *
   * @param resourceKey - Resource identifier being revalidated
   * @returns An open span that must be manually ended by the caller
   *
   * @remarks
   * **IMPORTANT**: This method returns an unmanaged span. The caller is responsible
   * for calling `span.end()` to prevent span leaks. Consider using
   * {@link traceBackgroundRevalidationComplete} for automatic span management.
   *
   * @example
   * ```typescript
   * const span = telemetry.traceBackgroundRevalidation('user.123');
   * try {
   *   await revalidateData();
   *   span.setStatus({ code: SpanStatusCode.OK });
   * } catch (error) {
   *   span.recordException(error);
   *   span.setStatus({ code: SpanStatusCode.ERROR });
   * } finally {
   *   span.end();
   * }
   * ```
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
    });

    return span;
  }

  /**
   * Traces a background revalidation operation with automatic span lifecycle management.
   *
   * @param spanName - Name for the span (will be formatted with spanNameFormatter)
   * @param resourceKey - Resource identifier being revalidated
   * @param operationFn - Function to execute within the span context
   * @param options - Optional span creation options
   * @returns The result of the operation function
   *
   * @remarks
   * This is a more robust alternative to {@link traceBackgroundRevalidation} that ensures
   * proper span lifecycle management. The span is automatically ended after the operation
   * completes or fails.
   *
   * Handles both synchronous and asynchronous operations correctly.
   *
   * @example
   * ```typescript
   * await telemetry.traceBackgroundRevalidationComplete(
   *   'user-data',
   *   'user.123',
   *   async (span) => {
   *     span.addEvent('fetching.fresh.data');
   *     return await fetchFreshData();
   *   }
   * );
   * ```
   */
  traceBackgroundRevalidationComplete(
    spanName: string,
    resourceKey: string,
    operationFn: (span: Span) => any,
    options?: SpanOptions,
  ): any {
    const optionsConstruct: SpanOptions = options || {
      kind: SpanKind.INTERNAL,
      attributes: {
        "udsl.operation": "background_revalidation",
        "udsl.resource_key": resourceKey,
        ...this.options.defaultAttributes,
      },
    };

    return this.tracer.startActiveSpan(
      this.options.spanNameFormatter("REVALIDATION", spanName),
      optionsConstruct,
      (span) => {
        try {
          // The current span is now active in the context for any child operations
          span.addEvent("udsl.revalidation.start", {
            "udsl.resource_key": resourceKey,
          });
          const result = operationFn(span);

          // Handle Promises/Async operations
          if (result instanceof Promise) {
            return result.finally(() => {
              span.end();
            });
          }

          // For synchronous operations, the span ends automatically after this block
          return result;
        } catch (error) {
          // Record exception and set status if an error occurs
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : "Unknown error",
          });
          throw error; // Re-throw the error for the caller to handle
        }
        // Note: For synchronous calls, the span.end() call is handled by the API's internal mechanics of startActiveSpan
      },
    );
  }

  /**
   * Gets the currently active span in the current execution context.
   *
   * @returns The active span, or undefined if no span is active
   *
   * @remarks
   * Uses OpenTelemetry's context API to retrieve the active span.
   * Useful for adding events or attributes to the current span.
   */
  getCurrentSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  /**
   * Creates a child span of the current active span.
   *
   * @param name - Name for the child span
   * @param attributes - Attributes to add to the child span
   * @returns A new child span
   *
   * @remarks
   * The created span is an INTERNAL span and includes default attributes
   * from the plugin configuration. The caller is responsible for ending this span.
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

  /**
   * Extracts a meaningful resource key from a URL.
   *
   * @param url - The URL to extract a resource key from
   * @returns A string identifier for the resource (e.g., 'api.users.123')
   * @private
   *
   * @remarks
   * Extraction strategy:
   * - For valid URLs: joins path segments with dots (e.g., '/api/users/123' → 'api.users.123')
   * - For root paths: uses the hostname
   * - For invalid URLs: generates a hash-based identifier to prevent collisions
   */
  private extractResourceKey(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Extract meaningful resource identifier from URL
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        return segments.join(".");
      }
      // Use host for root paths instead of "unknown"
      return urlObj.host || "unknown";
    } catch {
      // For invalid URLs, use a hash to prevent collisions
      const hash = this.hashString(url);
      return `invalid_url_${hash}`;
    }
  }

  /**
   * Generates a simple hash of a string.
   *
   * @param str - The string to hash
   * @returns A base-36 encoded hash string
   * @private
   *
   * @remarks
   * Uses a simple 32-bit hash algorithm for generating stable identifiers.
   * Not cryptographically secure, intended only for creating unique resource keys.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
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
export async function initializeOpenTelemetry(options: {
  serviceName: string;
  serviceVersion?: string;
  endpoint?: string;
  environment?: string;
}) {
  /**
   * This would typically be called at application startup
   * Although implementation would depend on the specific OpenTelemetry setup,
   * Here is a simple implementation using NodeSDK, which is common for Node.js apps.
   */

  let NodeSDK: any;
  let getNodeAutoInstrumentations: any;
  let OTLPTraceExporter: any;
  let Resource: any;

  try {
    const sdkModule = await import("@opentelemetry/sdk-node");
    NodeSDK = sdkModule.NodeSDK;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to import @opentelemetry/sdk-node. ${error.message}`,
      );
    }
    throw error;
  }

  try {
    const autoInstrumentations = await import(
      "@opentelemetry/auto-instrumentations-node"
    );
    getNodeAutoInstrumentations =
      autoInstrumentations.getNodeAutoInstrumentations;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to import @opentelemetry/auto-instrumentations-node. ${error.message}`,
      );
    }
    throw error;
  }

  // Import OTLP exporter if endpoint is provided
  if (options.endpoint) {
    try {
      const exporterModule = await import(
        "@opentelemetry/exporter-trace-otlp-http"
      );
      OTLPTraceExporter = exporterModule.OTLPTraceExporter;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to import @opentelemetry/exporter-trace-otlp-http. ${error.message}`,
        );
      }
      throw error;
    }
  }

  // Import Resource for environment configuration
  if (options.environment) {
    try {
      const resourceModule = await import("@opentelemetry/resources");
      Resource = resourceModule;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to import @opentelemetry/resources. ${error.message}`,
        );
      }
      throw error;
    }
  }

  const sdkConfig: any = {
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion || "1.0.0",
    instrumentations: [getNodeAutoInstrumentations()],
  };

  // Configure exporter if endpoint provided
  if (options.endpoint && OTLPTraceExporter) {
    sdkConfig.traceExporter = new OTLPTraceExporter({
      url: options.endpoint,
    });
  }

  // Add environment to resource attributes
  if (options.environment && Resource) {
    sdkConfig.resource = new Resource({
      "deployment.environment": options.environment,
    });
  }

  const sdk = new NodeSDK(sdkConfig);

  sdk.start();
}

export * from "@opentelemetry/api";
