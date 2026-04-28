import { expect, test } from "vitest";
import { PHASER_MAP_IMPORT_CONFIG } from "@/features/import-export/hooks/use-tiled-map-import";

test("PHASER_MAP_IMPORT_CONFIG only accepts JSON-style tilemaps", () => {
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.json")).toBe("json");
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmj")).toBe("json");
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmx")).toBeNull();
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.lua")).toBeNull();
});
