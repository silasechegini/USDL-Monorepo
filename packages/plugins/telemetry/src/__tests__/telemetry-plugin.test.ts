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
  /**
   * Mock that simulates OpenTelemetry's startActiveSpan behavior.
   * The real API does NOT automatically end spans - it's the user's responsibility
   * to call span.end(). This mock simply executes the callback and returns the result.
   */
  startActiveSpan: vi.fn((name, options, fn) => {
    // Execute the callback with the mock span (simulates setting active span in context)
    return fn(mockSpan);
  }),
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
      // Span should be ended by the .finally() handler on the promise
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it("should not call span.end() prematurely for async operations", async () => {
      const plugin = createTelemetryPlugin();
      let resolveOperation: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolveOperation = resolve;
      });

      const mockRevalidateFn = vi.fn().mockReturnValue(delayedPromise);

      // Start the operation but don't await it yet
      const resultPromise = plugin.traceBackgroundRevalidationComplete(
        "users-revalidation",
        "users",
        mockRevalidateFn,
      );

      // At this point, the operation is pending - span should NOT be ended yet
      expect(mockSpan.end).not.toHaveBeenCalled();

      // Resolve the operation
      resolveOperation!({ data: "resolved" });
      await resultPromise;

      // Now span.end() should have been called exactly once (by the .finally() handler)
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
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

    it("should use hostname for URLs with host but no path (no trailing slash)", async () => {
      const plugin = createTelemetryPlugin();
      const url = "https://api.example.com";
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

    it("should handle edge case URLs with no host and no path segments", async () => {
      const plugin = createTelemetryPlugin();
      // Test with a scheme-only URL pattern that might occur in edge cases
      // While most valid URLs will have either a host or path segments,
      // this tests the defensive coding in extractResourceKey
      // Using a minimal valid URL that browsers/Node.js accept
      const url = "http://:8080"; // URL with port but no hostname
      const init: RequestInit = { method: "GET" };

      await plugin.beforeFetch!(url, init);

      const callArgs = mockTracer.startSpan.mock.calls[0] as any[];
      const attributes = callArgs[1]?.attributes as Record<string, any>;
      // Should use host (which will be ":8080") or fall back to hash
      expect(attributes["udsl.resource_key"]).toBeDefined();
      expect(typeof attributes["udsl.resource_key"]).toBe("string");
      expect(attributes["udsl.resource_key"].length).toBeGreaterThan(0);
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

  describe("Parameter Validation (validateSpanParameter)", () => {
    it("should reject empty string for spanName", () => {
      const plugin = createTelemetryPlugin();

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "",
          "valid-resource",
          (span) => {},
        ),
      ).toThrow("spanName cannot be empty or whitespace only");
    });

    it("should reject whitespace-only string for spanName", () => {
      const plugin = createTelemetryPlugin();

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "   \t\n  ",
          "valid-resource",
          (span) => {},
        ),
      ).toThrow("spanName cannot be empty or whitespace only");
    });

    it("should reject spanName exceeding 255 characters", () => {
      const plugin = createTelemetryPlugin();
      const longName = "a".repeat(256);

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          longName,
          "valid-resource",
          (span) => {},
        ),
      ).toThrow("spanName exceeds maximum length of 255 characters");
    });

    it("should accept spanName with exactly 255 characters", () => {
      const plugin = createTelemetryPlugin();
      const maxName = "a".repeat(255);

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          maxName,
          "valid-resource",
          (span) => {},
        ),
      ).not.toThrow();
    });

    it("should reject spanName with null byte (\\x00)", () => {
      const plugin = createTelemetryPlugin();

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "span\x00name",
          "valid-resource",
          (span) => {},
        ),
      ).toThrow("spanName contains invalid control characters");
    });

    it("should reject spanName with control characters (\\x01-\\x1F)", () => {
      const plugin = createTelemetryPlugin();

      // Test a few control characters
      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "span\x01name",
          "valid-resource",
          (span) => {},
        ),
      ).toThrow("spanName contains invalid control characters");

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "span\x1Fname",
          "valid-resource",
          (span) => {},
        ),
      ).toThrow("spanName contains invalid control characters");
    });

    it("should reject spanName with DEL character (\\x7F)", () => {
      const plugin = createTelemetryPlugin();

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "span\x7Fname",
          "valid-resource",
          (span) => {},
        ),
      ).toThrow("spanName contains invalid control characters");
    });

    it("should accept spanName with valid special characters", () => {
      const plugin = createTelemetryPlugin();

      // These should all be acceptable
      const validNames = [
        "span-name",
        "span_name",
        "span.name",
        "span:name",
        "span/name",
        "span name",
        "span@name",
        "span#name",
        "span$name",
        "span(name)",
        "span[name]",
        "span{name}",
      ];

      validNames.forEach((name) => {
        expect(() =>
          plugin.traceBackgroundRevalidationComplete(
            name,
            "valid-resource",
            (span) => {},
          ),
        ).not.toThrow();
      });
    });

    it("should reject empty string for resourceKey", () => {
      const plugin = createTelemetryPlugin();

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "valid-span",
          "",
          (span) => {},
        ),
      ).toThrow("resourceKey cannot be empty or whitespace only");
    });

    it("should reject whitespace-only string for resourceKey", () => {
      const plugin = createTelemetryPlugin();

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "valid-span",
          "   \t\n  ",
          (span) => {},
        ),
      ).toThrow("resourceKey cannot be empty or whitespace only");
    });

    it("should reject resourceKey exceeding 255 characters", () => {
      const plugin = createTelemetryPlugin();
      const longKey = "r".repeat(256);

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "valid-span",
          longKey,
          (span) => {},
        ),
      ).toThrow("resourceKey exceeds maximum length of 255 characters");
    });

    it("should accept resourceKey with exactly 255 characters", () => {
      const plugin = createTelemetryPlugin();
      const maxKey = "r".repeat(255);

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "valid-span",
          maxKey,
          (span) => {},
        ),
      ).not.toThrow();
    });

    it("should reject resourceKey with control characters", () => {
      const plugin = createTelemetryPlugin();

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "valid-span",
          "resource\x00key",
          (span) => {},
        ),
      ).toThrow("resourceKey contains invalid control characters");

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "valid-span",
          "resource\x1Fkey",
          (span) => {},
        ),
      ).toThrow("resourceKey contains invalid control characters");

      expect(() =>
        plugin.traceBackgroundRevalidationComplete(
          "valid-span",
          "resource\x7Fkey",
          (span) => {},
        ),
      ).toThrow("resourceKey contains invalid control characters");
    });

    it("should accept resourceKey with valid special characters", () => {
      const plugin = createTelemetryPlugin();

      const validKeys = [
        "resource-key",
        "resource_key",
        "resource.key",
        "resource:key",
        "resource/key",
        "user.123",
        "api.v2.users",
      ];

      validKeys.forEach((key) => {
        expect(() =>
          plugin.traceBackgroundRevalidationComplete(
            "valid-span",
            key,
            (span) => {},
          ),
        ).not.toThrow();
      });
    });

    it("should validate both parameters in correct order", () => {
      const plugin = createTelemetryPlugin();

      // spanName is validated first
      expect(() =>
        plugin.traceBackgroundRevalidationComplete("", "", (span) => {}),
      ).toThrow("spanName cannot be empty or whitespace only");
    });
  });

  describe("Console Logging (logSpansToConsole)", () => {
    let consoleGroupCollapsed: ReturnType<typeof vi.fn>;
    let consoleLog: ReturnType<typeof vi.fn>;
    let consoleGroupEnd: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      consoleGroupCollapsed = vi.spyOn(console, "groupCollapsed");
      consoleLog = vi.spyOn(console, "log");
      consoleGroupEnd = vi.spyOn(console, "groupEnd");
    });

    it("should not log spans when logSpansToConsole is false (default)", async () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: false,
      });

      const url = "https://api.example.com/users";
      const init: RequestInit = { method: "GET" };
      const response = new Response(JSON.stringify([]), {
        status: 200,
        statusText: "OK",
      });

      await plugin.beforeFetch!(url, init);
      await plugin.afterFetch!(url, response, init);

      expect(consoleGroupCollapsed).not.toHaveBeenCalled();
      expect(consoleGroupEnd).not.toHaveBeenCalled();
    });

    it("should not log spans when logSpansToConsole is undefined (default)", async () => {
      const plugin = createTelemetryPlugin();

      const url = "https://api.example.com/users";
      const init: RequestInit = { method: "GET" };
      const response = new Response(JSON.stringify([]), {
        status: 200,
        statusText: "OK",
      });

      await plugin.beforeFetch!(url, init);
      await plugin.afterFetch!(url, response, init);

      expect(consoleGroupCollapsed).not.toHaveBeenCalled();
      expect(consoleGroupEnd).not.toHaveBeenCalled();
    });

    it("should log HTTP fetch spans when logSpansToConsole is true", async () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
        serviceName: "test-service",
      });

      const url = "https://api.example.com/users";
      const init: RequestInit = { method: "GET" };
      const response = new Response(JSON.stringify([]), {
        status: 200,
        statusText: "OK",
      });

      await plugin.beforeFetch!(url, init);
      await plugin.afterFetch!(url, response, init);

      // Verify console.groupCollapsed was called with span name and duration
      expect(consoleGroupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(/\[Telemetry\] HTTP users GET \(\d+ms\)/),
        expect.any(String),
      );

      // Verify attributes were logged
      expect(consoleLog).toHaveBeenCalledWith(
        "Attributes:",
        expect.objectContaining({
          "http.method": "GET",
          "http.url": url,
          "http.status_code": 200,
          "http.status_text": "OK",
        }),
      );

      // Verify service name was logged
      expect(consoleLog).toHaveBeenCalledWith("Service:", "test-service");

      // Verify console group was closed
      expect(consoleGroupEnd).toHaveBeenCalled();
    });

    it("should log cache hit spans when logSpansToConsole is true", () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
        traceCacheOperations: true,
        serviceName: "cache-service",
      });

      plugin.traceCacheHit("user.123", false);

      expect(consoleGroupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(/\[Telemetry\] CACHE_HIT user\.123 \(\d+ms\)/),
        expect.any(String),
      );

      expect(consoleLog).toHaveBeenCalledWith(
        "Attributes:",
        expect.objectContaining({
          "udsl.operation": "cache_hit",
          "udsl.resource_key": "user.123",
          "udsl.cache.is_stale": false,
        }),
      );

      expect(consoleLog).toHaveBeenCalledWith("Service:", "cache-service");
      expect(consoleGroupEnd).toHaveBeenCalled();
    });

    it("should log cache miss spans when logSpansToConsole is true", () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
        traceCacheOperations: true,
      });

      plugin.traceCacheMiss("product.456");

      expect(consoleGroupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[Telemetry\] CACHE_MISS product\.456 \(\d+ms\)/,
        ),
        expect.any(String),
      );

      expect(consoleLog).toHaveBeenCalledWith(
        "Attributes:",
        expect.objectContaining({
          "udsl.operation": "cache_miss",
          "udsl.resource_key": "product.456",
        }),
      );

      expect(consoleGroupEnd).toHaveBeenCalled();
    });

    it("should log custom operation spans when logSpansToConsole is true", async () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
        serviceName: "custom-service",
      });

      await plugin.traceOperation(
        "validate",
        "order.789",
        async () => {
          return { valid: true };
        },
        { "order.id": "789" },
      );

      expect(consoleGroupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(/\[Telemetry\] validate order\.789 \(\d+ms\)/),
        expect.any(String),
      );

      expect(consoleLog).toHaveBeenCalledWith(
        "Attributes:",
        expect.objectContaining({
          "udsl.operation": "validate",
          "udsl.resource_key": "order.789",
          "order.id": "789",
        }),
      );

      expect(consoleLog).toHaveBeenCalledWith("Service:", "custom-service");
      expect(consoleGroupEnd).toHaveBeenCalled();
    });

    it("should handle console without groupCollapsed support (fallback to log)", async () => {
      // Temporarily remove groupCollapsed to test fallback
      const originalGroupCollapsed = console.groupCollapsed;
      const originalGroupEnd = console.groupEnd;
      // @ts-ignore
      delete console.groupCollapsed;
      // @ts-ignore
      delete console.groupEnd;

      const consoleLogSpy = vi.spyOn(console, "log");

      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
        serviceName: "fallback-service",
      });

      const url = "https://api.example.com/data";
      const init: RequestInit = { method: "GET" };
      const response = new Response(JSON.stringify([]), {
        status: 200,
        statusText: "OK",
      });

      await plugin.beforeFetch!(url, init);
      await plugin.afterFetch!(url, response, init);

      // Verify fallback to console.log with formatted message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[Telemetry\] HTTP data GET \(\d+ms\)/),
        expect.any(String),
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Attributes:",
        expect.objectContaining({
          "http.method": "GET",
          "http.status_code": 200,
        }),
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Service:",
        "fallback-service",
      );

      // Restore console methods
      console.groupCollapsed = originalGroupCollapsed;
      console.groupEnd = originalGroupEnd;
    });

    it("should include custom default attributes in logged spans", async () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
        defaultAttributes: {
          environment: "production",
          version: "1.2.3",
        },
      });

      plugin.traceCacheHit("user.999", false);

      expect(consoleLog).toHaveBeenCalledWith(
        "Attributes:",
        expect.objectContaining({
          environment: "production",
          version: "1.2.3",
          "udsl.operation": "cache_hit",
          "udsl.resource_key": "user.999",
        }),
      );
    });

    it("should format duration correctly in logged spans", async () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
      });

      // Use a synchronous operation to minimize timing variability
      plugin.traceCacheHit("test.timing", false);

      expect(consoleGroupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(/\(\d+ms\)$/),
        expect.any(String),
      );
    });

    it("should use custom span name formatter in logs", async () => {
      const plugin = createTelemetryPlugin({
        logSpansToConsole: true,
        spanNameFormatter: (operation, resourceKey) =>
          `CUSTOM:${operation}:${resourceKey}`,
      });

      plugin.traceCacheHit("formatted.key", false);

      expect(consoleGroupCollapsed).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[Telemetry\] CUSTOM:CACHE_HIT:formatted\.key \(\d+ms\)/,
        ),
        expect.any(String),
      );
    });
  });
});
