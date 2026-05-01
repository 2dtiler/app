import { assert, test } from "vitest";
import { exportTiledMapBundle } from "@/features/import-export/lib/import-export-tiled";
import {
  exportTiledMapJsBundle,
  exportTiledMapJsonBundle,
} from "@/features/import-export/lib/import-export-tiled-json";
import { exportTiledMapLuaBundle } from "@/features/import-export/lib/import-export-tiled-lua";
import { prepareTiledMapImport } from "@/features/import-export/lib/tiled-map-import";
import {
  assertComplexImportResult,
  COMPLEX_TILED_OPTIONS,
  createTestAnimationConfig,
  createComplexTiledFixture,
  createTestMap,
  createTestTileset,
  createTestWangAutotileConfig,
  encodeText,
  getRootEntry,
  PNG_ASSET_RECORD,
  withStubbedAssetLookup,
  withStubbedImageImportEnvironment,
} from "./tiled-test-support";

test("prepareTiledMapImport normalizes external TSX tilesets with margin and spacing", async () => {
  await withStubbedImageImportEnvironment(
    async () => {
      const result = await prepareTiledMapImport(
        "maps/terrain.tmx",
        [
          {
            path: "maps/terrain.tmx",
            data: encodeText(
              [
                '<map version="1.10" orientation="orthogonal" width="2" height="1" tilewidth="16" tileheight="16" infinite="0">',
                '  <tileset firstgid="1" source="terrain.tsx"/>',
                '  <layer id="1" name="Ground" width="2" height="1">',
                '    <data encoding="csv">1,2</data>',
                "  </layer>",
                "</map>",
              ].join("\n"),
            ),
          },
          {
            path: "maps/terrain.tsx",
            data: encodeText(
              [
                '<tileset version="1.10" name="terrain" tilewidth="16" tileheight="16" tilecount="2" columns="2" margin="1" spacing="2">',
                '  <image source="images/terrain.png" width="36" height="18"/>',
                "</tileset>",
              ].join("\n"),
            ),
          },
          {
            path: "maps/images/terrain.png",
            data: new Uint8Array([1, 2, 3]),
          },
        ],
        "xml",
      );

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.strictEqual(result.result.tilesets.length, 1);
      assert.strictEqual(result.result.tilesets[0]?.imageWidth, 32);
      assert.strictEqual(result.result.tilesets[0]?.imageHeight, 16);

      const layer = result.result.layers[0];
      assert.ok(layer);
      assert.deepEqual(layer.tiles["0,0"], {
        tilesetId: result.result.tilesets[0]?.id,
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
        rotation: 0,
        flipX: false,
        flipY: false,
      });
      assert.deepEqual(layer.tiles["1,0"], {
        tilesetId: result.result.tilesets[0]?.id,
        sx: 16,
        sy: 0,
        sw: 16,
        sh: 16,
        rotation: 0,
        flipX: false,
        flipY: false,
      });
    },
    { width: 36, height: 18 },
  );
});

for (const scenario of [
  {
    label: "TMX",
    format: "xml" as const,
    extension: ".tmx",
    buildEntries: exportTiledMapBundle,
  },
  {
    label: "TMJ",
    format: "json" as const,
    extension: ".tmj",
    buildEntries: exportTiledMapJsonBundle,
  },
] as const) {
  test(`prepareTiledMapImport preserves Wang autotile and animations from ${scenario.label} tilesets`, async () => {
    const tileset = createTestTileset();
    tileset.imageWidth = 64;
    tileset.autotile = createTestWangAutotileConfig();
    tileset.animations = createTestAnimationConfig();
    const { map, layer } = createTestMap(tileset);

    await withStubbedAssetLookup(async () => {
      const entries = await scenario.buildEntries(
        map,
        [layer],
        [tileset],
        [],
        [],
        [],
        [],
        {
          encoding: "csv",
          compression: "none",
          compressionLevel: 0,
          tilesetMode: "external",
          renderOrder: "right-down",
        },
      );
      const rootEntry = getRootEntry(entries, scenario.extension);

      await withStubbedImageImportEnvironment(
        async () => {
          const imported = await prepareTiledMapImport(
            rootEntry.path,
            entries,
            scenario.format,
          );

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
          assert.strictEqual(
            importedTileset?.animations?.animations[0]?.name,
            "Waterfall",
          );
          assert.deepEqual(
            importedTileset?.animations?.animations[0]?.frames[1]?.cells[0],
            {
              sx: 16,
              sy: 0,
              sw: 16,
              sh: 16,
            },
          );
        },
        { width: 64, height: 16 },
      );
    }, PNG_ASSET_RECORD);
  });
}

for (const scenario of [
  {
    label: "TMX",
    format: "xml" as const,
    extension: ".tmx",
    buildEntries: exportTiledMapBundle,
    expectedMapName: "Fancy: Terrain",
  },
  {
    label: "TMJ",
    format: "json" as const,
    extension: ".tmj",
    buildEntries: exportTiledMapJsonBundle,
    expectedMapName: "Fancy: Terrain",
  },
  {
    label: "JS",
    format: "js" as const,
    extension: ".js",
    buildEntries: exportTiledMapJsBundle,
    expectedMapName: "Fancy: Terrain",
  },
  {
    label: "Lua",
    format: "lua" as const,
    extension: ".lua",
    buildEntries: exportTiledMapLuaBundle,
    expectedMapName: "Fancy- Terrain",
  },
] as const) {
  test(`prepareTiledMapImport imports complex ${scenario.label} bundles`, async () => {
    const fixture = createComplexTiledFixture();

    await withStubbedAssetLookup(async () => {
      const entries = await scenario.buildEntries(
        fixture.map,
        fixture.layers,
        [fixture.tileset],
        fixture.imageLayers,
        fixture.layerGroups,
        fixture.objectLayers,
        fixture.objects,
        COMPLEX_TILED_OPTIONS,
      );
      const rootEntry = getRootEntry(entries, scenario.extension);

      await withStubbedImageImportEnvironment(
        async () => {
          const imported = await prepareTiledMapImport(
            rootEntry.path,
            entries,
            scenario.format,
          );
          assertComplexImportResult(imported, scenario.expectedMapName);
        },
        { width: 32, height: 32 },
      );
    }, PNG_ASSET_RECORD);
  });
}

for (const scenario of [
  {
    label: "JSON",
    format: "json" as const,
    extension: ".tmj",
    buildEntries: exportTiledMapJsonBundle,
  },
  {
    label: "JS",
    format: "js" as const,
    extension: ".js",
    buildEntries: exportTiledMapJsBundle,
  },
  {
    label: "LUA",
    format: "lua" as const,
    extension: ".lua",
    buildEntries: exportTiledMapLuaBundle,
  },
] as const) {
  test(`prepareTiledMapImport reports missing linked resources for ${scenario.label} bundles`, async () => {
    const fixture = createComplexTiledFixture();

    await withStubbedAssetLookup(async () => {
      const entries = await scenario.buildEntries(
        fixture.map,
        fixture.layers,
        [fixture.tileset],
        fixture.imageLayers,
        fixture.layerGroups,
        fixture.objectLayers,
        fixture.objects,
        COMPLEX_TILED_OPTIONS,
      );
      const rootEntry = getRootEntry(entries, scenario.extension);
      const imported = await prepareTiledMapImport(
        rootEntry.path,
        [rootEntry],
        scenario.format,
      );
      assert.strictEqual(imported.status, "missing-resources");
      if (imported.status !== "missing-resources") {
        return;
      }

      const missingPaths = imported.missingResources.map(
        (resource) => resource.path,
      );
      assert.ok(missingPaths.some((path) => path.endsWith(".png")));
      assert.ok(
        missingPaths.some((path) =>
          path.endsWith(scenario.format === "lua" ? ".tsx" : ".tsj"),
        ),
      );
    }, PNG_ASSET_RECORD);
  });
}
