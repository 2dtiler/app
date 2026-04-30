import { assert, test } from "vitest";
import {
  exportTiledMapJsBundle,
  exportTiledMapJsonBundle,
} from "@/features/import-export/lib/import-export-tiled-json";
import {
  COMPLEX_TILED_OPTIONS,
  PNG_ASSET_RECORD,
  createTestAnimationConfig,
  createComplexTiledFixture,
  createTestMap,
  createTestTileset,
  decodeText,
  getRootEntry,
  withStubbedAssetLookup,
} from "./tiled-test-support";

test("exportTiledMapJsonBundle emits zero margin and spacing for external TSJ tilesets", async () => {
  const tileset = createTestTileset();
  tileset.animations = createTestAnimationConfig();
  const { map, layer } = createTestMap(tileset);

  await withStubbedAssetLookup(
    async () => {
      const entries = await exportTiledMapJsonBundle(
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

      const tilesetEntry = entries.find((entry) => entry.path.endsWith(".tsj"));
      assert.ok(tilesetEntry);

      const tilesetDocument = JSON.parse(decodeText(tilesetEntry.data)) as {
        margin?: number;
        spacing?: number;
        properties?: Array<{ name?: string; value?: string }>;
        tiles?: Array<{
          id?: number;
          animation?: Array<{ tileid?: number; duration?: number }>;
        }>;
      };
      assert.strictEqual(tilesetDocument.margin, 0);
      assert.strictEqual(tilesetDocument.spacing, 0);
      assert.ok(
        tilesetDocument.properties?.some(
          (property) => property.name === "2dtiler:animations",
        ),
      );
      assert.deepEqual(tilesetDocument.tiles?.[0], {
        id: 0,
        animation: [
          { tileid: 0, duration: 100 },
          { tileid: 1, duration: 150 },
        ],
      });
    },
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
  );
});

test("exportTiledMapJsonBundle serializes grouped layers and external tilesets through TMJ", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportTiledMapJsonBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      COMPLEX_TILED_OPTIONS,
    );

    const mapEntry = getRootEntry(entries, ".tmj");
    const mapDocument = JSON.parse(decodeText(mapEntry.data)) as {
      layers?: Array<{ type?: string }>;
      tilesets?: Array<{ source?: string }>;
    };
    assert.strictEqual(mapDocument.layers?.[1]?.type, "group");
    assert.ok(mapDocument.tilesets?.[0]?.source?.endsWith(".tsj"));
  }, PNG_ASSET_RECORD);
});

test("exportTiledMapJsBundle wraps grouped Tiled map data for JavaScript consumers", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportTiledMapJsBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      COMPLEX_TILED_OPTIONS,
    );

    const mapEntry = getRootEntry(entries, ".js");
    const mapText = decodeText(mapEntry.data);
    assert.match(mapText, /TileMaps\[name\] = data/);
    assert.match(mapText, /module\.exports = data/);
  }, PNG_ASSET_RECORD);
});
