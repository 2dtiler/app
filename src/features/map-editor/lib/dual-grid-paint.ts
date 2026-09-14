import {
  createTileKey,
  findDualGridTerrainSource,
  getDualGridFillRegion,
  resolveDualGridTerrainSource,
  resolveDualGridWrites,
} from "@/features/map-editor/lib/dual-grid";
import type {
  DualGridPaintLayerContext,
  DualGridPaintWrite,
} from "@/features/map-editor/types/dual-grid";
import type { AutotileTerrainId } from "@/types";

export function mergePendingLogicalTerrains(
  base: Record<string, AutotileTerrainId> | undefined,
  pending: Map<string, AutotileTerrainId | null>,
): Record<string, AutotileTerrainId> {
  const next = { ...(base ?? {}) };
  for (const [key, terrainId] of pending) {
    if (terrainId === null) {
      delete next[key];
    } else {
      next[key] = terrainId;
    }
  }
  return next;
}

function collectBrushWrites(
  gx: number,
  gy: number,
  brushSize: string,
  mapWidth: number,
  mapHeight: number,
  terrainId: AutotileTerrainId | null,
): DualGridPaintWrite[] {
  const brushNum = Number.parseInt(brushSize, 10);
  const writes: DualGridPaintWrite[] = [];

  for (let dy = 0; dy < brushNum; dy++) {
    for (let dx = 0; dx < brushNum; dx++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx >= mapWidth || ty >= mapHeight) {
        continue;
      }

      writes.push({ x: tx, y: ty, terrainId });
    }
  }

  return writes;
}

export function paintDualGridLayer(context: DualGridPaintLayerContext): boolean {
  const {
    brushSize,
    currentTool,
    fill,
    gx,
    gy,
    layer,
    map,
    mapHeight,
    mapWidth,
    onMissingSetup,
    pendingLogicalWrites,
    preferredTilesetId,
    selectedTerrainId,
    stroke,
    tilesets,
  } = context;

  if (currentTool === "paint" || currentTool === "animation") {
    return true;
  }

  const effectiveLogical = mergePendingLogicalTerrains(
    layer.logicalTerrains,
    pendingLogicalWrites,
  );

  if (currentTool === "autotile") {
    const source = resolveDualGridTerrainSource(
      tilesets,
      selectedTerrainId,
      preferredTilesetId,
    );

    if (!source) {
      onMissingSetup();
      return true;
    }

    stroke(
      collectBrushWrites(
        gx,
        gy,
        brushSize,
        mapWidth,
        mapHeight,
        source.terrain.id,
      ),
      source.terrain,
      source.tilesetId,
    );
    return true;
  }

  if (currentTool === "erase") {
    const writes: DualGridPaintWrite[] = [];
    let source = null as ReturnType<typeof findDualGridTerrainSource>;
    const brushNum = Number.parseInt(brushSize, 10);

    for (let dy = 0; dy < brushNum; dy++) {
      for (let dx = 0; dx < brushNum; dx++) {
        const tx = gx + dx;
        const ty = gy + dy;
        if (tx >= mapWidth || ty >= mapHeight) {
          continue;
        }

        const terrainId = effectiveLogical[createTileKey(tx, ty)] ?? null;
        if (!terrainId) {
          continue;
        }

        if (!source) {
          source = findDualGridTerrainSource(tilesets, terrainId);
        }

        writes.push({ x: tx, y: ty, terrainId: null });
      }
    }

    if (!source) {
      source = resolveDualGridTerrainSource(
        tilesets,
        selectedTerrainId,
        preferredTilesetId,
      );
    }

    if (!source) {
      return true;
    }

    stroke(writes, source.terrain, source.tilesetId);
    return true;
  }

  if (currentTool === "fill") {
    const source = resolveDualGridTerrainSource(
      tilesets,
      selectedTerrainId,
      preferredTilesetId,
    );
    if (!source) {
      onMissingSetup();
      return true;
    }

    const region = getDualGridFillRegion(
      map,
      effectiveLogical,
      mapWidth,
      mapHeight,
      gx,
      gy,
    );
    if (region.length === 0) {
      return true;
    }

    const resolved = resolveDualGridWrites({
      mapWidth,
      mapHeight,
      logicalTerrains: effectiveLogical,
      terrain: source.terrain,
      tilesetId: source.tilesetId,
      writes: region.map(([x, y]) => ({
        x,
        y,
        terrainId: source.terrain.id,
      })),
    });

    fill(resolved.logicalTerrains, resolved.tiles);
    return true;
  }

  return true;
}
