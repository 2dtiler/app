import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { unzipSync } from "fflate";
import type {
  ExportSaveStrategy,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

const {
  exportDefoldMapBundleMock,
  exportDefoldTilesourceBundleMock,
  exportMappyMapMock,
  exportTideMapBundleMock,
  getAssetMock,
  resolveExportSaveStrategyMock,
} = vi.hoisted(() => ({
  exportDefoldMapBundleMock: vi.fn(),
  exportDefoldTilesourceBundleMock: vi.fn(),
  exportMappyMapMock: vi.fn(),
  exportTideMapBundleMock: vi.fn(),
  getAssetMock: vi.fn(),
  resolveExportSaveStrategyMock: vi.fn(),
}));

vi.mock("@/features/import-export/lib/export-save-strategy", () => ({
  resolveExportSaveStrategy: resolveExportSaveStrategyMock,
}));
vi.mock("@/features/import-export/lib/import-export-defold", () => ({
  exportDefoldMapBundle: exportDefoldMapBundleMock,
  exportDefoldTilesourceBundle: exportDefoldTilesourceBundleMock,
}));
vi.mock("@/features/import-export/lib/import-export-mappy", () => ({
  exportMappyMap: exportMappyMapMock,
}));
vi.mock("@/features/import-export/lib/import-export-tide", () => ({
  exportTideMapBundle: exportTideMapBundleMock,
}));
vi.mock("@/services/db", () => ({
  getAsset: getAssetMock,
}));

import {
  buildMapExportGroups,
  buildTilesetExportGroups,
  getMapExportData,
  getUniqueArchivePath,
  isDefoldMapExportOptions,
  isGameMakerMapExportOptions,
  isGodotMapExportOptions,
  isRasterExportOptions,
  isTiledMapExportOptions,
  isTiledTilesetExportOptions,
  pickSingleFile,
} from "@/features/import-export/lib/import-export-action-utils";
import {
  exportSelectedDefoldMaps,
  isDefoldMapOption,
} from "@/features/import-export/lib/defold-map-action-utils";
import {
  exportSelectedDefoldTilesets,
  isDefoldTilesetOption,
} from "@/features/import-export/lib/defold-tileset-action-utils";
import {
  exportSelectedMappyMaps,
  isMappyMapOption,
} from "@/features/import-export/lib/mappy-map-action-utils";
import {
  exportSelectedTideMaps,
  isTideMapOption,
} from "@/features/import-export/lib/tide-map-action-utils";
import {
  exportSelectedTiledTilesets,
  isTiledTilesetExportOption,
  isTiledTilesetImportOption,
} from "@/features/import-export/lib/tiled-tileset-action-utils";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

beforeEach(() => {
  exportDefoldMapBundleMock.mockReset();
  exportDefoldTilesourceBundleMock.mockReset();
  exportMappyMapMock.mockReset();
  exportTideMapBundleMock.mockReset();
  getAssetMock.mockReset();
  resolveExportSaveStrategyMock.mockReset();
  resolveExportSaveStrategyMock.mockImplementation(
    (strategy?: ExportSaveStrategy) => strategy,
  );
});

afterEach(() => {
  vi.useRealTimers();

  if (originalDocument) {
    Object.assign(globalThis, { document: originalDocument });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (originalWindow) {
    Object.assign(globalThis, { window: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

async function expectToThrow(action: () => Promise<unknown>, matcher: RegExp) {
  try {
    await action();
    assert.fail("Expected action to throw.");
  } catch (error) {
    assert.match(String(error), matcher);
  }
}

function createSaveStrategy() {
  return {
    saveBlob: vi.fn(async () => true),
    saveByteArray: vi.fn(async () => true),
  } satisfies ExportSaveStrategy;
}

function createProjectFixture() {
  const mapA = {
    id: "map-a" as TileMapData["id"],
    name: "Map:One",
    groupId: "group-a" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 2,
    heightInTiles: 2,
    tileSize: 16,
    layerOrder: ["layer-group-a" as LayerGroup["id"]],
    createdAt: 1,
  } as TileMapData;
  const mapB = {
    id: "map-b" as TileMapData["id"],
    name: "Map/Two",
    groupId: "group-b" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 1,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: ["layer-b" as TileLayer["id"]],
    createdAt: 2,
  } as TileMapData;
  const layerA = {
    id: "layer-a" as TileLayer["id"],
    mapId: mapA.id,
    name: "Ground A",
    type: "tile",
    visible: true,
    locked: false,
    tiles: {
      "0,0": {
        tilesetId: "tileset-a" as Tileset["id"],
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
      },
    },
  } as TileLayer;
  const layerB = {
    id: "layer-b" as TileLayer["id"],
    mapId: mapB.id,
    name: "Ground B",
    type: "tile",
    visible: false,
    locked: true,
    tiles: {
      "0,0": {
        tilesetId: "tileset-b" as Tileset["id"],
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
      },
    },
  } as TileLayer;
  const imageLayer = {
    id: "image-a" as ImageLayer["id"],
    mapId: mapA.id,
    name: "Overlay",
    type: "image",
    visible: true,
    locked: false,
    assetId: "asset-image" as ImageLayer["assetId"],
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 100,
  } as ImageLayer;
  const objectLayer = {
    id: "object-layer-a" as ObjectLayer["id"],
    mapId: mapA.id,
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: ["object-a" as MapObject["id"]],
  } as ObjectLayer;
  const layerGroup = {
    id: "layer-group-a" as LayerGroup["id"],
    mapId: mapA.id,
    name: "Top Group",
    visible: true,
    locked: false,
    expanded: true,
    childOrder: [layerA.id, imageLayer.id, objectLayer.id],
  } as LayerGroup;
  const objectA = {
    id: "object-a" as MapObject["id"],
    layerId: objectLayer.id,
    name: "Marker",
    type: "point",
    x: 1,
    y: 1,
    width: 0,
    height: 0,
    rotation: 0,
    points: [],
    visible: true,
    locked: false,
    properties: {},
  } as MapObject;
  const tilesetA = {
    id: "tileset-a" as Tileset["id"],
    name: "Tileset A",
    groupId: "tileset-group-a" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-a" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 16,
    createdAt: 1,
  } as Tileset;
  const tilesetB = {
    id: "tileset-b" as Tileset["id"],
    name: "Tileset/B",
    groupId: "tileset-group-b" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-b" as Tileset["assetId"],
    imageWidth: 16,
    imageHeight: 16,
    createdAt: 2,
  } as Tileset;

  return {
    id: "project-1" as Project["id"],
    name: "Project Root",
    createdAt: 1,
    updatedAt: 2,
    tileSize: 16,
    tilesetGroups: [
      { id: "tileset-group-b", name: "B Group", order: 1 },
      { id: "tileset-group-a", name: "A Group", order: 2 },
    ],
    tilesets: [tilesetA, tilesetB],
    mapGroups: [
      { id: "group-b", name: "Bravo", order: 1 },
      { id: "group-a", name: "Alpha", order: 2 },
    ],
    maps: [mapA, mapB],
    layers: [layerA, layerB],
    imageLayers: [imageLayer],
    layerGroups: [layerGroup],
    terrains: [],
    objectLayers: [objectLayer],
    objects: [objectA],
    overrideTilesets: [],
  } as unknown as Project;
}

function installPickerEnvironment() {
  const inputListeners = new Map<string, Set<() => void>>();
  const windowListeners = new Map<string, Set<() => void>>();
  const input = {
    files: undefined as File[] | undefined,
    type: "",
    accept: "",
    name: "",
    id: "",
    addEventListener(event: string, listener: () => void) {
      inputListeners.set(
        event,
        (inputListeners.get(event) ?? new Set()).add(listener),
      );
    },
    removeEventListener(event: string, listener: () => void) {
      inputListeners.get(event)?.delete(listener);
    },
    click: vi.fn(),
  };
  const mockWindow = {
    addEventListener(event: string, listener: () => void) {
      windowListeners.set(
        event,
        (windowListeners.get(event) ?? new Set()).add(listener),
      );
    },
    removeEventListener(event: string, listener: () => void) {
      windowListeners.get(event)?.delete(listener);
    },
    setTimeout,
    clearTimeout,
  };
  Object.assign(globalThis, {
    document: {
      createElement: vi.fn(() => input),
    },
    window: mockWindow,
  });

  return {
    input,
    dispatchInput(event: string) {
      for (const listener of inputListeners.get(event) ?? []) {
        listener();
      }
    },
    dispatchWindow(event: string) {
      for (const listener of windowListeners.get(event) ?? []) {
        listener();
      }
    },
  };
}

test("action-utils type guards and archive path helpers recognize supported option shapes", () => {
  assert.strictEqual(isRasterExportOptions({ fileType: "png" }), true);
  assert.strictEqual(
    isTiledMapExportOptions({
      format: "json",
      tilesetMode: "external",
      encoding: "csv",
      compression: "none",
      compressionLevel: 0,
      renderOrder: "right-down",
    }),
    true,
  );
  assert.strictEqual(isTiledTilesetExportOptions({ format: "lua" }), true);
  assert.strictEqual(
    isGodotMapExportOptions({
      sceneRootName: "Root",
      tilesetMode: "single",
      textureMode: "atlas",
    }),
    true,
  );
  assert.strictEqual(isGameMakerMapExportOptions({ format: "yy" }), true);
  assert.strictEqual(isDefoldMapExportOptions({ format: "collection" }), true);
  assert.strictEqual(
    getUniqueArchivePath("maps/test.tmj", new Set()),
    "maps/test.tmj",
  );

  const usedPaths = new Set(["maps/test.tmj"]);
  assert.strictEqual(
    getUniqueArchivePath("maps/test.tmj", usedPaths),
    "maps/test (2).tmj",
  );
});

test("pickSingleFile resolves a chosen file and falls back to null on window focus cancel", async () => {
  const selected = installPickerEnvironment();
  const file = new File(["ok"], "map.tmx");
  const pickPromise = pickSingleFile(".tmx");
  selected.input.files = [file];
  selected.dispatchInput("change");
  assert.strictEqual(await pickPromise, file);
  assert.strictEqual(selected.input.accept, ".tmx");
  assert.strictEqual(selected.input.name, "import-file");
  assert.match(selected.input.id, /^import-file-/);

  vi.useFakeTimers();
  const canceled = installPickerEnvironment();
  const cancelPromise = pickSingleFile(".json", "custom-input");
  canceled.dispatchWindow("focus");
  vi.advanceTimersByTime(251);
  assert.strictEqual(await cancelPromise, null);
  assert.strictEqual(canceled.input.name, "custom-input");
});

test("getMapExportData and grouped asset builders preserve nested layer data and group ordering", () => {
  const project = createProjectFixture();
  const mapExportData = getMapExportData(project, project.maps[0]!);

  assert.deepEqual(
    mapExportData.layers.map((layer) => layer.id),
    ["layer-a"],
  );
  assert.deepEqual(
    mapExportData.imageLayers.map((layer) => layer.id),
    ["image-a"],
  );
  assert.deepEqual(
    mapExportData.layerGroups.map((group) => group.id),
    ["layer-group-a"],
  );
  assert.deepEqual(
    mapExportData.objectLayers.map((layer) => layer.id),
    ["object-layer-a"],
  );
  assert.deepEqual(
    mapExportData.objects.map((object) => object.id),
    ["object-a"],
  );

  const mapGroups = buildMapExportGroups(project);
  assert.deepEqual(
    mapGroups.map((group) => group.name),
    ["Bravo", "Alpha"],
  );
  assert.deepEqual(mapGroups[1]?.assets[0]?.thumbnail.tilesets, [
    { id: "tileset-a", assetId: "asset-a" },
  ]);

  const tilesetGroups = buildTilesetExportGroups(project);
  assert.deepEqual(
    tilesetGroups.map((group) => group.name),
    ["B Group", "A Group"],
  );
  assert.strictEqual(tilesetGroups[0]?.assets[0]?.subtitle, "16 × 16 px");
});

test("Defold export action utils handle predicates, single exports, and grouped multi-export archives", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  exportDefoldMapBundleMock.mockImplementation(async (map: TileMapData) => [
    { path: `${map.name}.collection`, data: encodeText(map.name) },
    { path: "shared/resource.txt", data: encodeText(map.id) },
  ]);
  exportDefoldTilesourceBundleMock.mockImplementation(
    async (tileset: Tileset) => [
      { path: `${tileset.name}.tilesource`, data: encodeText(tileset.name) },
    ],
  );

  assert.strictEqual(isDefoldMapOption("map-defold"), true);
  assert.strictEqual(isDefoldTilesetOption("tileset-defold"), true);
  assert.strictEqual(
    await exportSelectedDefoldMaps(null, [], "map-defold"),
    false,
  );
  await expectToThrow(
    () =>
      exportSelectedDefoldMaps(
        project,
        [project.maps[0]!.id],
        "map-tide",
        undefined,
        saveStrategy,
      ),
    /Unsupported Defold export option/,
  );

  await exportSelectedDefoldMaps(
    project,
    [project.maps[0]!.id],
    "map-defold",
    { format: "tilemap" },
    saveStrategy,
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Map-One.tilemap.zip",
  );

  await exportSelectedDefoldMaps(
    project,
    project.maps.map((map) => map.id),
    "map-defold",
    { format: "collection" },
    saveStrategy,
  );
  const multiMapArchive = unzipSync(
    saveStrategy.saveByteArray.mock.calls[1]![0],
  );
  assert.ok(
    Object.keys(multiMapArchive).some((path) =>
      path.includes("Alpha/Map-One/"),
    ),
  );
  assert.ok(
    Object.keys(multiMapArchive).some((path) =>
      path.includes("Bravo/Map-Two/"),
    ),
  );

  await exportSelectedDefoldTilesets(
    project,
    project.tilesets.map((tileset) => tileset.id),
    "tileset-defold",
    saveStrategy,
  );
  const tilesetArchive = unzipSync(
    saveStrategy.saveByteArray.mock.calls[2]![0],
  );
  assert.ok(
    Object.keys(tilesetArchive).some((path) =>
      path.includes("A Group/Tileset A/"),
    ),
  );
  assert.ok(
    Object.keys(tilesetArchive).some((path) =>
      path.includes("B Group/Tileset-B/"),
    ),
  );
});

test("Mappy and tIDE action utils export single files and grouped archives", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  exportMappyMapMock.mockImplementation(async (map: TileMapData) =>
    encodeText(`mappy:${map.name}`),
  );
  exportTideMapBundleMock.mockImplementation(async (map: TileMapData) => [
    { path: `${map.name}.tide`, data: encodeText(map.name) },
  ]);

  assert.strictEqual(isMappyMapOption("map-mappy-fmp"), true);
  assert.strictEqual(isTideMapOption("map-tide"), true);

  await exportSelectedMappyMaps(
    project,
    [project.maps[0]!.id],
    "map-mappy-fmp",
    saveStrategy,
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Map-One.fmp",
  );

  await exportSelectedMappyMaps(
    project,
    project.maps.map((map) => map.id),
    "map-mappy-fmp",
    saveStrategy,
  );
  const mappyArchive = unzipSync(saveStrategy.saveByteArray.mock.calls[1]![0]);
  assert.ok(
    Object.keys(mappyArchive).some((path) =>
      path.includes("Alpha/Map-One.fmp"),
    ),
  );
  assert.ok(
    Object.keys(mappyArchive).some((path) =>
      path.includes("Bravo/Map-Two.fmp"),
    ),
  );

  await exportSelectedTideMaps(
    project,
    [project.maps[0]!.id],
    "map-tide",
    saveStrategy,
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[2]?.[1],
    "Map-One.tide.zip",
  );

  await exportSelectedTideMaps(
    project,
    project.maps.map((map) => map.id),
    "map-tide",
    saveStrategy,
  );
  const tideArchive = unzipSync(saveStrategy.saveByteArray.mock.calls[3]![0]);
  assert.ok(
    Object.keys(tideArchive).some((path) => path.includes("Alpha/Map-One/")),
  );
  assert.ok(
    Object.keys(tideArchive).some((path) => path.includes("Bravo/Map-Two/")),
  );
});

test("Tiled tileset action utils export grouped archives and reject invalid input", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  getAssetMock.mockImplementation(async (assetId: string) => ({
    id: assetId,
    data: new Uint8Array([1, 2, 3]).buffer,
    mimeType: assetId === "asset-b" ? "image/jpeg" : "image/png",
  }));

  assert.strictEqual(isTiledTilesetImportOption("tileset-tiled-file"), true);
  assert.strictEqual(isTiledTilesetExportOption("tileset-tiled"), true);
  assert.strictEqual(
    await exportSelectedTiledTilesets(null, [], "tileset-tiled", {
      format: "xml",
    }),
    false,
  );
  await expectToThrow(
    () =>
      exportSelectedTiledTilesets(
        project,
        [project.tilesets[0]!.id],
        "tileset-defold",
        { format: "xml" },
        saveStrategy,
      ),
    /Unsupported Tiled tileset export option/,
  );
  await expectToThrow(
    () =>
      exportSelectedTiledTilesets(
        project,
        [project.tilesets[0]!.id],
        "tileset-tiled",
        undefined,
        saveStrategy,
      ),
    /Missing Tiled tileset export options/,
  );

  await exportSelectedTiledTilesets(
    project,
    project.tilesets.map((tileset) => tileset.id),
    "tileset-tiled",
    { format: "json" },
    saveStrategy,
  );
  const jsonArchive = unzipSync(saveStrategy.saveByteArray.mock.calls[0]![0]);
  assert.ok(
    Object.keys(jsonArchive).some((path) => path.endsWith("Tileset A.tsj")),
  );
  assert.ok(
    Object.keys(jsonArchive).some((path) =>
      path.includes("Tileset-B/Tileset-B.tsj"),
    ),
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Project Root tiled tilesets.zip",
  );

  getAssetMock.mockResolvedValueOnce(undefined);
  await expectToThrow(
    () =>
      exportSelectedTiledTilesets(
        project,
        [project.tilesets[0]!.id],
        "tileset-tiled",
        { format: "lua" },
        saveStrategy,
      ),
    /Missing tileset asset/,
  );
});
