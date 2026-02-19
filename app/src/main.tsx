import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Load Sentry after render so it doesn't block the critical path
requestIdleCallback(() => import("./instrument"), { timeout: 5000 });
