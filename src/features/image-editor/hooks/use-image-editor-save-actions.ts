import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useEditorStore } from "@/hooks/use-editor-store";
import { saveAsset } from "@/services/db";
import {
  evictImageLayer,
  evictTileset,
} from "@/features/map-editor/components/MapCanvas/texture-cache";
import { generateAssetId, generateTilesetId } from "@/utils/ids";
import type {
  ImageLayerEditorContext,
  TileEditorContext,
} from "@/types/editor/editor-helpers";
import type { ImageEditorProps } from "@/types/image-editor/image-editor-ui";
import type { ImageEditorController } from "@/types/image-editor/image-editor-controller";
import type { Dispatch, SetStateAction } from "react";

export function useImageEditorSaveActions(
  editor: ImageEditorController,
  activeTileCtx: TileEditorContext | null,
  activeImageLayerCtx: ImageLayerEditorContext | null,
  setActiveImageLayerCtx: Dispatch<
    SetStateAction<ImageLayerEditorContext | null>
  >,
  onRequestClose: ImageEditorProps["onRequestClose"],
  setShowUnsavedDialog: Dispatch<SetStateAction<boolean>>,
  setIsClosingAfterSave: Dispatch<SetStateAction<boolean>>,
  setShowSaveDialog: Dispatch<SetStateAction<boolean>>,
) {
  const { setState: setMainState } = useEditorStore();
  const closeAfterSaveRef = useRef(false);

  const finalizeSuccessfulSave = useCallback(() => {
    editor.markSavePoint();
    toast.success("Image saved");
    setShowUnsavedDialog(false);
    setIsClosingAfterSave(false);

    if (closeAfterSaveRef.current) {
      closeAfterSaveRef.current = false;
      onRequestClose?.();
    }
  }, [editor, onRequestClose, setIsClosingAfterSave, setShowUnsavedDialog]);

  const requestEditorClose = useCallback(() => {
    if (editor.hasUnsavedImageChanges()) {
      setShowUnsavedDialog(true);
      return;
    }
    onRequestClose?.();
  }, [editor, onRequestClose, setShowUnsavedDialog]);

  const handleSaveTile = useCallback(
    async (context: TileEditorContext) => {
      const frameData = editor.getCurrentFrameData();
      if (!frameData) return false;

      const canvas = document.createElement("canvas");
      canvas.width = context.sw;
      canvas.height = context.sh;
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) return false;
      canvasContext.imageSmoothingEnabled = false;
      canvasContext.putImageData(frameData, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) return false;

      const buffer = await blob.arrayBuffer();
      const newAssetId = generateAssetId();
      await saveAsset(newAssetId, buffer, "image/png");

      setMainState((draft) => {
        if (!draft.project) return;

        if (!draft.project.overrideTilesets) {
          draft.project.overrideTilesets = [];
        }

        const existingOverride = draft.project.overrideTilesets.find(
          (tileset) => tileset.id === context.tilesetId,
        );

        let overrideTilesetId = existingOverride?.id;

        if (existingOverride) {
          existingOverride.assetId = newAssetId;
        } else {
          const newId = generateTilesetId();
          overrideTilesetId = newId;
          const sourceTileset = [
            ...draft.project.tilesets,
            ...draft.project.overrideTilesets,
          ].find((tileset) => tileset.id === context.tilesetId);
          draft.project.overrideTilesets.push({
            id: newId,
            name: "__override__",
            groupId:
              sourceTileset?.groupId ?? draft.project.tilesetGroups[0]!.id,
            tileSize: sourceTileset?.tileSize ?? draft.tileSize,
            assetId: newAssetId,
            imageWidth: context.sw,
            imageHeight: context.sh,
            createdAt: Date.now(),
          });
        }

        if (overrideTilesetId) {
          evictTileset(overrideTilesetId);
        }

        const layer = draft.project.layers.find(
          (draftLayer) => draftLayer.id === context.layerId,
        );
        if (layer && overrideTilesetId) {
          layer.tiles[`${context.tileX},${context.tileY}`] = {
            tilesetId: overrideTilesetId,
            sx: 0,
            sy: 0,
            sw: context.sw,
            sh: context.sh,
          };
        }
      });

      finalizeSuccessfulSave();
      return true;
    },
    [editor, finalizeSuccessfulSave, setMainState],
  );

  const handleSaveImageLayer = useCallback(
    async (context: ImageLayerEditorContext) => {
      const frameData = editor.getCurrentFrameData();
      if (!frameData) return false;

      const canvas = document.createElement("canvas");
      canvas.width = frameData.width;
      canvas.height = frameData.height;
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) return false;
      canvasContext.imageSmoothingEnabled = false;
      canvasContext.putImageData(frameData, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) return false;

      const buffer = await blob.arrayBuffer();
      const newAssetId = generateAssetId();
      await saveAsset(newAssetId, buffer, "image/png");

      let didUpdateLayer = false;
      setMainState((draft) => {
        const imageLayer = (draft.project?.imageLayers ?? []).find(
          (layer) => layer.id === context.layerId,
        );
        if (!imageLayer) return;

        imageLayer.assetId = newAssetId;
        imageLayer.width = frameData.width;
        imageLayer.height = frameData.height;
        didUpdateLayer = true;
      });

      if (!didUpdateLayer) {
        return false;
      }

      evictImageLayer(context.assetId);
      setActiveImageLayerCtx((current) =>
        current && current.layerId === context.layerId
          ? { ...current, assetId: newAssetId }
          : current,
      );

      finalizeSuccessfulSave();
      return true;
    },
    [editor, finalizeSuccessfulSave, setActiveImageLayerCtx, setMainState],
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (activeImageLayerCtx) {
      return handleSaveImageLayer(activeImageLayerCtx);
    }
    if (activeTileCtx) {
      return handleSaveTile(activeTileCtx);
    }

    toast("Use Export to save this image to a file.");
    return false;
  }, [
    activeImageLayerCtx,
    activeTileCtx,
    handleSaveImageLayer,
    handleSaveTile,
  ]);

  const handleOpenExportDialog = useCallback(() => {
    setShowSaveDialog(true);
  }, [setShowSaveDialog]);

  const handleExportPng = useCallback(async (): Promise<boolean> => {
    const didSave = await editor.exportPng();
    if (didSave) {
      finalizeSuccessfulSave();
    }
    return didSave;
  }, [editor, finalizeSuccessfulSave]);

  const handleExportGif = useCallback(async (): Promise<boolean> => {
    const didSave = await editor.exportGif();
    if (didSave) {
      finalizeSuccessfulSave();
    }
    return didSave;
  }, [editor, finalizeSuccessfulSave]);

  const handleExportSpriteSheet = useCallback(
    async (columns: number): Promise<boolean> => {
      const didSave = await editor.exportSpriteSheet(columns);
      if (didSave) {
        finalizeSuccessfulSave();
      }
      return didSave;
    },
    [editor, finalizeSuccessfulSave],
  );

  const handleCloseSaveDialog = useCallback(() => {
    setShowSaveDialog(false);
    closeAfterSaveRef.current = false;
    setIsClosingAfterSave(false);
  }, [setIsClosingAfterSave, setShowSaveDialog]);

  return {
    closeAfterSaveRef,
    handleCloseSaveDialog,
    handleExportGif,
    handleExportPng,
    handleExportSpriteSheet,
    handleOpenExportDialog,
    handleSave,
    requestEditorClose,
  };
}
