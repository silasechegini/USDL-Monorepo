import { describe, it, expect, vi, beforeEach } from "vitest";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import { createTelemetryPlugin } from "../index";
import type { RequestConfig } from "@udsl/core";

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

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: vi.fn(() => mockTracer),
  },
  context: {
    active: vi.fn(() => ({})),
  },
  propagation: {
    inject: vi.fn(),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

describe("TelemetryPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create plugin with default options", () => {
    const plugin = createTelemetryPlugin();

    expect(plugin.name).toBe("telemetry");
    expect(plugin.version).toBe("1.0.0");
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

    expect(plugin.name).toBe("telemetry");
    expect(plugin.version).toBe("1.0.0");
  });

  describe("beforeFetch hook", () => {
    it("should inject trace context into request headers", async () => {
      const plugin = createTelemetryPlugin();
      const config: RequestConfig = {
        url: "https://api.example.com/users",
        method: "GET",
        headers: { "Content-Type": "application/json" },
      };

      const result = await plugin.beforeFetch!(config);

      expect(result.headers).toHaveProperty("Content-Type", "application/json");
      expect(vi.mocked(trace.getTracer)).toHaveBeenCalledWith(
        "udsl-telemetry",
        "1.0.0",
      );
    });

    it("should handle missing headers gracefully", async () => {
      const plugin = createTelemetryPlugin();
      const config: RequestConfig = {
        url: "https://api.example.com/users",
        method: "GET",
      };

      const result = await plugin.beforeFetch!(config);

      expect(result).toBeDefined();
      expect(result.headers).toBeDefined();
    });
  });

  describe("afterFetch hook", () => {
    it("should record successful response", async () => {
      const plugin = createTelemetryPlugin();
      const response = new Response('{"data": "test"}', {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      });
      const config: RequestConfig = {
        url: "https://api.example.com/users",
        method: "GET",
      };

      const result = await plugin.afterFetch!(response, config);

      expect(result).toBe(response);
    });

    it("should handle error response", async () => {
      const plugin = createTelemetryPlugin();
      const response = new Response('{"error": "Not found"}', {
        status: 404,
        statusText: "Not Found",
      });
      const config: RequestConfig = {
        url: "https://api.example.com/users/999",
        method: "GET",
      };

      const result = await plugin.afterFetch!(response, config);

      expect(result).toBe(response);
    });
  });

  describe("cache hooks", () => {
    it("should handle cache hit", async () => {
      const plugin = createTelemetryPlugin();

      await plugin.onCacheHit!("users", { data: "cached" }, false);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "CACHE_HIT users",
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.operation": "cache_hit",
            "udsl.resource_key": "users",
            "udsl.cache.is_stale": false,
          }),
        }),
      );
    });

    it("should handle cache miss", async () => {
      const plugin = createTelemetryPlugin();

      await plugin.onCacheMiss!("products");

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "CACHE_MISS products",
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.operation": "cache_miss",
            "udsl.resource_key": "products",
          }),
        }),
      );
    });

    it("should handle revalidation start", async () => {
      const plugin = createTelemetryPlugin();

      await plugin.onRevalidationStart!("users");

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "REVALIDATION users",
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.operation": "background_revalidation",
            "udsl.resource_key": "users",
          }),
        }),
      );
    });

    it("should handle revalidation complete", async () => {
      const plugin = createTelemetryPlugin();

      // Start revalidation first
      await plugin.onRevalidationStart!("users");

      // Complete revalidation
      await plugin.onRevalidationComplete!("users", true);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe("operation hooks", () => {
    it("should handle operation start", async () => {
      const plugin = createTelemetryPlugin();
      const userData = { name: "John", email: "john@example.com" };

      await plugin.onOperationStart!("create", "users", userData);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "create users",
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.operation": "create",
            "udsl.resource_key": "users",
          }),
        }),
      );
    });

    it("should handle operation complete", async () => {
      const plugin = createTelemetryPlugin();
      const result = { id: 1, name: "John", email: "john@example.com" };

      // Start operation first
      await plugin.onOperationStart!("create", "users", {});

      // Complete operation
      await plugin.onOperationComplete!("create", "users", result);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe("custom span name formatter", () => {
    it("should use custom span name formatter", async () => {
      const plugin = createTelemetryPlugin({
        spanNameFormatter: (operation, resourceKey, method) => {
          return `CUSTOM_${operation}_${resourceKey}${
            method ? `_${method}` : ""
          }`;
        },
      });

      await plugin.onCacheHit!("users", { data: "cached" }, false);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        "CUSTOM_cache_hit_users",
        expect.any(Object),
      );
    });
  });

  describe("tracing options", () => {
    it("should skip cache operations when disabled", async () => {
      const plugin = createTelemetryPlugin({
        traceCacheOperations: false,
      });

      await plugin.onCacheHit!("users", { data: "cached" }, false);

      expect(mockTracer.startSpan).not.toHaveBeenCalled();
    });

    it("should trace cache operations when enabled", async () => {
      const plugin = createTelemetryPlugin({
        traceCacheOperations: true,
      });

      await plugin.onCacheHit!("users", { data: "cached" }, false);

      expect(mockTracer.startSpan).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle errors gracefully in hooks", async () => {
      // Mock tracer to throw error
      const errorTracer = {
        startSpan: vi.fn(() => {
          throw new Error("Tracer error");
        }),
      };
      vi.mocked(trace.getTracer).mockReturnValue(errorTracer);

      const plugin = createTelemetryPlugin();

      // Should not throw error
      expect(async () => {
        await plugin.onCacheHit!("users", { data: "cached" }, false);
      }).not.toThrow();
    });
  });
});
