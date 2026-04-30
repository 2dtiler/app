import { afterEach, assert, test, vi } from "vitest";
import {
  getFillRegion,
  pickWeightedTile,
} from "@/features/map-editor/lib/terrain";
import type {
  LayerId,
  MapGroupId,
  MapId,
  TerrainTile,
  TileLayer,
  TileMapData,
  TileRef,
  TilesetId,
} from "@/types";

const TILESET_ID = "tileset-1" as TilesetId;

function asMapId(value: string) {
  return value as MapId;
}

function asMapGroupId(value: string) {
  return value as MapGroupId;
}

function asLayerId(value: string) {
  return value as LayerId;
}

function createMap(overrides: Partial<TileMapData> = {}): TileMapData {
  return {
    id: asMapId("map-1"),
    name: "Map",
    groupId: asMapGroupId("group-1"),
    orientation: "orthogonal",
    widthInTiles: 3,
    heightInTiles: 2,
    tileSize: 16,
    layerOrder: [],
    createdAt: 0,
    ...overrides,
  };
}

function createTileRef(sx: number, sy: number): TileRef {
  return {
    tilesetId: TILESET_ID,
    sx,
    sy,
    sw: 16,
    sh: 16,
  };
}

function createTileLayer(tiles: Record<string, TileRef>): TileLayer {
  return {
    id: asLayerId("layer-1"),
    mapId: asMapId("map-1"),
    name: "Ground",
    visible: true,
    locked: false,
    tiles,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("finds connected tiles that match the starting tile source", () => {
  const map = createMap();
  const grassTile = createTileRef(0, 0);
  const waterTile = createTileRef(16, 0);
  const layer = createTileLayer({
    "0,0": grassTile,
    "1,0": { ...grassTile, rotation: 90, flipX: true },
    "2,0": waterTile,
    "0,1": grassTile,
  });

  assert.deepEqual(
    getFillRegion({
      map,
      layer,
      mapWidth: 3,
      mapHeight: 2,
      startX: 0,
      startY: 0,
      fillMode: "fill",
      selectedTile: grassTile,
      activeFillTerrain: null,
    }),
    [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  );
});

test("guards invalid fill requests", () => {
  const map = createMap();
  const grassTile = createTileRef(0, 0);
  const layer = createTileLayer({ "0,0": grassTile });

  assert.deepEqual(
    getFillRegion({
      map,
      layer,
      mapWidth: 3,
      mapHeight: 2,
      startX: -1,
      startY: 0,
      fillMode: "fill",
      selectedTile: grassTile,
      activeFillTerrain: null,
    }),
    [],
  );
  assert.deepEqual(
    getFillRegion({
      map,
      layer,
      mapWidth: 3,
      mapHeight: 2,
      startX: 0,
      startY: 0,
      fillMode: "fill",
      selectedTile: null,
      activeFillTerrain: null,
    }),
    [],
  );
  assert.deepEqual(
    getFillRegion({
      map,
      layer,
      mapWidth: 3,
      mapHeight: 2,
      startX: 0,
      startY: 0,
      fillMode: "fillTerrain",
      selectedTile: null,
      activeFillTerrain: [],
    }),
    [],
  );
});

test("allows terrain fills when active terrain tiles are present", () => {
  const grassTile = createTileRef(0, 0);
  const terrainTile: TerrainTile = {
    tileRef: grassTile,
    probability: 100,
  };

  assert.deepEqual(
    getFillRegion({
      map: createMap(),
      layer: createTileLayer({ "1,1": grassTile }),
      mapWidth: 3,
      mapHeight: 2,
      startX: 1,
      startY: 1,
      fillMode: "fillTerrain",
      selectedTile: null,
      activeFillTerrain: [terrainTile],
    }),
    [[1, 1]],
  );
});

test("selects weighted terrain tiles deterministically under mocked random", () => {
  const firstTile = createTileRef(0, 0);
  const secondTile = createTileRef(16, 0);

  vi.spyOn(Math, "random").mockReturnValue(0.2);
  assert.deepEqual(
    pickWeightedTile([
      { tileRef: firstTile, probability: 3 },
      { tileRef: secondTile, probability: 7 },
    ]),
    firstTile,
  );

  vi.spyOn(Math, "random").mockReturnValue(0.95);
  assert.deepEqual(
    pickWeightedTile([
      { tileRef: firstTile, probability: 3 },
      { tileRef: secondTile, probability: 7 },
    ]),
    secondTile,
  );

  vi.spyOn(Math, "random").mockReturnValue(1);
  assert.deepEqual(
    pickWeightedTile([
      { tileRef: firstTile, probability: 3 },
      { tileRef: secondTile, probability: 7 },
    ]),
    secondTile,
  );

  assert.equal(pickWeightedTile([]), null);
  assert.equal(
    pickWeightedTile([{ tileRef: firstTile, probability: 0 }]),
    null,
  );
});
