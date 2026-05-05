import { expect, test, vi } from "vitest";
import {
  createPendingTilesetImageImport,
  getTilesetImportName,
  isTilesetImageFile,
  normalizeTilesetImageMimeType,
} from "@/features/map-editor/lib/tileset-image-import";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalImage = globalThis.Image;

test("detects raster image files by MIME type or known extension", () => {
  expect(
    isTilesetImageFile(new File([], "sheet.bin", { type: "image/png" })),
  ).toBe(true);
  expect(isTilesetImageFile(new File([], "sheet.webp", { type: "" }))).toBe(
    true,
  );
  expect(isTilesetImageFile(new File([], "sheet.2dt", { type: "" }))).toBe(
    false,
  );
});

test("normalizes empty image MIME types from file extensions", () => {
  expect(normalizeTilesetImageMimeType({ name: "sheet.jpg", type: "" })).toBe(
    "image/jpeg",
  );
  expect(normalizeTilesetImageMimeType({ name: "sheet.webp", type: "" })).toBe(
    "image/webp",
  );
  expect(normalizeTilesetImageMimeType({ name: "sheet.bmp", type: "" })).toBe(
    "image/bmp",
  );
  expect(normalizeTilesetImageMimeType({ name: "sheet.gif", type: "" })).toBe(
    "image/gif",
  );
  expect(normalizeTilesetImageMimeType({ name: "sheet", type: "" })).toBe(
    "image/png",
  );
});

test("derives a stable tileset name from the imported file", () => {
  expect(getTilesetImportName("terrain.v2.png")).toBe("terrain.v2");
  expect(getTilesetImportName(".png")).toBe("Imported Tileset");
});

test("createPendingTilesetImageImport decodes the image and revokes its object URL", async () => {
  const createObjectURL = vi.fn(() => "blob:tileset");
  const revokeObjectURL = vi.fn();
  const decode = vi.fn().mockResolvedValue(undefined);

  class DecodingImage {
    decode = decode;
    height = 0;
    naturalHeight = 48;
    naturalWidth = 96;
    src = "";
    width = 0;
  }

  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  globalThis.Image = DecodingImage as unknown as typeof Image;

  const result = await createPendingTilesetImageImport(
    new File([new Uint8Array([1, 2, 3])], "terrain.png", { type: "" }),
  );

  expect(result).toMatchObject({
    fileName: "terrain.png",
    name: "terrain",
    mimeType: "image/png",
    width: 96,
    height: 48,
  });
  expect(decode).toHaveBeenCalled();
  expect(createObjectURL).toHaveBeenCalled();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:tileset");

  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.Image = originalImage;
});

test("createPendingTilesetImageImport falls back to load events when decode is unavailable", async () => {
  const createObjectURL = vi.fn(() => "blob:fallback");
  const revokeObjectURL = vi.fn();

  class FallbackImage {
    height = 40;
    naturalHeight = 0;
    naturalWidth = 0;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    width = 80;

    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.();
      });
    }
  }

  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  globalThis.Image = FallbackImage as unknown as typeof Image;

  const result = await createPendingTilesetImageImport(
    new File([new Uint8Array([4, 5, 6])], "terrain.webp", { type: "" }),
  );

  expect(result).toMatchObject({
    fileName: "terrain.webp",
    name: "terrain",
    mimeType: "image/webp",
    width: 80,
    height: 40,
  });
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:fallback");

  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.Image = originalImage;
});
