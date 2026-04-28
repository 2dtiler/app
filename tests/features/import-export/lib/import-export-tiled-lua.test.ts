import { assert, test } from "vitest";
import { exportTiledMapLuaBundle } from "@/features/import-export/lib/import-export-tiled-lua";
import { parseTiledLuaDocument } from "@/features/import-export/lib/tiled-lua";
import {
  COMPLEX_TILED_OPTIONS,
  PNG_ASSET_RECORD,
  createComplexTiledFixture,
  decodeText,
  getRootEntry,
  withStubbedAssetLookup,
} from "./tiled-test-support";

test("exportTiledMapLuaBundle serializes grouped layers with external TSX tilesets", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportTiledMapLuaBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      COMPLEX_TILED_OPTIONS,
    );

    const mapEntry = getRootEntry(entries, ".lua");
    const mapDocument = parseTiledLuaDocument<{
      layers?: Array<{ type?: string }>;
      tilesets?: Array<{ filename?: string }>;
    }>(mapEntry.data, "Tiled Lua map");
    assert.strictEqual(mapDocument.layers?.[1]?.type, "group");
    assert.ok(mapDocument.tilesets?.[0]?.filename?.endsWith(".tsx"));

    const tilesetEntry = entries.find((entry) => entry.path.endsWith(".tsx"));
    assert.ok(tilesetEntry);
    const tilesetDocument = new DOMParser().parseFromString(
      decodeText(tilesetEntry.data),
      "application/xml",
    );
    const tilesetElement = tilesetDocument.querySelector("tileset");
    assert.ok(tilesetElement);
    assert.strictEqual(tilesetElement?.getAttribute("margin"), "0");
    assert.strictEqual(tilesetElement?.getAttribute("spacing"), "0");
  }, PNG_ASSET_RECORD);
});
