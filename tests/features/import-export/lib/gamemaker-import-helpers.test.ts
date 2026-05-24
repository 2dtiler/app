import { parseHTML } from "linkedom";
import { assert, expect, test } from "vitest";
import {
  addMissingResource,
  buildRoomMetadataProperties,
  collectMissingImageChain,
  createProperty,
  getLegacyBackgroundDescriptors,
  getLegacyTilesetDescriptors,
  isBackgroundLayer,
  isInstanceLayer,
  isTileLayer,
  normalizeGameMakerPath,
  parseJsonEntry,
  parseModernTileData,
  readBooleanField,
  readNumberField,
  readObjectRef,
  readStringField,
  readTilesetRef,
  resolveImagePathFromRecord,
  toTileSize,
} from "@/features/import-export/lib/gamemaker-import-helpers";
import {
  GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY,
  GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY,
  GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY,
  GAMEMAKER_ROOM_SPEED_PROPERTY_KEY,
} from "@/features/import-export/lib/gamemaker-property-keys";
import { encodeText } from "./tiled-test-support";

test("reads GameMaker scalar fields and resource references", () => {
  assert.strictEqual(normalizeGameMakerPath("rooms/room/room.yy", "../sprites/spr.yy"), "rooms/sprites/spr.yy");
  assert.strictEqual(normalizeGameMakerPath("rooms/room.yy", "sprites/spr/spr.yy"), "sprites/spr/spr.yy");
  assert.strictEqual(readNumberField({ width: "12" }, ["missing", "width"], 4), 12);
  assert.strictEqual(readNumberField({ width: "bad" }, ["width"], 4), 4);
  assert.strictEqual(readBooleanField({ enabled: "yes" }, ["enabled"]), true);
  assert.strictEqual(readBooleanField({ enabled: 0 }, ["enabled"], true), false);
  assert.strictEqual(readBooleanField({ enabled: "no" }, ["enabled"], true), false);
  assert.strictEqual(readBooleanField({ enabled: "maybe" }, ["enabled"], true), true);
  assert.strictEqual(readStringField({ name: " Player " }, ["name"]), " Player ");
  assert.strictEqual(readStringField({ name: " " }, ["name"]), null);
  assert.strictEqual(toTileSize(16), 16);
  expect(() => toTileSize(16.5)).toThrow(/Unsupported/);
  assert.deepEqual(createProperty("hello", "string"), {
    value: "hello",
    type: "string",
  });

  assert.strictEqual(isTileLayer({ resourceType: "GMRTileLayer" }), true);
  assert.strictEqual(isBackgroundLayer({ modelName: "GMRBackgroundLayer" }), true);
  assert.strictEqual(isInstanceLayer({ __type: "GMRInstanceLayer" }), true);
  assert.deepEqual(readTilesetRef({ tilesetName: "terrain" }), {
    name: "terrain",
    path: "tilesets/terrain/terrain.yy",
  });
  assert.deepEqual(
    readObjectRef({ object: { name: "obj_player", path: "objects/player.yy" } }),
    { name: "obj_player", path: "objects/player.yy" },
  );
});

test("parses GameMaker JSON entries and image reference chains", () => {
  const entries = new Map([
    ["sprites/spr/spr.yy", encodeText(JSON.stringify({ frames: [{ name: "frame0" }] }))],
    ["sprites/direct/direct.yy", encodeText(JSON.stringify({ imagePath: "direct.png" }))],
    ["rooms/room/room.yy", encodeText(JSON.stringify({ name: "room" }))],
  ]);

  assert.deepEqual(parseJsonEntry(entries, "rooms/room/room.yy"), {
    name: "room",
  });
  assert.strictEqual(
    resolveImagePathFromRecord(entries, "tilesets/terrain/terrain.yy", {
      sprite: { path: "../../sprites/spr/spr.yy" },
    }),
    "frame0.png",
  );
  assert.strictEqual(
    resolveImagePathFromRecord(entries, "tilesets/direct/direct.yy", {
      spritePath: "../../sprites/direct/direct.yy",
    }),
    "direct.png",
  );
  assert.strictEqual(
    resolveImagePathFromRecord(entries, "tilesets/missing/missing.yy", {}),
    null,
  );
});

test("collects missing GameMaker image resources without duplicates", () => {
  const missing = new Map();
  const entries = new Map([
    ["sprites/spr/spr.yy", encodeText(JSON.stringify({ frames: [{ path: "frame.png" }] }))],
  ]);

  collectMissingImageChain(
    entries,
    missing,
    "tilesets/terrain/terrain.yy",
    { imagePath: "../../images/missing.png" },
    "Terrain",
  );
  collectMissingImageChain(
    entries,
    missing,
    "tilesets/terrain/terrain.yy",
    { spritePath: "../../sprites/missing/missing.yy" },
    "Terrain",
  );
  collectMissingImageChain(
    entries,
    missing,
    "tilesets/terrain/terrain.yy",
    { spritePath: "../../sprites/spr/spr.yy" },
    "Terrain",
  );
  addMissingResource(missing, "images/missing.png", "image", "again.yy", "Again");

  assert.deepEqual(
    Array.from(missing.values()).map((resource) => ({
      path: resource.path,
      kind: resource.kind,
      label: resource.label,
      referringPath: resource.referringPath,
    })),
    [
      {
        path: "images/missing.png",
        kind: "image",
        label: "Terrain",
        referringPath: "tilesets/terrain/terrain.yy",
      },
      {
        path: "sprites/missing/missing.yy",
        kind: "json",
        label: "Terrain sprite resource",
        referringPath: "tilesets/terrain/terrain.yy",
      },
      {
        path: "frame.png",
        kind: "image",
        label: "Terrain",
        referringPath: "sprites/spr/spr.yy",
      },
    ],
  );
});

test("parses legacy resource descriptors from XML", () => {
  const { document } = parseHTML(`
    <rooms>
      <tilesetResources>
        <tileset name="terrain" image="terrain.png" tileSize="16" />
        <tileset name="" image="skip.png" tileSize="16" />
      </tilesetResources>
      <backgroundResources>
        <background backgroundName="sky" backgroundPath="sky.png" />
        <background name="clouds" image="clouds.png" />
      </backgroundResources>
    </rooms>
  `);

  assert.deepEqual(Array.from(getLegacyTilesetDescriptors(document).values()), [
    { name: "terrain", imagePath: "terrain.png", tileSize: 16 },
  ]);
  assert.deepEqual(
    Array.from(getLegacyBackgroundDescriptors(document).values()),
    [{ name: "sky", imagePath: "sky.png" }],
  );
});

test("builds room metadata and parses modern tile data", () => {
  const properties = buildRoomMetadataProperties(
    {
      caption: "Dungeon",
      speed: "30",
      creationCodeFile: "rooms/room/create.gml",
    },
    { persistent: "true" },
  );

  assert.strictEqual(properties[GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY]?.value, "Dungeon");
  assert.strictEqual(properties[GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY]?.value, "true");
  assert.strictEqual(properties[GAMEMAKER_ROOM_SPEED_PROPERTY_KEY]?.value, "30");
  assert.strictEqual(
    properties[GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY]?.value,
    "rooms/room/create.gml",
  );

  assert.deepEqual(
    parseModernTileData({
      SerialiseHeight: 2,
      TileSerialiseData: [0, -1, { x: 3, y: 1, value: 7 }, "bad"],
    }),
    {
      width: 4,
      height: 2,
      cells: [
        { x: 0, y: 0, value: 0 },
        { x: 3, y: 1, value: 7 },
      ],
    },
  );
  assert.deepEqual(
    parseModernTileData({
      width: 2,
      tiles: [{ x: 1, y: 2, index: 5 }, { x: 0, y: 0, index: -1 }, null],
    }),
    {
      width: 2,
      height: 3,
      cells: [{ x: 1, y: 2, value: 5 }],
    },
  );
  assert.deepEqual(parseModernTileData({ TileCompressedData: "1, 2  -1" }).cells, [
    { x: 0, y: 0, value: 1 },
    { x: 0, y: 1, value: 2 },
  ]);
});
