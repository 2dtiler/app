import { assert, test } from "vitest";
import { exportGameMakerMapBundle } from "@/features/import-export/lib/import-export-gamemaker";
import {
  GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY,
  GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY,
  GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY,
  GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY,
  GAMEMAKER_ROOM_SPEED_PROPERTY_KEY,
} from "@/features/import-export/lib/gamemaker-property-keys";
import { db } from "@/services/db";
import type {
  ImageLayer,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

test("exportGameMakerMapBundle encodes background, tile, instance, and room metadata in YY output", async () => {
  const originalGet = db.assets.get;
  db.assets.get = (async (assetId) => ({
    id: assetId,
    data: new Uint8Array([9, 8, 7]).buffer,
    mimeType: "image/png",
    createdAt: Date.now(),
  })) as typeof db.assets.get;

  try {
    const mapProperties: Record<string, PropertyValue> = {
      [GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY]: {
        type: "string",
        value: "Forest Room",
      },
      [GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY]: {
        type: "bool",
        value: "true",
      },
      [GAMEMAKER_ROOM_SPEED_PROPERTY_KEY]: {
        type: "int",
        value: "30",
      },
      [GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY]: {
        type: "file",
        value: "rooms/forest/create.gml",
      },
    };
    const map: TileMapData = {
      id: "map-1",
      name: "forest",
      groupId: "group-1" as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles: 4,
      heightInTiles: 2,
      tileSize: 16,
      properties: mapProperties,
      layerOrder: ["bg-1", "tiles-1", "objects-1"],
      createdAt: 0,
    };
    const layers: TileLayer[] = [
      {
        id: "tiles-1",
        mapId: map.id,
        name: "Ground",
        visible: true,
        locked: false,
        tiles: {
          "1,0": {
            tilesetId: "tileset-1",
            sx: 16,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        },
      },
    ];
    const tilesets: Tileset[] = [
      {
        id: "tileset-1",
        name: "terrain",
        groupId: "group-1" as Tileset["groupId"],
        tileSize: 16,
        assetId: "asset-tileset",
        imageWidth: 32,
        imageHeight: 32,
        createdAt: 0,
      },
    ];
    const imageLayers: ImageLayer[] = [
      {
        id: "bg-1",
        mapId: map.id,
        name: "Backdrop",
        type: "image",
        visible: true,
        locked: false,
        assetId: "asset-bg",
        x: 4,
        y: 8,
        width: 64,
        height: 32,
        opacity: 100,
      },
    ];
    const objectLayers: ObjectLayer[] = [
      {
        id: "objects-1",
        mapId: map.id,
        name: "Actors",
        type: "object",
        visible: true,
        locked: false,
        objectOrder: ["object-1"],
      },
    ];
    const objects: MapObject[] = [
      {
        id: "object-1",
        layerId: "objects-1",
        name: "tree_1",
        type: "point",
        x: 24,
        y: 16,
        width: 0,
        height: 0,
        rotation: 15,
        points: [],
        visible: true,
        locked: false,
        properties: {
          [GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY]: {
            type: "string",
            value: "obj_tree",
          },
          [GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY]: {
            type: "file",
            value: "objects/obj_tree/obj_tree.yy",
          },
          [GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY]: {
            type: "float",
            value: "1.5",
          },
          [GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY]: {
            type: "float",
            value: "0.75",
          },
          [GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY]: {
            type: "file",
            value: "objects/obj_tree/create.gml",
          },
        },
      },
    ];

    const entries = await exportGameMakerMapBundle(
      map,
      layers,
      tilesets,
      imageLayers,
      [],
      objectLayers,
      objects,
      { format: "yy" },
    );

    const roomEntry = entries.find((entry) => entry.path === "forest.yy");
    assert.ok(roomEntry);
    const room = JSON.parse(new TextDecoder().decode(roomEntry?.data));
    assert.strictEqual(room.caption, "Forest Room");
    assert.strictEqual(room.roomSpeed, 30);
    assert.strictEqual(room.roomCreationCodeFile, "rooms/forest/create.gml");
    assert.strictEqual(room.roomSettings.persistent, true);
    assert.strictEqual(room.layers.length, 3);
    assert.strictEqual(room.layers[0].resourceType, "GMRBackgroundLayer");
    assert.strictEqual(room.layers[1].resourceType, "GMRTileLayer");
    assert.strictEqual(room.layers[2].resourceType, "GMRInstanceLayer");
    assert.strictEqual(room.layers[2].instances[0].objectId.name, "obj_tree");
    assert.strictEqual(
      room.layers[2].instances[0].creationCodeFile,
      "objects/obj_tree/create.gml",
    );

    const tilesetEntry = entries.find(
      (entry) => entry.path === "tilesets/terrain/terrain.yy",
    );
    assert.ok(tilesetEntry);
    const tilesetResource = JSON.parse(
      new TextDecoder().decode(tilesetEntry?.data),
    );
    assert.strictEqual(tilesetResource.resourceType, "GMTileSet");
    assert.strictEqual(tilesetResource.spriteId.name, "terrain");
  } finally {
    db.assets.get = originalGet;
  }
});
