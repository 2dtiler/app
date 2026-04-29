import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assert, test } from "vitest";
import { useMapPanelCanvasActions } from "@/features/map-editor/components/MapPanel/use-map-panel-canvas-actions";
import {
  DEFAULT_EDITOR_STATE,
  type AssetId,
  type AutotileConfig,
  type AutotileTerrainId,
  type EditorState,
  type LayerId,
  type MapGroupId,
  type MapId,
  type ProjectId,
  type TileRef,
  type TilesetGroupId,
  type TilesetId,
} from "@/types";

const PROJECT_ID = "project-1" as ProjectId;
const TILESET_GROUP_ID = "tileset-group-1" as TilesetGroupId;
const TILESET_ID = "tileset-1" as TilesetId;
const MAP_GROUP_ID = "map-group-1" as MapGroupId;
const MAP_ID = "map-1" as MapId;
const LAYER_ID = "layer-1" as LayerId;
const ASSET_ID = "asset-1" as AssetId;
const LAND_TERRAIN_ID = "terrain-land" as AutotileTerrainId;
const WATER_TERRAIN_ID = "terrain-water" as AutotileTerrainId;

function createTileRef(sx: number, sy: number): TileRef {
  return {
    tilesetId: TILESET_ID,
    sx,
    sy,
    sw: 16,
    sh: 16,
  };
}

function createAutotileConfig(): AutotileConfig {
  return {
    version: 1,
    terrains: [
      {
        id: LAND_TERRAIN_ID,
        name: "Land",
        paletteTile: { sx: 0, sy: 0, sw: 16, sh: 16 },
      },
      {
        id: WATER_TERRAIN_ID,
        name: "Water",
        paletteTile: { sx: 16, sy: 0, sw: 16, sh: 16 },
      },
    ],
    rules: [
      {
        id: "rule-land-north-west-water",
        name: "Land corner",
        centerTerrainId: LAND_TERRAIN_ID,
        neighbors: {
          northWest: { kind: "any" },
          north: { kind: "terrain", terrainId: WATER_TERRAIN_ID },
          northEast: { kind: "any" },
          west: { kind: "terrain", terrainId: WATER_TERRAIN_ID },
          east: { kind: "any" },
          southWest: { kind: "any" },
          south: { kind: "any" },
          southEast: { kind: "any" },
        },
        output: { sx: 48, sy: 0, sw: 16, sh: 16 },
      },
      {
        id: "rule-land-north-water",
        name: "Land north edge",
        centerTerrainId: LAND_TERRAIN_ID,
        neighbors: {
          northWest: { kind: "any" },
          north: { kind: "terrain", terrainId: WATER_TERRAIN_ID },
          northEast: { kind: "any" },
          west: { kind: "any" },
          east: { kind: "any" },
          southWest: { kind: "any" },
          south: { kind: "any" },
          southEast: { kind: "any" },
        },
        output: { sx: 32, sy: 0, sw: 16, sh: 16 },
      },
      {
        id: "rule-water-open-top",
        name: "Water with empty north",
        centerTerrainId: WATER_TERRAIN_ID,
        neighbors: {
          northWest: { kind: "any" },
          north: { kind: "empty" },
          northEast: { kind: "any" },
          west: { kind: "any" },
          east: { kind: "any" },
          southWest: { kind: "any" },
          south: { kind: "any" },
          southEast: { kind: "any" },
        },
        output: { sx: 64, sy: 0, sw: 16, sh: 16 },
      },
    ],
  } as AutotileConfig;
}

test("erase strokes retile autotile neighbors through map panel canvas actions", () => {
  const activeLayer = {
    id: LAYER_ID,
    mapId: MAP_ID,
    name: "Ground",
    visible: true,
    locked: false,
    tiles: {
      "1,0": createTileRef(64, 0),
      "1,1": createTileRef(32, 0),
    },
  };
  const activeMap = {
    id: MAP_ID,
    name: "Map",
    groupId: MAP_GROUP_ID,
    orientation: "orthogonal",
    widthInTiles: 4,
    heightInTiles: 4,
    tileSize: 16,
    layerOrder: [LAYER_ID],
    createdAt: 0,
  };
  const project = {
    id: PROJECT_ID,
    name: "Project",
    createdAt: 0,
    updatedAt: 0,
    tileSize: 16,
    tilesetGroups: [{ id: TILESET_GROUP_ID, name: "Tilesets", order: 0 }],
    tilesets: [
      {
        id: TILESET_ID,
        name: "Terrain",
        groupId: TILESET_GROUP_ID,
        tileSize: 16,
        assetId: ASSET_ID,
        imageWidth: 64,
        imageHeight: 16,
        autotile: createAutotileConfig(),
        createdAt: 0,
      },
    ],
    mapGroups: [{ id: MAP_GROUP_ID, name: "Maps", order: 0 }],
    maps: [activeMap],
    layers: [activeLayer],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
  const state: EditorState = {
    ...DEFAULT_EDITOR_STATE,
    project,
    activeMapGroupId: MAP_GROUP_ID,
    activeMapId: MAP_ID,
    activeLayerId: LAYER_ID,
    activeTilesetGroupId: TILESET_GROUP_ID,
    activeTilesetId: TILESET_ID,
    currentTool: "erase",
    tileSize: 16,
  };
  const paintBuffer = new Map<string, TileRef | null>();
  const drawnTiles = [] as { ref: TileRef; x: number; y: number }[];
  const erasedTiles = [] as { x: number; y: number }[];
  const mapCanvasRef = {
    current: {
      drawBufferTile: (x: number, y: number, ref: TileRef) => {
        drawnTiles.push({ x, y, ref });
      },
      eraseBufferTile: (x: number, y: number) => {
        erasedTiles.push({ x, y });
      },
      clearPaintCanvas: () => {},
    },
  };
  let paintBufferVersion = 0;
  const setPaintBufferVersion = (
    value: number | ((currentValue: number) => number),
  ) => {
    paintBufferVersion =
      typeof value === "function" ? value(paintBufferVersion) : value;
  };
  const setState = (updater: EditorState | ((draft: EditorState) => void)) => {
    if (typeof updater === "function") {
      updater(state);
      return;
    }

    Object.assign(state, updater);
  };
  const hookResult = (() => {
    let current: ReturnType<typeof useMapPanelCanvasActions> | null = null;

    return {
      getCurrent: () => current,
      setCurrent: (value: ReturnType<typeof useMapPanelCanvasActions>) => {
        current = value;
      },
    };
  })();

  function HookHarness(params: Parameters<typeof useMapPanelCanvasActions>[0]) {
    hookResult.setCurrent(useMapPanelCanvasActions(params));
    return null;
  }

  renderToStaticMarkup(
    createElement(HookHarness, {
      activeImageLayer: null,
      activeLayer,
      activeMap,
      contextMenuTileRef: { current: null },
      hasContextMenuImageLayer: false,
      layerGroups: project.layerGroups,
      mapCanvasRef,
      paintBuffer,
      project,
      setPaintBufferVersion,
      setState,
      state,
      textObjectEditing: {
        editing: null,
        startEditing: () => {},
        updateText: () => {},
        commitEditing: () => {},
        cancelEditing: () => {},
      },
    }),
  );

  const actions = hookResult.getCurrent();

  assert.ok(actions);
  if (!actions) {
    return;
  }

  actions.handlePaintTile(1, 0);

  assert.strictEqual(paintBuffer.get("1,0"), null);
  assert.deepEqual(paintBuffer.get("1,1"), createTileRef(0, 0));
  assert.deepEqual(erasedTiles, [{ x: 1, y: 0 }]);
  assert.deepEqual(drawnTiles, [{ x: 1, y: 1, ref: createTileRef(0, 0) }]);

  actions.handlePaintEnd();

  assert.strictEqual(paintBuffer.size, 0);
  assert.strictEqual(paintBufferVersion, 1);
  assert.ok(!("1,0" in activeLayer.tiles));
  assert.deepEqual(activeLayer.tiles["1,1"], createTileRef(0, 0));
});

test("autotile strokes use explicit toolbar selection without a palette tile", () => {
  const activeLayer = {
    id: LAYER_ID,
    mapId: MAP_ID,
    name: "Ground",
    visible: true,
    locked: false,
    tiles: {},
  };
  const activeMap = {
    id: MAP_ID,
    name: "Map",
    groupId: MAP_GROUP_ID,
    orientation: "orthogonal",
    widthInTiles: 4,
    heightInTiles: 4,
    tileSize: 16,
    layerOrder: [LAYER_ID],
    createdAt: 0,
  };
  const project = {
    id: PROJECT_ID,
    name: "Project",
    createdAt: 0,
    updatedAt: 0,
    tileSize: 16,
    tilesetGroups: [{ id: TILESET_GROUP_ID, name: "Tilesets", order: 0 }],
    tilesets: [
      {
        id: TILESET_ID,
        name: "Terrain",
        groupId: TILESET_GROUP_ID,
        tileSize: 16,
        assetId: ASSET_ID,
        imageWidth: 64,
        imageHeight: 16,
        autotile: createAutotileConfig(),
        createdAt: 0,
      },
    ],
    mapGroups: [{ id: MAP_GROUP_ID, name: "Maps", order: 0 }],
    maps: [activeMap],
    layers: [activeLayer],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
  const state: EditorState = {
    ...DEFAULT_EDITOR_STATE,
    project,
    activeMapGroupId: MAP_GROUP_ID,
    activeMapId: MAP_ID,
    activeLayerId: LAYER_ID,
    activeTilesetGroupId: TILESET_GROUP_ID,
    activeTilesetId: TILESET_ID,
    currentTool: "autotile",
    tileSize: 16,
    selectedTile: null,
    selectedAutotileTerrain: {
      tilesetId: TILESET_ID,
      terrainId: LAND_TERRAIN_ID,
    },
  };
  const paintBuffer = new Map<string, TileRef | null>();
  const drawnTiles = [] as { ref: TileRef; x: number; y: number }[];
  const mapCanvasRef = {
    current: {
      drawBufferTile: (x: number, y: number, ref: TileRef) => {
        drawnTiles.push({ x, y, ref });
      },
      eraseBufferTile: () => {},
      clearPaintCanvas: () => {},
    },
  };
  let paintBufferVersion = 0;
  const setPaintBufferVersion = (
    value: number | ((currentValue: number) => number),
  ) => {
    paintBufferVersion =
      typeof value === "function" ? value(paintBufferVersion) : value;
  };
  const setState = (updater: EditorState | ((draft: EditorState) => void)) => {
    if (typeof updater === "function") {
      updater(state);
      return;
    }

    Object.assign(state, updater);
  };
  const hookResult = (() => {
    let current: ReturnType<typeof useMapPanelCanvasActions> | null = null;

    return {
      getCurrent: () => current,
      setCurrent: (value: ReturnType<typeof useMapPanelCanvasActions>) => {
        current = value;
      },
    };
  })();

  function HookHarness(params: Parameters<typeof useMapPanelCanvasActions>[0]) {
    hookResult.setCurrent(useMapPanelCanvasActions(params));
    return null;
  }

  renderToStaticMarkup(
    createElement(HookHarness, {
      activeImageLayer: null,
      activeLayer,
      activeMap,
      contextMenuTileRef: { current: null },
      hasContextMenuImageLayer: false,
      layerGroups: project.layerGroups,
      mapCanvasRef,
      paintBuffer,
      project,
      setPaintBufferVersion,
      setState,
      state,
      textObjectEditing: {
        editing: null,
        startEditing: () => {},
        updateText: () => {},
        commitEditing: () => {},
        cancelEditing: () => {},
      },
    }),
  );

  const actions = hookResult.getCurrent();

  assert.ok(actions);
  if (!actions) {
    return;
  }

  actions.handlePaintTile(1, 1);

  assert.deepEqual(paintBuffer.get("1,1"), createTileRef(0, 0));
  assert.deepEqual(drawnTiles, [{ x: 1, y: 1, ref: createTileRef(0, 0) }]);

  actions.handlePaintEnd();

  assert.strictEqual(paintBuffer.size, 0);
  assert.strictEqual(paintBufferVersion, 1);
  assert.deepEqual(activeLayer.tiles["1,1"], createTileRef(0, 0));
});

test("autotile strokes no-op when the selected rule is stale", () => {
  const activeLayer = {
    id: LAYER_ID,
    mapId: MAP_ID,
    name: "Ground",
    visible: true,
    locked: false,
    tiles: {},
  };
  const activeMap = {
    id: MAP_ID,
    name: "Map",
    groupId: MAP_GROUP_ID,
    orientation: "orthogonal",
    widthInTiles: 4,
    heightInTiles: 4,
    tileSize: 16,
    layerOrder: [LAYER_ID],
    createdAt: 0,
  };
  const project = {
    id: PROJECT_ID,
    name: "Project",
    createdAt: 0,
    updatedAt: 0,
    tileSize: 16,
    tilesetGroups: [{ id: TILESET_GROUP_ID, name: "Tilesets", order: 0 }],
    tilesets: [
      {
        id: TILESET_ID,
        name: "Terrain",
        groupId: TILESET_GROUP_ID,
        tileSize: 16,
        assetId: ASSET_ID,
        imageWidth: 64,
        imageHeight: 16,
        autotile: createAutotileConfig(),
        createdAt: 0,
      },
    ],
    mapGroups: [{ id: MAP_GROUP_ID, name: "Maps", order: 0 }],
    maps: [activeMap],
    layers: [activeLayer],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
  const state: EditorState = {
    ...DEFAULT_EDITOR_STATE,
    project,
    activeMapGroupId: MAP_GROUP_ID,
    activeMapId: MAP_ID,
    activeLayerId: LAYER_ID,
    activeTilesetGroupId: TILESET_GROUP_ID,
    activeTilesetId: TILESET_ID,
    currentTool: "autotile",
    tileSize: 16,
    selectedTile: null,
    selectedAutotileTerrain: {
      tilesetId: TILESET_ID,
      terrainId: "terrain-missing" as AutotileTerrainId,
    },
  };
  const paintBuffer = new Map<string, TileRef | null>();
  const drawnTiles = [] as { ref: TileRef; x: number; y: number }[];
  const mapCanvasRef = {
    current: {
      drawBufferTile: (x: number, y: number, ref: TileRef) => {
        drawnTiles.push({ x, y, ref });
      },
      eraseBufferTile: () => {},
      clearPaintCanvas: () => {},
    },
  };
  const setPaintBufferVersion = () => {};
  const setState = (updater: EditorState | ((draft: EditorState) => void)) => {
    if (typeof updater === "function") {
      updater(state);
      return;
    }

    Object.assign(state, updater);
  };
  const hookResult = (() => {
    let current: ReturnType<typeof useMapPanelCanvasActions> | null = null;

    return {
      getCurrent: () => current,
      setCurrent: (value: ReturnType<typeof useMapPanelCanvasActions>) => {
        current = value;
      },
    };
  })();

  function HookHarness(params: Parameters<typeof useMapPanelCanvasActions>[0]) {
    hookResult.setCurrent(useMapPanelCanvasActions(params));
    return null;
  }

  renderToStaticMarkup(
    createElement(HookHarness, {
      activeImageLayer: null,
      activeLayer,
      activeMap,
      contextMenuTileRef: { current: null },
      hasContextMenuImageLayer: false,
      layerGroups: project.layerGroups,
      mapCanvasRef,
      paintBuffer,
      project,
      setPaintBufferVersion,
      setState,
      state,
      textObjectEditing: {
        editing: null,
        startEditing: () => {},
        updateText: () => {},
        commitEditing: () => {},
        cancelEditing: () => {},
      },
    }),
  );

  const actions = hookResult.getCurrent();

  assert.ok(actions);
  if (!actions) {
    return;
  }

  actions.handlePaintTile(1, 1);

  assert.strictEqual(paintBuffer.size, 0);
  assert.deepEqual(drawnTiles, []);
  assert.deepEqual(activeLayer.tiles, {});
});
