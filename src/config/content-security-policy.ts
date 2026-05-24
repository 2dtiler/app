export const APP_CONNECT_SOURCES = [
  "'self'",
  "https://o4510891797250048.ingest.us.sentry.io",
  "https://*.sentry.io",
  "https://cloudflareinsights.com",
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://www.google.com",
  "https://api.2dtiler.com",
] as const;

export const AI_PROVIDER_CONNECT_SOURCES = [
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com",
  "https://api.together.xyz",
  "https://api.x.ai",
  "https://router.huggingface.co",
] as const;

export const CONNECT_SOURCES = [
  ...APP_CONNECT_SOURCES,
  ...AI_PROVIDER_CONNECT_SOURCES,
] as const;
