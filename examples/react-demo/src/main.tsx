import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { UDSLProvider } from "@udsl/react-adapter";
import { initUDSL } from "./udsl-setup";

const udsl = initUDSL();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UDSLProvider instance={udsl}>
      <App />
    </UDSLProvider>
  </React.StrictMode>
);
