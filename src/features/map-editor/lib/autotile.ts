import { areTileRefsEqual } from "@/features/map-editor/lib/tile-stamp";
import {
  AUTOTILE_NEIGHBOR_POSITIONS,
  type AutotileConfig,
  type AutotileNeighborMatcher,
  type AutotileTerrain,
  type AutotileTerrainId,
  type AutotileTileRegion,
  type TileRef,
  type TilesetId,
} from "@/types";

export interface AutotilePaintWrite {
  x: number;
  y: number;
  terrainId: AutotileTerrainId | null;
}

export interface ResolveAutotileWritesOptions {
  autotile: AutotileConfig;
  baseTiles: Record<string, TileRef>;
  mapWidth: number;
  mapHeight: number;
  tilesetId: TilesetId;
  writes: AutotilePaintWrite[];
}

type AutotileCellState = AutotileTerrainId | "foreign" | null;

const NEIGHBOR_OFFSETS = {
  northWest: { dx: -1, dy: -1 },
  north: { dx: 0, dy: -1 },
  northEast: { dx: 1, dy: -1 },
  west: { dx: -1, dy: 0 },
  east: { dx: 1, dy: 0 },
  southWest: { dx: -1, dy: 1 },
  south: { dx: 0, dy: 1 },
  southEast: { dx: 1, dy: 1 },
} as const;

function createTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseTileKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function matchesTileRegion(
  tileRef: TileRef | null | undefined,
  tilesetId: TilesetId,
  region: AutotileTileRegion | null | undefined,
): boolean {
  return (
    !!region &&
    tileRef?.tilesetId === tilesetId &&
    tileRef.sx === region.sx &&
    tileRef.sy === region.sy &&
    tileRef.sw === region.sw &&
    tileRef.sh === region.sh
  );
}

function createTileRef(
  tilesetId: TilesetId,
  region: AutotileTileRegion,
): TileRef {
  return {
    tilesetId,
    sx: region.sx,
    sy: region.sy,
    sw: region.sw,
    sh: region.sh,
  };
}

function getTerrainById(
  autotile: AutotileConfig,
  terrainId: AutotileTerrainId,
): AutotileTerrain | null {
  return autotile.terrains.find((terrain) => terrain.id === terrainId) ?? null;
}

function matchesNeighbor(
  matcher: AutotileNeighborMatcher,
  state: AutotileCellState,
): boolean {
  switch (matcher.kind) {
    case "any":
      return true;
    case "empty":
      return state === null;
    case "filled":
      return state !== null;
    case "terrain":
      return state === matcher.terrainId;
    case "notTerrain":
      return state !== matcher.terrainId;
  }
}

export function findAutotileTerrainByPaletteTile(
  autotile: AutotileConfig | null | undefined,
  tile: AutotileTileRegion | null | undefined,
): AutotileTerrain | null {
  if (!autotile || !tile) {
    return null;
  }

  return (
    autotile.terrains.find(
      (terrain) =>
        !!terrain.paletteTile &&
        terrain.paletteTile.sx === tile.sx &&
        terrain.paletteTile.sy === tile.sy &&
        terrain.paletteTile.sw === tile.sw &&
        terrain.paletteTile.sh === tile.sh,
    ) ?? null
  );
}

export function classifyAutotileTile(
  autotile: AutotileConfig | null | undefined,
  tilesetId: TilesetId,
  tileRef: TileRef | null | undefined,
): AutotileTerrainId | null {
  if (!autotile || !tileRef) {
    return null;
  }

  const terrain = autotile.terrains.find((candidate) =>
    matchesTileRegion(tileRef, tilesetId, candidate.paletteTile),
  );
  if (terrain) {
    return terrain.id;
  }

  const rule = autotile.rules.find((candidate) =>
    matchesTileRegion(tileRef, tilesetId, candidate.output),
  );
  return rule?.centerTerrainId ?? null;
}

export function resolveAutotileWrites({
  autotile,
  baseTiles,
  mapWidth,
  mapHeight,
  tilesetId,
  writes,
}: ResolveAutotileWritesOptions): Map<string, TileRef | null> {
  const explicitStates = new Map<string, AutotileTerrainId | null>();
  const affectedKeys = new Set<string>();

  function isInBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < mapWidth && y < mapHeight;
  }

  function getCellState(x: number, y: number): AutotileCellState {
    if (!isInBounds(x, y)) {
      return null;
    }

    const key = createTileKey(x, y);
    if (explicitStates.has(key)) {
      return explicitStates.get(key) ?? null;
    }

    const baseTile = baseTiles[key] ?? null;
    if (!baseTile) {
      return null;
    }

    return classifyAutotileTile(autotile, tilesetId, baseTile) ?? "foreign";
  }

  for (const write of writes) {
    if (!isInBounds(write.x, write.y)) {
      continue;
    }

    const key = createTileKey(write.x, write.y);
    explicitStates.set(key, write.terrainId);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = write.x + dx;
        const y = write.y + dy;
        if (!isInBounds(x, y)) {
          continue;
        }
        affectedKeys.add(createTileKey(x, y));
      }
    }
  }

  const resolved = new Map<string, TileRef | null>();

  for (const key of affectedKeys) {
    const { x, y } = parseTileKey(key);
    const state = getCellState(x, y);

    if (state === "foreign") {
      continue;
    }

    const baseRef = baseTiles[key] ?? null;
    let nextRef: TileRef | null = null;

    if (typeof state === "string") {
      const terrain = getTerrainById(autotile, state);
      if (!terrain) {
        continue;
      }

      const matchingRule = autotile.rules.find((rule) => {
        if (rule.centerTerrainId !== state) {
          return false;
        }

        return AUTOTILE_NEIGHBOR_POSITIONS.every((position) => {
          const offset = NEIGHBOR_OFFSETS[position];
          return matchesNeighbor(
            rule.neighbors[position],
            getCellState(x + offset.dx, y + offset.dy),
          );
        });
      });

      const outputRegion = matchingRule?.output ?? terrain.paletteTile;
      if (!outputRegion) {
        continue;
      }

      nextRef = createTileRef(tilesetId, outputRegion);
    }

    if (!areTileRefsEqual(baseRef, nextRef)) {
      resolved.set(key, nextRef);
    }
  }

  return resolved;
}
