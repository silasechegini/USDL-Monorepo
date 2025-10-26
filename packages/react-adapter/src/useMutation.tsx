import { useState, useCallback } from "react";
import type { UDSL } from "@udsl/core";
import { useUDSL } from "./context";
import {
  CreateVariables,
  DeleteVariables,
  MutationResult,
  PatchVariables,
  UpdateVariables,
} from "./types";

export function useMutation<T = any, TVariables = any>(
  mutationFn: (udsl: UDSL, variables: TVariables) => Promise<T>,
): MutationResult<T, TVariables> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Try to get the UDSL instance, but handle errors gracefully
  let udslInstance: UDSL | null = useUDSL();

  const mutate = useCallback(
    async (variables: TVariables): Promise<T> => {

      if (!udslInstance) {
        throw new Error(
          "UDSL instance not set. Either call setGlobalUDSLInstance() or wrap your app in UDSLProvider and pass instance to it.",
        );
      }

      setLoading(true);
      setError(null);

      try {
        const result = await mutationFn(udslInstance, variables);
        setData(result);
        return result;
      } catch (err) {
        const errorInstance = err as Error;
        setError(errorInstance);
        throw errorInstance;
      } finally {
        setLoading(false);
      }
    },
    [udslInstance, mutationFn],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    mutate,
    reset,
  } as const;
}

// Specific CRUD mutation hooks

export function useCreate<T = any, TData = any>(key: string) {
  return useMutation<T, CreateVariables<TData>>((udsl, variables) =>
    udsl.createResource<T>(key, variables.data, variables.params),
  );
}

export function useUpdate<T = any, TData = any>(key: string) {
  return useMutation<T, UpdateVariables<TData>>((udsl, variables) =>
    udsl.updateResource<T>(key, variables.id, variables.data, variables.params),
  );
}

export function usePatch<T = any, TData = any>(key: string) {
  return useMutation<T, PatchVariables<TData>>((udsl, variables) =>
    udsl.patchResource<T>(key, variables.id, variables.data, variables.params),
  );
}

export function useDelete<T = any>(key: string) {
  return useMutation<T, DeleteVariables>((udsl, variables) =>
    udsl.removeResource<T>(key, variables.id, variables.params),
  );
}
