import { describe, it, expect, vi, beforeEach } from "vitest";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { createTelemetryPlugin, TelemetryPlugin } from "../index";

// Mock OpenTelemetry API
const mockSpan = {
  setAttributes: vi.fn(),
  addEvent: vi.fn(),
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

const mockTracer = {
  startSpan: vi.fn(() => mockSpan),
};

vi.mock("@opentelemetry/api", async () => {
  const actual = await vi.importActual("@opentelemetry/api");
  return {
    ...actual,
    trace: {
      getTracer: vi.fn(() => mockTracer),
      getActiveSpan: vi.fn(() => mockSpan),
      setSpan: vi.fn((ctx, span) => ctx),
    },
    context: {
      active: vi.fn(() => ({})),
      with: vi.fn((ctx, fn) => fn()),
    },
    propagation: {
      inject: vi.fn(),
    },
  };
});

describe("TelemetryPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create plugin with default options", () => {
    const plugin = createTelemetryPlugin();

    expect(plugin).toBeInstanceOf(TelemetryPlugin);
  });

  it("should create plugin with custom options", () => {
    const plugin = createTelemetryPlugin({
      serviceName: "test-service",
      serviceVersion: "2.0.0",
      defaultAttributes: {
        env: "test",
        team: "frontend",
      },
    });

    expect(plugin).toBeInstanceOf(TelemetryPlugin);
  });

  describe("beforeFetch hook", () => {
    it("should inject trace context into request headers", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users";
      const init: RequestInit = {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      };

      await plugin.beforeFetch!(url, init);

      expect(vi.mocked(trace.getTracer)).toHaveBeenCalled();
      expect(mockTracer.startSpan).toHaveBeenCalled();
    });

    it("should handle missing headers gracefully", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users";
      const init: RequestInit = {
        method: "GET",
      };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalled();
    });
  });

  describe("afterFetch hook", () => {
    it("should record successful response", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users";
      const response = new Response('{"data": "test"}', {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      });

      await plugin.afterFetch!(url, response);

      expect(mockSpan.setAttributes).toHaveBeenCalled();
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });

    it("should handle error response", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users/999";
      const response = new Response('{"error": "Not found"}', {
        status: 404,
        statusText: "Not Found",
      });

      await plugin.afterFetch!(url, response);

      expect(mockSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ code: SpanStatusCode.ERROR }),
      );
    });
  });

  describe("cache hooks", () => {
    it("should handle cache hit", () => {
      const plugin = createTelemetryPlugin();

      plugin.traceCacheHit("users", false);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.stringContaining("users"),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.operation": "cache_hit",
            "udsl.resource_key": "users",
            "udsl.cache.is_stale": false,
          }),
        }),
      );
    });

    it("should handle cache miss", () => {
      const plugin = createTelemetryPlugin();

      plugin.traceCacheMiss("products");

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.stringContaining("products"),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.operation": "cache_miss",
            "udsl.resource_key": "products",
          }),
        }),
      );
    });

    it("should handle revalidation", () => {
      const plugin = createTelemetryPlugin();

      const span = plugin.traceBackgroundRevalidation("users");

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.stringContaining("users"),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.operation": "background_revalidation",
            "udsl.resource_key": "users",
          }),
        }),
      );
      expect(span).toBeDefined();
    });
  });

  describe("operation tracing", () => {
    it("should trace custom operations", async () => {
      const plugin = createTelemetryPlugin();
      const mockFn = vi.fn().mockResolvedValue({ success: true });

      const result = await plugin.traceOperation(
        "custom_sync",
        "users",
        mockFn,
      );

      expect(mockTracer.startSpan).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalledWith(mockSpan);
      expect(result).toEqual({ success: true });
    });

    it("should handle operation errors", async () => {
      const plugin = createTelemetryPlugin();
      const error = new Error("Operation failed");
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(
        plugin.traceOperation("failing_op", "users", mockFn),
      ).rejects.toThrow("Operation failed");

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ code: SpanStatusCode.ERROR }),
      );
    });
  });

  describe("custom span name formatter", () => {
    it("should use custom span name formatter", () => {
      const plugin = createTelemetryPlugin({
        spanNameFormatter: (operation, resourceKey, method) => {
          return `CUSTOM_${operation}_${resourceKey}${
            method ? `_${method}` : ""
          }`;
        },
      });

      plugin.traceCacheHit("users", false);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "CUSTOM_CACHE_HIT_users",
        expect.any(Object),
      );
    });
  });

  describe("tracing options", () => {
    it("should skip cache operations when disabled", () => {
      const plugin = createTelemetryPlugin({
        traceCacheOperations: false,
      });

      plugin.traceCacheHit("users", false);

      expect(mockTracer.startSpan).not.toHaveBeenCalled();
    });

    it("should trace cache operations when enabled", () => {
      const plugin = createTelemetryPlugin({
        traceCacheOperations: true,
      });

      plugin.traceCacheHit("users", false);

      expect(mockTracer.startSpan).toHaveBeenCalled();
    });
  });

  describe("span creation", () => {
    it("should create child spans", () => {
      const plugin = createTelemetryPlugin();

      const span = plugin.createChildSpan("custom_operation", {
        "custom.attribute": "value",
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "custom_operation",
        expect.objectContaining({
          attributes: expect.objectContaining({
            "custom.attribute": "value",
          }),
        }),
      );
      expect(span).toBeDefined();
    });

    it("should get current span", () => {
      const plugin = createTelemetryPlugin();

      const span = plugin.getCurrentSpan();

      expect(vi.mocked(trace.getActiveSpan)).toHaveBeenCalled();
      expect(span).toBeDefined();
    });
  });
});
