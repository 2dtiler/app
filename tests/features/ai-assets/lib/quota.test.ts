import { assert, test } from "vitest";
import { parseQuotaHeaders, UNKNOWN_QUOTA } from "@/features/ai-assets/lib/quota";

test("parses common quota headers", () => {
  const headers = new Headers({
    "x-ratelimit-limit": "100",
    "x-ratelimit-remaining": "42",
    "x-ratelimit-reset": "2000000000",
  });

  assert.deepEqual(parseQuotaHeaders(headers), {
    limit: 100,
    remaining: 42,
    resetAt: 2000000000000,
    source: "headers",
  });
});

test("returns unknown quota when headers are missing", () => {
  assert.deepEqual(parseQuotaHeaders(new Headers()), UNKNOWN_QUOTA);
});
