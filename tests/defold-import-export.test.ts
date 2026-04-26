import assert from "node:assert/strict";
import test from "node:test";
import { isDefoldMapOption } from "../src/features/import-export/lib/defold-map-action-utils";
import { isDefoldTilesetOption } from "../src/features/import-export/lib/defold-tileset-action-utils";
import {
  exportDefoldTilesourceBundle,
  exportDefoldMapBundle,
  prepareDefoldMapImport,
  prepareDefoldTilesetImport,
} from "../src/features/import-export/lib/import-export-defold";
import { db } from "../src/services/db";
import {
  generateAssetId,
  generateLayerId,
  generateMapId,
  generateTilesetId,
} from "../src/utils/ids";
import type { TileLayer, TileMapData, Tileset } from "../src/types";

function encodeText(value: string) {
  return new TextEncoder().encode(`${value}\n`);
}

async function withStubbedImageImportEnvironment(
  run: () => Promise<void>,
  dimensions: { width: number; height: number },
) {
  const originalImage = globalThis.Image;
  const originalPut = db.assets.put;

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
    db.assets.put = originalPut;
  }
}

async function withStubbedAssetLookup(
  assetRecord: { data: ArrayBuffer; mimeType: string },
  run: () => Promise<void>,
) {
  const originalGet = db.assets.get;
  db.assets.get = (async () => ({
    id: generateAssetId(),
    data: assetRecord.data,
    mimeType: assetRecord.mimeType,
    createdAt: Date.now(),
  })) as typeof db.assets.get;

  try {
    await run();
  } finally {
    db.assets.get = originalGet;
  }
}

test("prepareDefoldTilesetImport imports a linked image-backed tilesource", async () => {
  await withStubbedImageImportEnvironment(
    async () => {
      const result = await prepareDefoldTilesetImport("terrain.tilesource", [
        {
          path: "terrain.tilesource",
          data: encodeText(
            [
              'image: "/images/terrain.png"',
              "tile_width: 16",
              "tile_height: 16",
              "tile_margin: 0",
              "tile_spacing: 0",
            ].join("\n"),
          ),
        },
        {
          path: "images/terrain.png",
          data: new Uint8Array([1, 2, 3]),
        },
      ]);

      assert.equal(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.equal(result.result[0]?.tileSize, 16);
      assert.equal(result.result[0]?.imageWidth, 32);
      assert.equal(result.result[0]?.imageHeight, 32);
    },
    { width: 32, height: 32 },
  );
});

test("prepareDefoldTilesetImport reports a missing linked image", async () => {
  const result = await prepareDefoldTilesetImport("terrain.tilesource", [
    {
      path: "terrain.tilesource",
      data: encodeText(
        [
          'image: "/images/terrain.png"',
          "tile_width: 16",
          "tile_height: 16",
          "tile_margin: 0",
          "tile_spacing: 0",
        ].join("\n"),
      ),
    },
  ]);

  assert.equal(result.status, "missing-resources");
  if (result.status !== "missing-resources") {
    return;
  }

  assert.equal(result.missingResources[0]?.kind, "image");
  assert.equal(result.missingResources[0]?.path, "images/terrain.png");
});

test("prepareDefoldMapImport imports a standalone tilemap bundle", async () => {
  await withStubbedImageImportEnvironment(
    async () => {
      const result = await prepareDefoldMapImport("level.tilemap", [
        {
          path: "level.tilemap",
          data: encodeText(
            [
              'tile_set: "/tilesources/terrain.tilesource"',
              "layers {",
              '  id: "Ground"',
              "  z: 0.0",
              "  is_visible: 1",
              "  cell {",
              "    x: 1",
              "    y: 2",
              "    tile: 3",
              "    h_flip: 1",
              "    v_flip: 0",
              "  }",
              "}",
            ].join("\n"),
          ),
        },
        {
          path: "tilesources/terrain.tilesource",
          data: encodeText(
            [
              'image: "/images/terrain.png"',
              "tile_width: 16",
              "tile_height: 16",
              "tile_margin: 0",
              "tile_spacing: 0",
            ].join("\n"),
          ),
        },
        {
          path: "images/terrain.png",
          data: new Uint8Array([1, 2, 3]),
        },
      ]);

      assert.equal(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.equal(result.result.map.name, "level");
      assert.equal(result.result.layers.length, 1);
      assert.equal(result.result.map.widthInTiles, 2);
      assert.equal(result.result.map.heightInTiles, 3);
      assert.equal(result.result.layers[0]?.tiles["1,2"]?.flipX, true);
    },
    { width: 32, height: 32 },
  );
});

test("prepareDefoldMapImport requests the linked tilemap from a collection", async () => {
  const result = await prepareDefoldMapImport("level.collection", [
    {
      path: "level.collection",
      data: encodeText(
        [
          'name: "level"',
          "embedded_instances {",
          '  id: "go"',
          '  data: "components {\\n"',
          '  "  id: \\\"tilemap\\\"\\n"',
          '  "  component: \\\"/maps/level.tilemap\\\"\\n"',
          '  "}\\n"',
          "}",
        ].join("\n"),
      ),
    },
  ]);

  assert.equal(result.status, "missing-resources");
  if (result.status !== "missing-resources") {
    return;
  }

  assert.equal(result.missingResources[0]?.kind, "tilemap");
  assert.equal(result.missingResources[0]?.path, "maps/level.tilemap");
});

test("exportDefoldMapBundle emits linked Defold resources for collection export", async () => {
  await withStubbedAssetLookup(
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
    async () => {
      const tileset: Tileset = {
        id: generateTilesetId(),
        name: "terrain",
        groupId: "group" as Tileset["groupId"],
        tileSize: 16,
        assetId: generateAssetId(),
        imageWidth: 32,
        imageHeight: 32,
        createdAt: Date.now(),
      };
      const map: TileMapData = {
        id: generateMapId(),
        name: "level",
        groupId: "group" as TileMapData["groupId"],
        orientation: "orthogonal",
        widthInTiles: 2,
        heightInTiles: 2,
        tileSize: 16,
        properties: {},
        layerOrder: [],
        createdAt: Date.now(),
      };
      const layer: TileLayer = {
        id: generateLayerId(),
        mapId: map.id,
        name: "Ground",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {
          "0,0": {
            tilesetId: tileset.id,
            sx: 0,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        },
      };

      const entries = await exportDefoldMapBundle(
        map,
        [layer],
        [tileset],
        [],
        [],
        [],
        [],
        { format: "collection" },
      );
      const paths = entries.map((entry) => entry.path).sort();

      assert.deepEqual(paths, [
        "images/terrain.png",
        "level.collection",
        "level.tilemap",
        "tilesources/terrain.tilesource",
      ]);
      assert.match(
        new TextDecoder().decode(
          entries.find((entry) => entry.path === "level.collection")?.data,
        ),
        /component: \\\"\/level\.tilemap\\\"/,
      );
    },
  );
});

test("exportDefoldMapBundle emits a standalone Defold tilemap bundle", async () => {
  await withStubbedAssetLookup(
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
    async () => {
      const tileset: Tileset = {
        id: generateTilesetId(),
        name: "terrain",
        groupId: "group" as Tileset["groupId"],
        tileSize: 16,
        assetId: generateAssetId(),
        imageWidth: 32,
        imageHeight: 32,
        createdAt: Date.now(),
      };
      const map: TileMapData = {
        id: generateMapId(),
        name: "level",
        groupId: "group" as TileMapData["groupId"],
        orientation: "orthogonal",
        widthInTiles: 2,
        heightInTiles: 2,
        tileSize: 16,
        properties: {},
        layerOrder: [],
        createdAt: Date.now(),
      };
      const layer: TileLayer = {
        id: generateLayerId(),
        mapId: map.id,
        name: "Ground",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {
          "0,0": {
            tilesetId: tileset.id,
            sx: 0,
            sy: 0,
            sw: 16,
            sh: 16,
          },
        },
      };

      const entries = await exportDefoldMapBundle(
        map,
        [layer],
        [tileset],
        [],
        [],
        [],
        [],
        { format: "tilemap" },
      );
      const paths = entries.map((entry) => entry.path).sort();

      assert.deepEqual(paths, [
        "images/terrain.png",
        "level.tilemap",
        "tilesources/terrain.tilesource",
      ]);
      assert.match(
        new TextDecoder().decode(
          entries.find((entry) => entry.path === "level.tilemap")?.data,
        ),
        /tile_set: "\/tilesources\/terrain\.tilesource"/,
      );
    },
  );
});

test("exportDefoldTilesourceBundle emits tilesource and image resources", async () => {
  await withStubbedAssetLookup(
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
    async () => {
      const tileset: Tileset = {
        id: generateTilesetId(),
        name: "terrain",
        groupId: "group" as Tileset["groupId"],
        tileSize: 16,
        assetId: generateAssetId(),
        imageWidth: 32,
        imageHeight: 32,
        createdAt: Date.now(),
      };

      const entries = await exportDefoldTilesourceBundle(tileset);
      const paths = entries.map((entry) => entry.path).sort();

      assert.deepEqual(paths, ["images/terrain.png", "terrain.tilesource"]);
      assert.match(
        new TextDecoder().decode(
          entries.find((entry) => entry.path === "terrain.tilesource")?.data,
        ),
        /image: "\/images\/terrain\.png"/,
      );
    },
  );
});

test("Defold option predicates match only the Defold options", () => {
  assert.equal(isDefoldMapOption("map-defold"), true);
  assert.equal(isDefoldMapOption("map-godot"), false);
  assert.equal(isDefoldTilesetOption("tileset-defold"), true);
  assert.equal(isDefoldTilesetOption("tileset-tiled"), false);
});
