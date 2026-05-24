import { afterEach, assert, expect, test, vi } from "vitest";
import { generateWithProvider } from "@/features/ai-assets/lib/providers";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalImage = globalThis.Image;
const originalFetch = globalThis.fetch;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.Image = originalImage;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function installImageMock() {
  URL.createObjectURL = vi.fn(() => "blob:hf");
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

test("generates Hugging Face images through the provider route", async () => {
  installImageMock();
  const fetchMock = vi.fn(async () =>
    new Response(new Blob([new Uint8Array([7])], { type: "image/png" }), {
      headers: {
        "x-ratelimit-limit": "10",
        "x-ratelimit-remaining": "9",
      },
    }),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await generateWithProvider("huggingface", {
    apiKey: "hf_test",
    model: "black-forest-labs/FLUX.1-schnell",
    prompt: "grass tile",
    count: 1,
    width: 64,
    height: 64,
    ratio: "1:1",
    initImageB64: null,
    initImageMime: null,
  });

  assert.strictEqual(result.images.length, 1);
  assert.strictEqual(result.images[0]?.mimeType, "image/png");
  assert.deepEqual(result.quota, {
    limit: 10,
    remaining: 9,
    resetAt: null,
    source: "headers",
  });
  assert.match(String(fetchMock.mock.calls[0]?.[0]), /router\.huggingface\.co/);
});

test("surfaces provider error payloads", async () => {
  installImageMock();
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: "bad token" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  ) as typeof fetch;

  await expect(
    generateWithProvider("huggingface", {
      apiKey: "hf_bad",
      model: "black-forest-labs/FLUX.1-schnell",
      prompt: "grass tile",
      count: 1,
      width: 64,
      height: 64,
      ratio: "1:1",
      initImageB64: null,
      initImageMime: null,
    }),
  ).rejects.toThrow(/bad token/);
});
