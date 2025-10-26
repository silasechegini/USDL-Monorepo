import { useEffect, useState, useMemo } from "react";
import type { UDSL } from "@udsl/core";
import { useUDSL } from "./context";

export function useData<T = any>(key: string, params?: Record<string, any>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Try to get the UDSL instance, but handle errors gracefully
  const udslInstance: UDSL | null = useUDSL();

  // Memoize the params string to avoid unnecessary re-renders
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  useEffect(() => {
    let mounted = true;

    // Reset state at the beginning of each effect
    setLoading(true);
    setError(null);
    setData(null);

    if (!udslInstance) {
      const errorInstance = new Error(
        "UDSL instance not set. Either call setGlobalUDSLInstance() or wrap your app in UDSLProvider and pass instance to it.",
      );
      setError(errorInstance);
      setLoading(false);
      return; // Return early instead of throwing
    }

    udslInstance
      .fetchResource<T>(key, params)
      .then((res) => {
        if (!mounted) return;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err);
        setData(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [key, paramsKey, udslInstance]); // Added udslInstance to handle context changes

  return { data, loading, error } as const;
}
