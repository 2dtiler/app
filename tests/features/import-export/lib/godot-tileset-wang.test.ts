import { assert, test } from "vitest";
import { exportGodotTilesetBundle } from "@/features/import-export/lib/import-export-godot-tileset";
import { prepareGodotTilesetImport } from "@/features/import-export/lib/godot-tileset-import";
import "./tiled-test-support";
import {
  PNG_ASSET_RECORD,
  createTestTileset,
  createTestWangAutotileConfig,
  decodeText,
  withStubbedAssetLookup,
  withStubbedImageImportEnvironment,
} from "./tiled-test-support";
import type { AutotileConfig, Tileset } from "@/types";

function createNamedGodotWangAutotile(): AutotileConfig {
  return {
    version: 1,
    preset: "wang-named-colors",
    terrains: [],
    rules: [],
    wangSets: [
      {
        id: "wang-set-1" as NonNullable<
          NonNullable<AutotileConfig["wangSets"]>[number]
        >["id"],
        name: "Biomes",
        type: "mixed",
        tile: { sx: 0, sy: 0, sw: 16, sh: 16 },
        colors: [
          {
            index: 1,
            name: "Forest",
            color: "#116611",
            tile: { sx: 0, sy: 0, sw: 16, sh: 16 },
            probability: 2,
          },
          {
            index: 2,
            name: "River",
            color: "#2255ff",
            tile: { sx: 16, sy: 0, sw: 16, sh: 16 },
            probability: 0.75,
          },
        ],
        tiles: [
          {
            tile: { sx: 32, sy: 0, sw: 16, sh: 16 },
            wangId: [1, 2, 1, 2, 1, 2, 1, 2],
            probability: 0.5,
          },
        ],
      },
    ],
  };
}

async function exportTilesetDocument(tileset: Tileset) {
  return withStubbedAssetLookup(async () => {
    const entries = await exportGodotTilesetBundle(tileset);
    return {
      entries,
      document: decodeText(
        entries.find((entry) => entry.path.endsWith(".tres"))?.data ??
          new Uint8Array(),
      ),
    };
  }, PNG_ASSET_RECORD);
}

test("exportGodotTilesetBundle writes Godot terrain fields for simple Wang tiles", async () => {
  const tileset = createTestTileset();
  tileset.autotile = createTestWangAutotileConfig();

  const { document } = await exportTilesetDocument(tileset);

  assert.match(document, /terrain_set_0\/mode = 2/);
  assert.match(document, /terrain_set_0\/terrain_0\/name = "Land"/);
  assert.match(document, /1:0\/0\/terrain_set = 0/);
  assert.match(document, /1:0\/0\/terrain = 0/);
  assert.match(document, /1:0\/0\/terrains_peering_bit\/top_side = 0/);
  assert.match(document, /1:0\/0\/terrains_peering_bit\/right_side = 0/);
  assert.match(document, /1:0\/0\/terrains_peering_bit\/bottom_side = 0/);
  assert.match(document, /1:0\/0\/terrains_peering_bit\/left_side = 0/);
});

test("prepareGodotTilesetImport round-trips simple Wang autotile from exported Godot tilesets", async () => {
  const sourceTileset = createTestTileset();
  sourceTileset.autotile = createTestWangAutotileConfig();

  const { entries } = await exportTilesetDocument(sourceTileset);
  const rootPath = entries.find((entry) => entry.path.endsWith(".tres"))?.path;

  await withStubbedImageImportEnvironment(async () => {
    const result = await prepareGodotTilesetImport(rootPath ?? "terrain.tres", entries);

    assert.strictEqual(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }

    const importedTileset = result.result[0];
    assert.strictEqual(importedTileset?.autotile?.preset, "wang-tiles");
    assert.deepEqual(importedTileset?.autotile?.terrains[0]?.patternTiles?.["wang-00"], {
      sx: 0,
      sy: 0,
      sw: 16,
      sh: 16,
    });
    assert.deepEqual(importedTileset?.autotile?.terrains[0]?.patternTiles?.["wang-0f"], {
      sx: 16,
      sy: 0,
      sw: 16,
      sh: 16,
    });
  }, { width: 32, height: 16 });
});

test("Godot tileset Wang import and export preserve named mixed Wang geometry", async () => {
  const sourceTileset = createTestTileset();
  sourceTileset.imageWidth = 64;
  sourceTileset.autotile = createNamedGodotWangAutotile();

  const { entries, document } = await exportTilesetDocument(sourceTileset);
  const rootPath = entries.find((entry) => entry.path.endsWith(".tres"))?.path;

  assert.match(document, /terrain_set_0\/mode = 0/);
  assert.match(document, /terrain_set_0\/terrain_0\/name = "Forest"/);
  assert.match(document, /terrain_set_0\/terrain_1\/name = "River"/);
  assert.match(document, /2:0\/0\/probability = 0.5/);

  await withStubbedImageImportEnvironment(async () => {
    const result = await prepareGodotTilesetImport(rootPath ?? "terrain.tres", entries);

    assert.strictEqual(result.status, "ready");
    if (result.status !== "ready") {
      return;
    }

    const importedTileset = result.result[0];
    assert.strictEqual(importedTileset?.autotile?.preset, "wang-named-colors");
    assert.strictEqual(importedTileset?.autotile?.wangSets?.[0]?.type, "mixed");
    assert.deepEqual(
      importedTileset?.autotile?.wangSets?.[0]?.colors.map((color) => color.name),
      ["Forest", "River"],
    );
    assert.deepEqual(importedTileset?.autotile?.wangSets?.[0]?.tiles[0]?.wangId, [
      1,
      2,
      1,
      2,
      1,
      2,
      1,
      2,
    ]);
    assert.strictEqual(importedTileset?.autotile?.wangSets?.[0]?.tiles[0]?.probability, 0.5);
  }, { width: 64, height: 16 });
});