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

    await expect(udsl.fetchResource("users")).rejects.toThrow("Network error: 404");
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
});
