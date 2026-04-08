const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim() || "";

export const isSentryEnabled = Boolean(import.meta.env.PROD && sentryDsn);

export { sentryDsn };

async function loadSentry() {
  if (!isSentryEnabled) {
    return null;
  }

  return import("@sentry/react");
}

export async function submitBugReportToSentry(
  description: string,
  email: string,
) {
  const Sentry = await loadSentry();

  if (!Sentry) {
    return;
  }

  const reporterEmail = email.trim() || undefined;

  Sentry.setUser({ email: reporterEmail });
  Sentry.captureEvent({
    message: `Bug Report: ${description.slice(0, 80)}`,
    level: "error",
    tags: { source: "bug-report-dialog" },
    extra: {
      description,
      reporterEmail: reporterEmail || "not provided",
    },
    user: {
      email: reporterEmail,
    },
  });

  await Sentry.flush(3000);
}
