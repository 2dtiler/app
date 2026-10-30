import { useRef, type ChangeEvent } from "react";
import { toast } from "sonner";
import { evictTileset } from "@/features/map-editor/components/MapCanvas/texture-cache";
import { readReplacementTilesetImage } from "@/features/map-editor/lib/tileset-image-import";
import { deleteAsset, saveAsset } from "@/services/db";
import type { EditorState, Tileset } from "@/types";
import { generateAssetId } from "@/utils/ids";

export function useTilesetImageReload(
  activeTileset: Tileset | null,
  setState: (recipe: (draft: EditorState) => void) => void,
) {
  const reloadInputRef = useRef<HTMLInputElement>(null);

  async function handleReloadFileSelected(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeTileset) {
      return;
    }

    const tilesetId = activeTileset.id;
    const tilesetName = activeTileset.name;
    const previousAssetId = activeTileset.assetId;

    try {
      const replacement = await readReplacementTilesetImage(file);
      const assetId = generateAssetId();
      await saveAsset(assetId, replacement.buffer, replacement.mimeType);
      evictTileset(tilesetId);
      setState((draft) => {
        const tileset = draft.project?.tilesets.find(
          (candidate) => candidate.id === tilesetId,
        );
        if (!tileset) {
          return;
        }

        tileset.assetId = assetId;
        tileset.imageWidth = replacement.width;
        tileset.imageHeight = replacement.height;
      });
      await deleteAsset(previousAssetId);
      toast.success(`Reloaded "${tilesetName}".`);
    } catch (caughtError) {
      console.error("[Tileset Reload] Failed:", caughtError);
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to reload the tileset image.",
      );
    }
  }

  return {
    reloadInputRef,
    requestTilesetReload: () => {
      reloadInputRef.current?.click();
    },
    handleReloadFileSelected,
  };
}
