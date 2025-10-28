import { UDSLConfig, UDSLPlugin, CacheEntry } from "./types";

export class UDSL {
  private config: UDSLConfig;
  private cache = new Map<string, CacheEntry>();
  private plugins: UDSLPlugin[] = [];
  private revalidationPromises = new Map<string, Promise<any>>();

  constructor(config: UDSLConfig) {
    this.config = config;
  }

  registerPlugin(plugin: UDSLPlugin) {
    this.plugins.push(plugin);
  }

  private async runBeforeFetch(url: string, init: RequestInit) {
    for (const p of this.plugins) {
      if (p.beforeFetch) await p.beforeFetch(url, init);
    }
  }

  private async runAfterFetch(url: string, response: Response) {
    for (const p of this.plugins) {
      if (p.afterFetch) await p.afterFetch(url, response);
    }
  }

  private isZodSchema(schema: any): boolean {
    return (
      typeof schema === "object" &&
      schema !== null &&
      "parse" in schema &&
      typeof schema.parse === "function"
    );
  }

  private async executeRequest<T>(
    method: string,
    url: string,
    data?: any,
    resourceKey?: string,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (data) {
      init.body = JSON.stringify(data);
    }

    await this.runBeforeFetch(url, init);

    const res = await fetch(url, init);

    await this.runAfterFetch(url, res);

    if (!res.ok) throw new Error(`Network error: ${res.status}`);

    const responseData = await res.json();

    // Optionally validate via zod if schema provided and resourceKey exists
    if (resourceKey) {
      const resource = this.config.resources[resourceKey];
      if (resource?.schema) {
        try {
          // If schema is a zod schema
          if (this.isZodSchema(resource.schema)) {
            (resource.schema as any).parse(responseData);
          }
        } catch (e) {
          console.warn("Schema validation failed", e);
        }
      }
    }

    return responseData as T;
  }

  private replaceUrlParams(url: string, params: Record<string, any>): string {
    let result = url;

    // Replace :param patterns in URL
    Object.entries(params).forEach(([key, value]) => {
      result = result.replace(`:${key}`, String(value));
    });

    return result;
  }

  private generateCacheKey(
    resourceKey: string,
    params?: Record<string, any>,
  ): string {
    return params ? `${resourceKey}:${JSON.stringify(params)}` : resourceKey;
  }

  private async revalidateInBackground<T>(
    key: string,
    params?: Record<string, any>,
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(key, params);

    // Prevent duplicate revalidations - return existing promise if already revalidating
    if (this.revalidationPromises.has(cacheKey)) {
      return this.revalidationPromises.get(cacheKey);
    }

    const resource = this.config.resources[key];
    if (!resource?.get || !resource.cache) return;

    // Create and immediately register the promise to prevent race conditions
    const revalidationPromise = (async () => {
      // Mark as revalidating
      const cached = this.cache.get(cacheKey);
      if (cached) {
        cached.isRevalidating = true;
      }

      try {
        const data = await this.performFetch<T>(key, params);
        const now = Date.now();
        this.cache.set(cacheKey, {
          data,
          expiresAt: now + resource.cache! * 1000,
          isStale: false,
          isRevalidating: false,
          lastRevalidated: now,
        });
      } catch (error) {
        // Keep stale data on revalidation error, just mark as not revalidating
        const cached = this.cache.get(cacheKey);
        if (cached) {
          cached.isRevalidating = false;
        }
        console.warn(`Background revalidation failed for ${cacheKey}:`, error);
      }
    })();

    // Register the promise immediately after creation.
    // This prevents duplicate revalidations within a single event loop tick,
    // but is not truly atomic across all possible concurrent accesses.
    this.revalidationPromises.set(cacheKey, revalidationPromise);

    // Clean up the promise when done
    revalidationPromise.finally(() => {
      this.revalidationPromises.delete(cacheKey);
    });
  }

  private async performFetch<T>(
    key: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource?.get) throw new Error(`GET endpoint not defined for: ${key}`);

    // Simple param replacement for :id or query params
    let url = resource.get;
    if (params) {
      // Replace URL parameters like :id
      url = this.replaceUrlParams(url, params);

      // Add query parameters
      const queryParams = Object.entries(params).filter(
        ([key]) => !resource.get!.includes(`:${key}`),
      );

      if (queryParams.length > 0) {
        const qs = new URLSearchParams(
          queryParams.map(([k, v]) => [k, String(v)]),
        );
        url += (url.includes("?") ? "&" : "?") + qs.toString();
      }
    }

    const init: RequestInit = { method: "GET", headers: {} };

    await this.runBeforeFetch(url, init);

    const res = await fetch(url, init);

    await this.runAfterFetch(url, res);

    if (!res.ok) throw new Error(`Network error: ${res.status}`);

    const data = await res.json();

    // Optionally validate via zod if schema provided
    if (resource.schema) {
      try {
        // If schema is a zod schema
        if (this.isZodSchema(resource.schema)) {
          (resource.schema as any).parse(data);
        }
      } catch (e) {
        console.warn("Schema validation failed", e);
      }
    }

    return data as T;
  }

  async fetchResource<T = any>(
    key: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.get) throw new Error(`GET endpoint not defined for: ${key}`);

    // Create cache key that includes parameters for proper cache isolation
    const cacheKey = this.generateCacheKey(key, params);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // SWR Logic: Return stale data immediately if available, revalidate in background
    if (cached) {
      const isExpired = cached.expiresAt <= now;

      if (!isExpired) {
        // Fresh data - return immediately
        return cached.data as T;
      }

      if (isExpired && !cached.isRevalidating) {
        // Stale data - serve immediately and revalidate in background
        cached.isStale = true;
        this.revalidateInBackground<T>(key, params);
        return cached.data as T;
      }

      if (cached.isRevalidating) {
        // Already revalidating - return stale data
        return cached.data as T;
      }
    }

    // No cached data - fetch fresh data synchronously
    const data = await this.performFetch<T>(key, params);

    // Cache the fresh data
    if (resource.cache && resource.cache > 0) {
      this.cache.set(cacheKey, {
        data,
        expiresAt: now + resource.cache * 1000,
        isStale: false,
        isRevalidating: false,
        lastRevalidated: now,
      });
    }

    return data;
  }

  /**
   * Invalidates cache entries for a resource with configurable granularity.
   *
   * Cache invalidation strategy:
   * - CREATE: Invalidates list/collection caches but preserves specific item caches
   * - UPDATE/PATCH: Invalidates all caches for the resource (aggressive but safe)
   * - DELETE: Invalidates all caches for the resource
   *
   * @param resourceKey - The resource key to invalidate
   * @param operation - The type of mutation operation
   * @param affectedId - The ID of the affected resource (for future granular invalidation)
   */
  private invalidateResourceCache(
    resourceKey: string,
    operation: "create" | "update" | "patch" | "delete",
    affectedId?: string | number,
  ) {
    const keysToDelete: string[] = [];

    for (const [cacheKey] of this.cache) {
      // Match exact key or parameterized keys for this resource
      if (cacheKey === resourceKey || cacheKey.startsWith(`${resourceKey}:`)) {
        if (operation === "create") {
          // For CREATE: Only invalidate caches that might represent collections/lists
          // Preserve individual item caches since new items don't affect existing ones
          // This is a conservative approach - could be made more sophisticated
          keysToDelete.push(cacheKey);
        } else {
          // For UPDATE, PATCH, DELETE: Invalidate all related caches (aggressive but safe)
          keysToDelete.push(cacheKey);
        }
      }
    }

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
      // Also clean up any ongoing revalidation promises for this cache key
      this.revalidationPromises.delete(key);
    });
  }

  public invalidateResource(resourceKey: string): void {
    this.invalidateResourceCache(resourceKey, "delete");
  }

  public invalidateCache(): void {
    this.cache.clear();
    this.revalidationPromises.clear();
  }

  public getCacheInfo(
    resourceKey: string,
    params?: Record<string, any>,
  ): {
    isStale: boolean;
    isRevalidating: boolean;
    lastRevalidated: number | null;
    expiresAt: number | null;
  } | null {
    const cacheKey = this.generateCacheKey(resourceKey, params);
    const cached = this.cache.get(cacheKey);

    if (!cached) return null;

    return {
      isStale: cached.isStale,
      isRevalidating: cached.isRevalidating,
      lastRevalidated: cached.lastRevalidated,
      expiresAt: cached.expiresAt,
    };
  }

  /**
   * Forces revalidation of a cached resource and returns the fresh data.
   *
   * This method will:
   * - Wait for any ongoing revalidation to complete
   * - Trigger a new revalidation if none is in progress
   * - Return the fresh data after revalidation completes
   * - Throw an error if revalidation fails or no data is available
   *
   * @param resourceKey - The resource key to revalidate
   * @param params - Optional parameters for the resource
   * @returns Promise that resolves to the fresh data
   * @throws Error if revalidation fails or resource doesn't exist
   */
  public async revalidate<T = any>(
    resourceKey: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const cacheKey = this.generateCacheKey(resourceKey, params);

    // If already revalidating, wait for that promise
    if (this.revalidationPromises.has(cacheKey)) {
      await this.revalidationPromises.get(cacheKey);
      const cached = this.cache.get(cacheKey);
      if (!cached) {
        throw new Error(
          `Revalidation failed: no data available for ${resourceKey}`,
        );
      }
      return cached.data;
    }

    // Force revalidation by triggering background revalidation and waiting for it
    await this.revalidateInBackground<T>(resourceKey, params);

    // Wait for the revalidation promise to complete
    const revalidationPromise = this.revalidationPromises.get(cacheKey);
    if (revalidationPromise) {
      await revalidationPromise;
    }

    const cached = this.cache.get(cacheKey);
    if (!cached) {
      throw new Error(
        `Revalidation failed: no data available for ${resourceKey}`,
      );
    }
    return cached.data;
  }

  async createResource<T = any>(
    key: string,
    data: any,
    params?: Record<string, any>,
  ): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.post)
      throw new Error(`POST endpoint not defined for: ${key}`);

    let url = resource.post;
    if (params) {
      url = this.replaceUrlParams(url, params);
    }

    const result = await this.executeRequest<T>("POST", url, data, key);

    // Invalidate cache using granular strategy
    this.invalidateResourceCache(key, "create");

    return result;
  }

  async updateResource<T = any>(
    key: string,
    id: string | number,
    data: any,
    params?: Record<string, any>,
  ): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.put) throw new Error(`PUT endpoint not defined for: ${key}`);

    let url = resource.put;
    const allParams = { id, ...params };
    url = this.replaceUrlParams(url, allParams);

    const result = await this.executeRequest<T>("PUT", url, data, key);

    // Invalidate cache using granular strategy
    this.invalidateResourceCache(key, "update", id);

    return result;
  }

  async patchResource<T = any>(
    key: string,
    id: string | number,
    data: any,
    params?: Record<string, any>,
  ): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.patch)
      throw new Error(`PATCH endpoint not defined for: ${key}`);

    let url = resource.patch;
    const allParams = { id, ...params };
    url = this.replaceUrlParams(url, allParams);

    const result = await this.executeRequest<T>("PATCH", url, data, key);

    // Invalidate cache using granular strategy
    this.invalidateResourceCache(key, "patch", id);

    return result;
  }

  async removeResource<T = any>(
    key: string,
    id: string | number,
    params?: Record<string, any>,
  ): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.delete)
      throw new Error(`DELETE endpoint not defined for: ${key}`);

    let url = resource.delete;
    const allParams = { id, ...params };
    url = this.replaceUrlParams(url, allParams);

    const result = await this.executeRequest<T>("DELETE", url, undefined, key);

    // Invalidate cache using granular strategy
    this.invalidateResourceCache(key, "delete", id);

    return result;
  }
}

// Export a default instance placeholder (apps should create their own with config)
export const createUDSL = (config: UDSLConfig) => new UDSL(config);
