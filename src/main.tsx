import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/assets/styles/index.css";
import App from "./App";
import { AppProviders } from "@/context/AppProviders";
import { isSentryEnabled } from "@/services/sentry";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);

if (import.meta.env.PROD) {
  void import("./pwa");
}

// Load Sentry after render so it doesn't block the critical path
if (isSentryEnabled) {
  requestIdleCallback(() => import("./instrument"), { timeout: 5000 });
}
