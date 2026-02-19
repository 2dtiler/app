import * as Sentry from "@sentry/react";

// Sentry is loaded lazily (via requestIdleCallback in main.tsx) to avoid
// blocking the critical render path. Early startup errors won't be captured,
// but performance impact is eliminated.
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
