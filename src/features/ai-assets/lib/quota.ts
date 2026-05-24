import type { AiQuotaState } from "@/types/integrations/ai-assets";

export const UNKNOWN_QUOTA: AiQuotaState = {
  limit: null,
  remaining: null,
  resetAt: null,
  source: "unknown",
};

function readHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null && value.trim() !== "") {
      return value;
    }
  }
  return null;
}

function readNumber(headers: Headers, names: string[]): number | null {
  const value = readHeader(headers, names);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readResetAt(headers: Headers): number | null {
  const rawReset = readHeader(headers, [
    "x-ratelimit-reset",
    "x-rate-limit-reset",
    "ratelimit-reset",
    "rate-limit-reset",
  ]);
  if (!rawReset) return null;

  const numeric = Number(rawReset);
  if (Number.isFinite(numeric)) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }

  const parsedDate = Date.parse(rawReset);
  return Number.isFinite(parsedDate) ? parsedDate : null;
}

export function parseQuotaHeaders(headers: Headers): AiQuotaState {
  const limit = readNumber(headers, [
    "x-ratelimit-limit",
    "x-rate-limit-limit",
    "ratelimit-limit",
    "rate-limit-limit",
  ]);
  const remaining = readNumber(headers, [
    "x-ratelimit-remaining",
    "x-rate-limit-remaining",
    "ratelimit-remaining",
    "rate-limit-remaining",
  ]);

  if (limit === null && remaining === null) {
    return UNKNOWN_QUOTA;
  }

  return {
    limit,
    remaining,
    resetAt: readResetAt(headers),
    source: "headers",
  };
}
