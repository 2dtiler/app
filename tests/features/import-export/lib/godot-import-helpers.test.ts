import { assert, expect, test } from "vitest";
import {
  coerceTileSize,
  collectMissingResources,
  createImportContext,
  getDocument,
  getMetadataBoolean,
  getMetadataNumber,
  getMetadataString,
  getResourceOrientation,
  parseBoolean,
  parseColorAlpha,
  parseGodotDocument,
  parseGodotStringLiteral,
  parseMetadata,
  parseNumber,
  parsePackedByteArray,
  parsePackedVector2Array,
  parseReference,
  parseStoredProperties,
  parseVector,
  radiansToDegrees,
  resolveExtResource,
  resolveGodotResourcePath,
  snapQuarterRotation,
} from "@/features/import-export/lib/godot-import-helpers";
import { encodeText } from "./tiled-test-support";

test("parses Godot documents and resolves parent paths", () => {
  const document = parseGodotDocument(
    "scenes/main.tscn",
    encodeText(`
[gd_scene load_steps=3 format=3]

[ext_resource type="Texture2D" path="res://art/grass.png" id="texture_1"]
[ext_resource type="PackedScene" path="../shared/tree.tscn" id="scene_1"]

[sub_resource type="TileSet" id="tileset_1"]
tile_shape = 3
tile_offset_axis = 1
tile_layout = 1

[node name="Root" type="Node2D"]

[node name="Child" type="Node2D" parent="."]
metadata/title = "A child"

[node name="Grandchild" type="Node2D" parent="Child"]
`),
  );

  assert.strictEqual(document.kind, "scene");
  assert.strictEqual(document.extResources.get("texture_1")?.resolvedPath, "art/grass.png");
  assert.strictEqual(
    document.extResources.get("scene_1")?.resolvedPath,
    "shared/tree.tscn",
  );
  assert.strictEqual(document.subResources.get("tileset_1")?.kind, "sub_resource");
  assert.deepEqual(
    document.nodes.map((node) => [node.name, node.parent, node.path]),
    [
      ["Root", null, "Root"],
      ["Child", "Root", "Root/Child"],
      ["Grandchild", "Root/Child", "Root/Child/Grandchild"],
    ],
  );
});

test("rejects unsupported Godot documents", () => {
  expect(() => parseGodotDocument("bad.tscn", encodeText("[gd_binary]"))).toThrow(
    /Unsupported/,
  );
  expect(() => parseGodotDocument("empty.tscn", encodeText(""))).toThrow(
    /Invalid/,
  );
  expect(() =>
    parseGodotDocument("binary.tscn", new Uint8Array([0, 1, 2])),
  ).toThrow(/Binary/);
});

test("collects missing linked resources recursively", () => {
  const context = createImportContext([
    {
      path: "scenes/main.tscn",
      data: encodeText(`
[gd_scene load_steps=2 format=3]
[ext_resource type="PackedScene" path="res://scenes/child.tscn" id="scene_1"]
[ext_resource type="Texture2D" path="res://art/missing.png" id="texture_1"]
[node name="Root" type="Node2D"]
`),
    },
    {
      path: "scenes/child.tscn",
      data: encodeText(`
[gd_scene load_steps=2 format=3]
[ext_resource type="TileSet" path="res://tilesets/missing.tres" id="tileset_1"]
[node name="Child" type="Node2D"]
`),
    },
  ]);
  const document = getDocument(context, "scenes/main.tscn");
  const missing = new Map();

  collectMissingResources(document, context, missing, new Set());
  collectMissingResources(document, context, missing, new Set([document.path]));

  assert.deepEqual(
    Array.from(missing.values()).map((resource) => ({
      path: resource.path,
      kind: resource.kind,
      label: resource.label,
      referringPath: resource.referringPath,
    })),
    [
      {
        path: "tilesets/missing.tres",
        kind: "tres",
        label: "Godot resource",
        referringPath: "scenes/child.tscn",
      },
      {
        path: "art/missing.png",
        kind: "image",
        label: "Image asset",
        referringPath: "scenes/main.tscn",
      },
    ],
  );
  expect(() => getDocument(context, "missing.tscn")).toThrow(/Missing linked/);
});

test("parses Godot scalar, vector, packed, metadata, and rotation values", () => {
  assert.strictEqual(parseGodotStringLiteral('"hello\\nworld"'), "hello\nworld");
  assert.strictEqual(resolveGodotResourcePath("scenes/main.tscn", "res://art/a.png"), "art/a.png");
  assert.strictEqual(resolveGodotResourcePath("scenes/main.tscn", "../art/a.png"), "art/a.png");
  assert.deepEqual(parseReference('ExtResource("texture_1")'), {
    kind: "ExtResource",
    id: "texture_1",
  });
  assert.strictEqual(parseReference("Resource()"), null);
  assert.strictEqual(parseNumber("12.5", 3), 12.5);
  assert.strictEqual(parseNumber("nope", 3), 3);
  assert.strictEqual(parseBoolean("true", false), true);
  assert.strictEqual(parseBoolean("false", true), false);
  assert.strictEqual(parseBoolean("maybe", true), true);
  assert.deepEqual(parseVector("Vector2i(4, 8)"), { x: 4, y: 8 });
  assert.strictEqual(parseVector("Vector3(1, 2, 3)"), null);
  assert.strictEqual(parseColorAlpha("Color(1, 0.5, 0, 0.25)"), 0.25);
  assert.strictEqual(parseColorAlpha("not-color"), 1);
  assert.deepEqual(Array.from(parsePackedByteArray("PackedByteArray(1, 2, 255)")), [
    1,
    2,
    255,
  ]);
  assert.deepEqual(Array.from(parsePackedByteArray("PackedByteArray()")), []);
  expect(() => parsePackedByteArray("PackedByteArray(300)")).toThrow(
    /contents/,
  );
  assert.deepEqual(parsePackedVector2Array("PackedVector2Array(1, 2, 3, 4)"), [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);
  assert.deepEqual(parsePackedVector2Array("bad"), []);

  const metadata = parseMetadata({
    name: "Label",
    type: "Label",
    parent: null,
    path: "Root/Label",
    properties: {
      "metadata/title": '"Hello"',
      "metadata/count": "42",
      "metadata/enabled": "true",
      text: '"ignored"',
    },
  });
  assert.strictEqual(getMetadataString(metadata, "title"), "Hello");
  assert.strictEqual(getMetadataString(metadata, "missing"), undefined);
  assert.strictEqual(getMetadataNumber(metadata, "count"), 42);
  assert.strictEqual(getMetadataNumber({ count: "nan" }, "count"), undefined);
  assert.strictEqual(getMetadataBoolean(metadata, "enabled"), true);
  assert.strictEqual(getMetadataBoolean({ enabled: "maybe" }, "enabled"), undefined);
  assert.deepEqual(parseStoredProperties('"{\\"hp\\":{\\"value\\":\\"1\\",\\"type\\":\\"int\\"}}"'), {
    hp: { value: "1", type: "int" },
  });
  assert.deepEqual(parseStoredProperties("not-json"), {});
  assert.strictEqual(snapQuarterRotation(-95), 270);
  assert.strictEqual(Math.round(radiansToDegrees(String(Math.PI / 2))), 90);
});

test("resolves resources, orientations, and tile sizes", () => {
  const document = parseGodotDocument(
    "tilesets/set.tres",
    encodeText(`
[gd_resource type="TileSet" load_steps=2 format=3]
[ext_resource type="Texture2D" path="res://art/tiles.png" id="texture_1"]
[resource]
tile_shape = 2
tile_offset_axis = 0
tile_layout = 0
`),
  );

  assert.strictEqual(resolveExtResource(document, { kind: "SubResource", id: "x" }), null);
  assert.strictEqual(resolveExtResource(document, { kind: "ExtResource", id: "texture_1" })?.path, "res://art/tiles.png");
  assert.deepEqual(getResourceOrientation(document.resourceSection), {
    orientation: "staggered",
    staggerAxis: "x",
    staggerIndex: "odd",
  });
  assert.deepEqual(getResourceOrientation({ kind: "resource", attrs: {}, properties: { tile_shape: "1" } }), {
    orientation: "isometric",
  });
  assert.deepEqual(getResourceOrientation(null), { orientation: "orthogonal" });
  assert.strictEqual(coerceTileSize(16), 16);
  expect(() => coerceTileSize(17)).toThrow(/Unsupported tile size/);
});
