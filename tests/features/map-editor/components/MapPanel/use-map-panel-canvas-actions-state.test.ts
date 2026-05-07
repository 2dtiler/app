import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { useMapPanelCanvasActions } from "@/features/map-editor/components/MapPanel/use-map-panel-canvas-actions";
import {
  DEFAULT_EDITOR_STATE,
  type AssetId,
  type EditorState,
  type LayerId,
  type MapGroupId,
  type MapId,
  type ObjectId,
  type ProjectId,
  type TileRef,
  type TilesetGroupId,
  type TilesetId,
} from "@/types";

const editorContextMocks = vi.hoisted(() => ({
  setImageLayerEditorContext: vi.fn(),
  setTileEditorContext: vi.fn(),
}));

vi.mock("@/features/image-editor/lib/image-layer-editor-context", () => ({
  setImageLayerEditorContext: editorContextMocks.setImageLayerEditorContext,
}));

vi.mock("@/features/map-editor/lib/tile-editor-context", () => ({
  setTileEditorContext: editorContextMocks.setTileEditorContext,
}));

const PROJECT_ID = "project-1" as ProjectId;
const TILESET_GROUP_ID = "tileset-group-1" as TilesetGroupId;
const TILESET_ID = "tileset-1" as TilesetId;
const MAP_GROUP_ID = "map-group-1" as MapGroupId;
const MAP_ID = "map-1" as MapId;
const TILE_LAYER_ID = "layer-1" as LayerId;
const OBJECT_LAYER_ID = "object-layer-1" as LayerId;
const IMAGE_LAYER_ID = "image-layer-1" as LayerId;
const ASSET_ID = "asset-1" as AssetId;
const OBJECT_ID = "object-1" as ObjectId;

const originalCustomEvent = globalThis.CustomEvent;
const originalWindow = globalThis.window;

function createTileRef(sx: number, sy: number): TileRef {
  return {
    tilesetId: TILESET_ID,
    sx,
    sy,
    sw: 16,
    sh: 16,
  };
}

function createProject() {
  const activeMap = {
    id: MAP_ID,
    name: "Map",
    groupId: MAP_GROUP_ID,
    orientation: "orthogonal" as const,
    widthInTiles: 8,
    heightInTiles: 8,
    tileSize: 16,
    layerOrder: [TILE_LAYER_ID],
    createdAt: 0,
  };
  const tileLayer = {
    id: TILE_LAYER_ID,
    mapId: MAP_ID,
    name: "Ground",
    visible: true,
    locked: false,
    tiles: {
      "0,0": createTileRef(0, 0),
      "1,0": createTileRef(16, 0),
      "1,2": createTileRef(32, 0),
    },
  };
  const imageLayer = {
    id: IMAGE_LAYER_ID,
    mapId: MAP_ID,
    name: "Backdrop",
    type: "image" as const,
    visible: true,
    locked: false,
    assetId: ASSET_ID,
    x: 4,
    y: 8,
    width: 32,
    height: 48,
    opacity: 100,
  };
  const objectLayer = {
    id: OBJECT_LAYER_ID,
    mapId: MAP_ID,
    name: "Objects",
    type: "object" as const,
    visible: true,
    locked: false,
    objectOrder: [] as ObjectId[],
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
        createdAt: 0,
      },
    ],
    mapGroups: [{ id: MAP_GROUP_ID, name: "Maps", order: 0 }],
    maps: [activeMap],
    layers: [tileLayer],
    imageLayers: [imageLayer],
    layerGroups: [],
    terrains: [],
    objectLayers: [objectLayer],
    objects: [] as {
      id: ObjectId;
      layerId: LayerId;
      name: string;
      type: "rectangle" | "point" | "ellipse" | "polygon" | "text";
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      points: { x: number; y: number }[];
      visible: boolean;
      locked: boolean;
      properties: Record<string, { value: string; type: string }>;
    }[],
    overrideTilesets: [],
  };

  return {
    activeMap,
    imageLayer,
    objectLayer,
    project,
    tileLayer,
  };
}

function installWindow() {
  const dispatchEvent = vi.fn();
  Object.assign(globalThis, {
    CustomEvent: class {
      type: string;

      constructor(type: string) {
        this.type = type;
      }
    },
    window: {
      dispatchEvent,
    },
  });

  return dispatchEvent;
}

function renderActions(overrides = {}) {
  const overrideParams = overrides as Partial<
    Parameters<typeof useMapPanelCanvasActions>[0]
  >;
  const { activeMap, imageLayer, objectLayer, project, tileLayer } =
    createProject();
  const state: EditorState = {
    ...DEFAULT_EDITOR_STATE,
    project,
    activeMapGroupId: MAP_GROUP_ID,
    activeMapId: MAP_ID,
    activeLayerId: TILE_LAYER_ID,
    activeTilesetGroupId: TILESET_GROUP_ID,
    activeTilesetId: TILESET_ID,
    tileSize: 16,
  };
  const effectiveProject = overrideParams.project ?? project;
  const effectiveState = overrideParams.state ?? state;
  const effectiveActiveMap = overrideParams.activeMap ?? activeMap;
  const effectiveActiveLayer = overrideParams.activeLayer ?? tileLayer;
  const effectiveActiveImageLayer = overrideParams.activeImageLayer ?? null;
  const effectiveContextMenuTileRef = overrideParams.contextMenuTileRef ?? {
    current: null as { x: number; y: number } | null,
  };
  const effectiveHasContextMenuImageLayer =
    overrideParams.hasContextMenuImageLayer ?? false;
  const paintBuffer = new Map<string, TileRef | null>();
  let paintBufferVersion = 0;
  const textObjectEditing = {
    editing: null,
    startEditing: vi.fn(),
    updateText: vi.fn(),
    commitEditing: vi.fn(),
    cancelEditing: vi.fn(),
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

  const params = {
    activeImageLayer: effectiveActiveImageLayer,
    activeLayer: effectiveActiveLayer,
    activeMap: effectiveActiveMap,
    contextMenuTileRef: effectiveContextMenuTileRef,
    hasContextMenuImageLayer: effectiveHasContextMenuImageLayer,
    layerGroups: effectiveProject.layerGroups,
    mapCanvasRef: {
      current: {
        drawBufferTile: () => {},
        eraseBufferTile: () => {},
        clearPaintCanvas: () => {},
      },
    },
    paintBuffer,
    project: effectiveProject,
    setPaintBufferVersion: (
      value: number | ((currentValue: number) => number),
    ) => {
      paintBufferVersion =
        typeof value === "function" ? value(paintBufferVersion) : value;
    },
    setState: (updater: EditorState | ((draft: EditorState) => void)) => {
      if (typeof updater === "function") {
        updater(effectiveState);
        return;
      }

      Object.assign(effectiveState, updater);
    },
    state: effectiveState,
    textObjectEditing,
    ...overrides,
  } as Parameters<typeof useMapPanelCanvasActions>[0];

  function HookHarness(
    hookParams: Parameters<typeof useMapPanelCanvasActions>[0],
  ) {
    hookResult.setCurrent(useMapPanelCanvasActions(hookParams));
    return null;
  }

  renderToStaticMarkup(createElement(HookHarness, params));

  const actions = hookResult.getCurrent();
  if (!actions) {
    throw new Error("Hook did not render.");
  }

  return {
    actions,
    activeMap: effectiveActiveMap,
    imageLayer: effectiveProject.imageLayers[0] ?? imageLayer,
    objectLayer: effectiveProject.objectLayers[0] ?? objectLayer,
    paintBuffer,
    paintBufferVersion: () => paintBufferVersion,
    params,
    project: effectiveProject,
    state: effectiveState,
    textObjectEditing,
    tileLayer: effectiveProject.layers[0] ?? tileLayer,
  };
}

afterEach(() => {
  vi.clearAllMocks();

  if (originalCustomEvent) {
    globalThis.CustomEvent = originalCustomEvent;
  } else {
    Reflect.deleteProperty(globalThis, "CustomEvent");
  }

  if (originalWindow) {
    globalThis.window = originalWindow;
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("map panel canvas actions update selection, tile moves, and image layer transforms", () => {
  const { actions, imageLayer, state, tileLayer } = renderActions();

  actions.handleSelectionChange({ x: 0, y: 0, width: 2, height: 1 });
  expect(state.mapSelection).toEqual({ x: 0, y: 0, width: 2, height: 1 });

  actions.handleMoveTiles({ x: 0, y: 0, width: 2, height: 1 }, 3, 4);

  expect(tileLayer.tiles["0,0"]).toBeUndefined();
  expect(tileLayer.tiles["1,0"]).toBeUndefined();
  expect(tileLayer.tiles["3,4"]).toEqual(createTileRef(0, 0));
  expect(tileLayer.tiles["4,4"]).toEqual(createTileRef(16, 0));

  actions.handleMoveImageLayer(IMAGE_LAYER_ID, 12, 18);
  expect(imageLayer.x).toBe(12);
  expect(imageLayer.y).toBe(18);

  actions.handleResizeImageLayer(IMAGE_LAYER_ID, 20, 24, 96, 128);
  expect(imageLayer).toMatchObject({
    x: 20,
    y: 24,
    width: 96,
    height: 128,
  });
});

test("map panel canvas actions create and mutate text objects", () => {
  const base = createProject();
  const { actions, objectLayer, project, state, textObjectEditing } =
    renderActions({
      activeLayer: null,
      project: base.project,
      state: {
        ...DEFAULT_EDITOR_STATE,
        project: base.project,
        activeMapGroupId: MAP_GROUP_ID,
        activeMapId: MAP_ID,
        activeLayerId: OBJECT_LAYER_ID,
        activeTilesetGroupId: TILESET_GROUP_ID,
        activeTilesetId: TILESET_ID,
        pendingObjectType: "text",
        tileSize: 16,
      },
    });

  actions.handleCreateObject("text", 5, 6, 0, 0, []);

  expect(project.objects).toHaveLength(1);
  const createdObject = project.objects[0];
  expect(createdObject).toMatchObject({
    layerId: OBJECT_LAYER_ID,
    name: "Text 1",
    type: "text",
    x: 5,
    y: 6,
    width: 96,
    height: 32,
  });
  expect(objectLayer.objectOrder).toEqual([createdObject?.id]);
  expect(state.activeObjectId).toBe(createdObject?.id);
  expect(state.pendingObjectType).toBeNull();
  expect(textObjectEditing.startEditing).toHaveBeenCalledWith(
    createdObject?.id,
    "",
  );

  actions.handleMoveObject(createdObject?.id ?? OBJECT_ID, 9, 10);
  actions.handleResizeObject(createdObject?.id ?? OBJECT_ID, 12, 14, 0, 0);
  actions.handleUpdatePolygonPoints(createdObject?.id ?? OBJECT_ID, [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);
  actions.handleCancelPendingObject();

  expect(createdObject).toMatchObject({
    x: 12,
    y: 14,
    width: 96,
    height: 32,
    points: [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ],
  });
  expect(state.pendingObjectType).toBeNull();
});

test("map panel canvas actions open tile selections in the image editor", () => {
  const dispatchEvent = installWindow();
  const { actions } = renderActions({
    contextMenuTileRef: { current: { x: 1, y: 2 } },
  });

  actions.handleEditInImageEditor();

  expect(editorContextMocks.setTileEditorContext).toHaveBeenCalledWith({
    tilesetId: TILESET_ID,
    assetId: ASSET_ID,
    sx: 32,
    sy: 0,
    sw: 16,
    sh: 16,
    layerId: TILE_LAYER_ID,
    tileX: 1,
    tileY: 2,
  });
  expect(editorContextMocks.setImageLayerEditorContext).not.toHaveBeenCalled();
  expect(dispatchEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "open-image-editor" }),
  );
});

test("map panel canvas actions open unlocked image layers in the image editor", () => {
  const dispatchEvent = installWindow();
  const base = createProject();
  const { actions } = renderActions({
    activeImageLayer: base.imageLayer,
    hasContextMenuImageLayer: true,
    project: base.project,
    state: {
      ...DEFAULT_EDITOR_STATE,
      project: base.project,
      activeMapGroupId: MAP_GROUP_ID,
      activeMapId: MAP_ID,
      activeLayerId: TILE_LAYER_ID,
      activeTilesetGroupId: TILESET_GROUP_ID,
      activeTilesetId: TILESET_ID,
      tileSize: 16,
    },
  });

  actions.handleEditInImageEditor();

  expect(editorContextMocks.setImageLayerEditorContext).toHaveBeenCalledWith({
    layerId: IMAGE_LAYER_ID,
    assetId: ASSET_ID,
    width: 32,
    height: 48,
  });
  expect(editorContextMocks.setTileEditorContext).not.toHaveBeenCalled();
  expect(dispatchEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: "open-image-editor" }),
  );
});

test("map panel canvas actions paint the selected tile across the brush area", () => {
  const base = createProject();
  base.activeMap.widthInTiles = 4;
  base.activeMap.heightInTiles = 4;
  base.tileLayer.tiles = {};
  base.project.layers = [base.tileLayer];
  base.project.maps = [base.activeMap];
  const { actions, paintBuffer, project } = renderActions({
    activeLayer: base.tileLayer,
    activeMap: base.activeMap,
    project: base.project,
    state: {
      ...DEFAULT_EDITOR_STATE,
      project: base.project,
      activeMapGroupId: MAP_GROUP_ID,
      activeMapId: MAP_ID,
      activeLayerId: TILE_LAYER_ID,
      activeTilesetGroupId: TILESET_GROUP_ID,
      activeTilesetId: TILESET_ID,
      currentTool: "paint",
      brushSize: "2",
      selectedTile: createTileRef(48, 0),
      tileSize: 16,
    },
  });

  actions.handlePaintTile(1, 1);

  expect([...paintBuffer.keys()].sort()).toEqual(["1,1", "1,2", "2,1", "2,2"]);

  actions.handlePaintEnd();

  expect(project.layers[0]?.tiles["1,1"]).toEqual(createTileRef(48, 0));
  expect(project.layers[0]?.tiles["2,2"]).toEqual(createTileRef(48, 0));
});

test("map panel canvas actions paint terrain selections across the brush area", () => {
  const base = createProject();
  base.activeMap.widthInTiles = 4;
  base.activeMap.heightInTiles = 4;
  base.tileLayer.tiles = {};
  base.project.layers = [base.tileLayer];
  base.project.maps = [base.activeMap];
  const terrainTile = createTileRef(16, 16);
  const { actions, paintBuffer, project } = renderActions({
    activeLayer: base.tileLayer,
    activeMap: base.activeMap,
    project: base.project,
    state: {
      ...DEFAULT_EDITOR_STATE,
      project: base.project,
      activeMapGroupId: MAP_GROUP_ID,
      activeMapId: MAP_ID,
      activeLayerId: TILE_LAYER_ID,
      activeTilesetGroupId: TILESET_GROUP_ID,
      activeTilesetId: TILESET_ID,
      currentTool: "paint",
      paintMode: "paintTerrain",
      brushSize: "2x2",
      activePaintTerrain: [{ tileRef: terrainTile, probability: 100 }],
      selectedTile: null,
      tileSize: 16,
    },
  });

  actions.handlePaintTile(1, 1);

  expect([...paintBuffer.keys()].sort()).toEqual(["1,1", "1,2", "2,1", "2,2"]);

  actions.handlePaintEnd();

  expect(project.layers[0]?.tiles).toMatchObject({
    "1,1": terrainTile,
    "1,2": terrainTile,
    "2,1": terrainTile,
    "2,2": terrainTile,
  });
});

test("map panel canvas actions flood-fill contiguous tiles from the selected stamp", () => {
  const base = createProject();
  base.activeMap.widthInTiles = 2;
  base.activeMap.heightInTiles = 2;
  base.tileLayer.tiles = {
    "0,0": createTileRef(0, 0),
    "1,0": createTileRef(0, 0),
    "0,1": createTileRef(0, 0),
    "1,1": createTileRef(16, 0),
  };
  base.project.layers = [base.tileLayer];
  base.project.maps = [base.activeMap];
  const { actions, project } = renderActions({
    activeLayer: base.tileLayer,
    activeMap: base.activeMap,
    project: base.project,
    state: {
      ...DEFAULT_EDITOR_STATE,
      project: base.project,
      activeMapGroupId: MAP_GROUP_ID,
      activeMapId: MAP_ID,
      activeLayerId: TILE_LAYER_ID,
      activeTilesetGroupId: TILESET_GROUP_ID,
      activeTilesetId: TILESET_ID,
      currentTool: "fill",
      fillMode: "fill",
      selectedTile: createTileRef(32, 0),
      tileSize: 16,
    },
  });

  actions.handlePaintTile(0, 0);

  expect(project.layers[0]?.tiles["0,0"]).toEqual(createTileRef(32, 0));
  expect(project.layers[0]?.tiles["1,0"]).toEqual(createTileRef(32, 0));
  expect(project.layers[0]?.tiles["0,1"]).toEqual(createTileRef(32, 0));
  expect(project.layers[0]?.tiles["1,1"]).toEqual(createTileRef(16, 0));
});

test("map panel canvas actions flood-fill terrain selections with weighted tiles", () => {
  const base = createProject();
  base.activeMap.widthInTiles = 2;
  base.activeMap.heightInTiles = 2;
  base.tileLayer.tiles = {};
  base.project.layers = [base.tileLayer];
  base.project.maps = [base.activeMap];
  const terrainTile = createTileRef(16, 16);
  const { actions, project } = renderActions({
    activeLayer: base.tileLayer,
    activeMap: base.activeMap,
    project: base.project,
    state: {
      ...DEFAULT_EDITOR_STATE,
      project: base.project,
      activeMapGroupId: MAP_GROUP_ID,
      activeMapId: MAP_ID,
      activeLayerId: TILE_LAYER_ID,
      activeTilesetGroupId: TILESET_GROUP_ID,
      activeTilesetId: TILESET_ID,
      currentTool: "fill",
      fillMode: "fillTerrain",
      activeFillTerrain: [{ tileRef: terrainTile, probability: 100 }],
      selectedTile: null,
      tileSize: 16,
    },
  });

  actions.handlePaintTile(0, 0);

  expect(project.layers[0]?.tiles).toMatchObject({
    "0,0": terrainTile,
    "0,1": terrainTile,
    "1,0": terrainTile,
    "1,1": terrainTile,
  });
});

test("map panel canvas actions do not paint when placement is blocked by a locked layer", () => {
  const base = createProject();
  base.tileLayer.locked = true;
  const { actions, paintBuffer, project } = renderActions({
    activeLayer: base.tileLayer,
    activeMap: base.activeMap,
    project: base.project,
    state: {
      ...DEFAULT_EDITOR_STATE,
      project: base.project,
      activeMapGroupId: MAP_GROUP_ID,
      activeMapId: MAP_ID,
      activeLayerId: TILE_LAYER_ID,
      activeTilesetGroupId: TILESET_GROUP_ID,
      activeTilesetId: TILESET_ID,
      currentTool: "paint",
      selectedTile: createTileRef(48, 0),
      tileSize: 16,
    },
  });

  actions.handlePaintTile(0, 0);

  expect(paintBuffer.size).toBe(0);
  expect(project.layers[0]?.tiles["0,0"]).toEqual(createTileRef(0, 0));
});
