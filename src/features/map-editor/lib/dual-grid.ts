import type {
  AutotileTerrain,
  AutotileTerrainId,
  EditorState,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  TilesetId,
} from "@/types";
import { createDualGridSlotId } from "@/features/map-editor/lib/autotile-preset-rules";
import { getAdjacentMapCells } from "@/features/map-editor/lib/map-geometry";
import type {
  AutoEnableDualGridResult,
  DualGridLayer,
  DualGridPaintWrite,
  DualGridWriteResult,
  ResolveDualGridWritesOptions,
} from "@/features/map-editor/types/dual-grid";

export function createTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function isDualGridLayer(
  layer: DualGridLayer | null | undefined,
): boolean {
  return layer?.tilingMode === "dual-grid";
}

export function isDualGridTileset(
  tileset: Pick<Tileset, "autotile"> | null | undefined,
): boolean {
  return tileset?.autotile?.preset === "dual-grid-15";
}

export function getDualGridCornerMask(
  logicalTerrains: Record<string, AutotileTerrainId>,
  vx: number,
  vy: number,
  terrainId: AutotileTerrainId,
): number {
  const nw = logicalTerrains[createTileKey(vx - 1, vy - 1)] === terrainId;
  const ne = logicalTerrains[createTileKey(vx, vy - 1)] === terrainId;
  const sw = logicalTerrains[createTileKey(vx - 1, vy)] === terrainId;
  const se = logicalTerrains[createTileKey(vx, vy)] === terrainId;

  return (nw ? 1 : 0) | (ne ? 2 : 0) | (sw ? 4 : 0) | (se ? 8 : 0);
}

function getAffectedVertices(
  writes: DualGridPaintWrite[],
  mapWidth: number,
  mapHeight: number,
): Array<{ vx: number; vy: number }> {
  const seen = new Set<string>();
  const vertices: Array<{ vx: number; vy: number }> = [];

  for (const write of writes) {
    for (const [dvx, dvy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const vx = write.x + dvx;
      const vy = write.y + dvy;
      if (vx < 0 || vy < 0 || vx > mapWidth || vy > mapHeight) {
        continue;
      }

      const key = createTileKey(vx, vy);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      vertices.push({ vx, vy });
    }
  }

  return vertices;
}

function createDisplayTile(
  tilesetId: ResolveDualGridWritesOptions["tilesetId"],
  terrain: ResolveDualGridWritesOptions["terrain"],
  mask: number,
): TileRef | null {
  if (mask === 0) {
    return null;
  }

  const region = terrain.patternTiles?.[createDualGridSlotId(mask)] ?? null;
  if (!region) {
    return null;
  }

  return {
    tilesetId,
    sx: region.sx,
    sy: region.sy,
    sw: region.sw,
    sh: region.sh,
  };
}

export function resolveDualGridWrites({
  mapWidth,
  mapHeight,
  logicalTerrains,
  terrain,
  tilesetId,
  writes,
}: ResolveDualGridWritesOptions): DualGridWriteResult {
  const nextLogical: Record<string, AutotileTerrainId> = {
    ...logicalTerrains,
  };

  for (const write of writes) {
    if (
      write.x < 0 ||
      write.y < 0 ||
      write.x >= mapWidth ||
      write.y >= mapHeight
    ) {
      continue;
    }

    const key = createTileKey(write.x, write.y);
    if (write.terrainId === null) {
      delete nextLogical[key];
    } else {
      nextLogical[key] = write.terrainId;
    }
  }

  const tiles = new Map<string, TileRef | null>();

  for (const { vx, vy } of getAffectedVertices(writes, mapWidth, mapHeight)) {
    const mask = getDualGridCornerMask(nextLogical, vx, vy, terrain.id);
    tiles.set(createTileKey(vx, vy), createDisplayTile(tilesetId, terrain, mask));
  }

  return {
    logicalTerrains: nextLogical,
    tiles,
  };
}

export function getDualGridFillRegion(
  map: TileMapData,
  logicalTerrains: Record<string, AutotileTerrainId>,
  mapWidth: number,
  mapHeight: number,
  startX: number,
  startY: number,
): [number, number][] {
  if (startX < 0 || startY < 0 || startX >= mapWidth || startY >= mapHeight) {
    return [];
  }

  const target = logicalTerrains[createTileKey(startX, startY)] ?? null;
  const visited = new Set<string>();
  const queue: [number, number][] = [[startX, startY]];
  const region: [number, number][] = [];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const [x, y] = queue[queueIndex++];
    const key = createTileKey(x, y);
    if (visited.has(key)) {
      continue;
    }
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) {
      continue;
    }
    visited.add(key);

    const current = logicalTerrains[key] ?? null;
    if (current !== target) {
      continue;
    }

    region.push([x, y]);

    for (const neighbor of getAdjacentMapCells(map, x, y)) {
      queue.push([neighbor.x, neighbor.y]);
    }
  }

  return region;
}

export function findDualGridTerrainSource(
  tilesets: readonly Tileset[],
  terrainId: AutotileTerrainId,
): { terrain: AutotileTerrain; tilesetId: TilesetId } | null {
  for (const tileset of tilesets) {
    const terrain = tileset.autotile?.terrains.find(
      (candidate) => candidate.id === terrainId,
    );
    if (
      terrain?.paletteTile &&
      tileset.autotile?.preset === "dual-grid-15"
    ) {
      return { terrain, tilesetId: tileset.id };
    }
  }

  return null;
}

export function findFirstDualGridTerrainSource(
  tilesets: readonly Tileset[],
  preferredTilesetId?: TilesetId | null,
): { terrain: AutotileTerrain; tilesetId: TilesetId } | null {
  const ordered =
    preferredTilesetId == null
      ? tilesets
      : [
          ...tilesets.filter((tileset) => tileset.id === preferredTilesetId),
          ...tilesets.filter((tileset) => tileset.id !== preferredTilesetId),
        ];

  for (const tileset of ordered) {
    if (!isDualGridTileset(tileset) || !tileset.autotile) {
      continue;
    }

    const terrain =
      tileset.autotile.terrains.find((candidate) => !!candidate.paletteTile) ??
      tileset.autotile.terrains[0];
    if (terrain) {
      return { terrain, tilesetId: tileset.id };
    }
  }

  return null;
}

export function resolveDualGridTerrainSource(
  tilesets: readonly Tileset[],
  selectedTerrainId: AutotileTerrainId | undefined,
  preferredTilesetId?: TilesetId | null,
): { terrain: AutotileTerrain; tilesetId: TilesetId } | null {
  const preferred = findFirstDualGridTerrainSource(
    tilesets,
    preferredTilesetId,
  );

  if (selectedTerrainId) {
    const selected = findDualGridTerrainSource(tilesets, selectedTerrainId);
    if (selected) {
      if (
        preferredTilesetId &&
        selected.tilesetId !== preferredTilesetId &&
        preferred?.tilesetId === preferredTilesetId
      ) {
        return preferred;
      }

      return selected;
    }
  }

  return preferred;
}

export function applyDualGridTileWrites(
  layer: TileLayer,
  tiles: Map<string, TileRef | null>,
): void {
  for (const [key, ref] of tiles.entries()) {
    if (ref === null) {
      delete layer.tiles[key];
    } else {
      layer.tiles[key] = ref;
    }
  }
}

export function enableDualGridOnLayer(layer: TileLayer): boolean {
  const clearedTiles = Object.keys(layer.tiles).length > 0;
  layer.tilingMode = "dual-grid";
  layer.tiles = {};
  layer.logicalTerrains = {};
  return clearedTiles;
}

function findTileLayerForDualGridAutoEnable(
  draft: EditorState,
): TileLayer | null {
  const project = draft.project;
  if (!project || !draft.activeMapId) {
    return null;
  }

  const layersOnMap = project.layers.filter(
    (candidate) =>
      !candidate.mapId || candidate.mapId === draft.activeMapId,
  );

  const activeLayer = draft.activeLayerId
    ? layersOnMap.find((candidate) => candidate.id === draft.activeLayerId)
    : undefined;
  if (activeLayer) {
    return activeLayer;
  }

  // Active selection may be an image/object layer — fall back to first tile layer.
  return layersOnMap[0] ?? null;
}

/**
 * When the active tileset is Dual Grid (15), turn on dual-grid mode for the
 * active orthogonal tile layer so users do not need the layer context menu.
 */
export function tryAutoEnableDualGridOnActiveLayer(
  draft: EditorState,
): AutoEnableDualGridResult {
  const project = draft.project;
  if (!project || !draft.activeMapId) {
    return { enabled: false, clearedTiles: false, layerName: null };
  }

  const activeMap = project.maps.find((map) => map.id === draft.activeMapId);
  if (!activeMap || activeMap.orientation !== "orthogonal") {
    return { enabled: false, clearedTiles: false, layerName: null };
  }

  const layer = findTileLayerForDualGridAutoEnable(draft);
  if (!layer || isDualGridLayer(layer)) {
    return { enabled: false, clearedTiles: false, layerName: null };
  }

  if (draft.activeLayerId !== layer.id) {
    draft.activeLayerId = layer.id;
  }

  const clearedTiles = enableDualGridOnLayer(layer);
  return {
    enabled: true,
    clearedTiles,
    layerName: layer.name,
  };
}

/** Enable dual-grid on the active layer when a Dual Grid (15) tileset is in use. */
export function ensureDualGridForDualTileset(
  draft: EditorState,
  tilesetId?: TilesetId | null,
): AutoEnableDualGridResult {
  const project = draft.project;
  if (!project) {
    return { enabled: false, clearedTiles: false, layerName: null };
  }

  const preferredId = tilesetId ?? draft.activeTilesetId;
  const tileset = preferredId
    ? project.tilesets.find((candidate) => candidate.id === preferredId)
    : null;

  if (!isDualGridTileset(tileset)) {
    const selectedId = draft.selectedAutotileTerrain?.tilesetId;
    const selectedTileset = selectedId
      ? project.tilesets.find((candidate) => candidate.id === selectedId)
      : null;
    if (!isDualGridTileset(selectedTileset)) {
      return { enabled: false, clearedTiles: false, layerName: null };
    }
  }

  return tryAutoEnableDualGridOnActiveLayer(draft);
}
