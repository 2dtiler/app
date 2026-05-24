import { saveAsset } from "@/services/db";
import { generateAssetId, generateTilesetId } from "@/utils/ids";
import { syncActiveTilesetState } from "@/features/map-editor/lib/tileset-panel-state";
import type { EditorState, TileSize, Tileset } from "@/types";
import type { AiGeneratedImageRecord } from "@/types/integrations/ai-assets";

export function appendGeneratedImageTileset(
  draft: EditorState,
  record: AiGeneratedImageRecord,
  assetId: Tileset["assetId"],
  tilesetId: Tileset["id"],
  createdAt = Date.now(),
): boolean {
  if (!draft.project) return false;

  const targetGroupId =
    draft.activeTilesetGroupId ?? draft.project.tilesetGroups[0]?.id ?? null;
  if (!targetGroupId) return false;

  const tileSize = (draft.tileSize || draft.project.tileSize || 32) as TileSize;
  draft.project.tilesets.push({
    id: tilesetId,
    name: `AI ${record.modelLabel}`.slice(0, 64),
    groupId: targetGroupId,
    tileSize,
    assetId,
    imageWidth: record.width,
    imageHeight: record.height,
    createdAt,
  });
  draft.activeTilesetGroupId = targetGroupId;
  syncActiveTilesetState(draft, tilesetId);
  return true;
}

export async function saveGeneratedImageAsset(
  record: AiGeneratedImageRecord,
): Promise<Tileset["assetId"]> {
  const assetId = generateAssetId();
  await saveAsset(assetId, record.data, record.mimeType);
  return assetId;
}

export function createGeneratedTilesetId(): Tileset["id"] {
  return generateTilesetId();
}
