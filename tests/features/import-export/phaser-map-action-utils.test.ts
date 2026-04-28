import { expect, test } from "vitest";
import {
  DEFAULT_PHASER_MAP_EXPORT_OPTIONS,
  isPhaserMapOption,
  normalizePhaserMapBundleEntries,
} from "@/features/import-export/lib/phaser-map-action-utils";
import { PHASER_MAP_IMPORT_CONFIG } from "@/features/import-export/hooks/use-tiled-map-import";

test("normalizePhaserMapBundleEntries renames TMJ roots to JSON", () => {
  const entries = normalizePhaserMapBundleEntries([
    {
      path: "maps/forest.tmj",
      data: new Uint8Array([1, 2, 3]),
    },
    {
      path: "tilesets/forest.png",
      data: new Uint8Array([4, 5, 6]),
    },
  ]);

  expect(entries.map((entry) => entry.path)).toEqual([
    "maps/forest.json",
    "tilesets/forest.png",
  ]);
});

test("DEFAULT_PHASER_MAP_EXPORT_OPTIONS force Phaser-safe Tiled JSON defaults", () => {
  expect(DEFAULT_PHASER_MAP_EXPORT_OPTIONS).toEqual({
    format: "json",
    encoding: "base64",
    compression: "zlib",
    compressionLevel: 6,
    tilesetMode: "inline",
    renderOrder: "right-down",
  });
});

test("PHASER_MAP_IMPORT_CONFIG only accepts JSON-style tilemaps", () => {
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.json")).toBe("json");
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmj")).toBe("json");
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmx")).toBeNull();
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.lua")).toBeNull();
});

test("isPhaserMapOption matches only the Phaser map option", () => {
  expect(isPhaserMapOption("map-phaser")).toBe(true);
  expect(isPhaserMapOption("map-tiled")).toBe(false);
});