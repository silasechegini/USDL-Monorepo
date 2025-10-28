import { beforeEach, describe, expect, it, vi } from "vitest";
import { UDSL } from "../udsl";

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe("UDSL SWR Implementation", () => {
  let udsl: UDSL;

  beforeEach(() => {
    udsl = new UDSL({
      resources: {
        users: {
          get: "https://api.example.com/users",
          cache: 5, // 5 second cache
        },
      },
    });
    mockFetch.mockClear();
  });

  it("should return fresh data immediately on first request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John" }),
    });

    const data = await udsl.fetchResource("users");

    expect(data).toEqual({ id: 1, name: "John" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should return cached data without new request when cache is fresh", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John" }),
    });

    // First request
    await udsl.fetchResource("users");

    // Second request should use cache
    const data = await udsl.fetchResource("users");

    expect(data).toEqual({ id: 1, name: "John" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should implement Stale-While-Revalidate for expired cache", async () => {
    // First request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John" }),
    });

    await udsl.fetchResource("users");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Fast-forward time to expire cache
    vi.useFakeTimers();
    vi.advanceTimersByTime(6000); // 6 seconds, cache expired

    // Mock second response for background revalidation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John Updated" }),
    });

    // Second request should return stale data immediately
    const data = await udsl.fetchResource("users");

    // Should get stale data immediately
    expect(data).toEqual({ id: 1, name: "John" });

    // Should have triggered background revalidation
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Allow background revalidation to complete
    await vi.runAllTimersAsync();

    // Third request should get updated data
    const updatedData = await udsl.fetchResource("users");
    expect(updatedData).toEqual({ id: 1, name: "John Updated" });

    vi.useRealTimers();
  });

  it("should provide cache info", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John" }),
    });

    // No cache initially
    expect(udsl.getCacheInfo("users")).toBeNull();

    // Fetch data
    await udsl.fetchResource("users");

    // Should have cache info
    const cacheInfo = udsl.getCacheInfo("users");
    expect(cacheInfo).toBeTruthy();
    expect(cacheInfo!.isStale).toBe(false);
    expect(cacheInfo!.isRevalidating).toBe(false);
    expect(cacheInfo!.lastRevalidated).toBeGreaterThan(0);
  });

  it("should allow manual revalidation", async () => {
    // First request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John" }),
    });

    await udsl.fetchResource("users");

    // Mock updated response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John Updated" }),
    });

    // Manual revalidation
    const data = await udsl.revalidate("users");

    expect(data).toEqual({ id: 1, name: "John Updated" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should not make duplicate revalidation requests", async () => {
    // First request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John" }),
    });

    await udsl.fetchResource("users");

    // Expire cache
    vi.useFakeTimers();
    vi.advanceTimersByTime(6000);

    // Mock slow response
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () => Promise.resolve({ id: 1, name: "John Updated" }),
              }),
            1000,
          ),
        ),
    );

    // Multiple requests while revalidating
    const promise1 = udsl.fetchResource("users");
    const promise2 = udsl.fetchResource("users");
    const promise3 = udsl.fetchResource("users");

    const [data1, data2, data3] = await Promise.all([
      promise1,
      promise2,
      promise3,
    ]);

    // All should return stale data immediately
    expect(data1).toEqual({ id: 1, name: "John" });
    expect(data2).toEqual({ id: 1, name: "John" });
    expect(data3).toEqual({ id: 1, name: "John" });

    // Only one background revalidation should have been triggered
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("should clean up revalidation promises when invalidating cache", async () => {
    // First request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John" }),
    });

    await udsl.fetchResource("users");

    // Expire cache to trigger revalidation
    vi.useFakeTimers();
    vi.advanceTimersByTime(6000);

    // Mock slow response to keep revalidation promise active
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () => Promise.resolve({ id: 1, name: "John Updated" }),
              }),
            1000,
          ),
        ),
    );

    // Trigger revalidation but don't wait
    udsl.fetchResource("users");

    // Verify revalidation is in progress
    const cacheInfo = udsl.getCacheInfo("users");
    expect(cacheInfo?.isRevalidating).toBe(true);

    // Invalidate the resource cache
    udsl.invalidateResource("users");

    // After invalidation, cache should be gone and no revalidation should be active
    expect(udsl.getCacheInfo("users")).toBeNull();

    // New request should fetch fresh data, not wait for the old revalidation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: "John Fresh" }),
    });

    const freshData = await udsl.fetchResource("users");
    expect(freshData).toEqual({ id: 1, name: "John Fresh" });

    vi.useRealTimers();
  });
});
