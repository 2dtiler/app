import { zipSync } from "fflate";
import { assert, test } from "vitest";
import {
  exportGodotProjectEntries,
  prepareGodotProjectArchive,
  prepareGodotProjectImport,
} from "@/features/import-export/lib/import-export-godot-project";
import {
  PNG_ASSET_RECORD,
  createTestMap,
  createTestProject,
  createTestTileset,
  decodeText,
  encodeText,
  withStubbedAssetLookup,
  withStubbedImageImportEnvironment,
} from "./tiled-test-support";

function createGodotProjectFixture() {
  const tileset = createTestTileset();
  const { map, layer } = createTestMap(tileset);
  const project = createTestProject(tileset);

  project.name = "Godot Demo";
  project.mapGroups = [{ id: map.groupId, name: "World", order: 0 }];
  project.maps = [map];
  project.layers = [layer];

  return {
    map,
    project,
    tileset,
  };
}

test("exportGodotProjectEntries creates a Godot project archive layout", async () => {
  const { project } = createGodotProjectFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportGodotProjectEntries(project);
    const projectEntry = entries.find((entry) => entry.path === "project.godot");
    const sceneEntry = entries.find((entry) =>
      entry.path.endsWith("terrain-map.tscn"),
    );

    assert.ok(projectEntry);
    assert.ok(sceneEntry);
    assert.match(decodeText(projectEntry.data), /config_version=5/);
    assert.match(
      decodeText(projectEntry.data),
      /run\/main_scene="res:\/\/scenes\/World\/terrain-map\.tscn"/,
    );
    assert.ok(entries.some((entry) => entry.path.startsWith("tilesets/")));
    assert.ok(entries.some((entry) => entry.path.startsWith("images/")));
    assert.match(decodeText(sceneEntry.data), /res:\/\/tilesets\//);
  }, PNG_ASSET_RECORD);
});

test("prepareGodotProjectImport imports exported Godot project entries", async () => {
  const { map, project } = createGodotProjectFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportGodotProjectEntries(project);

    await withStubbedImageImportEnvironment(
      async () => {
        const prepared = await prepareGodotProjectImport(entries);

        assert.strictEqual(prepared.status, "ready");
        if (prepared.status !== "ready") return;

        assert.strictEqual(prepared.result.maps.length, 1);
        assert.strictEqual(prepared.result.maps[0]?.map.name, map.name);
        assert.strictEqual(
          prepared.result.maps[0]?.map.widthInTiles,
          map.widthInTiles,
        );
        assert.strictEqual(prepared.result.warnings.length, 0);
      },
      { width: 32, height: 16 },
    );
  }, PNG_ASSET_RECORD);
});

test("prepareGodotProjectArchive rebases zipped project folders", async () => {
  const { project } = createGodotProjectFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportGodotProjectEntries(project);
    const zipData = zipSync(
      Object.fromEntries(
        entries.map((entry) => [`Godot Demo/${entry.path}`, entry.data]),
      ),
    );

    await withStubbedImageImportEnvironment(
      async () => {
        const prepared = await prepareGodotProjectArchive(zipData);

        assert.strictEqual(prepared.projectName, "Godot Demo");
        assert.strictEqual(prepared.preparation.status, "ready");
      },
      { width: 32, height: 16 },
    );
  }, PNG_ASSET_RECORD);
});

test("prepareGodotProjectImport deduplicates missing linked resources across scenes", async () => {
  const sceneData = encodeText(`
[gd_scene load_steps=2 format=3]

[ext_resource type="TileSet" path="res://tilesets/shared.tres" id="tileset_1"]

[node name="Map" type="Node2D"]
metadata/2dtiler_kind = "map"

[node name="Ground" type="TileMapLayer" parent="."]
tile_set = ExtResource("tileset_1")
`);

  const prepared = await prepareGodotProjectImport([
    {
      path: "project.godot",
      data: encodeText(`
config_version=5

[application]
config/name="Missing Resources"
`),
    },
    { path: "scenes/one.tscn", data: sceneData },
    { path: "scenes/two.tscn", data: sceneData },
  ]);

  assert.strictEqual(prepared.status, "missing-resources");
  if (prepared.status !== "missing-resources") return;

  assert.deepEqual(
    prepared.missingResources.map((resource) => resource.path),
    ["tilesets/shared.tres"],
  );
});