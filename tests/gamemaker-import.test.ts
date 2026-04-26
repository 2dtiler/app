import assert from "node:assert/strict";
import test from "node:test";
import { exportGameMakerMapBundle } from "../src/features/import-export/lib/import-export-gamemaker";
import { prepareGameMakerMapImport } from "../src/features/import-export/lib/gamemaker-map-import";
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
} from "../src/features/import-export/lib/gamemaker-property-keys";
import { db } from "../src/services/db";
import type {
  ImageLayer,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  Tileset,
} from "../src/types";

function encodeJson(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

async function withStubbedGameMakerImportEnvironment(
  run: () => Promise<void>,
  dimensions: { width: number; height: number },
) {
  const originalImage = globalThis.Image;
  const originalPut = db.assets.put;
  const urlCtor = URL as typeof URL & {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
  };
  const originalCreateObjectURL = urlCtor.createObjectURL;
  const originalRevokeObjectURL = urlCtor.revokeObjectURL;

  class MockImage {
    naturalWidth = dimensions.width;
    naturalHeight = dimensions.height;
    src = "";

    async decode() {
      return undefined;
    }
  }

  Object.assign(globalThis, {
    Image: MockImage as unknown as typeof Image,
  });
  urlCtor.createObjectURL = () => "blob:gamemaker-test";
  urlCtor.revokeObjectURL = () => undefined;
  db.assets.put = (async () => undefined) as typeof db.assets.put;

  try {
    await run();
  } finally {
    if (originalImage) {
      Object.assign(globalThis, {
        Image: originalImage,
      });
    } else {
      Reflect.deleteProperty(globalThis, "Image");
    }

    if (originalCreateObjectURL) {
      urlCtor.createObjectURL = originalCreateObjectURL;
    } else {
      Reflect.deleteProperty(urlCtor, "createObjectURL");
    }

    if (originalRevokeObjectURL) {
      urlCtor.revokeObjectURL = originalRevokeObjectURL;
    } else {
      Reflect.deleteProperty(urlCtor, "revokeObjectURL");
    }

    db.assets.put = originalPut;
  }
}

test("prepareGameMakerMapImport resolves sprite-backed YY tilesets, backgrounds, and instances", async () => {
  await withStubbedGameMakerImportEnvironment(
    async () => {
      const result = await prepareGameMakerMapImport("rooms/forest/forest.yy", [
        {
          path: "rooms/forest/forest.yy",
          data: encodeJson({
            resourceType: "GMRoom",
            resourceVersion: "1.0",
            name: "forest",
            roomSettings: {
              Width: 64,
              Height: 32,
              persistent: true,
            },
            caption: "Forest Room",
            roomSpeed: 30,
            roomCreationCodeFile: "rooms/forest/create.gml",
            layers: [
              {
                resourceType: "GMRBackgroundLayer",
                name: "Backdrop",
                visible: true,
                x: 4,
                y: 8,
                spriteId: {
                  name: "bg_sprite",
                  path: "sprites/backgrounds/bg_sprite.yy",
                },
              },
              {
                resourceType: "GMRTileLayer",
                name: "Ground",
                visible: true,
                tilesetId: {
                  name: "terrain",
                  path: "tilesets/terrain/terrain.yy",
                },
                tiles: {
                  SerialiseWidth: 4,
                  SerialiseHeight: 2,
                  TileSerialiseData: [0, 1, -1, -1, -1, -1, -1, -1],
                },
              },
              {
                resourceType: "GMRInstanceLayer",
                name: "Actors",
                visible: true,
                instances: [
                  {
                    name: "tree_1",
                    x: 24,
                    y: 16,
                    rotation: 15,
                    scaleX: 1.5,
                    scaleY: 0.75,
                    objectId: {
                      name: "obj_tree",
                      path: "objects/obj_tree/obj_tree.yy",
                    },
                    creationCodeFile: "objects/obj_tree/create.gml",
                  },
                ],
              },
            ],
          }),
        },
        {
          path: "tilesets/terrain/terrain.yy",
          data: encodeJson({
            resourceType: "GMTileSet",
            resourceVersion: "1.0",
            name: "terrain",
            tilewidth: 16,
            tileheight: 16,
            tilexoff: 0,
            tileyoff: 0,
            tilesep: 0,
            out_columns: 2,
            spriteId: {
              name: "terrain_sprite",
              path: "sprites/terrain/terrain_sprite.yy",
            },
          }),
        },
        {
          path: "sprites/terrain/terrain_sprite.yy",
          data: encodeJson({
            resourceType: "GMSprite",
            resourceVersion: "1.0",
            name: "terrain_sprite",
            imagePath: "sprites/terrain/terrain.png",
          }),
        },
        {
          path: "sprites/terrain/terrain.png",
          data: new Uint8Array([1, 2, 3]),
        },
        {
          path: "sprites/backgrounds/bg_sprite.yy",
          data: encodeJson({
            resourceType: "GMSprite",
            resourceVersion: "1.0",
            name: "bg_sprite",
            imagePath: "sprites/backgrounds/bg.png",
          }),
        },
        {
          path: "sprites/backgrounds/bg.png",
          data: new Uint8Array([4, 5, 6]),
        },
      ]);

      assert.equal(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.equal(result.result.map.name, "forest");
      assert.equal(result.result.map.tileSize, 16);
      assert.equal(result.result.map.widthInTiles, 4);
      assert.equal(result.result.map.heightInTiles, 2);
      assert.deepEqual(result.result.map.properties, {
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
      });

      assert.equal(result.result.tilesets.length, 1);
      assert.equal(result.result.tilesets[0]?.name, "terrain");
      assert.equal(result.result.imageLayers.length, 1);
      assert.equal(result.result.imageLayers[0]?.name, "Backdrop");
      assert.equal(result.result.imageLayers[0]?.x, 4);
      assert.equal(result.result.imageLayers[0]?.y, 8);
      assert.equal(result.result.objectLayers.length, 1);
      assert.equal(result.result.objects.length, 1);
      assert.deepEqual(result.result.objects[0]?.properties, {
        [GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY]: {
          type: "string",
          value: "obj_tree",
        },
        [GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY]: {
          type: "float",
          value: "1.5",
        },
        [GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY]: {
          type: "float",
          value: "0.75",
        },
        [GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY]: {
          type: "file",
          value: "objects/obj_tree/obj_tree.yy",
        },
        [GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY]: {
          type: "file",
          value: "objects/obj_tree/create.gml",
        },
      });
      assert.ok(result.result.layers[0]?.tiles["0,0"]);
      assert.ok(result.result.layers[0]?.tiles["1,0"]);
    },
    { width: 64, height: 32 },
  );
});

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
    assert.equal(room.caption, "Forest Room");
    assert.equal(room.roomSpeed, 30);
    assert.equal(room.roomCreationCodeFile, "rooms/forest/create.gml");
    assert.equal(room.roomSettings.persistent, true);
    assert.equal(room.layers.length, 3);
    assert.equal(room.layers[0].resourceType, "GMRBackgroundLayer");
    assert.equal(room.layers[1].resourceType, "GMRTileLayer");
    assert.equal(room.layers[2].resourceType, "GMRInstanceLayer");
    assert.equal(room.layers[2].instances[0].objectId.name, "obj_tree");
    assert.equal(
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
    assert.equal(tilesetResource.resourceType, "GMTileSet");
    assert.equal(tilesetResource.spriteId.name, "terrain");
  } finally {
    db.assets.get = originalGet;
  }
});
