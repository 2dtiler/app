import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/assets/styles/index.css";
import App from "./App";
import { AppProviders } from "@/context/AppProviders";
import { initPwa } from "./pwa";
import { isSentryEnabled } from "@/services/sentry";

const STALE_CHUNK_RELOAD_KEY = "2dtiler:stale-chunk-reload";

function recoverFromStaleChunk() {
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === "1") {
    return;
  }

  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, "1");
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  recoverFromStaleChunk();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);

sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);

if (import.meta.env.PROD) {
  initPwa();
}

// Load Sentry after render so it doesn't block the critical path
if (isSentryEnabled) {
  requestIdleCallback(
    () => void import("./instrument").catch(() => recoverFromStaleChunk()),
    { timeout: 5000 },
  );
}
