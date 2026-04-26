import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PHASER_MAP_EXPORT_OPTIONS,
  isPhaserMapOption,
  normalizePhaserMapBundleEntries,
} from "../src/features/import-export/lib/phaser-map-action-utils";
import { PHASER_MAP_IMPORT_CONFIG } from "../src/features/import-export/hooks/use-tiled-map-import";

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

  assert.deepEqual(
    entries.map((entry) => entry.path),
    ["maps/forest.json", "tilesets/forest.png"],
  );
});

test("DEFAULT_PHASER_MAP_EXPORT_OPTIONS force Phaser-safe Tiled JSON defaults", () => {
  assert.deepEqual(DEFAULT_PHASER_MAP_EXPORT_OPTIONS, {
    format: "json",
    encoding: "base64",
    compression: "zlib",
    compressionLevel: 6,
    tilesetMode: "inline",
    renderOrder: "right-down",
  });
});

test("PHASER_MAP_IMPORT_CONFIG only accepts JSON-style tilemaps", () => {
  assert.equal(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.json"), "json");
  assert.equal(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmj"), "json");
  assert.equal(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmx"), null);
  assert.equal(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.lua"), null);
});

test("isPhaserMapOption matches only the Phaser map option", () => {
  assert.equal(isPhaserMapOption("map-phaser"), true);
  assert.equal(isPhaserMapOption("map-tiled"), false);
});
