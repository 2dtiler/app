import * as Sentry from "@sentry/react";

// Initialize Sentry as early as possible
const dsn = import.meta.env.VITE_SENTRY_DSN;
// Only enable Sentry in production (e.g. Cloudflare Pages builds)
// This prevents alerts from local development (vite dev)
const isProd = import.meta.env.PROD;

if (dsn && isProd) {
  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of the transactions
    // Session Replay
    replaysSessionSampleRate: 0.1, // Sample 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions with errors
    sendDefaultPii: true,
    // Optional: Add environment tag to distinguish between preview and production
    environment: import.meta.env.MODE,
  });
}
