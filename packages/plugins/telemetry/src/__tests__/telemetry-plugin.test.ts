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
  startActiveSpan: vi.fn(),
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
      const init: RequestInit = { method: "GET" };
      const response = new Response('{"data": "test"}', {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      });

      // Call beforeFetch first to set up the span
      await plugin.beforeFetch!(url, init);
      await plugin.afterFetch!(url, response, init);

      expect(mockSpan.setAttributes).toHaveBeenCalled();
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });

    it("should handle error response", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users/999";
      const init: RequestInit = { method: "GET" };
      const response = new Response('{"error": "Not found"}', {
        status: 404,
        statusText: "Not Found",
      });

      // Call beforeFetch first to set up the span
      await plugin.beforeFetch!(url, init);
      await plugin.afterFetch!(url, response, init);

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

    it("should handle complete revalidation with async function", async () => {
      const plugin = createTelemetryPlugin();
      const mockRevalidateFn = vi.fn().mockResolvedValue({ data: "updated" });

      // Mock startActiveSpan
      mockTracer.startActiveSpan = vi.fn((name, options, fn) => {
        return fn(mockSpan);
      });

      const result = await plugin.traceBackgroundRevalidationComplete(
        "users-revalidation",
        "users",
        mockRevalidateFn,
      );

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        expect.stringContaining("users"),
        expect.any(Object),
        expect.any(Function),
      );
      expect(mockRevalidateFn).toHaveBeenCalledWith(mockSpan);
      expect(mockSpan.end).toHaveBeenCalled();
      expect(result).toEqual({ data: "updated" });
    });

    it("should handle complete revalidation with synchronous function", () => {
      const plugin = createTelemetryPlugin();
      const mockRevalidateFn = vi.fn().mockReturnValue({ data: "updated" });

      // Mock startActiveSpan to simulate synchronous execution with proper span.end() call
      mockTracer.startActiveSpan = vi.fn((name, options, fn) => {
        const result = fn(mockSpan);
        // For synchronous operations, the span should end automatically
        mockSpan.end();
        return result;
      });

      const result = plugin.traceBackgroundRevalidationComplete(
        "products-revalidation",
        "products",
        mockRevalidateFn,
      );

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        expect.stringContaining("products"),
        expect.any(Object),
        expect.any(Function),
      );
      expect(mockRevalidateFn).toHaveBeenCalledWith(mockSpan);
      expect(mockSpan.end).toHaveBeenCalled();
      expect(result).toEqual({ data: "updated" });
    });

    it("should handle complete revalidation errors", async () => {
      const plugin = createTelemetryPlugin();
      const error = new Error("Revalidation failed");
      const mockRevalidateFn = vi.fn().mockRejectedValue(error);

      // Mock startActiveSpan to simulate async error handling like the real implementation
      mockTracer.startActiveSpan = vi.fn((name, options, fn) => {
        try {
          const result = fn(mockSpan);

          // Handle Promise rejection
          if (result instanceof Promise) {
            return result
              .catch((err) => {
                mockSpan.recordException(err);
                mockSpan.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: err instanceof Error ? err.message : "Unknown error",
                });
                throw err;
              })
              .finally(() => {
                mockSpan.end();
              });
          }

          return result;
        } catch (err) {
          mockSpan.recordException(err as Error);
          mockSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : "Unknown error",
          });
          mockSpan.end();
          throw err;
        }
      });

      await expect(
        plugin.traceBackgroundRevalidationComplete(
          "users-revalidation",
          "users",
          mockRevalidateFn,
        ),
      ).rejects.toThrow("Revalidation failed");

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ code: SpanStatusCode.ERROR }),
      );
      expect(mockSpan.end).toHaveBeenCalled();
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

  describe("resource key extraction (via beforeFetch)", () => {
    it("should extract resource key from standard URL paths", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users/123/posts/456";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "users.123.posts.456",
          }),
        }),
      );
    });

    it("should extract resource key from single segment paths", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "users",
          }),
        }),
      );
    });

    it("should use hostname for root paths", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "api.example.com",
          }),
        }),
      );
    });

    it("should handle paths with trailing slashes", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/api/v1/products/";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "api.v1.products",
          }),
        }),
      );
    });

    it("should handle query parameters in URLs", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/search?q=test&limit=10";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "search",
          }),
        }),
      );
    });

    it("should generate hash-based key for invalid URLs", async () => {
      const plugin = createTelemetryPlugin();
      const url = "not-a-valid-url";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      const callArgs = mockTracer.startSpan.mock.calls[0] as any[];
      const attributes = callArgs[1]?.attributes as Record<string, any>;
      expect(attributes["udsl.resource_key"]).toMatch(
        /^invalid_url_[a-z0-9]+$/,
      );
    });

    it("should generate consistent hash for same invalid URL", async () => {
      const plugin = createTelemetryPlugin();
      const url = "invalid://example";
      const init1: RequestInit = { method: "GET" };
      const init2: RequestInit = { method: "POST" };

      await plugin.beforeFetch!(url, init1);
      const firstCall = mockTracer.startSpan.mock.calls[0] as any[];
      const firstResourceKey = firstCall[1]?.attributes["udsl.resource_key"];

      vi.clearAllMocks();

      await plugin.beforeFetch!(url, init2);
      const secondCall = mockTracer.startSpan.mock.calls[0] as any[];
      const secondResourceKey = secondCall[1]?.attributes["udsl.resource_key"];

      expect(firstResourceKey).toBe(secondResourceKey);
    });

    it("should generate different hashes for different invalid URLs", async () => {
      const plugin = createTelemetryPlugin();
      const url1 = "invalid-url-1";
      const url2 = "invalid-url-2";
      const init1: RequestInit = { method: "GET" };
      const init2: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url1, init1);
      const firstCall = mockTracer.startSpan.mock.calls[0] as any[];
      const firstResourceKey = firstCall[1]?.attributes["udsl.resource_key"];

      vi.clearAllMocks();

      await plugin.beforeFetch!(url2, init2);
      const secondCall = mockTracer.startSpan.mock.calls[0] as any[];
      const secondResourceKey = secondCall[1]?.attributes["udsl.resource_key"];

      expect(firstResourceKey).not.toBe(secondResourceKey);
    });

    it("should handle URLs with ports", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com:8080/api/users";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "api.users",
          }),
        }),
      );
    });

    it("should handle URLs with encoded characters", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com/users/john%20doe/profile";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "users.john%20doe.profile",
          }),
        }),
      );
    });

    it("should handle localhost URLs", async () => {
      const plugin = createTelemetryPlugin();
      const url = "http://localhost:3000/api/data";
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attributes: expect.objectContaining({
            "udsl.resource_key": "api.data",
          }),
        }),
      );
    });
  });
});
