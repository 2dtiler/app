import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, assert, test, vi } from "vitest";
import { AI_PROVIDER_CONNECT_SOURCES } from "@/config/content-security-policy";
import { generateWithProvider } from "@/features/ai-assets/lib/providers";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalFetch = globalThis.fetch;
const originalImage = globalThis.Image;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.Image = originalImage;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function installImageMock() {
  URL.createObjectURL = vi.fn(() => "blob:test-image");
  URL.revokeObjectURL = vi.fn();

  class DecodingImage {
    decode = vi.fn().mockResolvedValue(undefined);
    height = 0;
    naturalHeight = 64;
    naturalWidth = 64;
    src = "";
    width = 0;
  }

  globalThis.Image = DecodingImage as unknown as typeof Image;
}

function getFetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("AI provider origins are covered by both CSP configurations", async () => {
  installImageMock();
  const seenOrigins = new Set<string>();

  globalThis.fetch = vi.fn(async (input) => {
    const url = getFetchUrl(input);
    seenOrigins.add(new URL(url).origin);

    if (url.startsWith("https://router.huggingface.co/")) {
      return new Response(
        new Blob([new Uint8Array([7])], { type: "image/png" }),
        {
          headers: {
            "x-ratelimit-limit": "10",
            "x-ratelimit-remaining": "9",
          },
        },
      );
    }

    if (url.startsWith("https://api.openai.com/")) {
      return new Response(
        JSON.stringify({ data: [{ b64_json: "b3BlbmFp" }] }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: "Z2VtaW5p",
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.startsWith("https://api.together.xyz/")) {
      return new Response(
        JSON.stringify({ data: [{ b64_json: "dG9nZXRoZXI=" }] }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.startsWith("https://api.x.ai/")) {
      return new Response(
        JSON.stringify({ data: [{ url: "data:image/png;base64,eGFp" }] }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  const baseRequest = {
    apiKey: "provider_test",
    prompt: "grass tile",
    count: 1,
    width: 64,
    height: 64,
    ratio: "1:1" as const,
    initImageB64: null,
    initImageMime: null,
  };

  await Promise.all([
    generateWithProvider("huggingface", {
      ...baseRequest,
      model: "black-forest-labs/FLUX.1-schnell",
    }),
    generateWithProvider("openai", {
      ...baseRequest,
      model: "gpt-image-1",
    }),
    generateWithProvider("gemini", {
      ...baseRequest,
      model: "gemini-2.5-flash-image",
      ratio: "16:9",
    }),
    generateWithProvider("together", {
      ...baseRequest,
      model: "black-forest-labs/FLUX.1-schnell",
    }),
    generateWithProvider("xai", {
      ...baseRequest,
      model: "aurora",
    }),
  ]);

  assert.deepEqual(
    [...seenOrigins].sort(),
    [...AI_PROVIDER_CONNECT_SOURCES].sort(),
  );

  const headersPath = path.resolve(
    import.meta.dirname,
    "../../public/_headers",
  );
  const headers = readFileSync(headersPath, "utf8");
  for (const origin of AI_PROVIDER_CONNECT_SOURCES) {
    assert.match(headers, new RegExp(escapeForRegex(origin)));
  }
});
