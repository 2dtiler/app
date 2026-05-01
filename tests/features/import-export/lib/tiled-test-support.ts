import { assert } from "vitest";
import { parseHTML } from "linkedom";
import { getTextObjectSettings } from "@/features/map-editor/lib/text-objects";
import { db } from "@/services/db";
import { TILESET_ANIMATION_CONFIG_VERSION } from "@/types/map/animation";
import {
  generateAssetId,
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";
import type {
  AutotileConfig,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TiledMapImportPreparationResult,
  TileMapData,
  Tileset,
  TilesetAnimation,
  TilesetAnimationConfig,
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

export function encodeText(value: string) {
  return new TextEncoder().encode(`${value}\n`);
}

export function decodeText(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

export function createTestTileset(): Tileset {
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

export function createTestAnimationConfig(): TilesetAnimationConfig {
  const animation = {
    id: "animation-water" as TilesetAnimation["id"],
    name: "Waterfall",
    widthInTiles: 1,
    heightInTiles: 1,
    frames: [
      {
        durationMs: 100,
        cells: [{ sx: 0, sy: 0, sw: 16, sh: 16 }],
      },
      {
        durationMs: 150,
        cells: [{ sx: 16, sy: 0, sw: 16, sh: 16 }],
      },
    ],
    createdAt: 1,
    updatedAt: 2,
  } satisfies TilesetAnimation;

  return {
    version: TILESET_ANIMATION_CONFIG_VERSION,
    animations: [animation],
  };
}

export function createTestWangAutotileConfig(): AutotileConfig {
  return {
    version: 1,
    preset: "wang-tiles",
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: { sx: 16, sy: 0, sw: 16, sh: 16 },
        patternTiles: {
          "wang-00": { sx: 0, sy: 0, sw: 16, sh: 16 },
          "wang-0f": { sx: 16, sy: 0, sw: 16, sh: 16 },
        },
      },
    ],
    rules: [],
  };
}

export function createTestMap(tileset: Tileset): {
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

export function createTestProject(tileset: Tileset): Project {
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

export function createComplexTiledFixture() {
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

export function getReadyImportResult(
  preparation: TiledMapImportPreparationResult,
) {
  assert.strictEqual(preparation.status, "ready");
  if (preparation.status !== "ready") {
    throw new Error(
      `Expected a ready import result, got ${preparation.status}.`,
    );
  }
  return preparation.result;
}

export function assertComplexImportResult(
  preparation: TiledMapImportPreparationResult,
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

export function getRootEntry(
  entries: readonly { path: string; data: Uint8Array }[],
  extension: string,
) {
  const entry = entries.find((candidate) => candidate.path.endsWith(extension));
  assert.ok(entry);
  return entry!;
}

export const COMPLEX_TILED_OPTIONS = {
  encoding: "base64",
  compression: "zlib",
  compressionLevel: 6,
  tilesetMode: "external",
  renderOrder: "right-down",
} as const;

export const PNG_ASSET_RECORD = {
  data: new Uint8Array([1, 2, 3, 4]).buffer,
  mimeType: "image/png",
};

export async function withStubbedAssetLookup(
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

export async function withStubbedImageImportEnvironment(
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
