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
    const data = await udsl.fetch<any[]>("users");

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

    await expect(udsl.fetch("users")).rejects.toThrow("Network error: 404");
  });

  test("throws error for unknown resource", async () => {
    const udsl = createUDSL({ resources: {} });

    await expect(udsl.fetch("unknown")).rejects.toThrow(
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
    const data1 = await udsl.fetch("user");
    expect(data1).toEqual(mockData);

    // Second fetch should use cache
    const data2 = await udsl.fetch("user");
    expect(data2).toEqual(mockData);

    // Should only have called fetch once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
