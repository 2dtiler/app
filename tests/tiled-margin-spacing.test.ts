import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import { parseHTML } from "linkedom";
import {
  exportTiledMapJsonBundle,
  exportTiledMapBundle,
} from "../src/features/import-export/lib/import-export-tiled";
import { prepareTiledMapImport } from "../src/features/import-export/lib/tiled-map-import";
import { db } from "../src/services/db";
import { exportSelectedTiledTilesets } from "../src/features/import-export/lib/tiled-tileset-action-utils";
import {
  generateAssetId,
  generateLayerId,
  generateMapId,
  generateTilesetId,
} from "../src/utils/ids";
import type { Project, TileLayer, TileMapData, Tileset } from "../src/types";

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
  return new TextEncoder().encode(`${value}\n`);
}

function decodeText(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

function createTestTileset(): Tileset {
  return {
    id: generateTilesetId(),
    name: "terrain",
    groupId: "group" as Tileset["groupId"],
    tileSize: 16,
    assetId: generateAssetId(),
    imageWidth: 32,
    imageHeight: 16,
    createdAt: Date.now(),
  };
}

function createTestMap(tileset: Tileset): {
  map: TileMapData;
  layer: TileLayer;
} {
  const layer: TileLayer = {
    id: generateLayerId(),
    mapId: generateMapId(),
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

  const map: TileMapData = {
    id: layer.mapId,
    name: "terrain-map",
    groupId: "group" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 1,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: [layer.id],
    createdAt: Date.now(),
  };

  return { map, layer };
}

function createTestProject(tileset: Tileset): Project {
  return {
    id: "project" as Project["id"],
    name: "Demo",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tileSize: 16,
    tilesetGroups: [],
    tilesets: [tileset],
    mapGroups: [],
    maps: [],
    layers: [],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
}

async function withStubbedAssetLookup(
  run: () => Promise<void>,
  assetRecord: { data: ArrayBuffer; mimeType: string },
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

async function withStubbedImageImportEnvironment(
  run: () => Promise<void>,
  dimensions: { width: number; height: number },
) {
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalCreateElement = document.createElement.bind(document);
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
  URL.createObjectURL = (() => "blob:test") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  document.createElement = ((tagName: string) => {
    if (tagName !== "canvas") {
      return originalCreateElement(tagName);
    }

    return {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => undefined,
      }),
      toBlob: (callback: BlobCallback) => {
        callback(
          new Blob([new Uint8Array([137, 80, 78, 71])], {
            type: "image/png",
          }),
        );
      },
    } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement;
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

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.createElement = originalCreateElement;
    db.assets.put = originalPut;
  }
}

test("prepareTiledMapImport normalizes external TSX tilesets with margin and spacing", async () => {
  await withStubbedImageImportEnvironment(
    async () => {
      const result = await prepareTiledMapImport(
        "maps/terrain.tmx",
        [
          {
            path: "maps/terrain.tmx",
            data: encodeText(
              [
                '<map version="1.10" orientation="orthogonal" width="2" height="1" tilewidth="16" tileheight="16" infinite="0">',
                '  <tileset firstgid="1" source="terrain.tsx"/>',
                '  <layer id="1" name="Ground" width="2" height="1">',
                '    <data encoding="csv">1,2</data>',
                "  </layer>",
                "</map>",
              ].join("\n"),
            ),
          },
          {
            path: "maps/terrain.tsx",
            data: encodeText(
              [
                '<tileset version="1.10" name="terrain" tilewidth="16" tileheight="16" tilecount="2" columns="2" margin="1" spacing="2">',
                '  <image source="images/terrain.png" width="36" height="18"/>',
                "</tileset>",
              ].join("\n"),
            ),
          },
          {
            path: "maps/images/terrain.png",
            data: new Uint8Array([1, 2, 3]),
          },
        ],
        "xml",
      );

      assert.equal(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.equal(result.result.tilesets.length, 1);
      assert.equal(result.result.tilesets[0]?.imageWidth, 32);
      assert.equal(result.result.tilesets[0]?.imageHeight, 16);

      const layer = result.result.layers[0];
      assert.ok(layer);
      assert.deepEqual(layer.tiles["0,0"], {
        tilesetId: result.result.tilesets[0]?.id,
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
        rotation: 0,
        flipX: false,
        flipY: false,
      });
      assert.deepEqual(layer.tiles["1,0"], {
        tilesetId: result.result.tilesets[0]?.id,
        sx: 16,
        sy: 0,
        sw: 16,
        sh: 16,
        rotation: 0,
        flipX: false,
        flipY: false,
      });
    },
    { width: 36, height: 18 },
  );
});

test("exportTiledMapBundle emits zero margin and spacing for inline TMX tilesets", async () => {
  const tileset = createTestTileset();
  const { map, layer } = createTestMap(tileset);

  await withStubbedAssetLookup(
    async () => {
      const entries = await exportTiledMapBundle(
        map,
        [layer],
        [tileset],
        [],
        [],
        [],
        [],
        {
          encoding: "csv",
          compression: "none",
          compressionLevel: 0,
          tilesetMode: "inline",
          renderOrder: "right-down",
        },
      );

      const mapEntry = entries.find((entry) => entry.path.endsWith(".tmx"));
      assert.ok(mapEntry);

      const document = new DOMParser().parseFromString(
        decodeText(mapEntry.data),
        "application/xml",
      );
      const tilesetElement = document.querySelector("map > tileset");
      assert.ok(tilesetElement);
      assert.equal(tilesetElement?.getAttribute("margin"), "0");
      assert.equal(tilesetElement?.getAttribute("spacing"), "0");
    },
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
  );
});

test("exportTiledMapJsonBundle emits zero margin and spacing for external TSJ tilesets", async () => {
  const tileset = createTestTileset();
  const { map, layer } = createTestMap(tileset);

  await withStubbedAssetLookup(
    async () => {
      const entries = await exportTiledMapJsonBundle(
        map,
        [layer],
        [tileset],
        [],
        [],
        [],
        [],
        {
          encoding: "csv",
          compression: "none",
          compressionLevel: 0,
          tilesetMode: "external",
          renderOrder: "right-down",
        },
      );

      const tilesetEntry = entries.find((entry) => entry.path.endsWith(".tsj"));
      assert.ok(tilesetEntry);

      const tilesetDocument = JSON.parse(decodeText(tilesetEntry.data)) as {
        margin?: number;
        spacing?: number;
      };
      assert.equal(tilesetDocument.margin, 0);
      assert.equal(tilesetDocument.spacing, 0);
    },
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
  );
});

test("exportSelectedTiledTilesets emits zero margin and spacing for xml, json, and lua", async () => {
  const tileset = createTestTileset();
  const project = createTestProject(tileset);

  await withStubbedAssetLookup(
    async () => {
      for (const format of ["xml", "json", "lua"] as const) {
        let archive: Uint8Array | null = null;

        const didExport = await exportSelectedTiledTilesets(
          project,
          [tileset.id],
          "tileset-tiled",
          { format },
          {
            saveBlob: async () => true,
            saveByteArray: async (data) => {
              archive = data;
              return true;
            },
          },
        );

        assert.equal(didExport, true);
        assert.ok(archive);

        const files = unzipSync(archive);

        if (format === "xml") {
          const xmlEntry = Object.entries(files).find(([path]) =>
            path.endsWith(".tsx"),
          );
          assert.ok(xmlEntry);
          const document = new DOMParser().parseFromString(
            decodeText(xmlEntry[1]),
            "application/xml",
          );
          const tilesetElement = document.querySelector("tileset");
          assert.ok(tilesetElement);
          assert.equal(tilesetElement?.getAttribute("margin"), "0");
          assert.equal(tilesetElement?.getAttribute("spacing"), "0");
          continue;
        }

        if (format === "json") {
          const jsonEntry = Object.entries(files).find(([path]) =>
            path.endsWith(".tsj"),
          );
          assert.ok(jsonEntry);
          const document = JSON.parse(decodeText(jsonEntry[1])) as {
            margin?: number;
            spacing?: number;
          };
          assert.equal(document.margin, 0);
          assert.equal(document.spacing, 0);
          continue;
        }

        const luaEntry = Object.entries(files).find(([path]) =>
          path.endsWith(".lua"),
        );
        assert.ok(luaEntry);
        const luaText = decodeText(luaEntry[1]);
        assert.match(luaText, /margin\s*=\s*0/);
        assert.match(luaText, /spacing\s*=\s*0/);
      }
    },
    {
      data: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "image/png",
    },
  );
});
