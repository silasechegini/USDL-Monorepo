import React, { createContext, useContext } from "react";
import type { UDSL } from "@udsl/core";

const UDSLContext = createContext<UDSL | null>(null);
let globalInstance: UDSL | null = null;
export function setGlobalUDSLInstance(instance: UDSL) {
  globalInstance = instance;
}

export const UDSLProvider = ({
  instance,
  children,
}: {
  instance: UDSL;
  children: React.ReactNode;
}) => <UDSLContext.Provider value={instance}>{children}</UDSLContext.Provider>;

/**
 * Returns the current UDSL instance from context or the global instance.
 *
 * @throws If called outside of a UDSLProvider and no global instance is set.
 * @remarks This hook must be used within a UDSLProvider or after calling setGlobalUDSLInstance.
 */
export function useUDSL(): UDSL {
  const ctx = useContext(UDSLContext);
  if (ctx) return ctx;
  if (globalInstance) return globalInstance;
  throw new Error("No UDSL instance found!");
}
