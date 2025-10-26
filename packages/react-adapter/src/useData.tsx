import { useEffect, useState } from "react";
import type { UDSL } from "@udsl/core";
import { useUDSL } from "./context";

export function useData<T = any>(key: string, params?: Record<string, any>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const udslInstance: UDSL = useUDSL();

  useEffect(() => {
    let mounted = true;
    if (!udslInstance) {
      setError(
        new Error(
          "UDSL instance not set. Either call setGlobalUDSLInstance() or wrap your app in UDSLProvider and pass instance to it.",
        ),
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    udslInstance
      .fetchResource<T>(key, params)
      .then((res) => {
        if (!mounted) return;
        setData(res);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [key, JSON.stringify(params)]);

  return { data, loading, error } as const;
}
