import { afterEach, assert, test, vi } from "vitest";
import { imageSourceToProviderImage } from "@/features/ai-assets/lib/provider-utils";

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

function installImageMock(width = 16, height = 24) {
  URL.createObjectURL = vi.fn(() => "blob:image");
  URL.revokeObjectURL = vi.fn();

  class DecodingImage {
    decode = vi.fn().mockResolvedValue(undefined);
    height = 0;
    naturalHeight = height;
    naturalWidth = width;
    src = "";
    width = 0;
  }

  globalThis.Image = DecodingImage as unknown as typeof Image;
}

test("normalizes base64 data URLs into provider images", async () => {
  installImageMock();

  const image = await imageSourceToProviderImage(
    "data:image/png;base64,AQID",
  );

  assert.strictEqual(image.mimeType, "image/png");
  assert.strictEqual(image.width, 16);
  assert.strictEqual(image.height, 24);
  assert.deepEqual([...new Uint8Array(image.data)], [1, 2, 3]);
});

test("normalizes URL responses into provider images", async () => {
  installImageMock(32, 48);
  globalThis.fetch = vi.fn(async () => new Response(new Blob([new Uint8Array([9])], { type: "image/webp" }))) as typeof fetch;

  const image = await imageSourceToProviderImage("https://example.com/a.webp");

  assert.strictEqual(image.mimeType, "image/webp");
  assert.strictEqual(image.width, 32);
  assert.strictEqual(image.height, 48);
  assert.deepEqual([...new Uint8Array(image.data)], [9]);
});
