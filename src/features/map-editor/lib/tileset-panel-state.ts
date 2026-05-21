import { getTilesetTileSize } from "@/features/project-management/lib/project";
import type { EditorState, TilesetId } from "@/types";

export function syncActiveTilesetState(
  draft: EditorState,
  tilesetId: TilesetId | null,
): void {
  draft.activeTilesetId = tilesetId;
  const activeTileset = draft.project?.tilesets.find(
    (tileset) => tileset.id === tilesetId,
  );
  draft.tileSize = getTilesetTileSize(
    activeTileset,
    draft.project?.tileSize ?? draft.tileSize,
  );
  draft.selectedTile = null;
  draft.selectedAutotileTerrain = null;
  draft.selectedAnimation = null;
}
