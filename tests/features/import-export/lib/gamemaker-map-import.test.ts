import { parseHTML } from "linkedom";
import { assert, test } from "vitest";
import { prepareGameMakerMapImport } from "@/features/import-export/lib/gamemaker-map-import";
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

const { window } = parseHTML("<html><body></body></html>");

class TestXMLSerializer {
  serializeToString(document: { toString: () => string }) {
    return document.toString();
  }
}

Object.assign(globalThis, {
  DOMParser: window.DOMParser,
  XMLSerializer: TestXMLSerializer,
  document: window.document,
  window,
});

Object.defineProperty(window.document, "implementation", {
  configurable: true,
  value: {
    createDocument: (_namespace: string, rootName: string) =>
      new window.DOMParser().parseFromString(
        `<${rootName}></${rootName}>`,
        "application/xml",
      ),
  },
});

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

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.strictEqual(result.result.map.name, "forest");
      assert.strictEqual(result.result.map.tileSize, 16);
      assert.strictEqual(result.result.map.widthInTiles, 4);
      assert.strictEqual(result.result.map.heightInTiles, 2);
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

      assert.strictEqual(result.result.tilesets.length, 1);
      assert.strictEqual(result.result.tilesets[0]?.name, "terrain");
      assert.strictEqual(result.result.imageLayers.length, 1);
      assert.strictEqual(result.result.imageLayers[0]?.name, "Backdrop");
      assert.strictEqual(result.result.imageLayers[0]?.x, 4);
      assert.strictEqual(result.result.imageLayers[0]?.y, 8);
      assert.strictEqual(result.result.objectLayers.length, 1);
      assert.strictEqual(result.result.objects.length, 1);
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

test("prepareGameMakerMapImport resolves legacy GMX tilesets, backgrounds, and instances", async () => {
  await withStubbedGameMakerImportEnvironment(
    async () => {
      const result = await prepareGameMakerMapImport(
        "rooms/forest/forest.room.gmx",
        [
          {
            path: "rooms/forest/forest.room.gmx",
            data: new TextEncoder().encode(`
              <room>
                <name>forest</name>
                <width>64</width>
                <height>32</height>
                <tilewidth>16</tilewidth>
                <tileheight>16</tileheight>
                <caption>Forest Room</caption>
                <persistent>1</persistent>
                <speed>30</speed>
                <creationCodeFile>rooms/forest/create.gml</creationCodeFile>
                <tilesetResources>
                  <tileset name="terrain" image="images/terrain.png" tileSize="16" sprite="sprites/terrain/terrain.yy" />
                </tilesetResources>
                <backgroundResources>
                  <background name="bg_sprite" image="images/background.png" sprite="sprites/backgrounds/bg_sprite.yy" />
                </backgroundResources>
                <backgrounds>
                  <background
                    name="Backdrop"
                    backgroundName="bg_sprite"
                    backgroundPath="images/background.png"
                    x="4"
                    y="8"
                    w="64"
                    h="32"
                    visible="1"
                    depth="3000"
                    htiled="0"
                    vtiled="0"
                    stretch="0"
                  />
                </backgrounds>
                <tiles>
                  <tile
                    bgName="terrain"
                    bgPath="images/terrain.png"
                    x="0"
                    y="0"
                    w="16"
                    h="16"
                    xo="16"
                    yo="0"
                    id="1"
                    name="Ground"
                    depth="2000"
                    locked="0"
                  />
                  <tile
                    bgName="terrain"
                    bgPath="images/terrain.png"
                    x="16"
                    y="0"
                    w="16"
                    h="16"
                    xo="0"
                    yo="16"
                    id="2"
                    name="Ground"
                    depth="2000"
                    locked="0"
                  />
                </tiles>
                <instances>
                  <instance
                    name="tree_1"
                    objName="obj_tree"
                    objPath="objects/obj_tree/obj_tree.yy"
                    code="objects/obj_tree/create.gml"
                    x="24"
                    y="16"
                    rotation="15"
                    scaleX="1.5"
                    scaleY="0.75"
                    depth="1000"
                    visible="1"
                    layerName="Actors"
                  />
                </instances>
              </room>
            `),
          },
          {
            path: "images/terrain.png",
            data: new Uint8Array([1, 2, 3]),
          },
          {
            path: "images/background.png",
            data: new Uint8Array([4, 5, 6]),
          },
        ],
      );

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.strictEqual(result.result.map.name, "forest");
      assert.strictEqual(result.result.map.tileSize, 16);
      assert.strictEqual(result.result.map.widthInTiles, 4);
      assert.strictEqual(result.result.map.heightInTiles, 2);
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

      assert.strictEqual(result.result.tilesets.length, 1);
      assert.strictEqual(result.result.tilesets[0]?.name, "terrain");
      assert.strictEqual(result.result.layers.length, 1);
      assert.strictEqual(result.result.layers[0]?.name, "Ground");
      assert.strictEqual(result.result.imageLayers.length, 1);
      assert.strictEqual(result.result.imageLayers[0]?.name, "Backdrop");
      assert.strictEqual(result.result.imageLayers[0]?.x, 4);
      assert.strictEqual(result.result.imageLayers[0]?.y, 8);
      assert.strictEqual(result.result.objectLayers.length, 1);
      assert.strictEqual(result.result.objectLayers[0]?.name, "Actors");
      assert.strictEqual(result.result.objects.length, 1);
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
      assert.deepEqual(result.result.map.layerOrder.length, 3);
      assert.ok(result.result.layers[0]?.tiles["0,0"]);
      assert.ok(result.result.layers[0]?.tiles["1,0"]);
    },
    { width: 64, height: 32 },
  );
});
