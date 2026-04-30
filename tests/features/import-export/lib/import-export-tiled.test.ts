import { assert, test } from "vitest";
import { exportTiledMapBundle } from "@/features/import-export/lib/import-export-tiled";
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

test("exportTiledMapBundle emits zero margin and spacing for inline TMX tilesets", async () => {
  const tileset = createTestTileset();
  tileset.animations = createTestAnimationConfig();
  const { map, layer } = createTestMap(tileset);

  await withStubbedAssetLookup(
    async () => {
      const entries = await exportTiledMapBundle(
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
          tilesetMode: "inline",
          renderOrder: "right-down",
        },
      );

      const mapEntry = entries.find((entry) => entry.path.endsWith(".tmx"));
      assert.ok(mapEntry);

      const document = new DOMParser().parseFromString(
        decodeText(mapEntry.data),
        "application/xml",
      );
      const tilesetElement = document.querySelector("map > tileset");
      assert.ok(tilesetElement);
      assert.strictEqual(tilesetElement?.getAttribute("margin"), "0");
      assert.strictEqual(tilesetElement?.getAttribute("spacing"), "0");
      assert.strictEqual(
        tilesetElement
          ?.querySelector('properties > property[name="2dtiler:animations"]')
          ?.getAttribute("value")
          ?.includes("Waterfall"),
        true,
      );
      assert.strictEqual(
        tilesetElement
          ?.querySelector('tile[id="0"] > animation > frame[tileid="1"]')
          ?.getAttribute("duration"),
        "150",
      );
    },
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
  );
});

test("exportTiledMapBundle serializes grouped layers, images, and objects into TMX", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportTiledMapBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      COMPLEX_TILED_OPTIONS,
    );

    const mapEntry = getRootEntry(entries, ".tmx");
    const mapText = decodeText(mapEntry.data);
    assert.match(mapText, /<group /);
    assert.match(mapText, /<imagelayer /);
    assert.match(mapText, /<objectgroup /);
    assert.match(mapText, /compression="zlib"/);
  }, PNG_ASSET_RECORD);
});
