import { zipSync } from "fflate";
import { assert, test } from "vitest";
import { exportTiledMapBundle } from "@/features/import-export/lib/import-export-tiled";
import { encodeJsonDocument } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  importTiledProjectFromZip,
  prepareTiledProjectImport,
} from "@/features/import-export/lib/import-export-tiled-project";
import {
  COMPLEX_TILED_OPTIONS,
  PNG_ASSET_RECORD,
  createComplexTiledFixture,
  getRootEntry,
  withStubbedAssetLookup,
  withStubbedImageImportEnvironment,
} from "./tiled-test-support";

function createProjectEntry() {
  return {
    path: "demo.tiled-project",
    data: encodeJsonDocument({
      automappingRulesFile: "",
      commands: [],
      extensionsPath: "extensions",
      folders: ["."],
      propertyTypes: [],
    }),
  };
}

test("prepareTiledProjectImport resolves bundled Tiled project entries", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    await withStubbedImageImportEnvironment(
      async () => {
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
        const prepared = await prepareTiledProjectImport([
          createProjectEntry(),
          ...entries,
        ]);

        assert.strictEqual(prepared.status, "ready");
        if (prepared.status !== "ready") {
          return;
        }

        assert.strictEqual(prepared.result.maps.length, 1);
        assert.strictEqual(
          prepared.result.maps[0]?.map.widthInTiles,
          fixture.map.widthInTiles,
        );
        assert.strictEqual(
          prepared.result.maps[0]?.map.heightInTiles,
          fixture.map.heightInTiles,
        );
      },
      {
        width: fixture.tileset.imageWidth,
        height: fixture.tileset.imageHeight,
      },
    );
  }, PNG_ASSET_RECORD);
});

test("prepareTiledProjectImport deduplicates missing linked resources across maps", async () => {
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
    const rootEntry = getRootEntry(entries, ".tmx");
    const duplicateRootEntry = {
      path: rootEntry.path.replace(/\.tmx$/, "-copy.tmx"),
      data: rootEntry.data,
    };
    const prepared = await prepareTiledProjectImport([
      createProjectEntry(),
      rootEntry,
      duplicateRootEntry,
    ]);

    assert.strictEqual(prepared.status, "missing-resources");
    if (prepared.status !== "missing-resources") {
      return;
    }

    const missingPaths = prepared.missingResources.map(
      (resource) => resource.path,
    );
    assert.strictEqual(
      missingPaths.filter((path) => path.endsWith(".tsx")).length,
      1,
    );
    assert.strictEqual(
      missingPaths.filter((path) => path.endsWith(".png")).length,
      1,
    );
    assert.deepEqual([...new Set(missingPaths)], missingPaths);
  }, PNG_ASSET_RECORD);
});

test("importTiledProjectFromZip preserves bundled zip import behavior", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    await withStubbedImageImportEnvironment(
      async () => {
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
        const result = await importTiledProjectFromZip(
          zipSync(
            Object.fromEntries(
              [createProjectEntry(), ...entries].map((entry) => [
                entry.path,
                entry.data,
              ]),
            ),
          ),
        );

        assert.strictEqual(result.maps.length, 1);
        assert.strictEqual(result.maps[0]?.map.name, fixture.map.name);
      },
      {
        width: fixture.tileset.imageWidth,
        height: fixture.tileset.imageHeight,
      },
    );
  }, PNG_ASSET_RECORD);
});
