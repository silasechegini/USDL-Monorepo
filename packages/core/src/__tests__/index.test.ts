import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createUDSL } from "../udsl";

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe("UDSL Core", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fetches users", async () => {
    // Mock the fetch response
    const mockUsers = [
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Smith" },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    const udsl = createUDSL({
      resources: { users: { get: "https://api.example.com/users" } },
    });
    const data = await udsl.fetchResource<any[]>("users");

    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual(mockUsers);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/users",
      expect.objectContaining({
        method: "GET",
        headers: {},
      }),
    );
  });

  test("handles fetch errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const udsl = createUDSL({
      resources: { users: { get: "https://api.example.com/users" } },
    });

    await expect(udsl.fetchResource("users")).rejects.toThrow(
      "Network error: 404",
    );
  });

  test("throws error for unknown resource", async () => {
    const udsl = createUDSL({ resources: {} });

    await expect(udsl.fetchResource("unknown")).rejects.toThrow(
      "Resource not found: unknown",
    );
  });

  test("caches responses when cache is configured", async () => {
    const mockData = { id: 1, name: "Cached User" };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const udsl = createUDSL({
      resources: {
        user: {
          get: "https://api.example.com/user/1",
          cache: 60, // 60 seconds cache
        },
      },
    });

    // First fetch
    const data1 = await udsl.fetchResource("user");
    expect(data1).toEqual(mockData);

    // Second fetch should use cache
    const data2 = await udsl.fetchResource("user");
    expect(data2).toEqual(mockData);

    // Should only have called fetch once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // CRUD Mutation Tests
  describe("CRUD Operations", () => {
    test("creates a new user", async () => {
      const newUser = { name: "New User", email: "new@example.com" };
      const createdUser = { id: 3, ...newUser };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createdUser,
      });

      const udsl = createUDSL({
        resources: { users: { post: "https://api.example.com/users" } },
      });

      const result = await udsl.createResource("users", newUser);

      expect(result).toEqual(createdUser);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newUser),
        }),
      );
    });

    test("updates an existing user", async () => {
      const updatedData = {
        name: "Updated User",
        email: "updated@example.com",
      };
      const updatedUser = { id: 1, ...updatedData };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedUser,
      });

      const udsl = createUDSL({
        resources: { users: { put: "https://api.example.com/users/:id" } },
      });

      const result = await udsl.updateResource("users", 1, updatedData);

      expect(result).toEqual(updatedUser);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedData),
        }),
      );
    });

    test("patches an existing user", async () => {
      const patchData = { email: "patched@example.com" };
      const patchedUser = { id: 1, name: "Existing User", ...patchData };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => patchedUser,
      });

      const udsl = createUDSL({
        resources: { users: { patch: "https://api.example.com/users/:id" } },
      });

      const result = await udsl.patchResource("users", 1, patchData);

      expect(result).toEqual(patchedUser);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchData),
        }),
      );
    });

    test("deletes a user", async () => {
      const deleteResponse = { success: true, message: "User deleted" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => deleteResponse,
      });

      const udsl = createUDSL({
        resources: { users: { delete: "https://api.example.com/users/:id" } },
      });

      const result = await udsl.removeResource("users", 1);

      expect(result).toEqual(deleteResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    test("throws error when POST endpoint not defined", async () => {
      const udsl = createUDSL({
        resources: { users: { get: "https://api.example.com/users" } },
      });

      await expect(udsl.createResource("users", {})).rejects.toThrow(
        "POST endpoint not defined for: users",
      );
    });

    test("throws error when PUT endpoint not defined", async () => {
      const udsl = createUDSL({
        resources: { users: { get: "https://api.example.com/users" } },
      });

      await expect(udsl.updateResource("users", 1, {})).rejects.toThrow(
        "PUT endpoint not defined for: users",
      );
    });

    test("throws error when PATCH endpoint not defined", async () => {
      const udsl = createUDSL({
        resources: { users: { get: "https://api.example.com/users" } },
      });

      await expect(udsl.patchResource("users", 1, {})).rejects.toThrow(
        "PATCH endpoint not defined for: users",
      );
    });

    test("throws error when DELETE endpoint not defined", async () => {
      const udsl = createUDSL({
        resources: { users: { get: "https://api.example.com/users" } },
      });

      await expect(udsl.removeResource("users", 1)).rejects.toThrow(
        "DELETE endpoint not defined for: users",
      );
    });

    test("invalidates cache after mutations", async () => {
      const mockData = { id: 1, name: "Original User" };
      const updatedData = { id: 1, name: "Updated User" };

      // First call for initial fetch (cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      // Second call for update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedData,
      });

      // Third call for fetch after update (should not use cache)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedData,
      });

      const udsl = createUDSL({
        resources: {
          users: {
            get: "https://api.example.com/users",
            put: "https://api.example.com/users/:id",
            cache: 60,
          },
        },
      });

      // Initial fetch (populates cache)
      await udsl.fetchResource("users");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Update (should invalidate cache)
      await udsl.updateResource("users", 1, { name: "Updated User" });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Fetch again (should not use cache due to invalidation)
      await udsl.fetchResource("users");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("Plugin Telemetry Hooks", () => {
    test("should call onCacheHit hook with correct parameters", async () => {
      const onCacheHit = vi.fn();
      const plugin = { onCacheHit };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1, name: "John" }],
      });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 60 },
        },
      });

      udsl.registerPlugin(plugin);

      // First fetch - cache miss
      await udsl.fetchResource("users");
      expect(onCacheHit).not.toHaveBeenCalled();

      // Second fetch - cache hit (not stale)
      await udsl.fetchResource("users");
      expect(onCacheHit).toHaveBeenCalledTimes(1);
      expect(onCacheHit).toHaveBeenCalledWith("users", false);
    });

    test("should call onCacheHit with isStale=true for stale cache", async () => {
      const onCacheHit = vi.fn();
      const plugin = { onCacheHit };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1, name: "John" }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1, name: "John Updated" }],
        });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 0.01 }, // 10ms cache
        },
      });

      udsl.registerPlugin(plugin);

      // First fetch
      await udsl.fetchResource("users");

      // Wait for cache to become stale
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Second fetch - cache hit but stale
      await udsl.fetchResource("users");
      expect(onCacheHit).toHaveBeenCalledWith("users", true);
    });

    test("should call onCacheMiss hook when cache is empty", async () => {
      const onCacheMiss = vi.fn();
      const plugin = { onCacheMiss };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1, name: "John" }],
      });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 60 },
        },
      });

      udsl.registerPlugin(plugin);

      await udsl.fetchResource("users");
      expect(onCacheMiss).toHaveBeenCalledTimes(1);
      expect(onCacheMiss).toHaveBeenCalledWith("users");
    });

    test("should call onRevalidationStart and onRevalidationComplete hooks", async () => {
      const onRevalidationStart = vi.fn();
      const onRevalidationComplete = vi.fn();
      const plugin = { onRevalidationStart, onRevalidationComplete };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1, name: "John" }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1, name: "John Updated" }],
        });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 60 },
        },
      });

      udsl.registerPlugin(plugin);

      // Initial fetch
      await udsl.fetchResource("users");

      // Manual revalidation
      await udsl.revalidate("users");

      expect(onRevalidationStart).toHaveBeenCalledTimes(1);
      expect(onRevalidationStart).toHaveBeenCalledWith("users");
      expect(onRevalidationComplete).toHaveBeenCalledTimes(1);
      expect(onRevalidationComplete).toHaveBeenCalledWith("users", true);
    });

    test("should call onRevalidationComplete with success=false on error", async () => {
      const onRevalidationStart = vi.fn();
      const onRevalidationComplete = vi.fn();
      const plugin = { onRevalidationStart, onRevalidationComplete };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1, name: "John" }],
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 0.01 },
        },
      });

      udsl.registerPlugin(plugin);

      // Initial fetch
      await udsl.fetchResource("users");

      // Wait for cache to become stale
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Trigger background revalidation via stale fetch
      await udsl.fetchResource("users");

      // Wait for background revalidation to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onRevalidationStart).toHaveBeenCalledWith("users");
      expect(onRevalidationComplete).toHaveBeenCalledWith("users", false);
    });

    test("should call onOperationStart and onOperationComplete for create operation", async () => {
      const onOperationStart = vi.fn();
      const onOperationComplete = vi.fn();
      const plugin = { onOperationStart, onOperationComplete };

      const newUser = { id: 3, name: "New User" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => newUser,
      });

      const udsl = createUDSL({
        resources: {
          users: {
            get: "https://api.example.com/users",
            post: "https://api.example.com/users",
          },
        },
      });

      udsl.registerPlugin(plugin);

      await udsl.createResource("users", { name: "New User" });

      expect(onOperationStart).toHaveBeenCalledTimes(1);
      expect(onOperationStart).toHaveBeenCalledWith(
        "create",
        "users",
        undefined,
      );

      expect(onOperationComplete).toHaveBeenCalledTimes(1);
      expect(onOperationComplete).toHaveBeenCalledWith(
        "create",
        "users",
        true,
        expect.any(Number),
        newUser,
      );
    });

    test("should call onOperationComplete with success=false on operation error", async () => {
      const onOperationStart = vi.fn();
      const onOperationComplete = vi.fn();
      const plugin = { onOperationStart, onOperationComplete };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const udsl = createUDSL({
        resources: {
          users: {
            post: "https://api.example.com/users",
          },
        },
      });

      udsl.registerPlugin(plugin);

      await expect(
        udsl.createResource("users", { name: "Invalid" }),
      ).rejects.toThrow();

      expect(onOperationStart).toHaveBeenCalledWith(
        "create",
        "users",
        undefined,
      );
      expect(onOperationComplete).toHaveBeenCalledWith(
        "create",
        "users",
        false,
        expect.any(Number),
        undefined,
      );
    });

    test("should call onOperationStart and onOperationComplete for update operation", async () => {
      const onOperationStart = vi.fn();
      const onOperationComplete = vi.fn();
      const plugin = { onOperationStart, onOperationComplete };

      const updatedUser = { id: 1, name: "Updated User" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedUser,
      });

      const udsl = createUDSL({
        resources: {
          users: {
            put: "https://api.example.com/users/:id",
          },
        },
      });

      udsl.registerPlugin(plugin);

      await udsl.updateResource("users", 1, { name: "Updated User" });

      expect(onOperationStart).toHaveBeenCalledWith("update", "users", {
        id: 1,
      });
      expect(onOperationComplete).toHaveBeenCalledWith(
        "update",
        "users",
        true,
        expect.any(Number),
        updatedUser,
      );
    });

    test("should call onOperationStart and onOperationComplete for patch operation", async () => {
      const onOperationStart = vi.fn();
      const onOperationComplete = vi.fn();
      const plugin = { onOperationStart, onOperationComplete };

      const patchedUser = { id: 1, name: "Patched User" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => patchedUser,
      });

      const udsl = createUDSL({
        resources: {
          users: {
            patch: "https://api.example.com/users/:id",
          },
        },
      });

      udsl.registerPlugin(plugin);

      await udsl.patchResource("users", 1, { name: "Patched User" });

      expect(onOperationStart).toHaveBeenCalledWith("patch", "users", {
        id: 1,
      });
      expect(onOperationComplete).toHaveBeenCalledWith(
        "patch",
        "users",
        true,
        expect.any(Number),
        patchedUser,
      );
    });

    test("should call onOperationStart and onOperationComplete for delete operation", async () => {
      const onOperationStart = vi.fn();
      const onOperationComplete = vi.fn();
      const plugin = { onOperationStart, onOperationComplete };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const udsl = createUDSL({
        resources: {
          users: {
            delete: "https://api.example.com/users/:id",
          },
        },
      });

      udsl.registerPlugin(plugin);

      await udsl.removeResource("users", 1);

      expect(onOperationStart).toHaveBeenCalledWith("delete", "users", {
        id: 1,
      });
      expect(onOperationComplete).toHaveBeenCalledWith(
        "delete",
        "users",
        true,
        expect.any(Number),
        { success: true },
      );
    });

    test("should handle multiple plugins with telemetry hooks", async () => {
      const plugin1 = {
        onCacheHit: vi.fn(),
        onCacheMiss: vi.fn(),
      };
      const plugin2 = {
        onCacheHit: vi.fn(),
        onCacheMiss: vi.fn(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1 }],
      });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 60 },
        },
      });

      udsl.registerPlugin(plugin1);
      udsl.registerPlugin(plugin2);

      // First fetch - cache miss
      await udsl.fetchResource("users");
      expect(plugin1.onCacheMiss).toHaveBeenCalledWith("users");
      expect(plugin2.onCacheMiss).toHaveBeenCalledWith("users");

      // Second fetch - cache hit
      await udsl.fetchResource("users");
      expect(plugin1.onCacheHit).toHaveBeenCalledWith("users", false);
      expect(plugin2.onCacheHit).toHaveBeenCalledWith("users", false);
    });

    test("should handle async plugin hooks", async () => {
      const onCacheMiss = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const plugin = { onCacheMiss };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1 }],
      });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 60 },
        },
      });

      udsl.registerPlugin(plugin);

      await udsl.fetchResource("users");
      expect(onCacheMiss).toHaveBeenCalledTimes(1);
    });

    test("should not fail if plugin hook throws error", async () => {
      const onCacheMiss = vi.fn(() => {
        throw new Error("Plugin error");
      });
      const plugin = { onCacheMiss };

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1 }],
      });

      const udsl = createUDSL({
        resources: {
          users: { get: "https://api.example.com/users", cache: 60 },
        },
      });

      udsl.registerPlugin(plugin);

      // Should not throw despite plugin error
      await expect(udsl.fetchResource("users")).resolves.toBeDefined();
      expect(onCacheMiss).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Plugin hook onCacheMiss failed:",
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });

    test("should measure operation duration correctly", async () => {
      const onOperationComplete = vi.fn();
      const plugin = { onOperationComplete };

      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ id: 1 }),
                }),
              50,
            ),
          ),
      );

      const udsl = createUDSL({
        resources: {
          users: { post: "https://api.example.com/users" },
        },
      });

      udsl.registerPlugin(plugin);

      await udsl.createResource("users", { name: "Test" });

      expect(onOperationComplete).toHaveBeenCalledTimes(1);
      const duration = onOperationComplete.mock.calls[0][3];
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });
});
