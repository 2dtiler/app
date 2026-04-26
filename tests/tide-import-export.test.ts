import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { isTideMapOption } from "../src/features/import-export/lib/tide-map-action-utils";
import {
  exportTideMapBundle,
  prepareTideMapImport,
} from "../src/features/import-export/lib/import-export-tide";
import { db } from "../src/services/db";
import {
  generateAssetId,
  generateLayerId,
  generateMapId,
  generateTilesetId,
} from "../src/utils/ids";
import type { TileLayer, TileMapData, Tileset } from "../src/types";

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

function encodeText(value: string) {
  return new TextEncoder().encode(value);
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

function buildTideFixture() {
  return [
    "<Map>",
    "  <Properties>",
    '    <Property Key="difficulty" Type="String">hard</Property>',
    "  </Properties>",
    "  <TileSheets>",
    '    <TileSheet Id="terrain">',
    "      <Description>terrain</Description>",
    "      <ImageSource>images/terrain.png</ImageSource>",
    '      <Alignment SheetSize="32 x 32" TileSize="16 x 16" Margin="0 x 0" Spacing="0 x 0" />',
    "    </TileSheet>",
    "  </TileSheets>",
    "  <Layers>",
    '    <Layer Id="Ground" Visible="True">',
    '      <Dimensions LayerSize="2 x 2" TileSize="16 x 16" />',
    "      <TileArray>",
    '        <Row><TileSheet Ref="terrain" /><Static Index="0" /><Null Count="1" /></Row>',
    '        <Row><TileSheet Ref="terrain" /><Null Count="1" /><Static Index="3" /></Row>',
    "      </TileArray>",
    "    </Layer>",
    "  </Layers>",
    "</Map>",
  ].join("\n");
}

test("prepareTideMapImport imports a linked image-backed tIDE map", async () => {
  await withStubbedImageImportEnvironment(
    async () => {
      const result = await prepareTideMapImport("level.tide", [
        {
          path: "level.tide",
          data: encodeText(buildTideFixture()),
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
      assert.equal(result.result.map.tileSize, 16);
      assert.equal(result.result.map.properties?.difficulty?.value, "hard");
      assert.equal(result.result.tilesets[0]?.imageWidth, 32);
      assert.equal(result.result.layers[0]?.tiles["0,0"]?.sx, 0);
      assert.equal(result.result.layers[0]?.tiles["1,1"]?.sx, 16);
    },
    { width: 32, height: 32 },
  );
});

test("prepareTideMapImport reports a missing linked image", async () => {
  const result = await prepareTideMapImport("level.tide", [
    {
      path: "level.tide",
      data: encodeText(buildTideFixture()),
    },
  ]);

  assert.equal(result.status, "missing-resources");
  if (result.status !== "missing-resources") {
    return;
  }

  assert.equal(result.missingResources[0]?.kind, "image");
  assert.equal(result.missingResources[0]?.path, "images/terrain.png");
});

test("exportTideMapBundle emits a tIDE map and linked image resources", async () => {
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
        properties: {
          biome: {
            type: "string",
            value: "forest",
          },
        },
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

      const entries = await exportTideMapBundle(map, [layer], [tileset]);
      const paths = entries.map((entry) => entry.path).sort();

      assert.deepEqual(paths, ["images/terrain.png", "level.tide"]);
      assert.match(
        new TextDecoder().decode(
          entries.find((entry) => entry.path === "level.tide")?.data,
        ),
        /<ImageSource>images\/terrain\.png<\/ImageSource>/,
      );
      assert.match(
        new TextDecoder().decode(
          entries.find((entry) => entry.path === "level.tide")?.data,
        ),
        /<TileSheet Ref="terrain"\s*\/>/,
      );
    },
  );
});

test("tIDE option predicate matches only the unified tIDE map option", () => {
  assert.equal(isTideMapOption("map-tide"), true);
  assert.equal(isTideMapOption("map-defold"), false);
});
