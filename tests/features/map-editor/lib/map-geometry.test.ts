import { assert, test } from "vitest";
import {
  getAdjacentMapCells,
  getGeometryForNewMapType,
  getMapCellAtPoint,
  getMapCellBounds,
  getMapCellOrigin,
  getMapCellPolygon,
  getMapPixelSize,
  isHexagonalMap,
  isIsometricMap,
  isOffsetMap,
  isStaggeredIndex,
  isStaggeredMap,
} from "@/features/map-editor/lib/map-geometry";
import type { MapGroupId, MapId, TileMapData } from "@/types";

function asMapId(value: string) {
  return value as MapId;
}

function asMapGroupId(value: string) {
  return value as MapGroupId;
}

function createMap(overrides: Partial<TileMapData> = {}): TileMapData {
  return {
    id: asMapId("map-1"),
    name: "Map",
    groupId: asMapGroupId("group-1"),
    orientation: "orthogonal",
    widthInTiles: 4,
    heightInTiles: 3,
    tileSize: 16,
    layerOrder: [],
    createdAt: 0,
    ...overrides,
  };
}

function getCellCenter(map: TileMapData, cellX: number, cellY: number) {
  const bounds = getMapCellBounds(map, 1, cellX, cellY);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

test("maps new-map type choices to geometry metadata", () => {
  assert.deepEqual(getGeometryForNewMapType("orthogonal"), {
    orientation: "orthogonal",
  });
  assert.deepEqual(getGeometryForNewMapType("hexagonal-row"), {
    orientation: "hexagonal",
    staggerAxis: "y",
    staggerIndex: "odd",
  });
  assert.deepEqual(getGeometryForNewMapType("hexagonal-column"), {
    orientation: "hexagonal",
    staggerAxis: "x",
    staggerIndex: "odd",
  });
  assert.deepEqual(getGeometryForNewMapType("isometric"), {
    orientation: "isometric",
  });
  assert.deepEqual(getGeometryForNewMapType("isometric-staggered"), {
    orientation: "staggered",
    staggerAxis: "x",
    staggerIndex: "odd",
  });
});

test("classifies map geometry variants", () => {
  const orthogonalMap = createMap();
  const isometricMap = createMap({ orientation: "isometric" });
  const hexagonalMap = createMap({
    orientation: "hexagonal",
    staggerAxis: "y",
    staggerIndex: "odd",
  });
  const staggeredMap = createMap({
    orientation: "staggered",
    staggerAxis: "x",
    staggerIndex: "even",
  });

  assert.equal(isIsometricMap(isometricMap), true);
  assert.equal(isIsometricMap(orthogonalMap), false);
  assert.equal(isHexagonalMap(hexagonalMap), true);
  assert.equal(isHexagonalMap(staggeredMap), false);
  assert.equal(isStaggeredMap(staggeredMap), true);
  assert.equal(isStaggeredMap(hexagonalMap), false);
  assert.equal(isOffsetMap(orthogonalMap), false);
  assert.equal(isOffsetMap(isometricMap), true);
  assert.equal(isOffsetMap(hexagonalMap), true);
  assert.equal(isOffsetMap(staggeredMap), true);
  assert.equal(isStaggeredIndex(0, { staggerIndex: "even" }), true);
  assert.equal(isStaggeredIndex(1, { staggerIndex: "even" }), false);
  assert.equal(isStaggeredIndex(-1, { staggerIndex: "odd" }), true);
});

test("calculates origins, bounds, polygons, and pixel sizes", () => {
  const orthogonalMap = createMap();
  const isometricMap = createMap({ orientation: "isometric" });
  const staggeredRowsMap = createMap({
    orientation: "staggered",
    staggerAxis: "y",
    staggerIndex: "odd",
  });
  const staggeredColumnsMap = createMap({
    orientation: "staggered",
    staggerAxis: "x",
    staggerIndex: "even",
  });
  const hexagonalRowsMap = createMap({
    orientation: "hexagonal",
    staggerAxis: "y",
    staggerIndex: "odd",
  });
  const hexagonalColumnsMap = createMap({
    orientation: "hexagonal",
    staggerAxis: "x",
    staggerIndex: "even",
  });

  assert.deepEqual(getMapCellOrigin(orthogonalMap, 2, 1, 2), {
    x: 32,
    y: 64,
  });
  assert.deepEqual(getMapCellBounds(orthogonalMap, 2, 1, 2), {
    x: 32,
    y: 64,
    width: 32,
    height: 32,
  });
  assert.deepEqual(getMapCellPolygon(orthogonalMap, 2, 1, 2), [
    { x: 32, y: 64 },
    { x: 64, y: 64 },
    { x: 64, y: 96 },
    { x: 32, y: 96 },
  ]);
  assert.deepEqual(getMapPixelSize(orthogonalMap, 1), {
    width: 64,
    height: 48,
  });
  assert.deepEqual(getMapPixelSize(orthogonalMap, 1, 0, 3), {
    width: 0,
    height: 0,
  });

  assert.deepEqual(getMapCellOrigin(isometricMap, 1, 1, 2), {
    x: 8,
    y: 24,
  });
  assert.deepEqual(getMapCellPolygon(isometricMap, 1, 1, 2), [
    { x: 16, y: 24 },
    { x: 24, y: 32 },
    { x: 16, y: 40 },
    { x: 8, y: 32 },
  ]);
  assert.deepEqual(getMapPixelSize(isometricMap, 1), {
    width: 56,
    height: 56,
  });

  assert.deepEqual(getMapCellOrigin(staggeredRowsMap, 1, 1, 1), {
    x: 24,
    y: 8,
  });
  assert.deepEqual(getMapCellPolygon(staggeredRowsMap, 1, 1, 1), [
    { x: 32, y: 8 },
    { x: 40, y: 16 },
    { x: 32, y: 24 },
    { x: 24, y: 16 },
  ]);
  assert.deepEqual(getMapPixelSize(staggeredRowsMap, 1), {
    width: 72,
    height: 32,
  });

  assert.deepEqual(getMapCellOrigin(staggeredColumnsMap, 1, 1, 1), {
    x: 8,
    y: 16,
  });
  assert.deepEqual(getMapPixelSize(staggeredColumnsMap, 1), {
    width: 40,
    height: 56,
  });

  assert.deepEqual(getMapCellOrigin(hexagonalRowsMap, 1, 1, 1), {
    x: 24,
    y: 12,
  });
  assert.deepEqual(getMapCellPolygon(hexagonalRowsMap, 1, 1, 1), [
    { x: 32, y: 12 },
    { x: 40, y: 16 },
    { x: 40, y: 24 },
    { x: 32, y: 28 },
    { x: 24, y: 24 },
    { x: 24, y: 16 },
  ]);
  assert.deepEqual(getMapPixelSize(hexagonalRowsMap, 1), {
    width: 72,
    height: 40,
  });

  assert.deepEqual(getMapCellOrigin(hexagonalColumnsMap, 1, 1, 1), {
    x: 12,
    y: 16,
  });
  assert.deepEqual(getMapCellPolygon(hexagonalColumnsMap, 1, 1, 1), [
    { x: 16, y: 16 },
    { x: 24, y: 16 },
    { x: 28, y: 24 },
    { x: 24, y: 32 },
    { x: 16, y: 32 },
    { x: 12, y: 24 },
  ]);
  assert.deepEqual(getMapPixelSize(hexagonalColumnsMap, 1), {
    width: 52,
    height: 56,
  });
});

test("resolves points to map cells across geometry variants", () => {
  const geometryCases = [
    createMap(),
    createMap({ orientation: "isometric" }),
    createMap({
      orientation: "staggered",
      staggerAxis: "y",
      staggerIndex: "odd",
    }),
    createMap({
      orientation: "staggered",
      staggerAxis: "x",
      staggerIndex: "odd",
    }),
    createMap({
      orientation: "hexagonal",
      staggerAxis: "y",
      staggerIndex: "odd",
    }),
    createMap({
      orientation: "hexagonal",
      staggerAxis: "x",
      staggerIndex: "odd",
    }),
  ];

  for (const geometryMap of geometryCases) {
    assert.deepEqual(
      getMapCellAtPoint(geometryMap, 1, getCellCenter(geometryMap, 1, 1)),
      { x: 1, y: 1 },
    );
    assert.equal(getMapCellAtPoint(geometryMap, 1, { x: -24, y: -24 }), null);
  }

  assert.equal(getMapCellAtPoint(createMap(), 1, { x: 99, y: 0 }), null);
});

test("filters adjacent cells for every geometry branch", () => {
  assert.deepEqual(getAdjacentMapCells(createMap(), 1, 1), [
    { x: 2, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 2 },
    { x: 1, y: 0 },
  ]);
  assert.deepEqual(getAdjacentMapCells(createMap(), 0, 0), [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ]);

  const staggeredRowsMap = createMap({
    orientation: "staggered",
    staggerAxis: "y",
    staggerIndex: "odd",
    heightInTiles: 4,
  });
  assert.deepEqual(getAdjacentMapCells(staggeredRowsMap, 1, 1), [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ]);
  assert.deepEqual(getAdjacentMapCells(staggeredRowsMap, 1, 2), [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: 3 },
    { x: 1, y: 3 },
  ]);

  const staggeredColumnsMap = createMap({
    orientation: "staggered",
    staggerAxis: "x",
    staggerIndex: "odd",
    heightInTiles: 4,
  });
  assert.deepEqual(getAdjacentMapCells(staggeredColumnsMap, 1, 1), [
    { x: 0, y: 1 },
    { x: 0, y: 2 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ]);
  assert.deepEqual(getAdjacentMapCells(staggeredColumnsMap, 2, 1), [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 3, y: 0 },
    { x: 3, y: 1 },
  ]);

  const hexagonalRowsMap = createMap({
    orientation: "hexagonal",
    staggerAxis: "y",
    staggerIndex: "odd",
    heightInTiles: 4,
  });
  assert.deepEqual(getAdjacentMapCells(hexagonalRowsMap, 1, 1), [
    { x: 0, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ]);
  assert.deepEqual(getAdjacentMapCells(hexagonalRowsMap, 1, 2), [
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: 3 },
    { x: 1, y: 3 },
  ]);

  const hexagonalColumnsMap = createMap({
    orientation: "hexagonal",
    staggerAxis: "x",
    staggerIndex: "odd",
    heightInTiles: 4,
  });
  assert.deepEqual(getAdjacentMapCells(hexagonalColumnsMap, 1, 1), [
    { x: 1, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 2 },
    { x: 0, y: 1 },
  ]);
  assert.deepEqual(getAdjacentMapCells(hexagonalColumnsMap, 2, 1), [
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 1 },
    { x: 2, y: 2 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
  ]);
});
