import {
  TILESET_ANIMATION_CONFIG_VERSION,
  type TileLayer,
  type TileMapData,
  type TileRef,
  type Tileset,
  type TilesetAnimation,
  type TilesetAnimationConfig,
  type TilesetAnimationFrame,
  type TilesetAnimationId,
  type TilesetAnimationTileRegion,
  type TilesetId,
} from "@/types";
import type {
  AnimationDefinitionConflict,
  AnimationFrameResolution,
  AnimationPlacementStamp,
  TilesetAnimationDragPayload,
} from "@/features/map-editor/types/animations";

export const TILESET_ANIMATION_DRAG_MIME = "application/x-2dtiler-animation";
export const TILED_ANIMATIONS_PROPERTY_KEY = "2dtiler:animations";

const DEFAULT_FRAME_DURATION_MS = 120;

export function createEmptyAnimationConfig(): TilesetAnimationConfig {
  return {
    version: TILESET_ANIMATION_CONFIG_VERSION,
    animations: [],
  };
}

export function getTilesetAnimations(tileset: Tileset | null | undefined) {
  return tileset?.animations?.animations ?? [];
}

export function getTilesetAnimationById(
  tileset: Tileset | null | undefined,
  animationId: TilesetAnimationId | null | undefined,
) {
  if (!animationId) return null;
  return (
    getTilesetAnimations(tileset).find(
      (animation) => animation.id === animationId,
    ) ?? null
  );
}

export function cloneTilesetAnimationConfig(
  config: TilesetAnimationConfig | undefined,
): TilesetAnimationConfig {
  return {
    version: TILESET_ANIMATION_CONFIG_VERSION,
    animations: (config?.animations ?? []).map((animation) => ({
      ...animation,
      frames: animation.frames.map((frame) => ({
        durationMs: frame.durationMs,
        cells: frame.cells.map((cell) => (cell ? { ...cell } : null)),
      })),
    })),
  };
}

export function getAnimationCellCount(
  animation: Pick<TilesetAnimation, "widthInTiles" | "heightInTiles">,
) {
  return Math.max(1, animation.widthInTiles * animation.heightInTiles);
}

export function normalizeAnimationFrame(
  frame: Partial<TilesetAnimationFrame>,
  cellCount: number,
): TilesetAnimationFrame {
  const cells = Array.isArray(frame.cells) ? frame.cells : [];

  return {
    durationMs: Math.max(
      1,
      Math.round(Number(frame.durationMs) || DEFAULT_FRAME_DURATION_MS),
    ),
    cells: Array.from({ length: cellCount }, (_, index) => {
      const cell = cells[index];
      return cell ? { ...cell } : null;
    }),
  };
}

export function normalizeTilesetAnimation(
  animation: TilesetAnimation,
): TilesetAnimation {
  const widthInTiles = Math.max(
    1,
    Math.round(Number(animation.widthInTiles) || 1),
  );
  const heightInTiles = Math.max(
    1,
    Math.round(Number(animation.heightInTiles) || 1),
  );
  const cellCount = widthInTiles * heightInTiles;

  return {
    ...animation,
    name: animation.name.trim() || "Animation",
    widthInTiles,
    heightInTiles,
    frames: animation.frames.map((frame) =>
      normalizeAnimationFrame(frame, cellCount),
    ),
  };
}

export function normalizeTilesetAnimationConfig(
  config: TilesetAnimationConfig | undefined,
): TilesetAnimationConfig {
  return {
    version: TILESET_ANIMATION_CONFIG_VERSION,
    animations: (config?.animations ?? []).map(normalizeTilesetAnimation),
  };
}

export function getTileColumns(
  tileset: Pick<Tileset, "imageWidth" | "tileSize">,
) {
  return Math.max(1, Math.floor(tileset.imageWidth / tileset.tileSize));
}

export function getTileRegionFromIndex(
  tileset: Pick<Tileset, "imageWidth" | "tileSize">,
  localTileId: number,
): TilesetAnimationTileRegion {
  const columns = getTileColumns(tileset);
  const tileColumn = localTileId % columns;
  const tileRow = Math.floor(localTileId / columns);

  return {
    sx: tileColumn * tileset.tileSize,
    sy: tileRow * tileset.tileSize,
    sw: tileset.tileSize,
    sh: tileset.tileSize,
  };
}

export function getTileIndexFromRegion(
  tileset: Pick<Tileset, "imageWidth" | "tileSize">,
  region: Pick<TilesetAnimationTileRegion, "sx" | "sy">,
) {
  const columns = getTileColumns(tileset);
  const tileColumn = Math.max(0, Math.floor(region.sx / tileset.tileSize));
  const tileRow = Math.max(0, Math.floor(region.sy / tileset.tileSize));
  return tileRow * columns + tileColumn;
}

export function createAnimationPlacementStamp(
  tileset: Tileset,
  animation: TilesetAnimation,
): AnimationPlacementStamp {
  const firstFrame = animation.frames[0];
  const cells = firstFrame?.cells ?? [];

  return {
    tilesetId: tileset.id,
    animationId: animation.id,
    widthInTiles: animation.widthInTiles,
    heightInTiles: animation.heightInTiles,
    cells: cells.flatMap((cell, cellIndex) => {
      if (!cell) return [];
      const cellColumn = cellIndex % animation.widthInTiles;
      const cellRow = Math.floor(cellIndex / animation.widthInTiles);
      const ref: TileRef = {
        tilesetId: tileset.id,
        sx: cell.sx,
        sy: cell.sy,
        sw: cell.sw,
        sh: cell.sh,
        animationId: animation.id,
        animationCellIndex: cellIndex,
      };

      return [
        {
          dx: cellColumn,
          dy: cellRow,
          ref,
        },
      ];
    }),
  };
}

export function resolveAnimationPlacementStamp(
  tilesets: readonly Tileset[] | null | undefined,
  tilesetId: TilesetId | null | undefined,
  animationId: TilesetAnimationId | null | undefined,
): AnimationPlacementStamp | null {
  if (!tilesetId || !animationId) return null;

  const tileset = tilesets?.find((candidate) => candidate.id === tilesetId);
  const animation = getTilesetAnimationById(tileset, animationId);

  if (!tileset || !animation) return null;
  return createAnimationPlacementStamp(tileset, animation);
}

export function resolveAnimationFrame(
  animation: TilesetAnimation,
  elapsedMs: number,
): AnimationFrameResolution {
  if (animation.frames.length === 0) {
    return { frameIndex: 0, elapsedInFrameMs: 0 };
  }

  const totalDuration = animation.frames.reduce(
    (sum, frame) => sum + Math.max(1, frame.durationMs),
    0,
  );
  const normalizedElapsed =
    totalDuration > 0
      ? ((elapsedMs % totalDuration) + totalDuration) % totalDuration
      : 0;
  let cursor = 0;

  for (const [frameIndex, frame] of animation.frames.entries()) {
    const duration = Math.max(1, frame.durationMs);
    if (normalizedElapsed < cursor + duration) {
      return {
        frameIndex,
        elapsedInFrameMs: normalizedElapsed - cursor,
      };
    }
    cursor += duration;
  }

  return {
    frameIndex: animation.frames.length - 1,
    elapsedInFrameMs: 0,
  };
}

export function resolveAnimatedTileRef(
  ref: TileRef,
  tilesets: readonly Tileset[],
  elapsedMs: number,
): TileRef {
  if (!ref.animationId) return ref;

  const tileset = tilesets.find((candidate) => candidate.id === ref.tilesetId);
  const animation = getTilesetAnimationById(tileset, ref.animationId);
  if (!animation) return ref;

  const cellIndex = Math.max(0, Math.floor(ref.animationCellIndex ?? 0));
  const { frameIndex } = resolveAnimationFrame(animation, elapsedMs);
  const frame = animation.frames[frameIndex];
  const cell = frame?.cells[cellIndex];
  if (!cell) return ref;

  return {
    ...ref,
    sx: cell.sx,
    sy: cell.sy,
    sw: cell.sw,
    sh: cell.sh,
  };
}

export function createAnimationDragPayload(
  tilesetId: TilesetId,
  animationId: TilesetAnimationId,
): TilesetAnimationDragPayload {
  return {
    kind: "tileset-animation",
    tilesetId,
    animationId,
  };
}

export function parseAnimationDragPayload(
  dataTransfer: DataTransfer,
): TilesetAnimationDragPayload | null {
  const rawPayload = dataTransfer.getData(TILESET_ANIMATION_DRAG_MIME);
  if (!rawPayload) return null;

  try {
    const parsed = JSON.parse(
      rawPayload,
    ) as Partial<TilesetAnimationDragPayload>;
    if (
      parsed.kind !== "tileset-animation" ||
      typeof parsed.tilesetId !== "string" ||
      typeof parsed.animationId !== "string"
    ) {
      return null;
    }

    return parsed as TilesetAnimationDragPayload;
  } catch {
    return null;
  }
}

export function hasTilesetAnimationDefinitions(tilesets: readonly Tileset[]) {
  return tilesets.some((tileset) => getTilesetAnimations(tileset).length > 0);
}

export function hasPlacedAnimations(layers: readonly TileLayer[]) {
  return layers.some((layer) =>
    Object.values(layer.tiles).some((ref) => Boolean(ref.animationId)),
  );
}

export function getMapReferencedTilesetIds(
  map: TileMapData,
  layers: readonly TileLayer[],
) {
  const mapLayerIds = new Set(
    map.layerOrder.map((entryId) => entryId as string),
  );
  const referencedTilesetIds = new Set<string>();

  for (const layer of layers) {
    if (!mapLayerIds.has(layer.id as string)) continue;
    for (const ref of Object.values(layer.tiles)) {
      referencedTilesetIds.add(ref.tilesetId as string);
    }
  }

  return referencedTilesetIds;
}

export function findTiledAnimationDefinitionConflicts(
  tilesets: readonly Tileset[],
): AnimationDefinitionConflict[] {
  const conflicts: AnimationDefinitionConflict[] = [];

  for (const tileset of tilesets) {
    const seenLocalTileIds = new Map<number, TilesetAnimationId>();
    for (const animation of getTilesetAnimations(tileset)) {
      const firstFrame = animation.frames[0];
      for (const cell of firstFrame?.cells ?? []) {
        if (!cell) continue;
        const localTileId = getTileIndexFromRegion(tileset, cell);
        const existingAnimationId = seenLocalTileIds.get(localTileId);
        if (existingAnimationId && existingAnimationId !== animation.id) {
          conflicts.push({
            tilesetId: tileset.id,
            animationId: animation.id,
            localTileId,
          });
          continue;
        }
        seenLocalTileIds.set(localTileId, animation.id);
      }
    }
  }

  return conflicts;
}

export function findAnimationCellForLocalTileId(
  tileset: Tileset,
  localTileId: number,
) {
  for (const animation of getTilesetAnimations(tileset)) {
    const firstFrame = animation.frames[0];
    for (const [cellIndex, cell] of (firstFrame?.cells ?? []).entries()) {
      if (!cell) continue;
      if (getTileIndexFromRegion(tileset, cell) === localTileId) {
        return {
          animationId: animation.id,
          animationCellIndex: cellIndex,
        };
      }
    }
  }

  return null;
}
