import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { unzipSync } from "fflate";
import type {
  AutotileConfig,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

const { getAssetMock, saveAssetMock } = vi.hoisted(() => ({
  getAssetMock: vi.fn(),
  saveAssetMock: vi.fn(),
}));

vi.mock("@/services/db", () => ({
  getAsset: getAssetMock,
  saveAsset: saveAssetMock,
}));

import {
  buildDownloadFilename,
  createZipArchive,
  downloadFile,
  exportMap,
  exportProject,
  exportTileset,
  importMap,
  importProject,
  importTileset,
  readFileAsUint8Array,
  sanitizeDownloadSegment,
} from "@/utils/format";

const originalDocument = globalThis.document;
const originalFileReader = globalThis.FileReader;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  getAssetMock.mockReset();
  saveAssetMock.mockReset();
});

afterEach(() => {
  if (originalDocument) {
    Object.assign(globalThis, { document: originalDocument });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (originalFileReader) {
    Object.assign(globalThis, { FileReader: originalFileReader });
  } else {
    Reflect.deleteProperty(globalThis, "FileReader");
  }

  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

function createTextObject(layerId: ObjectLayer["id"]) {
  return {
    id: "object-text" as MapObject["id"],
    layerId,
    name: "Label",
    type: "text",
    x: 4,
    y: 5,
    width: 0,
    height: 0,
    rotation: 0,
    points: [],
    visible: true,
    locked: false,
    properties: {
      Text: { value: "Hello", type: "string" },
      Size: { value: "14", type: "int" },
      Rotation: { value: "30", type: "float" },
      Font: { value: "", type: "string" },
      "Word wrap": { value: "true", type: "bool" },
      Color: { value: "", type: "color" },
    },
  } as MapObject;
}

function createProjectFixture() {
  const tileset = {
    id: "tileset-1" as Tileset["id"],
    name: "Main",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 0 as Tileset["tileSize"],
    assetId: "asset-tileset" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 32,
    createdAt: 1,
  } as Tileset;
  const objectLayer = {
    id: "layer-objects" as ObjectLayer["id"],
    mapId: "map-1" as ObjectLayer["mapId"],
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: ["object-text" as MapObject["id"]],
  } as ObjectLayer;

  return {
    id: "project-1" as Project["id"],
    name: "Demo",
    createdAt: 1,
    updatedAt: 2,
    tileSize: undefined,
    tilesetGroups: [],
    tilesets: [tileset],
    mapGroups: [],
    maps: [
      {
        id: "map-1" as TileMapData["id"],
        name: "Test Map",
        groupId: "group-1" as TileMapData["groupId"],
        orientation: undefined,
        widthInTiles: 2,
        heightInTiles: 2,
        tileSize: 16,
        layerOrder: [],
        createdAt: 1,
      } as TileMapData,
    ],
    layers: [],
    imageLayers: [
      {
        id: "image-1" as ImageLayer["id"],
        mapId: "map-1" as ImageLayer["mapId"],
        name: "Backdrop",
        type: "image",
        visible: true,
        locked: false,
        assetId: "asset-shared" as ImageLayer["assetId"],
        x: 0,
        y: 0,
        width: 32,
        height: 32,
        rotation: 45 as ImageLayer["rotation"],
        flipX: false,
        flipY: true,
        opacity: 105,
      } as ImageLayer,
    ],
    layerGroups: [],
    terrains: [],
    objectLayers: [objectLayer],
    objects: [createTextObject(objectLayer.id)],
    overrideTilesets: [
      {
        id: "tileset-override" as Tileset["id"],
        name: "Override",
        groupId: "group-1" as Tileset["groupId"],
        tileSize: 0 as Tileset["tileSize"],
        assetId: "asset-shared" as Tileset["assetId"],
        imageWidth: 16,
        imageHeight: 16,
        createdAt: 1,
      } as Tileset,
    ],
  } as unknown as Project;
}

function createMapFixture() {
  const map = {
    id: "map-1" as TileMapData["id"],
    name: "Map Export",
    groupId: "group-1" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 2,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: ["layer-1" as TileLayer["id"]],
    createdAt: 1,
  } as TileMapData;
  const tilesetA = {
    id: "tileset-a" as Tileset["id"],
    name: "A",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-a" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 16,
    createdAt: 1,
  } as Tileset;
  const tilesetB = {
    id: "tileset-b" as Tileset["id"],
    name: "B",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-b" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 16,
    createdAt: 1,
  } as Tileset;
  const overrideTileset = {
    id: "tileset-override" as Tileset["id"],
    name: "Override",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 0 as Tileset["tileSize"],
    assetId: "asset-override" as Tileset["assetId"],
    imageWidth: 16,
    imageHeight: 16,
    createdAt: 1,
  } as Tileset;
  const layer = {
    id: "layer-1" as TileLayer["id"],
    mapId: map.id,
    name: "Ground",
    type: "tile",
    visible: true,
    locked: false,
    tiles: {
      "0,0": {
        tilesetId: tilesetA.id,
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
      },
      "1,0": {
        tilesetId: overrideTileset.id,
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
      },
    },
  } as TileLayer;
  const imageLayer = {
    id: "image-map" as ImageLayer["id"],
    mapId: map.id,
    name: "Image",
    type: "image",
    visible: true,
    locked: false,
    assetId: "asset-image" as ImageLayer["assetId"],
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 100,
  } as ImageLayer;
  const localObjectLayer = {
    id: "objects-local" as ObjectLayer["id"],
    mapId: map.id,
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: ["object-local" as MapObject["id"]],
  } as ObjectLayer;
  const foreignObjectLayer = {
    id: "objects-foreign" as ObjectLayer["id"],
    mapId: "other-map" as ObjectLayer["mapId"],
    name: "Other",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: ["object-foreign" as MapObject["id"]],
  } as ObjectLayer;
  const objects = [
    {
      id: "object-local" as MapObject["id"],
      layerId: localObjectLayer.id,
      name: "Spawn",
      type: "rectangle",
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      rotation: 0,
      points: [],
      visible: true,
      locked: false,
      properties: {},
    } as MapObject,
    {
      id: "object-foreign" as MapObject["id"],
      layerId: foreignObjectLayer.id,
      name: "Elsewhere",
      type: "rectangle",
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      rotation: 0,
      points: [],
      visible: true,
      locked: false,
      properties: {},
    } as MapObject,
  ];

  return {
    map,
    layer,
    imageLayer,
    tilesets: [tilesetA, tilesetB],
    overrideTilesets: [overrideTileset],
    layerGroups: [] as LayerGroup[],
    objectLayers: [localObjectLayer, foreignObjectLayer],
    objects,
  };
}

test("sanitizeDownloadSegment and buildDownloadFilename normalize unsafe names", () => {
  assert.strictEqual(
    sanitizeDownloadSegment('  bad<>:"/\\|?* name.  '),
    "bad--------- name",
  );
  assert.strictEqual(sanitizeDownloadSegment("   ", "fallback"), "fallback");
  assert.strictEqual(buildDownloadFilename("Map:01", ".tmx"), "Map-01.tmx");
});

test("createZipArchive normalizes entry separators", () => {
  const archive = createZipArchive([
    {
      path: "nested\\map.json",
      data: new TextEncoder().encode("hello"),
    },
  ]);
  const files = unzipSync(archive);
  assert.strictEqual(
    new TextDecoder().decode(files["nested/map.json"]),
    "hello",
  );
});

test("exportProject and importProject round-trip assets and normalize the project", async () => {
  const project = createProjectFixture();
  const assetRecords = new Map([
    [
      "asset-tileset",
      {
        id: "asset-tileset",
        data: new Uint8Array([1, 2, 3]).buffer,
        mimeType: "image/png",
      },
    ],
    [
      "asset-shared",
      {
        id: "asset-shared",
        data: new Uint8Array([4, 5, 6]).buffer,
        mimeType: "image/png",
      },
    ],
  ]);
  getAssetMock.mockImplementation(async (id: string) => assetRecords.get(id));
  saveAssetMock.mockResolvedValue(undefined);

  const packed = await exportProject(project);
  const imported = await importProject(packed);

  assert.deepEqual(
    getAssetMock.mock.calls.map(([id]) => id),
    ["asset-tileset", "asset-shared"],
  );
  assert.strictEqual(saveAssetMock.mock.calls.length, 2);
  assert.strictEqual(imported.tileSize, 32);
  assert.strictEqual(imported.tilesets[0]?.tileSize, 32);
  assert.strictEqual(imported.overrideTilesets[0]?.tileSize, 32);
  assert.strictEqual(imported.maps[0]?.orientation, "orthogonal");
  assert.strictEqual(imported.imageLayers[0]?.opacity, 100);
  assert.strictEqual(imported.imageLayers[0]?.rotation, 0);
  assert.strictEqual(imported.objects[0]?.width, 96);
  assert.strictEqual(imported.objects[0]?.height, 32);
});

test("exportMap and importMap keep only referenced tilesets and local object layers", async () => {
  const fixture = createMapFixture();
  const assetRecords = new Map([
    [
      "asset-a",
      {
        id: "asset-a",
        data: new Uint8Array([1]).buffer,
        mimeType: "image/png",
      },
    ],
    [
      "asset-override",
      {
        id: "asset-override",
        data: new Uint8Array([2]).buffer,
        mimeType: "image/png",
      },
    ],
    [
      "asset-image",
      {
        id: "asset-image",
        data: new Uint8Array([3]).buffer,
        mimeType: "image/png",
      },
    ],
  ]);
  getAssetMock.mockImplementation(async (id: string) => assetRecords.get(id));
  saveAssetMock.mockResolvedValue(undefined);

  const packed = await exportMap(
    fixture.map,
    [fixture.layer],
    fixture.tilesets,
    fixture.overrideTilesets,
    [fixture.imageLayer],
    fixture.layerGroups,
    fixture.objectLayers,
    fixture.objects,
  );
  const imported = await importMap(packed);

  assert.deepEqual(
    getAssetMock.mock.calls.map(([id]) => id),
    ["asset-a", "asset-override", "asset-image"],
  );
  assert.deepEqual(
    imported.tilesets.map((tileset) => tileset.id),
    ["tileset-a"],
  );
  assert.deepEqual(
    imported.overrideTilesets.map((tileset) => tileset.id),
    ["tileset-override"],
  );
  assert.strictEqual(
    imported.overrideTilesets[0]?.tileSize,
    fixture.map.tileSize,
  );
  assert.deepEqual(
    imported.objectLayers.map((layer) => layer.id),
    ["objects-local"],
  );
  assert.deepEqual(
    imported.objects.map((object) => object.id),
    ["object-local"],
  );
  assert.deepEqual(
    imported.imageLayers.map((layer) => layer.id),
    ["image-map"],
  );
});

test("exportTileset and importTileset round-trip a single tileset asset", async () => {
  const autotile = {
    version: 1,
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: {
          sx: 0,
          sy: 0,
          sw: 16,
          sh: 16,
        },
      },
      {
        id: "terrain-water",
        name: "Water",
        paletteTile: {
          sx: 16,
          sy: 0,
          sw: 16,
          sh: 16,
        },
      },
    ],
    rules: [
      {
        id: "rule-land-water-edge",
        name: "Land with water above",
        centerTerrainId: "terrain-land",
        neighbors: {
          northWest: { kind: "any" },
          north: { kind: "terrain", terrainId: "terrain-water" },
          northEast: { kind: "any" },
          west: { kind: "any" },
          east: { kind: "any" },
          southWest: { kind: "any" },
          south: { kind: "filled" },
          southEast: { kind: "any" },
        },
        output: {
          sx: 32,
          sy: 0,
          sw: 16,
          sh: 16,
        },
      },
    ],
  } as AutotileConfig;

  const tileset = {
    id: "tileset-1" as Tileset["id"],
    name: "Tileset",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 0 as Tileset["tileSize"],
    assetId: "asset-tileset" as Tileset["assetId"],
    imageWidth: 16,
    imageHeight: 16,
    autotile,
    createdAt: 1,
  } as Tileset;
  getAssetMock.mockResolvedValue({
    id: "asset-tileset",
    data: new Uint8Array([8, 9]).buffer,
    mimeType: "image/png",
  });
  saveAssetMock.mockResolvedValue(undefined);

  const packed = await exportTileset(tileset);
  const imported = await importTileset(packed, 24);

  assert.strictEqual(imported.tileSize, 24);
  assert.deepEqual(imported.autotile, autotile);
  assert.strictEqual(saveAssetMock.mock.calls.length, 1);
});

test("downloadFile clicks a temporary anchor and revokes the object URL", () => {
  const anchor = {
    href: "",
    download: "",
    click: vi.fn(),
  };
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  Object.assign(globalThis, {
    document: {
      body: {
        appendChild,
        removeChild,
      },
      createElement: vi.fn(() => anchor),
    },
  });
  URL.createObjectURL = vi.fn(() => "blob:test") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

  downloadFile(new Uint8Array([1, 2, 3]), "map.2dm");

  assert.strictEqual(anchor.href, "blob:test");
  assert.strictEqual(anchor.download, "map.2dm");
  assert.strictEqual(anchor.click.mock.calls.length, 1);
  assert.strictEqual(appendChild.mock.calls.length, 1);
  assert.strictEqual(removeChild.mock.calls.length, 1);
  assert.strictEqual(
    (URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls
      .length,
    1,
  );
});

test("readFileAsUint8Array resolves and rejects based on the FileReader result", async () => {
  class SuccessfulFileReader {
    result: ArrayBuffer | null = null;
    error: Error | null = null;
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;

    readAsArrayBuffer() {
      this.result = new Uint8Array([7, 8, 9]).buffer;
      this.onload?.();
    }
  }

  Object.assign(globalThis, {
    FileReader: SuccessfulFileReader as unknown as typeof FileReader,
  });

  const bytes = await readFileAsUint8Array(
    new Blob([new Uint8Array([0])]) as File,
  );
  assert.deepEqual(Array.from(bytes), [7, 8, 9]);

  class FailingFileReader {
    result: ArrayBuffer | null = null;
    error = new Error("reader failed");
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;

    readAsArrayBuffer() {
      this.onerror?.();
    }
  }

  Object.assign(globalThis, {
    FileReader: FailingFileReader as unknown as typeof FileReader,
  });

  try {
    await readFileAsUint8Array(new Blob([new Uint8Array([0])]) as File);
    assert.fail("Expected readFileAsUint8Array to reject.");
  } catch (error) {
    assert.match(String(error), /reader failed/);
  }
});
