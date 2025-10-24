// src/useData.tsx
import { useEffect, useState } from "react";

// src/context.tsx
import { createContext, useContext } from "react";
import { jsx } from "react/jsx-runtime";
var UDSLContext = createContext(null);
var globalInstance = null;
function setGlobalUDSLInstance(instance) {
  globalInstance = instance;
}
var UDSLProvider = ({
  instance,
  children
}) => /* @__PURE__ */ jsx(UDSLContext.Provider, { value: instance, children });
function useUDSL() {
  const ctx = useContext(UDSLContext);
  if (ctx) return ctx;
  if (globalInstance) return globalInstance;
  throw new Error("No UDSL instance found!");
}

// src/useData.tsx
function useData(key, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const udslInstance = useUDSL();
  useEffect(() => {
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
export {
  UDSLProvider,
  setGlobalUDSLInstance,
  useData,
  useUDSL
};
