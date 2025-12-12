# UDSL OpenTelemetry Plugin

The UDSL OpenTelemetry Plugin provides comprehensive observability and tracing for your UDSL-powered applications. It automatically instruments all UDSL operations with OpenTelemetry spans, enabling you to trace data flow, monitor performance, and debug issues across your application.

## Features

- 🔍 **Distributed Tracing** - Full request tracing with W3C trace context propagation
- ⚡ **Performance Monitoring** - Automatic timing and performance metrics
- 🎯 **Cache Observability** - Trace cache hits, misses, and revalidation events
- 🔄 **SWR Tracing** - Monitor stale-while-revalidate patterns and background operations
- 📊 **Custom Metrics** - Add custom attributes and events to spans
- 🚨 **Error Tracking** - Automatic error capture and span status management
- 🏷️ **Resource Tagging** - Automatic resource identification and labeling
- 🔌 **Extensible** - Customize span names, attributes, and tracing behavior

## Installation

```bash
pnpm add @udsl/plugin-telemetry @opentelemetry/api
pnpm add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

## Quick Start

### 1. Initialize OpenTelemetry

```typescript
// telemetry.ts - Initialize this BEFORE importing UDSL
/**
 * The plugin includes a helper function (`initializeOpenTelemetry`) that can be used
 * if you prefer a simplified initialization approach rather than setting up your own configuration.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const sdk = new NodeSDK({
  serviceName: "my-udsl-app",
  serviceVersion: "1.0.0",
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

### 2. Add Telemetry Plugin to UDSL

```typescript
// udsl-setup.ts
import { createUDSL } from "@udsl/core";
import { createTelemetryPlugin } from "@udsl/plugin-telemetry";

const telemetryPlugin = createTelemetryPlugin({
  serviceName: "my-udsl-app",
  serviceVersion: "1.0.0",
  defaultAttributes: {
    "app.environment": process.env.NODE_ENV || "development",
    "app.version": "1.0.0",
  },
});

const udsl = createUDSL({
  resources: {
    users: {
      get: "https://api.example.com/users",
      cache: 300,
    },
    posts: {
      get: "https://api.example.com/posts",
      post: "https://api.example.com/posts",
      cache: 180,
    },
  },
});

udsl.registerPlugin(telemetryPlugin);

export { udsl };
```

### 3. All Operations Are Now Traced

```typescript
// Every UDSL operation creates spans automatically
const users = await udsl.fetchResource("users");
// Creates spans: "HTTP users GET", "CACHE_MISS users", etc.

const newPost = await udsl.createResource("posts", { title: "Hello World" });
// Creates spans: "create posts", "HTTP posts POST", etc.
```

## Configuration Options

### TelemetryPluginOptions

```typescript
interface TelemetryPluginOptions {
  /** Service name for tracing (default: 'udsl-client') */
  serviceName?: string;

  /** Service version for tracing (default: '0.1.0') */
  serviceVersion?: string;

  /** Custom span attributes added to all spans */
  defaultAttributes?: Record<string, string | number | boolean>;

  /** Whether to trace cache operations (default: true) */
  traceCacheOperations?: boolean;

  /** Whether to trace plugin executions (default: true) */
  tracePluginExecution?: boolean;

  /** Custom span name formatter */
  spanNameFormatter?: (
    operation: string,
    resourceKey: string,
    method?: string,
  ) => string;
}
```

### Example Configuration

```typescript
const telemetryPlugin = createTelemetryPlugin({
  serviceName: "ecommerce-frontend",
  serviceVersion: "2.1.0",
  defaultAttributes: {
    "service.environment": "production",
    "service.team": "frontend",
    "app.feature": "product-catalog",
  },
  traceCacheOperations: true,
  tracePluginExecution: true,
  spanNameFormatter: (operation, resourceKey, method) => {
    return `${operation.toUpperCase()}_${resourceKey}${
      method ? `_${method}` : ""
    }`;
  },
});
```

## Automatic Instrumentation

### HTTP Requests

Every HTTP request creates a span with:

```
Span Name: "HTTP users GET"
Attributes:
  - http.method: "GET"
  - http.url: "https://api.example.com/users"
  - http.status_code: 200
  - udsl.resource_key: "users"
  - udsl.operation: "fetch"

Events:
  - udsl.fetch.start
  - udsl.fetch.success (or udsl.fetch.error)
```

### Cache Operations

Cache hits and misses create spans:

```
Span Name: "CACHE_HIT users"
Attributes:
  - udsl.operation: "cache_hit"
  - udsl.resource_key: "users"
  - udsl.cache.is_stale: false

Events:
  - udsl.cache.hit
```

### Background Revalidation

SWR background operations are traced:

```
Span Name: "REVALIDATION users"
Attributes:
  - udsl.operation: "background_revalidation"
  - udsl.resource_key: "users"

Events:
  - udsl.revalidation.start
  - udsl.revalidation.success
```

### CRUD Operations

All mutations create operation spans:

```
Span Name: "create posts"
Attributes:
  - udsl.operation: "create"
  - udsl.resource_key: "posts"

Child spans include HTTP requests and cache invalidation
```

## Manual Tracing

### Custom Operation Tracing

```typescript
// Get telemetry plugin instance
const telemetryPlugin = udsl.getPlugin(TelemetryPlugin);

// Trace custom operations
await telemetryPlugin.traceOperation("custom_sync", "users", async (span) => {
  span.setAttributes({
    "sync.type": "full",
    "sync.batch_size": 100,
  });

  // Your custom logic here
  const result = await synchronizeUsers();

  span.addEvent("sync.completed", {
    "sync.records_processed": result.count,
    timestamp: Date.now(),
  });

  return result;
});
```

### Creating Child Spans

```typescript
import { SpanStatusCode } from '@opentelemetry/api';

const telemetryPlugin = udsl.getPlugin(TelemetryPlugin);

// Create child span for detailed tracing
const childSpan = telemetryPlugin.createChildSpan("data_transformation", {
  "transform.type": "user_profile",
  "transform.version": "2.0",
});

try {
  // Transform data
  const transformedData = transformUserData(rawData);

  childSpan.setAttributes({
    "transform.input_size": rawData.length,
    "transform.output_size": transformedData.length,
  });

  childSpan.setStatus({ code: SpanStatusCode.OK });
  return transformedData;
} catch (error) {
  childSpan.recordException(error);
  childSpan.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  throw error;
} finally {
  childSpan.end();
}
```

## React Integration

### Tracing React Components

```tsx
import { useEffect } from "react";
import { useData } from "@udsl/react-adapter";
import { trace } from "@opentelemetry/api";

function UserProfile({ userId }: { userId: string }) {
  const { data: user, loading, error } = useData("user", { id: userId });

  useEffect(() => {
    // Create custom span for component lifecycle
    const tracer = trace.getTracer("react-components");
    const span = tracer.startSpan("UserProfile.mount", {
      attributes: {
        "component.name": "UserProfile",
        "user.id": userId,
      },
    });

    span.addEvent("component.mounted");

    return () => {
      span.addEvent("component.unmounted");
      span.end();
    };
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}
```

### Tracing User Interactions

```tsx
import { trace } from "@opentelemetry/api";

function CreateUserForm() {
  const createUser = useCreate("users");

  const handleSubmit = async (userData) => {
    const tracer = trace.getTracer("user-interactions");
    const span = tracer.startSpan("user.create_form_submit", {
      attributes: {
        "form.type": "create_user",
        "user.role": userData.role,
      },
    });

    try {
      span.addEvent("form.validation_start");
      validateUserData(userData);
      span.addEvent("form.validation_success");

      span.addEvent("api.request_start");
      const result = await createUser.mutate({ data: userData });
      span.addEvent("api.request_success");

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  };

  // ... form JSX
}
```

## Advanced Features

### Distributed Tracing

The plugin automatically propagates trace context across HTTP requests:

```typescript
// Parent service creates trace
const users = await udsl.fetchResource("users");

// HTTP request includes trace headers:
// traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
// tracestate: congo=t61rcWkgMzE
```

### Custom Exporters

Configure different exporters for different environments:

```typescript
// Development - Console exporter
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";

// Production - OTLP exporter to observability platform
import { OTLPTraceExporter } from "@opentelemetry/exporter-otlp-http";

const exporter =
  process.env.NODE_ENV === "production"
    ? new OTLPTraceExporter({
        url: "https://api.honeycomb.io/v1/traces",
        headers: {
          "x-honeycomb-team": process.env.HONEYCOMB_API_KEY,
          "x-honeycomb-dataset": "udsl-traces",
        },
      })
    : new ConsoleSpanExporter();
```

### Sampling Configuration

Configure sampling for production performance:

```typescript
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";

const sdk = new NodeSDK({
  serviceName: "my-udsl-app",
  sampler: new TraceIdRatioBasedSampler(0.1), // Sample 10% of traces
  instrumentations: [getNodeAutoInstrumentations()],
});
```

## Observability Platforms

### Jaeger

```typescript
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";

const jaegerExporter = new JaegerExporter({
  endpoint: "http://localhost:14268/api/traces",
});
```

### Honeycomb

```typescript
import { OTLPTraceExporter } from "@opentelemetry/exporter-otlp-http";

const honeycombExporter = new OTLPTraceExporter({
  url: "https://api.honeycomb.io/v1/traces",
  headers: {
    "x-honeycomb-team": process.env.HONEYCOMB_API_KEY,
    "x-honeycomb-dataset": "udsl-app",
  },
});
```

### DataDog

```typescript
import { DatadogSpanProcessor, DatadogExporter } from "dd-trace/opentelemetry";

const datadogExporter = new DatadogExporter({
  service: "my-udsl-app",
  env: "production",
});
```

### New Relic

```typescript
import { OTLPTraceExporter } from "@opentelemetry/exporter-otlp-http";

const newRelicExporter = new OTLPTraceExporter({
  url: "https://otlp.nr-data.net:4318/v1/traces",
  headers: {
    "api-key": process.env.NEW_RELIC_LICENSE_KEY,
  },
});
```

## Performance Considerations

### Sampling Strategies

```typescript
// Head-based sampling (decide at trace start)
const headSampler = new TraceIdRatioBasedSampler(0.05); // 5% of traces

// Custom sampling based on operation
class UDSLSampler implements Sampler {
  shouldSample(context, traceId, spanName, spanKind, attributes) {
    // Always sample errors
    if (attributes["error"]) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLE };
    }

    // Higher sampling for cache misses
    if (spanName.includes("CACHE_MISS")) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLE };
    }

    // Lower sampling for cache hits
    if (spanName.includes("CACHE_HIT")) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    // Default sampling
    return { decision: SamplingDecision.RECORD_AND_SAMPLE };
  }
}
```

### Batch Processing

```typescript
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const spanProcessor = new BatchSpanProcessor(exporter, {
  maxExportBatchSize: 512,
  maxQueueSize: 2048,
  scheduledDelayMillis: 5000,
});
```

## Troubleshooting

### Common Issues

1. **No traces appearing**

   ```typescript
   // Ensure initialization happens before UDSL import
   import "./telemetry"; // Must be first
   import { createUDSL } from "@udsl/core";
   ```

2. **Missing trace context**

   ```typescript
   // Ensure headers are properly set
   const headers = new Headers(init.headers);
   propagation.inject(context.active(), headers);
   ```

3. **Performance impact**
   ```typescript
   // Use appropriate sampling rates
   const sampler = new TraceIdRatioBasedSampler(0.01); // 1% in production
   ```

### Debug Mode

```typescript
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

// Enable debug logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
```

## Best Practices

1. **Service Naming**: Use consistent service names across your architecture
2. **Attribute Standards**: Follow OpenTelemetry semantic conventions
3. **Sampling**: Start with low sampling rates in production (1-5%)
4. **Error Handling**: Always record exceptions in spans
5. **Resource Limits**: Configure appropriate queue and batch sizes
6. **Context Propagation**: Ensure trace context flows through async operations

## Contributing

This plugin is part of the UDSL monorepo. See the main repository README for contribution guidelines.

## License

MIT License - see the main repository for details.
