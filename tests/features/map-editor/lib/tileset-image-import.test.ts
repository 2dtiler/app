import { expect, test } from "vitest";
import {
  getTilesetImportName,
  isTilesetImageFile,
  normalizeTilesetImageMimeType,
} from "@/features/map-editor/lib/tileset-image-import";

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
