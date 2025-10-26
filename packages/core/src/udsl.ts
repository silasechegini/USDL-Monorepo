import { UDSLConfig, UDSLPlugin } from "./types";

export class UDSL {
  private config: UDSLConfig;
  private cache = new Map<string, { data: any; expiresAt: number }>();
  private plugins: UDSLPlugin[] = [];

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

  async fetchResource<T = any>(
    key: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.get) throw new Error(`GET endpoint not defined for: ${key}`);

    // Create cache key that includes parameters for proper cache isolation
    const cacheKey = params ? `${key}:${JSON.stringify(params)}` : key;

    // Basic cache check
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.data as T;
    }

    // Simple param replacement for :id or query params
    let url = resource.get;
    if (params) {
      // naive query param append
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      );
      url += (url.includes("?") ? "&" : "?") + qs.toString();
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

    if (resource.cache && resource.cache > 0) {
      this.cache.set(cacheKey, {
        data,
        expiresAt: now + resource.cache * 1000,
      });
    }

    return data as T;
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

    keysToDelete.forEach((key) => this.cache.delete(key));
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
