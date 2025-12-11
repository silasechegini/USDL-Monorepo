export interface IUDSL {
  fetchResource<T>(key: string, params?: Record<string, any>): Promise<T>;
  registerPlugin(plugin: UDSLPlugin): void;
  invalidateResource(key: string): void;
  invalidateCache(): void;
  getCacheInfo(key: string, params?: Record<string, any>): CacheResult | null;
  revalidate<T>(key: string, params?: Record<string, any>): Promise<T>;
  createResource<T>(
    key: string,
    data: any,
    params?: Record<string, any>,
  ): Promise<T>;
  updateResource<T>(
    key: string,
    id: string | number,
    data: any,
    params?: Record<string, any>,
  ): Promise<T>;
  patchResource<T>(
    key: string,
    id: string | number,
    data: any,
    params?: Record<string, any>,
  ): Promise<T>;
  removeResource<T>(
    key: string,
    id: string | number,
    params?: Record<string, any>,
  ): Promise<T>;
}
export type ResourceConfig = {
  get?: string;
  post?: string;
  put?: string;
  patch?: string;
  delete?: string;
  cache?: number; // seconds
  schema?: unknown; // zod schema or JSON schema ref
};

export type CacheEntry = {
  data: any;
  expiresAt: number;
  isStale: boolean;
  isRevalidating: boolean;
  lastRevalidated: number;
};

export type CacheResult = {
  isStale: boolean;
  isRevalidating: boolean;
  lastRevalidated: number;
  expiresAt: number | null;
};

export type UDSLConfig = {
  resources: Record<string, ResourceConfig>;
};

export interface UDSLPlugin {
  beforeFetch?: (url: string, init: RequestInit) => Promise<void> | void;
  afterFetch?: (url: string, response: Response) => Promise<void> | void;
  // Telemetry hooks
  onCacheHit?: (resourceKey: string, isStale: boolean) => Promise<void> |void;
  onCacheMiss?: (resourceKey: string) => Promise<void> |void;
  onRevalidationStart?: (resourceKey: string) => Promise<void> |void;
  onRevalidationComplete?: (resourceKey: string, success: boolean) => Promise<void> |void;
  onOperationStart?: (
    operation: string,
    resourceKey: string,
    params?: any,
  ) => Promise<void> | void;
  onOperationComplete?: (
    operation: string,
    resourceKey: string,
    success: boolean,
    duration: number,
    result?: any,
  ) => Promise<void> | void;
}

export type MutateOperation = "create" | "update" | "patch" | "delete";
