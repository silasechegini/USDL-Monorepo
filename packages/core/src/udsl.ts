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

  async fetch<T = any>(key: string, params?: Record<string, any>): Promise<T> {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.get) throw new Error(`GET endpoint not defined for: ${key}`);

    // Basic cache check
    const cached = this.cache.get(key);
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
        if ((resource.schema as any)._def) {
          (resource.schema as any).parse(data);
        }
      } catch (e) {
        console.warn("Schema validation failed", e);
      }
    }

    if (resource.cache && resource.cache > 0) {
      this.cache.set(key, { data, expiresAt: now + resource.cache * 1000 });
    }

    return data as T;
  }
}

// Export a default instance placeholder (apps should create their own with config)
export const createUDSL = (config: UDSLConfig) => new UDSL(config);
