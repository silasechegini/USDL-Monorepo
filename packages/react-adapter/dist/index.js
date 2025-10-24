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
  UDSLProvider: () => UDSLProvider,
  setGlobalUDSLInstance: () => setGlobalUDSLInstance,
  useData: () => useData,
  useUDSL: () => useUDSL
});
module.exports = __toCommonJS(index_exports);

// src/useData.tsx
var import_react2 = require("react");

// src/context.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var UDSLContext = (0, import_react.createContext)(null);
var globalInstance = null;
function setGlobalUDSLInstance(instance) {
  globalInstance = instance;
}
var UDSLProvider = ({
  instance,
  children
}) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UDSLContext.Provider, { value: instance, children });
function useUDSL() {
  const ctx = (0, import_react.useContext)(UDSLContext);
  if (ctx) return ctx;
  if (globalInstance) return globalInstance;
  throw new Error("No UDSL instance found!");
}

// src/useData.tsx
function useData(key, params) {
  const [data, setData] = (0, import_react2.useState)(null);
  const [loading, setLoading] = (0, import_react2.useState)(true);
  const [error, setError] = (0, import_react2.useState)(null);
  const udslInstance = useUDSL();
  (0, import_react2.useEffect)(() => {
    let mounted = true;
    if (!udslInstance) {
      setError(new Error("UDSL instance not set. Call setUDSLInstance()"));
      setLoading(false);
      return;
    }
    setLoading(true);
    udslInstance.fetch(key, params).then((res) => {
      if (!mounted) return;
      setData(res);
    }).catch((err) => {
      if (!mounted) return;
      setError(err);
    }).finally(() => {
      if (!mounted) return;
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [key, JSON.stringify(params)]);
  return { data, loading, error };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UDSLProvider,
  setGlobalUDSLInstance,
  useData,
  useUDSL
});
