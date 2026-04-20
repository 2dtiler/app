import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";

import "./index.css";
import App from "./App";
import { isSentryEnabled } from "@/lib/sentry";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      enableSystem={false}
      storageKey="2dtiler-theme"
      themes={["dark", "light"]}
    >
      <App />
    </ThemeProvider>
  </StrictMode>,
);

if (import.meta.env.PROD) {
  void import("./pwa");
}

// Load Sentry after render so it doesn't block the critical path
if (isSentryEnabled) {
  requestIdleCallback(() => import("./instrument"), { timeout: 5000 });
}
