export type ResourceConfig = {
  get?: string;
  post?: string;
  put?: string;
  patch?: string;
  delete?: string;
  cache?: number; // seconds
  schema?: unknown; // zod schema or JSON schema ref
};

export type UDSLConfig = {
  resources: Record<string, ResourceConfig>;
};

export interface UDSLPlugin {
  beforeFetch?: (url: string, init: RequestInit) => Promise<void> | void;
  afterFetch?: (url: string, response: Response) => Promise<void> | void;
}
