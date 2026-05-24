import { assert, expect, test } from "vitest";
import { prepareGodotMapImport } from "@/features/import-export/lib/godot-map-import";
import { exportGodotMapBundle } from "@/features/import-export/lib/import-export-godot";
import { db } from "@/services/db";
import {
  PNG_ASSET_RECORD,
  createComplexTiledFixture,
  decodeText,
  getRootEntry,
  getReadyImportResult,
  withStubbedAssetLookup,
  withStubbedImageImportEnvironment,
} from "./tiled-test-support";

test("Godot export and import preserve complex maps", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportGodotMapBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      {
        sceneRootName: "Root/Name",
        tilesetMode: "external",
        textureMode: "copy",
      },
    );
    const sceneEntry = getRootEntry(entries, ".tscn");
    const sceneText = decodeText(sceneEntry.data);

    assert.match(sceneText, /\[node name="Root Name" type="Node2D"\]/);
    assert.match(sceneText, /metadata\/2dtiler_kind = "map"/);
    assert.match(sceneText, /tile_map_data = PackedByteArray/);
    assert.match(sceneText, /modulate = Color\(1, 1, 1, 0.45\)/);
    assert.match(sceneText, /flip_h = true/);
    assert.match(sceneText, /\[node name="Spawn" type="Polygon2D"/);
    assert.match(sceneText, /\[node name="Label" type="Label"/);
    assert.match(sceneText, /\[node name="Marker" type="Marker2D"/);
    assert.ok(entries.some((entry) => entry.path.startsWith("tilesets/")));
    assert.ok(entries.some((entry) => entry.path.startsWith("images/layers/")));

    await withStubbedImageImportEnvironment(
      async () => {
        const imported = await prepareGodotMapImport(sceneEntry.path, entries);
        const result = getReadyImportResult(imported);

        assert.strictEqual(result.map.name, "Root Name");
        assert.strictEqual(result.tilesets[0]?.name, "terrain-set");
        assert.strictEqual(result.layers.length, 2);
        assert.strictEqual(result.imageLayers[0]?.name, "Backdrop");
        assert.strictEqual(result.imageLayers[0]?.opacity, 45);
        assert.strictEqual(result.layerGroups[0]?.name, "Decor");
        assert.strictEqual(result.objectLayers[0]?.name, "Objects");
        assert.ok(result.objects.find((object) => object.name === "Spawn"));
        assert.ok(result.objects.find((object) => object.name === "Label"));
        assert.ok(result.objects.find((object) => object.name === "Bounds"));
        assert.ok(result.objects.find((object) => object.name === "Marker"));
      },
      { width: 32, height: 32 },
    );
  }, PNG_ASSET_RECORD);
});

test("Godot export reports missing image assets", async () => {
  const fixture = createComplexTiledFixture();
  const originalGet = db.assets.get;
  db.assets.get = (async () => undefined) as typeof db.assets.get;

  try {
    await expect(
      exportGodotMapBundle(
        fixture.map,
        fixture.layers,
        [fixture.tileset],
        fixture.imageLayers,
        fixture.layerGroups,
        fixture.objectLayers,
        fixture.objects,
      ),
    ).rejects.toThrow(/Missing image asset/);
  } finally {
    db.assets.get = originalGet;
  }
});
