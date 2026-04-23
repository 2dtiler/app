import { useCallback, useEffect, useRef, useState } from "react";
import { loadPaletteLibrary } from "@/services/db";
import {
  clearImageLayerEditorContext,
  getPendingImageLayerEditorRequest,
} from "@/features/image-editor/lib/image-layer-editor-context";
import {
  imageLayerImageCache,
  loadImageLayerImage,
  loadTilesetImage,
  tilesetImageCache,
} from "@/features/map-editor/components/MapCanvas/texture-cache";
import {
  clearTileEditorContext,
  getPendingTileEditorRequest,
} from "@/features/map-editor/lib/tile-editor-context";
import {
  getImageEditorStore,
  isImageEditorStoreReady,
} from "@/store/image-editor-store";
import type {
  ImageLayerEditorContext,
  TileEditorContext,
} from "@/types/editor/editor-helpers";
import type { ImageEditorController } from "@/features/image-editor/types/image-editor-controller";

export function useImageEditorRequestLoader(
  editor: ImageEditorController,
  projectId: string | undefined,
  onRequestLoaded: () => void,
) {
  const [activeTileCtx, setActiveTileCtx] = useState<TileEditorContext | null>(
    null,
  );
  const [activeImageLayerCtx, setActiveImageLayerCtx] =
    useState<ImageLayerEditorContext | null>(null);
  const handledTileRequestIdRef = useRef<number | null>(null);
  const handledImageLayerRequestIdRef = useRef<number | null>(null);
  const loadRunIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const loadPendingTileRequest = useCallback(async () => {
    const pendingRequest = getPendingTileEditorRequest();
    if (!pendingRequest) {
      return;
    }

    const { requestId, context: ctx } = pendingRequest;
    if (handledTileRequestIdRef.current === requestId) {
      return;
    }

    const runId = ++loadRunIdRef.current;
    const isCurrentRun = () =>
      isMountedRef.current && loadRunIdRef.current === runId;

    let image = tilesetImageCache.get(ctx.tilesetId);
    if (!image) {
      image = (await loadTilesetImage(ctx.tilesetId, ctx.assetId)) ?? undefined;
    }
    if (!image || !isCurrentRun()) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = ctx.sw;
    canvas.height = ctx.sh;
    const context = canvas.getContext("2d");
    if (!context || !isCurrentRun()) {
      return;
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      ctx.sx,
      ctx.sy,
      ctx.sw,
      ctx.sh,
      0,
      0,
      ctx.sw,
      ctx.sh,
    );
    const imageData = context.getImageData(0, 0, ctx.sw, ctx.sh);
    if (!isCurrentRun()) {
      return;
    }

    const savedPalettes = projectId ? loadPaletteLibrary(projectId) : null;
    editor.initProject(ctx.sw, ctx.sh, savedPalettes ?? undefined);
    if (!isCurrentRun()) {
      return;
    }

    if (isImageEditorStoreReady()) {
      const state = getImageEditorStore().getState();
      if (state.frames.length > 0) {
        editor.setFrameData(state.frames[0].id, imageData);
        editor.markSavePoint();
      }
    }

    if (!isCurrentRun()) {
      return;
    }

    handledTileRequestIdRef.current = requestId;
    clearTileEditorContext(requestId);
    onRequestLoaded();
    setActiveImageLayerCtx(null);
    setActiveTileCtx(ctx);
  }, [editor, onRequestLoaded, projectId]);

  const loadPendingImageLayerRequest = useCallback(async () => {
    const pendingRequest = getPendingImageLayerEditorRequest();
    if (!pendingRequest) {
      return;
    }

    const { requestId, context: ctx } = pendingRequest;
    if (handledImageLayerRequestIdRef.current === requestId) {
      return;
    }

    const runId = ++loadRunIdRef.current;
    const isCurrentRun = () =>
      isMountedRef.current && loadRunIdRef.current === runId;

    let image = imageLayerImageCache.get(ctx.assetId);
    if (!image) {
      image = (await loadImageLayerImage(ctx.assetId)) ?? undefined;
    }
    if (!image || !isCurrentRun()) {
      return;
    }

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const width = ctx.width > 0 ? ctx.width : sourceWidth;
    const height = ctx.height > 0 ? ctx.height : sourceHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context || !isCurrentRun()) {
      return;
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      0,
      0,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    );
    const imageData = context.getImageData(0, 0, width, height);
    if (!isCurrentRun()) {
      return;
    }

    const savedPalettes = projectId ? loadPaletteLibrary(projectId) : null;
    editor.initProject(width, height, savedPalettes ?? undefined);
    if (!isCurrentRun()) {
      return;
    }

    if (isImageEditorStoreReady()) {
      const state = getImageEditorStore().getState();
      if (state.frames.length > 0) {
        editor.setFrameData(state.frames[0].id, imageData);
        editor.markSavePoint();
      }
    }

    if (!isCurrentRun()) {
      return;
    }

    handledImageLayerRequestIdRef.current = requestId;
    clearImageLayerEditorContext(requestId);
    onRequestLoaded();
    setActiveTileCtx(null);
    setActiveImageLayerCtx(ctx);
  }, [editor, onRequestLoaded, projectId]);

  const loadPendingEditorRequest = useCallback(async () => {
    if (getPendingImageLayerEditorRequest()) {
      await loadPendingImageLayerRequest();
      return;
    }

    await loadPendingTileRequest();
  }, [loadPendingImageLayerRequest, loadPendingTileRequest]);

  useEffect(() => {
    isMountedRef.current = true;
    const pendingLoadTimer = window.setTimeout(() => {
      void loadPendingEditorRequest();
    }, 0);

    function handleOpenImageEditor() {
      void loadPendingEditorRequest();
    }

    window.addEventListener("open-image-editor", handleOpenImageEditor);

    return () => {
      isMountedRef.current = false;
      loadRunIdRef.current += 1;
      window.clearTimeout(pendingLoadTimer);
      window.removeEventListener("open-image-editor", handleOpenImageEditor);
    };
  }, [loadPendingEditorRequest]);

  return {
    activeImageLayerCtx,
    activeTileCtx,
    setActiveImageLayerCtx,
    setActiveTileCtx,
  };
}
