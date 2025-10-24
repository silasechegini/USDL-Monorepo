type ResourceConfig = {
    get?: string;
    post?: string;
    cache?: number;
    schema?: unknown;
};
type UDSLConfig = {
    resources: Record<string, ResourceConfig>;
};
interface UDSLPlugin {
    beforeFetch?: (url: string, init: RequestInit) => Promise<void> | void;
    afterFetch?: (url: string, response: Response) => Promise<void> | void;
}
declare class UDSL {
    private config;
    private cache;
    private plugins;
    constructor(config: UDSLConfig);
    registerPlugin(plugin: UDSLPlugin): void;
    private runBeforeFetch;
    private runAfterFetch;
    fetch<T = any>(key: string, params?: Record<string, any>): Promise<T>;
}
declare const createUDSL: (config: UDSLConfig) => UDSL;

export { type ResourceConfig, UDSL, type UDSLConfig, type UDSLPlugin, createUDSL };
