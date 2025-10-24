"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  UDSL: () => UDSL,
  createUDSL: () => createUDSL
});
module.exports = __toCommonJS(index_exports);

// src/udsl.ts
var UDSL = class {
  config;
  cache = /* @__PURE__ */ new Map();
  plugins = [];
  constructor(config) {
    this.config = config;
  }
  registerPlugin(plugin) {
    this.plugins.push(plugin);
  }
  async runBeforeFetch(url, init) {
    for (const p of this.plugins) {
      if (p.beforeFetch) await p.beforeFetch(url, init);
    }
  }
  async runAfterFetch(url, response) {
    for (const p of this.plugins) {
      if (p.afterFetch) await p.afterFetch(url, response);
    }
  }
  async fetch(key, params) {
    const resource = this.config.resources[key];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (!resource.get) throw new Error(`GET endpoint not defined for: ${key}`);
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
    let url = resource.get;
    if (params) {
      const qs = new URLSearchParams(params);
      url += (url.includes("?") ? "&" : "?") + qs.toString();
    }
    const init = { method: "GET", headers: {} };
    await this.runBeforeFetch(url, init);
    const res = await fetch(url, init);
    await this.runAfterFetch(url, res);
    if (!res.ok) throw new Error(`Network error: ${res.status}`);
    const data = await res.json();
    if (resource.schema) {
      try {
        if (resource.schema._def) {
          resource.schema.parse(data);
        }
      } catch (e) {
        console.warn("Schema validation failed", e);
      }
    }
    if (resource.cache && resource.cache > 0) {
      this.cache.set(key, { data, expiresAt: now + resource.cache * 1e3 });
    }
    return data;
  }
};
var createUDSL = (config) => new UDSL(config);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UDSL,
  createUDSL
});
