import { beforeEach, expect, test, vi } from "vitest";
import {
  renderActiveLayerEntryToCanvas,
  renderLayerEntriesToCanvas,
} from "@/features/map-editor/components/MapCanvas/draw-layer-entries";
import {
  imageLayerImageCache,
  tilesetImageCache,
} from "@/features/map-editor/components/MapCanvas/texture-cache";
import type {
  AssetId,
  MapGroupId,
  MapId,
  TileRef,
  TilesetAnimationId,
  TilesetGroupId,
  TilesetId,
} from "@/types";

const TILESET_ID = "tileset-1" as TilesetId;
const TILESET_GROUP_ID = "tileset-group-1" as TilesetGroupId;
const MAP_GROUP_ID = "map-group-1" as MapGroupId;
const MAP_ID = "map-1" as MapId;
const ANIMATION_ID = "animation-1" as TilesetAnimationId;
const ASSET_ID = "asset-1" as AssetId;

function createTileRef(overrides: Partial<TileRef> = {}): TileRef {
  return {
    tilesetId: TILESET_ID,
    sx: 0,
    sy: 0,
    sw: 16,
    sh: 16,
    ...overrides,
  };
}

function createContext() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    globalAlpha: 1,
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  imageLayerImageCache.clear();
  tilesetImageCache.clear();
});

test("active-layer redraw keeps buffered paint and erase results visible across animation ticks", () => {
  const image = {} as HTMLImageElement;
  const context = createContext();
  const canvas = {
    width: 64,
    height: 16,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  const map = {
    id: MAP_ID,
    name: "Map",
    groupId: MAP_GROUP_ID,
    orientation: "orthogonal",
    widthInTiles: 4,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: ["layer-1"],
    createdAt: 0,
  };
  const tileset = {
    id: TILESET_ID,
    name: "Terrain",
    groupId: TILESET_GROUP_ID,
    tileSize: 16,
    assetId: ASSET_ID,
    imageWidth: 48,
    imageHeight: 16,
    animations: {
      version: 1,
      animations: [
        {
          id: ANIMATION_ID,
          name: "Water",
          widthInTiles: 1,
          heightInTiles: 1,
          frames: [
            {
              durationMs: 100,
              cells: [{ sx: 0, sy: 0, sw: 16, sh: 16 }],
            },
            {
              durationMs: 100,
              cells: [{ sx: 16, sy: 0, sw: 16, sh: 16 }],
            },
          ],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    },
    createdAt: 0,
  };
  const entry = {
    kind: "tile" as const,
    layer: {
      id: "layer-1",
      mapId: MAP_ID,
      name: "Ground",
      visible: true,
      locked: false,
      tiles: {
        "0,0": createTileRef({
          animationId: ANIMATION_ID,
          animationCellIndex: 0,
        }),
        "1,0": createTileRef({ sx: 16, sy: 0 }),
      },
    },
  };
  const paintBuffer = new Map<string, TileRef | null>([
    ["1,0", null],
    ["2,0", createTileRef({ sx: 32, sy: 0 })],
  ]);

  tilesetImageCache.set(TILESET_ID, image);

  renderActiveLayerEntryToCanvas({
    animationElapsedMs: 0,
    canvas,
    entry,
    getDisplayImageLayer: (layer) => layer,
    map,
    paintBuffer,
    scaleImageLayer: (layer) => layer,
    scaledTile: 16,
    tilesets: [tileset],
    zoom: 1,
  });

  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 64, 16);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
  expect(context.drawImage).toHaveBeenNthCalledWith(
    1,
    image,
    0,
    0,
    16,
    16,
    0,
    0,
    16,
    16,
  );
  expect(context.drawImage).toHaveBeenNthCalledWith(
    2,
    image,
    32,
    0,
    16,
    16,
    32,
    0,
    16,
    16,
  );

  vi.mocked(context.clearRect).mockClear();
  vi.mocked(context.drawImage).mockClear();

  renderActiveLayerEntryToCanvas({
    animationElapsedMs: 150,
    canvas,
    entry,
    getDisplayImageLayer: (layer) => layer,
    map,
    paintBuffer,
    scaleImageLayer: (layer) => layer,
    scaledTile: 16,
    tilesets: [tileset],
    zoom: 1,
  });

  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 64, 16);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
  expect(context.drawImage).toHaveBeenNthCalledWith(
    1,
    image,
    16,
    0,
    16,
    16,
    0,
    0,
    16,
    16,
  );
  expect(context.drawImage).toHaveBeenNthCalledWith(
    2,
    image,
    32,
    0,
    16,
    16,
    32,
    0,
    16,
    16,
  );
});

test("renderLayerEntriesToCanvas draws visible image and tile entries and restores alpha", () => {
  const tileImage = {} as HTMLImageElement;
  const backdropImage = {} as HTMLImageElement;
  const context = createContext();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  const map = {
    id: MAP_ID,
    name: "Map",
    groupId: MAP_GROUP_ID,
    orientation: "orthogonal",
    widthInTiles: 2,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: ["layer-1"],
    createdAt: 0,
  };
  const tileset = {
    id: TILESET_ID,
    name: "Terrain",
    groupId: TILESET_GROUP_ID,
    tileSize: 16,
    assetId: ASSET_ID,
    imageWidth: 32,
    imageHeight: 16,
    createdAt: 0,
  };

  imageLayerImageCache.set(ASSET_ID, backdropImage);
  tilesetImageCache.set(TILESET_ID, tileImage);

  renderLayerEntriesToCanvas({
    animationElapsedMs: 0,
    canvas,
    entries: [
      {
        kind: "image",
        layer: {
          id: "image-1",
          mapId: MAP_ID,
          name: "Backdrop",
          type: "image",
          visible: true,
          locked: false,
          assetId: ASSET_ID,
          x: 0,
          y: 0,
          width: 32,
          height: 16,
          opacity: 50,
        },
      },
      {
        kind: "tile",
        layer: {
          id: "layer-1",
          mapId: MAP_ID,
          name: "Ground",
          visible: true,
          locked: false,
          tiles: {
            "0,0": createTileRef(),
          },
        },
      },
      {
        kind: "tile",
        layer: {
          id: "layer-hidden",
          mapId: MAP_ID,
          name: "Hidden",
          visible: false,
          locked: false,
          tiles: {
            "1,0": createTileRef({ sx: 16, sy: 0 }),
          },
        },
      },
    ],
    getDisplayImageLayer: (layer) => layer,
    height: 16,
    map,
    scaleImageLayer: (layer) => layer,
    scaledTile: 16,
    tileAlpha: 0.4,
    tilesets: [tileset],
    width: 32,
    zoom: 1,
  });

  expect(canvas.width).toBe(32);
  expect(canvas.height).toBe(16);
  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 32, 16);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
  expect(context.globalAlpha).toBe(1);
});

test("render helpers no-op when the context, entry, or cached image is missing", () => {
  const noContextCanvas = {
    getContext: vi.fn(() => null),
  } as unknown as HTMLCanvasElement;
  const context = createContext();
  const canvas = {
    width: 64,
    height: 16,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;

  expect(() =>
    renderLayerEntriesToCanvas({
      animationElapsedMs: 0,
      canvas: noContextCanvas,
      entries: [],
      getDisplayImageLayer: (layer) => layer,
      height: 16,
      map: {
        id: MAP_ID,
        name: "Map",
        groupId: MAP_GROUP_ID,
        orientation: "orthogonal",
        widthInTiles: 1,
        heightInTiles: 1,
        tileSize: 16,
        layerOrder: [],
        createdAt: 0,
      },
      scaleImageLayer: (layer) => layer,
      scaledTile: 16,
      tileAlpha: 1,
      tilesets: [],
      width: 16,
      zoom: 1,
    }),
  ).not.toThrow();

  renderActiveLayerEntryToCanvas({
    animationElapsedMs: 0,
    canvas,
    entry: {
      kind: "image",
      layer: {
        id: "image-1",
        mapId: MAP_ID,
        name: "Backdrop",
        type: "image",
        visible: true,
        locked: false,
        assetId: ASSET_ID,
        x: 0,
        y: 0,
        width: 32,
        height: 16,
        opacity: 100,
      },
    },
    getDisplayImageLayer: (layer) => layer,
    map: {
      id: MAP_ID,
      name: "Map",
      groupId: MAP_GROUP_ID,
      orientation: "orthogonal",
      widthInTiles: 1,
      heightInTiles: 1,
      tileSize: 16,
      layerOrder: [],
      createdAt: 0,
    },
    paintBuffer: new Map(),
    scaleImageLayer: (layer) => layer,
    scaledTile: 16,
    tilesets: [],
    zoom: 1,
  });

  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 64, 16);
  expect(context.drawImage).not.toHaveBeenCalled();
});
