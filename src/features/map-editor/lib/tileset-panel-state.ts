import { getPaintableAutotileTerrains } from "@/features/map-editor/lib/autotile";
import {
  findFirstDualGridTerrainSource,
  isDualGridTileset,
  tryAutoEnableDualGridOnActiveLayer,
} from "@/features/map-editor/lib/dual-grid";
import { getTilesetTileSize } from "@/features/project-management/lib/project";
import type { SyncActiveTilesetResult } from "@/features/map-editor/types/dual-grid";
import type { EditorState, TilesetId } from "@/types";
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
