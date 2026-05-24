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

test("generates OpenAI images with JSON requests", async () => {
  installImageMock();
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "b3BlbmFp" }] }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await generateWithProvider("openai", {
    apiKey: "openai_test",
    model: "gpt-image-1",
    prompt: "stone tile",
    count: 1,
    width: 64,
    height: 64,
    ratio: "1:1",
    initImageB64: null,
    initImageMime: null,
  });

  const [, init] = fetchMock.mock.calls[0] ?? [];
  assert.strictEqual(result.images[0]?.mimeType, "image/png");
  assert.match(String(init?.body), /"size":"64x64"/);
});

test("generates OpenAI edits with multipart requests", async () => {
  installImageMock();
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "ZWRpdA==" }] }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await generateWithProvider("openai", {
    apiKey: "openai_test",
    model: "gpt-image-1",
    prompt: "mossy stone tile",
    count: 1,
    width: 64,
    height: 64,
    ratio: "1:1",
    initImageB64: "AQID",
    initImageMime: "image/png",
  });

  const [url, init] = fetchMock.mock.calls[0] ?? [];
  assert.match(String(url), /images\/edits/);
  assert.ok(init?.body instanceof FormData);
  assert.strictEqual(result.images[0]?.mimeType, "image/png");
});

test("generates Gemini images with text and optional image parts", async () => {
  installImageMock();
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true },
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
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await generateWithProvider("gemini", {
    apiKey: "gemini_test",
    model: "gemini-2.5-flash-image",
    prompt: "water tile",
    count: 1,
    width: 64,
    height: 64,
    ratio: "16:9",
    initImageB64: "AQID",
    initImageMime: "image/png",
  });

  const [, init] = fetchMock.mock.calls[0] ?? [];
  assert.match(String(init?.body), /"aspectRatio":"16:9"/);
  assert.match(String(init?.body), /"inline_data"/);
  assert.strictEqual(result.images[0]?.mimeType, "image/png");
});

test("rejects Gemini responses without image parts", async () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [] } }] }), {
        headers: { "Content-Type": "application/json" },
      }),
  ) as typeof fetch;

  await expect(
    generateWithProvider("gemini", {
      apiKey: "gemini_test",
      model: "gemini-2.5-flash-image",
      prompt: "water tile",
      count: 1,
      width: 64,
      height: 64,
      ratio: "1:1",
      initImageB64: null,
      initImageMime: null,
    }),
  ).rejects.toThrow(/no image/);
});

test("generates Together and xAI images", async () => {
  installImageMock();
  globalThis.fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ b64_json: "dG9nZXRoZXI=" }, { b64_json: "dGlsZQ==" }],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ url: "https://example.test/xai.png" }] }), {
        headers: { "Content-Type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(new Blob([new Uint8Array([1])], { type: "image/png" })),
    ) as typeof fetch;

  const baseRequest = {
    apiKey: "provider_test",
    prompt: "lava tile",
    count: 2,
    width: 64,
    height: 64,
    ratio: "1:1",
    initImageB64: null,
    initImageMime: null,
  };

  const together = await generateWithProvider("together", {
    ...baseRequest,
    model: "black-forest-labs/FLUX.1-schnell",
  });
  const xai = await generateWithProvider("xai", {
    ...baseRequest,
    model: "grok-2-image",
    count: 1,
  });

  assert.strictEqual(together.images.length, 2);
  assert.strictEqual(together.images[0]?.mimeType, "image/jpeg");
  assert.strictEqual(xai.images.length, 1);
});

test("uses Hugging Face provider routes and error payloads", async () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ message: "quota exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
  ) as typeof fetch;

  await expect(
    generateWithProvider("huggingface", {
      apiKey: "hf_bad",
      model: "org/model:replicate",
      prompt: "grass tile",
      count: 1,
      width: 64,
      height: 64,
      ratio: "1:1",
      initImageB64: null,
      initImageMime: null,
    }),
  ).rejects.toThrow(/quota exceeded/);
  assert.match(
    String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]),
    /replicate\/models\/org\/model/,
  );
});
