import { assert, test } from "vitest";
import { unzipSync } from "fflate";
import { parseHTML } from "linkedom";
import {
  exportTiledMapJsBundle,
  exportTiledMapJsonBundle,
  exportTiledMapLuaBundle,
  exportTiledMapBundle,
} from "@/features/import-export/lib/import-export-tiled";
import {
  convertJsonLikeToTiledLua,
  convertTiledLuaToJsonLike,
  encodeTiledLuaDocument,
  parseTiledLuaDocument,
} from "@/features/import-export/lib/tiled-lua";
import { prepareTiledMapImport } from "@/features/import-export/lib/tiled-map-import";
import { getTextObjectSettings } from "@/features/map-editor/lib/text-objects";
import { db } from "@/services/db";
import { exportSelectedTiledTilesets } from "@/features/import-export/lib/tiled-tileset-action-utils";
import {
  generateAssetId,
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";
import type {
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

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

function createComplexTiledFixture() {
  const tileset: Tileset = {
    ...createTestTileset(),
    name: "terrain/set",
    imageWidth: 32,
    imageHeight: 32,
  };

  const mapId = generateMapId();
  const groupId = generateLayerGroupId();
  const backgroundLayerId = generateLayerId();
  const detailLayerId = generateLayerId();
  const imageLayerId = generateLayerId();
  const objectLayerId = generateLayerId();
  const spawnId = generateObjectId();
  const labelId = generateObjectId();
  const boundsId = generateObjectId();
  const markerId = generateObjectId();

  const backgroundLayer = {
    id: backgroundLayerId,
    mapId,
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
        rotation: 0,
        flipX: false,
        flipY: false,
      },
      "1,0": {
        tilesetId: tileset.id,
        sx: 16,
        sy: 0,
        sw: 16,
        sh: 16,
        rotation: 90,
        flipX: false,
        flipY: false,
      },
      "0,1": {
        tilesetId: tileset.id,
        sx: 0,
        sy: 16,
        sw: 16,
        sh: 16,
        rotation: 0,
        flipX: true,
        flipY: false,
      },
      "1,1": {
        tilesetId: tileset.id,
        sx: 16,
        sy: 16,
        sw: 16,
        sh: 16,
        rotation: 180,
        flipX: false,
        flipY: false,
      },
    },
  } as TileLayer;

  const detailLayer = {
    id: detailLayerId,
    mapId,
    name: "Detail",
    type: "tile",
    visible: false,
    locked: true,
    tiles: {
      "1,0": {
        tilesetId: tileset.id,
        sx: 16,
        sy: 16,
        sw: 16,
        sh: 16,
        rotation: 270,
        flipX: false,
        flipY: false,
      },
    },
  } as TileLayer;

  const imageLayer = {
    id: imageLayerId,
    mapId,
    name: "Backdrop",
    type: "image",
    visible: false,
    locked: true,
    assetId: generateAssetId(),
    x: 8,
    y: -4,
    width: 48,
    height: 24,
    rotation: 90,
    flipX: true,
    flipY: false,
    opacity: 45,
  } as ImageLayer;

  const objectLayer = {
    id: objectLayerId,
    mapId,
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: [spawnId, labelId, boundsId, markerId],
  } as ObjectLayer;

  const spawnObject = {
    id: spawnId,
    layerId: objectLayerId,
    name: "Spawn",
    type: "rectangle",
    x: 4,
    y: 8,
    width: 16,
    height: 16,
    rotation: 15,
    points: [],
    visible: true,
    locked: false,
    properties: {
      role: {
        value: "spawn",
        type: "string",
      },
    },
  } as MapObject;

  const labelObject = {
    id: labelId,
    layerId: objectLayerId,
    name: "Label",
    type: "text",
    x: 20,
    y: 18,
    width: 96,
    height: 32,
    rotation: 45,
    points: [],
    visible: false,
    locked: true,
    properties: {
      Text: {
        value: "Hello\nWorld",
        type: "string",
      },
      Size: {
        value: "20",
        type: "int",
      },
      Rotation: {
        value: "45",
        type: "float",
      },
      Font: {
        value: "Space Mono",
        type: "string",
      },
      "Word wrap": {
        value: "false",
        type: "bool",
      },
      Color: {
        value: "#ff00ff",
        type: "color",
      },
      target: {
        value: spawnId,
        type: "object",
      },
      note: {
        value: "keep me",
        type: "string",
      },
    },
  } as MapObject;

  const boundsObject = {
    id: boundsId,
    layerId: objectLayerId,
    name: "Bounds",
    type: "polygon",
    x: 32,
    y: 24,
    width: 0,
    height: 0,
    rotation: 0,
    points: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 12 },
    ],
    visible: true,
    locked: false,
    properties: {},
  } as MapObject;

  const markerObject = {
    id: markerId,
    layerId: objectLayerId,
    name: "Marker",
    type: "point",
    x: 12,
    y: 30,
    width: 0,
    height: 0,
    rotation: 0,
    points: [],
    visible: true,
    locked: false,
    properties: {},
  } as MapObject;

  const layerGroup = {
    id: groupId,
    mapId,
    name: "Decor",
    visible: false,
    locked: true,
    expanded: false,
    childOrder: [detailLayerId, imageLayerId, objectLayerId],
  } as LayerGroup;

  const map = {
    id: mapId,
    name: "Fancy: Terrain",
    groupId: "group" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 2,
    heightInTiles: 2,
    tileSize: 16,
    layerOrder: [backgroundLayerId, groupId],
    properties: {
      theme: {
        value: "forest",
        type: "string",
      },
    },
    createdAt: Date.now(),
  } as TileMapData;

  return {
    map,
    tileset,
    layers: [backgroundLayer, detailLayer],
    imageLayers: [imageLayer],
    layerGroups: [layerGroup],
    objectLayers: [objectLayer],
    objects: [spawnObject, labelObject, boundsObject, markerObject],
  };
}

function getReadyImportResult(
  preparation: Awaited<ReturnType<typeof prepareTiledMapImport>>,
) {
  assert.strictEqual(preparation.status, "ready");
  if (preparation.status !== "ready") {
    throw new Error(
      `Expected a ready import result, got ${preparation.status}.`,
    );
  }
  return preparation.result;
}

function assertComplexImportResult(
  preparation: Awaited<ReturnType<typeof prepareTiledMapImport>>,
  expectedMapName = "Fancy: Terrain",
) {
  const result = getReadyImportResult(preparation);
  assert.strictEqual(result.map.name, expectedMapName);
  assert.strictEqual(result.map.properties?.theme?.value, "forest");
  assert.deepEqual(result.map.layerOrder, [
    result.layers[0]?.id,
    result.layerGroups[0]?.id,
  ]);

  assert.strictEqual(result.tilesets.length, 1);
  assert.strictEqual(result.tilesets[0]?.name, "terrain/set");
  assert.strictEqual(result.tilesets[0]?.imageWidth, 32);
  assert.strictEqual(result.tilesets[0]?.imageHeight, 32);

  const groundLayer = result.layers.find((layer) => layer.name === "Ground");
  const detailLayer = result.layers.find((layer) => layer.name === "Detail");
  assert.ok(groundLayer);
  assert.ok(detailLayer);
  assert.strictEqual(groundLayer?.tiles["1,0"]?.rotation, 90);
  assert.strictEqual(groundLayer?.tiles["0,1"]?.flipX, true);
  assert.strictEqual(groundLayer?.tiles["1,1"]?.rotation, 180);
  assert.strictEqual(detailLayer?.visible, false);
  assert.strictEqual(detailLayer?.locked, true);
  assert.strictEqual(detailLayer?.tiles["1,0"]?.rotation, 270);

  assert.strictEqual(result.layerGroups.length, 1);
  assert.strictEqual(result.layerGroups[0]?.name, "Decor");
  assert.strictEqual(result.layerGroups[0]?.visible, false);
  assert.strictEqual(result.layerGroups[0]?.locked, true);
  assert.strictEqual(result.layerGroups[0]?.expanded, false);
  assert.strictEqual(result.layerGroups[0]?.childOrder.length, 3);

  assert.strictEqual(result.imageLayers.length, 1);
  assert.strictEqual(result.imageLayers[0]?.name, "Backdrop");
  assert.strictEqual(result.imageLayers[0]?.width, 48);
  assert.strictEqual(result.imageLayers[0]?.height, 24);
  assert.strictEqual(result.imageLayers[0]?.rotation, 90);
  assert.strictEqual(result.imageLayers[0]?.flipX, true);
  assert.strictEqual(result.imageLayers[0]?.flipY, false);
  assert.strictEqual(result.imageLayers[0]?.opacity, 45);
  assert.strictEqual(result.imageLayers[0]?.locked, true);

  assert.strictEqual(result.objectLayers.length, 1);
  assert.strictEqual(result.objectLayers[0]?.name, "Objects");

  const importedSpawn = result.objects.find(
    (object) => object.name === "Spawn",
  );
  const importedLabel = result.objects.find(
    (object) => object.name === "Label",
  );
  const importedBounds = result.objects.find(
    (object) => object.name === "Bounds",
  );
  const importedMarker = result.objects.find(
    (object) => object.name === "Marker",
  );
  assert.ok(importedSpawn);
  assert.ok(importedLabel);
  assert.ok(importedBounds);
  assert.ok(importedMarker);
  assert.strictEqual(importedSpawn?.rotation, 15);
  assert.strictEqual(importedSpawn?.properties?.role?.value, "spawn");
  assert.strictEqual(importedBounds?.type, "polygon");
  assert.deepEqual(importedBounds?.points, [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 12 },
  ]);
  assert.strictEqual(importedMarker?.type, "point");
  assert.strictEqual(importedLabel?.visible, false);
  assert.strictEqual(importedLabel?.locked, true);
  assert.strictEqual(importedLabel?.properties?.note?.value, "keep me");
  assert.strictEqual(importedLabel?.properties?.target?.type, "object");
  assert.strictEqual(
    importedLabel?.properties?.target?.value,
    importedSpawn?.id,
  );

  const importedTextSettings = getTextObjectSettings(importedLabel!);
  assert.strictEqual(importedTextSettings.text, "Hello\nWorld");
  assert.strictEqual(importedTextSettings.size, 20);
  assert.strictEqual(importedTextSettings.rotation, 45);
  assert.strictEqual(importedTextSettings.font, "Space Mono");
  assert.strictEqual(importedTextSettings.wordWrap, false);
  assert.strictEqual(importedTextSettings.color, "#ff00ff");
}

function getRootEntry(
  entries: readonly { path: string; data: Uint8Array }[],
  extension: string,
) {
  const entry = entries.find((candidate) => candidate.path.endsWith(extension));
  assert.ok(entry);
  return entry!;
}

const COMPLEX_TILED_OPTIONS = {
  encoding: "base64",
  compression: "zlib",
  compressionLevel: 6,
  tilesetMode: "external",
  renderOrder: "right-down",
} as const;

const PNG_ASSET_RECORD = {
  data: new Uint8Array([1, 2, 3, 4]).buffer,
  mimeType: "image/png",
};

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

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.strictEqual(result.result.tilesets.length, 1);
      assert.strictEqual(result.result.tilesets[0]?.imageWidth, 32);
      assert.strictEqual(result.result.tilesets[0]?.imageHeight, 16);

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
      assert.strictEqual(tilesetElement?.getAttribute("margin"), "0");
      assert.strictEqual(tilesetElement?.getAttribute("spacing"), "0");
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
      assert.strictEqual(tilesetDocument.margin, 0);
      assert.strictEqual(tilesetDocument.spacing, 0);
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

        assert.strictEqual(didExport, true);
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
          assert.strictEqual(tilesetElement?.getAttribute("margin"), "0");
          assert.strictEqual(tilesetElement?.getAttribute("spacing"), "0");
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
          assert.strictEqual(document.margin, 0);
          assert.strictEqual(document.spacing, 0);
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

test("exportTiledMapBundle round-trips grouped layers, images, and objects through TMX", async () => {
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

    const mapEntry = getRootEntry(entries, ".tmx");
    const mapText = decodeText(mapEntry.data);
    assert.match(mapText, /<group /);
    assert.match(mapText, /<imagelayer /);
    assert.match(mapText, /<objectgroup /);
    assert.match(mapText, /compression="zlib"/);

    await withStubbedImageImportEnvironment(
      async () => {
        const imported = await prepareTiledMapImport(
          mapEntry.path,
          entries,
          "xml",
        );
        assertComplexImportResult(imported);
      },
      { width: 32, height: 32 },
    );
  }, PNG_ASSET_RECORD);
});

test("exportTiledMapJsonBundle round-trips grouped layers and object references through TMJ", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportTiledMapJsonBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      COMPLEX_TILED_OPTIONS,
    );

    const mapEntry = getRootEntry(entries, ".tmj");
    const mapDocument = JSON.parse(decodeText(mapEntry.data)) as {
      layers?: Array<{ type?: string }>;
      tilesets?: Array<{ source?: string }>;
    };
    assert.strictEqual(mapDocument.layers?.[1]?.type, "group");
    assert.ok(mapDocument.tilesets?.[0]?.source?.endsWith(".tsj"));

    await withStubbedImageImportEnvironment(
      async () => {
        const imported = await prepareTiledMapImport(
          mapEntry.path,
          entries,
          "json",
        );
        assertComplexImportResult(imported);
      },
      { width: 32, height: 32 },
    );
  }, PNG_ASSET_RECORD);
});

test("exportTiledMapJsBundle round-trips wrapped Tiled JavaScript maps", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportTiledMapJsBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      COMPLEX_TILED_OPTIONS,
    );

    const mapEntry = getRootEntry(entries, ".js");
    const mapText = decodeText(mapEntry.data);
    assert.match(mapText, /TileMaps\[name\] = data/);
    assert.match(mapText, /module\.exports = data/);

    await withStubbedImageImportEnvironment(
      async () => {
        const imported = await prepareTiledMapImport(
          mapEntry.path,
          entries,
          "js",
        );
        assertComplexImportResult(imported);
      },
      { width: 32, height: 32 },
    );
  }, PNG_ASSET_RECORD);
});

test("exportTiledMapLuaBundle round-trips external TSX tilesets through the Lua import path", async () => {
  const fixture = createComplexTiledFixture();

  await withStubbedAssetLookup(async () => {
    const entries = await exportTiledMapLuaBundle(
      fixture.map,
      fixture.layers,
      [fixture.tileset],
      fixture.imageLayers,
      fixture.layerGroups,
      fixture.objectLayers,
      fixture.objects,
      COMPLEX_TILED_OPTIONS,
    );

    const mapEntry = getRootEntry(entries, ".lua");
    const mapDocument = parseTiledLuaDocument<{
      layers?: Array<{ type?: string }>;
      tilesets?: Array<{ filename?: string }>;
    }>(mapEntry.data, "Tiled Lua map");
    assert.strictEqual(mapDocument.layers?.[1]?.type, "group");
    assert.ok(mapDocument.tilesets?.[0]?.filename?.endsWith(".tsx"));

    await withStubbedImageImportEnvironment(
      async () => {
        const imported = await prepareTiledMapImport(
          mapEntry.path,
          entries,
          "lua",
        );
        assertComplexImportResult(imported, "Fancy- Terrain");
      },
      { width: 32, height: 32 },
    );
  }, PNG_ASSET_RECORD);
});

for (const format of ["json", "js", "lua"] as const) {
  test(`prepareTiledMapImport reports missing linked resources for ${format.toUpperCase()} bundles`, async () => {
    const fixture = createComplexTiledFixture();

    await withStubbedAssetLookup(async () => {
      const entries =
        format === "json"
          ? await exportTiledMapJsonBundle(
              fixture.map,
              fixture.layers,
              [fixture.tileset],
              fixture.imageLayers,
              fixture.layerGroups,
              fixture.objectLayers,
              fixture.objects,
              COMPLEX_TILED_OPTIONS,
            )
          : format === "js"
            ? await exportTiledMapJsBundle(
                fixture.map,
                fixture.layers,
                [fixture.tileset],
                fixture.imageLayers,
                fixture.layerGroups,
                fixture.objectLayers,
                fixture.objects,
                COMPLEX_TILED_OPTIONS,
              )
            : await exportTiledMapLuaBundle(
                fixture.map,
                fixture.layers,
                [fixture.tileset],
                fixture.imageLayers,
                fixture.layerGroups,
                fixture.objectLayers,
                fixture.objects,
                COMPLEX_TILED_OPTIONS,
              );

      const rootEntry = getRootEntry(
        entries,
        format === "json" ? ".tmj" : format === "js" ? ".js" : ".lua",
      );
      const imported = await prepareTiledMapImport(
        rootEntry.path,
        [rootEntry],
        format,
      );
      assert.strictEqual(imported.status, "missing-resources");
      if (imported.status !== "missing-resources") {
        return;
      }

      const missingPaths = imported.missingResources.map(
        (resource) => resource.path,
      );
      assert.ok(missingPaths.some((path) => path.endsWith(".png")));
      assert.ok(
        missingPaths.some((path) =>
          path.endsWith(format === "lua" ? ".tsx" : ".tsj"),
        ),
      );
    }, PNG_ASSET_RECORD);
  });
}

test("Tiled Lua helpers round-trip escaped values and reject unsupported documents", () => {
  const encoded = encodeTiledLuaDocument({
    plain: 1,
    list: [true, null, 3.5],
    nested: { child: "ok" },
    "two words": 'line 1\n"line 2"',
  });

  const encodedText = decodeText(encoded);
  assert.match(encodedText, /\["two words"\] = "line 1\\n\\"line 2\\""/);

  const parsed = parseTiledLuaDocument<Record<string, unknown>>(
    encoded,
    "fixture",
  );
  assert.deepEqual(parsed, {
    plain: 1,
    list: [true, null, 3.5],
    nested: { child: "ok" },
    "two words": 'line 1\n"line 2"',
  });

  assert.deepEqual(
    convertJsonLikeToTiledLua({ sample: [1, 2, 3], omit: undefined }),
    {
      arrayValues: [],
      objectValues: {
        sample: {
          arrayValues: [1, 2, 3],
          objectValues: {},
        },
      },
    },
  );

  assert.throws(
    () =>
      convertTiledLuaToJsonLike({
        objectValues: { named: 1 },
        arrayValues: [2],
      }),
    /Mixed keyed and array Lua tables are not supported/,
  );
  assert.throws(
    () => convertJsonLikeToTiledLua(new Date()),
    /Unsupported value/,
  );
  assert.throws(() => encodeTiledLuaDocument("oops"), /top-level table/);
});
