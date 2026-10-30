import {
  getPaintableAutotileTerrainById,
  getPaintableAutotileTerrains,
} from "@/features/map-editor/lib/autotile";
import {
  createEmptyAnimationConfig,
  normalizeTilesetAnimationConfig,
} from "@/features/map-editor/lib/tileset-animations";
import {
  findFirstDualGridTerrainSource,
  isDualGridTileset,
  tryAutoEnableDualGridOnActiveLayer,
} from "@/features/map-editor/lib/dual-grid";
import { getTilesetTileSize } from "@/features/project-management/lib/project";
import type { SyncActiveTilesetResult } from "@/features/map-editor/types/dual-grid";
import type {
  EditorState,
  Tileset,
  TilesetAnimation,
  TilesetId,
} from "@/types";
import { toast } from "sonner";

export const EMPTY_SYNC_ACTIVE_TILESET_RESULT: SyncActiveTilesetResult = {
  autoEnabledDualGrid: false,
  clearedLayerTiles: false,
  layerName: null,
};

export function notifySyncActiveTilesetResult(
  result: SyncActiveTilesetResult,
): void {
  if (!result.autoEnabledDualGrid || !result.layerName) {
    return;
  }

  if (result.clearedLayerTiles) {
    toast.warning(
      `Enabled dual grid on "${result.layerName}" and cleared existing tiles.`,
    );
    return;
  }

  toast.success(`Enabled dual grid on "${result.layerName}".`);
}

export function syncActiveTilesetState(
  draft: EditorState,
  tilesetId: TilesetId | null,
): SyncActiveTilesetResult {
  draft.activeTilesetId = tilesetId;
  const activeTileset = draft.project?.tilesets.find(
    (tileset) => tileset.id === tilesetId,
  );
  draft.tileSize = getTilesetTileSize(
    activeTileset,
    draft.project?.tileSize ?? draft.tileSize,
  );
  draft.selectedTile = null;
  draft.selectedAnimation = null;

  if (!activeTileset) {
    draft.selectedAutotileTerrain = null;
    return EMPTY_SYNC_ACTIVE_TILESET_RESULT;
  }

  if (isDualGridTileset(activeTileset)) {
    const dualGridSource = findFirstDualGridTerrainSource(
      [activeTileset],
      activeTileset.id,
    );
    draft.selectedAutotileTerrain = dualGridSource
      ? {
          tilesetId: dualGridSource.tilesetId,
          terrainId: dualGridSource.terrain.id,
        }
      : null;
    const autoEnable = tryAutoEnableDualGridOnActiveLayer(draft);
    return {
      autoEnabledDualGrid: autoEnable.enabled,
      clearedLayerTiles: autoEnable.clearedTiles,
      layerName: autoEnable.layerName,
    };
  }

  const paintableTerrain = getPaintableAutotileTerrains(
    activeTileset.autotile,
  )[0];
  draft.selectedAutotileTerrain = paintableTerrain
    ? {
        tilesetId: activeTileset.id,
        terrainId: paintableTerrain.id,
      }
    : null;

  return EMPTY_SYNC_ACTIVE_TILESET_RESULT;
}

export function applyTilesetAutotile(
  draft: EditorState,
  tilesetId: TilesetId,
  autotile: NonNullable<Tileset["autotile"]>,
): SyncActiveTilesetResult {
  const tileset = draft.project?.tilesets.find(
    (candidate) => candidate.id === tilesetId,
  );
  if (!tileset) {
    return EMPTY_SYNC_ACTIVE_TILESET_RESULT;
  }

  tileset.autotile = autotile;

  const dualGridSource = findFirstDualGridTerrainSource([tileset], tileset.id);
  if (dualGridSource) {
    draft.selectedAutotileTerrain = {
      tilesetId: dualGridSource.tilesetId,
      terrainId: dualGridSource.terrain.id,
    };
    const autoEnable = tryAutoEnableDualGridOnActiveLayer(draft);
    return {
      autoEnabledDualGrid: autoEnable.enabled,
      clearedLayerTiles: autoEnable.clearedTiles,
      layerName: autoEnable.layerName,
    };
  }

  if (
    draft.selectedAutotileTerrain?.tilesetId === tilesetId &&
    !getPaintableAutotileTerrainById(
      autotile,
      draft.selectedAutotileTerrain.terrainId,
    )
  ) {
    draft.selectedAutotileTerrain = null;
  }

  return EMPTY_SYNC_ACTIVE_TILESET_RESULT;
}

export function saveTilesetAnimation(
  draft: EditorState,
  animation: TilesetAnimation,
): void {
  const tileset = draft.project?.tilesets.find(
    (candidate) => candidate.id === draft.activeTilesetId,
  );
  if (!tileset) {
    return;
  }

  const config = normalizeTilesetAnimationConfig(
    tileset.animations ?? createEmptyAnimationConfig(),
  );
  const existingIndex = config.animations.findIndex(
    (candidate) => candidate.id === animation.id,
  );

  if (existingIndex >= 0) {
    config.animations[existingIndex] = animation;
  } else {
    config.animations.push(animation);
  }

  tileset.animations = config;
  draft.currentTool = "animation";
  draft.selectedTile = null;
  draft.selectedAutotileTerrain = null;
  draft.selectedAnimation = {
    tilesetId: tileset.id,
    animationId: animation.id,
  };
}

export function deleteTilesetAnimation(
  draft: EditorState,
  animation: TilesetAnimation,
): void {
  const tileset = draft.project?.tilesets.find(
    (candidate) => candidate.id === draft.activeTilesetId,
  );
  if (!tileset?.animations) {
    return;
  }

  tileset.animations.animations = tileset.animations.animations.filter(
    (candidate) => candidate.id !== animation.id,
  );

  for (const layer of draft.project?.layers ?? []) {
    for (const ref of Object.values(layer.tiles)) {
      if (ref.tilesetId === tileset.id && ref.animationId === animation.id) {
        delete ref.animationId;
        delete ref.animationCellIndex;
      }
    }
  }

  if (draft.selectedAnimation?.animationId === animation.id) {
    draft.selectedAnimation = null;
    if (draft.currentTool === "animation") {
      draft.currentTool = "paint";
    }
  }
}
