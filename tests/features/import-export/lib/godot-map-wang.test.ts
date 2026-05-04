import { assert, test } from "vitest";
import { prepareGodotMapImport } from "@/features/import-export/lib/godot-map-import";
import { exportGodotMapBundle } from "@/features/import-export/lib/import-export-godot";
import "./tiled-test-support";
import {
  PNG_ASSET_RECORD,
  createTestMap,
  createTestTileset,
  createTestWangAutotileConfig,
  decodeText,
  getRootEntry,
  withStubbedAssetLookup,
  withStubbedImageImportEnvironment,
} from "./tiled-test-support";

for (const scenario of [
  {
    label: "embedded TileSet subresources",
    tilesetMode: "embedded" as const,
  },
  {
    label: "external TileSet resources",
    tilesetMode: "external" as const,
  },
] as const) {
  test(`exportGodotMapBundle preserves Wang terrain metadata for ${scenario.label}`, async () => {
    const tileset = createTestTileset();
    tileset.autotile = createTestWangAutotileConfig();
    const { map, layer } = createTestMap(tileset);

    await withStubbedAssetLookup(async () => {
      const entries = await exportGodotMapBundle(
        map,
        [layer],
        [tileset],
        [],
        [],
        [],
        [],
        {
          sceneRootName: "",
          tilesetMode: scenario.tilesetMode,
          textureMode: "copy",
        },
      );

      const expectedEntry =
        scenario.tilesetMode === "embedded"
          ? getRootEntry(entries, ".tscn")
          : getRootEntry(entries, ".tres");
      const document = decodeText(expectedEntry.data);

      assert.match(document, /terrain_set_0_0\/mode = 2|terrain_set_0\/mode = 2/);
      assert.match(document, /1:0\/0\/terrain_set = 0/);
      assert.match(document, /1:0\/0\/terrains_peering_bit\/top_side = 0/);
    }, PNG_ASSET_RECORD);
  });

  test(`prepareGodotMapImport preserves Wang autotile metadata from ${scenario.label}`, async () => {
    const tileset = createTestTileset();
    tileset.autotile = createTestWangAutotileConfig();
    const { map, layer } = createTestMap(tileset);

    await withStubbedAssetLookup(async () => {
      const entries = await exportGodotMapBundle(
        map,
        [layer],
        [tileset],
        [],
        [],
        [],
        [],
        {
          sceneRootName: "",
          tilesetMode: scenario.tilesetMode,
          textureMode: "copy",
        },
      );
      const rootEntry = getRootEntry(entries, ".tscn");

      await withStubbedImageImportEnvironment(async () => {
        const imported = await prepareGodotMapImport(rootEntry.path, entries);

        assert.strictEqual(imported.status, "ready");
        if (imported.status !== "ready") {
          return;
        }

        const importedTileset = imported.result.tilesets[0];
        assert.strictEqual(importedTileset?.autotile?.preset, "wang-tiles");
        assert.deepEqual(
          importedTileset?.autotile?.terrains[0]?.patternTiles?.["wang-0f"],
          {
            sx: 16,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        );
      }, { width: 32, height: 16 });
    }, PNG_ASSET_RECORD);
  });

  test(`Godot map Wang export and import keep terrain-set indexes stable for multiple tilesets in ${scenario.label}`, async () => {
    const firstTileset = createTestTileset();
    firstTileset.name = "terrain-a";
    firstTileset.autotile = createTestWangAutotileConfig();

    const secondTileset = createTestTileset();
    secondTileset.name = "terrain-b";
    secondTileset.autotile = createTestWangAutotileConfig();

    const { map, layer } = createTestMap(firstTileset);
    const secondLayer = {
      ...layer,
      id: "layer-second" as typeof layer.id,
      name: "Ground B",
      tiles: {
        "0,0": {
          tilesetId: secondTileset.id,
          sx: 0,
          sy: 0,
          sw: 16,
          sh: 16,
        },
      },
    };
    map.layerOrder = [layer.id, secondLayer.id];

    await withStubbedAssetLookup(async () => {
      const entries = await exportGodotMapBundle(
        map,
        [layer, secondLayer],
        [firstTileset, secondTileset],
        [],
        [],
        [],
        [],
        {
          sceneRootName: "",
          tilesetMode: scenario.tilesetMode,
          textureMode: "copy",
        },
      );
      const expectedEntry =
        scenario.tilesetMode === "embedded"
          ? getRootEntry(entries, ".tscn")
          : getRootEntry(entries, ".tres");
      const document = decodeText(expectedEntry.data);

      assert.match(document, /terrain_set_0\/mode = 2/);
      assert.match(document, /terrain_set_1\/mode = 2/);
      assert.match(document, /\/terrain_set = 0/);
      assert.match(document, /\/terrain_set = 1/);

      const rootEntry = getRootEntry(entries, ".tscn");
      await withStubbedImageImportEnvironment(async () => {
        const imported = await prepareGodotMapImport(rootEntry.path, entries);

        assert.strictEqual(imported.status, "ready");
        if (imported.status !== "ready") {
          return;
        }

        assert.strictEqual(imported.result.tilesets.length, 2);
        assert.deepEqual(
          imported.result.tilesets.map((tileset) => tileset.autotile?.preset),
          ["wang-tiles", "wang-tiles"],
        );
      }, { width: 32, height: 16 });
    }, PNG_ASSET_RECORD);
  });
}