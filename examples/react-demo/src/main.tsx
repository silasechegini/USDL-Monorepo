import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { UDSLProvider } from "@udsl/react-adapter";
import { initUDSL } from "./udsl-setup";

const udsl = initUDSL();

createRoot(document.getElementById("root")!).render(
  <UDSLProvider instance={udsl}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </UDSLProvider>,
);
