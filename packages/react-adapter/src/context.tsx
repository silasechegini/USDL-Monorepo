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

export function useUDSL(): UDSL {
  const ctx = useContext(UDSLContext);
  if (ctx) return ctx;
  if (globalInstance) return globalInstance;
  throw new Error("No UDSL instance found!");
}
