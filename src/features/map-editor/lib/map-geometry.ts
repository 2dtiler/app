import {
  DEFAULT_HEX_STAGGER_AXIS,
  DEFAULT_HEX_STAGGER_INDEX,
  type MapCell,
  type MapPixelSize,
  type MapPoint,
  type MapRect,
  type NewMapType,
  type TileMapData,
  type TileMapGeometry,
} from "@/types";

const HEX_STEP_RATIO = 0.75;
const HALF_TILE_RATIO = 0.5;

type TileMapGeometryLike = Pick<
  TileMapData,
  | "orientation"
  | "staggerAxis"
  | "staggerIndex"
  | "tileSize"
  | "widthInTiles"
  | "heightInTiles"
>;

export const NEW_MAP_TYPE_OPTIONS = [
  { value: "orthogonal", label: "Orthogonal" },
  { value: "hexagonal-row", label: "Hexagonal (Staggered Rows)" },
  { value: "hexagonal-column", label: "Hexagonal (Staggered Columns)" },
  { value: "isometric", label: "Isometric" },
  { value: "isometric-staggered", label: "Isometric (Staggered)" },
] as const satisfies readonly { value: NewMapType; label: string }[];

export function getGeometryForNewMapType(mapType: NewMapType): TileMapGeometry {
  switch (mapType) {
    case "hexagonal-row":
      return {
        orientation: "hexagonal",
        staggerAxis: "y",
        staggerIndex: DEFAULT_HEX_STAGGER_INDEX,
      };
    case "hexagonal-column":
      return {
        orientation: "hexagonal",
        staggerAxis: "x",
        staggerIndex: DEFAULT_HEX_STAGGER_INDEX,
      };
    case "isometric":
      return {
        orientation: "isometric",
      };
    case "isometric-staggered":
      return {
        orientation: "staggered",
        staggerAxis: DEFAULT_HEX_STAGGER_AXIS,
        staggerIndex: DEFAULT_HEX_STAGGER_INDEX,
      };
    default:
      return {
        orientation: "orthogonal",
      };
  }
}

export function isIsometricMap(map: TileMapGeometryLike): boolean {
  return map.orientation === "isometric";
}

export function isHexagonalMap(map: TileMapGeometryLike): boolean {
  return map.orientation === "hexagonal";
}

export function isStaggeredMap(map: TileMapGeometryLike): boolean {
  return map.orientation === "staggered";
}

export function isOffsetMap(map: TileMapGeometryLike): boolean {
  return isHexagonalMap(map) || isStaggeredMap(map) || isIsometricMap(map);
}

function getIsometricLeftInset(
  tileSize: number,
  heightInTiles: number,
): number {
  return Math.max(0, (heightInTiles - 1) * tileSize * HALF_TILE_RATIO);
}

export function isStaggeredIndex(
  index: number,
  map: Pick<TileMapGeometryLike, "staggerIndex">,
): boolean {
  const isOddIndex = Math.abs(index % 2) === 1;
  return map.staggerIndex === "even" ? !isOddIndex : isOddIndex;
}

function hasShiftedIndex(
  count: number,
  map: Pick<TileMapGeometryLike, "staggerIndex">,
): boolean {
  if (count <= 0) return false;
  return map.staggerIndex === "even" ? count >= 1 : count >= 2;
}

function getMapStepRatio(map: TileMapGeometryLike): number {
  if (isHexagonalMap(map)) {
    return HEX_STEP_RATIO;
  }

  if (isStaggeredMap(map)) {
    return HALF_TILE_RATIO;
  }

  return 1;
}

export function getMapCellOrigin(
  map: TileMapGeometryLike,
  zoom: number,
  x: number,
  y: number,
): MapPoint {
  const scaledTile = map.tileSize * zoom;

  if (isIsometricMap(map)) {
    return {
      x:
        getIsometricLeftInset(scaledTile, map.heightInTiles) +
        (x - y) * scaledTile * HALF_TILE_RATIO,
      y: (x + y) * scaledTile * HALF_TILE_RATIO,
    };
  }

  if (!isOffsetMap(map)) {
    return {
      x: x * scaledTile,
      y: y * scaledTile,
    };
  }

  const step = scaledTile * getMapStepRatio(map);

  if (map.staggerAxis === "y") {
    return {
      x: x * scaledTile + (isStaggeredIndex(y, map) ? scaledTile / 2 : 0),
      y: y * step,
    };
  }

  return {
    x: x * step,
    y: y * scaledTile + (isStaggeredIndex(x, map) ? scaledTile / 2 : 0),
  };
}

export function getMapCellBounds(
  map: TileMapGeometryLike,
  zoom: number,
  x: number,
  y: number,
): MapRect {
  const origin = getMapCellOrigin(map, zoom, x, y);
  const scaledTile = map.tileSize * zoom;

  return {
    x: origin.x,
    y: origin.y,
    width: scaledTile,
    height: scaledTile,
  };
}

export function getMapCellPolygon(
  map: TileMapGeometryLike,
  zoom: number,
  x: number,
  y: number,
): MapPoint[] {
  const origin = getMapCellOrigin(map, zoom, x, y);
  const scaledTile = map.tileSize * zoom;

  if (isIsometricMap(map) || isStaggeredMap(map)) {
    return [
      { x: origin.x + scaledTile * HALF_TILE_RATIO, y: origin.y },
      { x: origin.x + scaledTile, y: origin.y + scaledTile * HALF_TILE_RATIO },
      { x: origin.x + scaledTile * HALF_TILE_RATIO, y: origin.y + scaledTile },
      { x: origin.x, y: origin.y + scaledTile * HALF_TILE_RATIO },
    ];
  }

  if (!isOffsetMap(map)) {
    return [
      { x: origin.x, y: origin.y },
      { x: origin.x + scaledTile, y: origin.y },
      { x: origin.x + scaledTile, y: origin.y + scaledTile },
      { x: origin.x, y: origin.y + scaledTile },
    ];
  }

  if (map.staggerAxis === "y") {
    return [
      { x: origin.x + scaledTile * HALF_TILE_RATIO, y: origin.y },
      { x: origin.x + scaledTile, y: origin.y + scaledTile * 0.25 },
      { x: origin.x + scaledTile, y: origin.y + scaledTile * 0.75 },
      { x: origin.x + scaledTile * HALF_TILE_RATIO, y: origin.y + scaledTile },
      { x: origin.x, y: origin.y + scaledTile * 0.75 },
      { x: origin.x, y: origin.y + scaledTile * 0.25 },
    ];
  }

  return [
    { x: origin.x + scaledTile * 0.25, y: origin.y },
    { x: origin.x + scaledTile * 0.75, y: origin.y },
    { x: origin.x + scaledTile, y: origin.y + scaledTile * HALF_TILE_RATIO },
    { x: origin.x + scaledTile * 0.75, y: origin.y + scaledTile },
    { x: origin.x + scaledTile * 0.25, y: origin.y + scaledTile },
    { x: origin.x, y: origin.y + scaledTile * HALF_TILE_RATIO },
  ];
}

export function getMapPixelSize(
  map: TileMapGeometryLike,
  zoom: number,
  widthInTiles = map.widthInTiles,
  heightInTiles = map.heightInTiles,
): MapPixelSize {
  const scaledTile = map.tileSize * zoom;

  if (widthInTiles <= 0 || heightInTiles <= 0) {
    return { width: 0, height: 0 };
  }

  if (isIsometricMap(map)) {
    const projectedSpan =
      (widthInTiles + heightInTiles) * scaledTile * HALF_TILE_RATIO;
    return {
      width: projectedSpan,
      height: projectedSpan,
    };
  }

  if (!isOffsetMap(map)) {
    return {
      width: widthInTiles * scaledTile,
      height: heightInTiles * scaledTile,
    };
  }

  const step = scaledTile * getMapStepRatio(map);

  if (map.staggerAxis === "y") {
    return {
      width:
        widthInTiles * scaledTile +
        (hasShiftedIndex(heightInTiles, map) ? scaledTile / 2 : 0),
      height: scaledTile + (heightInTiles - 1) * step,
    };
  }

  return {
    width: scaledTile + (widthInTiles - 1) * step,
    height:
      heightInTiles * scaledTile +
      (hasShiftedIndex(widthInTiles, map) ? scaledTile / 2 : 0),
  };
}

function pointInPolygon(point: MapPoint, polygon: MapPoint[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function getMapCellAtPoint(
  map: TileMapGeometryLike,
  zoom: number,
  point: MapPoint,
): MapCell | null {
  const scaledTile = map.tileSize * zoom;

  if (isIsometricMap(map)) {
    const halfTile = scaledTile * HALF_TILE_RATIO;
    const localX =
      point.x - getIsometricLeftInset(scaledTile, map.heightInTiles);
    const approxSum = point.y / halfTile;
    const approxDiff = localX / halfTile;
    const approxX = Math.floor((approxSum + approxDiff) / 2);
    const approxY = Math.floor((approxSum - approxDiff) / 2);
    const xCandidates = new Set<number>();
    const yCandidates = new Set<number>();

    for (let x = approxX - 1; x <= approxX + 1; x += 1) {
      if (x >= 0 && x < map.widthInTiles) {
        xCandidates.add(x);
      }
    }

    for (let y = approxY - 1; y <= approxY + 1; y += 1) {
      if (y >= 0 && y < map.heightInTiles) {
        yCandidates.add(y);
      }
    }

    for (const y of yCandidates) {
      for (const x of xCandidates) {
        const polygon = getMapCellPolygon(map, zoom, x, y);
        if (pointInPolygon(point, polygon)) {
          return { x, y };
        }
      }
    }

    return null;
  }

  if (!isOffsetMap(map)) {
    const x = Math.floor(point.x / scaledTile);
    const y = Math.floor(point.y / scaledTile);

    if (x < 0 || y < 0 || x >= map.widthInTiles || y >= map.heightInTiles) {
      return null;
    }

    return { x, y };
  }

  const xCandidates = new Set<number>();
  const yCandidates = new Set<number>();
  const step = scaledTile * getMapStepRatio(map);

  if (map.staggerAxis === "y") {
    const approxY = Math.floor(point.y / step);

    for (let y = approxY - 1; y <= approxY + 1; y++) {
      if (y < 0 || y >= map.heightInTiles) continue;
      yCandidates.add(y);
      const offsetX = isStaggeredIndex(y, map) ? scaledTile / 2 : 0;
      const approxX = Math.floor((point.x - offsetX) / scaledTile);

      for (let x = approxX - 1; x <= approxX + 1; x++) {
        if (x >= 0 && x < map.widthInTiles) {
          xCandidates.add(x);
        }
      }
    }
  } else {
    const approxX = Math.floor(point.x / step);

    for (let x = approxX - 1; x <= approxX + 1; x++) {
      if (x < 0 || x >= map.widthInTiles) continue;
      xCandidates.add(x);
      const offsetY = isStaggeredIndex(x, map) ? scaledTile / 2 : 0;
      const approxY = Math.floor((point.y - offsetY) / scaledTile);

      for (let y = approxY - 1; y <= approxY + 1; y++) {
        if (y >= 0 && y < map.heightInTiles) {
          yCandidates.add(y);
        }
      }
    }
  }

  for (const y of yCandidates) {
    for (const x of xCandidates) {
      const polygon = getMapCellPolygon(map, zoom, x, y);
      if (pointInPolygon(point, polygon)) {
        return { x, y };
      }
    }
  }

  return null;
}

export function getAdjacentMapCells(
  map: TileMapGeometryLike,
  x: number,
  y: number,
): MapCell[] {
  let candidates: MapCell[];

  if (isIsometricMap(map) || !isOffsetMap(map)) {
    candidates = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
  } else if (isStaggeredMap(map) && map.staggerAxis === "y") {
    const shifted = isStaggeredIndex(y, map);
    candidates = shifted
      ? [
          { x, y: y - 1 },
          { x: x + 1, y: y - 1 },
          { x, y: y + 1 },
          { x: x + 1, y: y + 1 },
        ]
      : [
          { x: x - 1, y: y - 1 },
          { x, y: y - 1 },
          { x: x - 1, y: y + 1 },
          { x, y: y + 1 },
        ];
  } else if (isStaggeredMap(map)) {
    const shifted = isStaggeredIndex(x, map);
    candidates = shifted
      ? [
          { x: x - 1, y },
          { x: x - 1, y: y + 1 },
          { x: x + 1, y },
          { x: x + 1, y: y + 1 },
        ]
      : [
          { x: x - 1, y: y - 1 },
          { x: x - 1, y },
          { x: x + 1, y: y - 1 },
          { x: x + 1, y },
        ];
  } else if (map.staggerAxis === "y") {
    const shifted = isStaggeredIndex(y, map);
    candidates = shifted
      ? [
          { x: x - 1, y },
          { x: x + 1, y },
          { x, y: y - 1 },
          { x: x + 1, y: y - 1 },
          { x, y: y + 1 },
          { x: x + 1, y: y + 1 },
        ]
      : [
          { x: x - 1, y },
          { x: x + 1, y },
          { x: x - 1, y: y - 1 },
          { x, y: y - 1 },
          { x: x - 1, y: y + 1 },
          { x, y: y + 1 },
        ];
  } else {
    const shifted = isStaggeredIndex(x, map);
    candidates = shifted
      ? [
          { x, y: y - 1 },
          { x: x + 1, y },
          { x: x + 1, y: y + 1 },
          { x, y: y + 1 },
          { x: x - 1, y: y + 1 },
          { x: x - 1, y },
        ]
      : [
          { x, y: y - 1 },
          { x: x + 1, y: y - 1 },
          { x: x + 1, y },
          { x, y: y + 1 },
          { x: x - 1, y },
          { x: x - 1, y: y - 1 },
        ];
  }

  return candidates.filter(
    (cell) =>
      cell.x >= 0 &&
      cell.y >= 0 &&
      cell.x < map.widthInTiles &&
      cell.y < map.heightInTiles,
  );
}
