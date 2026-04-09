import { useState, useCallback, useEffect, useRef } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useImageEditor } from "@/hooks/use-image-editor";
import { useEditorStore } from "@/hooks/use-editor-store";
import { loadPaletteLibrary, savePaletteLibrary, saveAsset } from "@/lib/db";
import { getActivePalette } from "@/types/image-editor";
import type {
  ImageLayerEditorContext,
  TileEditorContext,
} from "@/types/editor-helpers";
import { generateAssetId, generateTilesetId } from "@/lib/ids";
import {
  clearImageLayerEditorContext,
  getPendingImageLayerEditorRequest,
} from "@/lib/image-layer-editor-context";
import {
  clearTileEditorContext,
  getPendingTileEditorRequest,
} from "@/lib/tile-editor-context";
import {
  evictImageLayer,
  imageLayerImageCache,
  loadImageLayerImage,
  tilesetImageCache,
  loadTilesetImage,
  evictTileset,
} from "@/components/editor/MapCanvas/texture-cache";
import {
  isImageEditorStoreReady,
  getImageEditorStore,
} from "@/lib/image-editor-store";
import { NewImageDialog } from "./NewImageDialog";
import { ImageCanvas } from "./ImageCanvas";
import { ToolSidebar } from "./ToolSidebar";
import { EditorToolbar } from "./EditorToolbar";
import { PalettePanel } from "./PalettePanel";
import { TimelinePanel } from "./TimelinePanel";
import { SaveFormatDialog } from "./SaveFormatDialog";
import type { ImageEditorTool } from "@/types/image-editor";

export function ImageEditor() {
  const editor = useImageEditor();
  const { state: mainState, setState: setMainState } = useEditorStore();
  const projectId = mainState.project?.id;
  const prevProjectIdRef = useRef<string | undefined>(undefined);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  /** Context set by MapPanel when opening a specific tile for editing. */
  const [activeTileCtx, setActiveTileCtx] = useState<TileEditorContext | null>(
    null,
  );
  const [activeImageLayerCtx, setActiveImageLayerCtx] =
    useState<ImageLayerEditorContext | null>(null);
  const handledTileRequestIdRef = useRef<number | null>(null);
  const handledImageLayerRequestIdRef = useRef<number | null>(null);
  const loadRunIdRef = useRef(0);
  const isMountedRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Load any pending map-tile request on mount or while the editor is already open.
  // ---------------------------------------------------------------------------
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

    let img = tilesetImageCache.get(ctx.tilesetId);
    if (!img) {
      img = (await loadTilesetImage(ctx.tilesetId, ctx.assetId)) ?? undefined;
    }
    if (!img || !isCurrentRun()) {
      return;
    }

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = ctx.sw;
    tmpCanvas.height = ctx.sh;
    const tmpCtx = tmpCanvas.getContext("2d");
    if (!tmpCtx || !isCurrentRun()) {
      return;
    }

    tmpCtx.imageSmoothingEnabled = false;
    tmpCtx.drawImage(img, ctx.sx, ctx.sy, ctx.sw, ctx.sh, 0, 0, ctx.sw, ctx.sh);
    const imageData = tmpCtx.getImageData(0, 0, ctx.sw, ctx.sh);
    if (!isCurrentRun()) {
      return;
    }

    const savedPalettes = projectId ? loadPaletteLibrary(projectId) : null;
    editor.initProject(ctx.sw, ctx.sh, savedPalettes ?? undefined);
    if (!isCurrentRun()) {
      return;
    }

    if (isImageEditorStoreReady()) {
      const s = getImageEditorStore().getState();
      if (s.frames.length > 0) {
        editor.setFrameData(s.frames[0].id, imageData);
      }
    }

    if (!isCurrentRun()) {
      return;
    }

    handledTileRequestIdRef.current = requestId;
    clearTileEditorContext(requestId);
    setShowNewDialog(false);
    setActiveImageLayerCtx(null);
    setActiveTileCtx(ctx);
  }, [editor, projectId]);

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

    let img = imageLayerImageCache.get(ctx.assetId);
    if (!img) {
      img = (await loadImageLayerImage(ctx.assetId)) ?? undefined;
    }
    if (!img || !isCurrentRun()) {
      return;
    }

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const width = ctx.width > 0 ? ctx.width : sourceWidth;
    const height = ctx.height > 0 ? ctx.height : sourceHeight;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    const tmpCtx = tmpCanvas.getContext("2d");
    if (!tmpCtx || !isCurrentRun()) {
      return;
    }

    tmpCtx.imageSmoothingEnabled = false;
    tmpCtx.drawImage(img, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    const imageData = tmpCtx.getImageData(0, 0, width, height);
    if (!isCurrentRun()) {
      return;
    }

    const savedPalettes = projectId ? loadPaletteLibrary(projectId) : null;
    editor.initProject(width, height, savedPalettes ?? undefined);
    if (!isCurrentRun()) {
      return;
    }

    if (isImageEditorStoreReady()) {
      const s = getImageEditorStore().getState();
      if (s.frames.length > 0) {
        editor.setFrameData(s.frames[0].id, imageData);
      }
    }

    if (!isCurrentRun()) {
      return;
    }

    handledImageLayerRequestIdRef.current = requestId;
    clearImageLayerEditorContext(requestId);
    setShowNewDialog(false);
    setActiveTileCtx(null);
    setActiveImageLayerCtx(ctx);
  }, [editor, projectId]);

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

  const handleCreate = useCallback(
    (w: number, h: number) => {
      const savedPalettes = projectId ? loadPaletteLibrary(projectId) : null;
      editor.initProject(w, h, savedPalettes ?? undefined);
      setShowNewDialog(false);
    },
    [editor, projectId],
  );

  const handleNew = useCallback(() => {
    setShowNewDialog(true);
    // Clear tile context so Save opens the format dialog, not a tileset write
    setActiveTileCtx(null);
    setActiveImageLayerCtx(null);
  }, []);

  const handleResize = useCallback(() => {
    setShowResizeDialog(true);
  }, []);

  const handleResizeConfirm = useCallback(
    (w: number, h: number) => {
      editor.resizeCanvas(w, h);
      setShowResizeDialog(false);
    },
    [editor],
  );

  // ---------------------------------------------------------------------------
  // Save — writes changes back ONLY to the specific map tile instance by
  // creating (or updating) a per-tile override tileset.  The source tileset is
  // never modified.
  // ---------------------------------------------------------------------------

  const handleSaveTile = useCallback(
    async (ctx: TileEditorContext) => {
      const frameData = editor.getCurrentFrameData();
      if (!frameData) return;

      // Render the edited frame into a standalone canvas (tile dimensions only)
      const canvas = document.createElement("canvas");
      canvas.width = ctx.sw;
      canvas.height = ctx.sh;
      const canvasCtx = canvas.getContext("2d");
      if (!canvasCtx) return;
      canvasCtx.imageSmoothingEnabled = false;
      canvasCtx.putImageData(frameData, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) return;

      const buffer = await blob.arrayBuffer();
      const newAssetId = generateAssetId();
      await saveAsset(newAssetId, buffer, "image/png");

      setMainState((draft) => {
        if (!draft.project) return;

        // Ensure overrideTilesets array exists
        if (!draft.project.overrideTilesets)
          draft.project.overrideTilesets = [];

        // Check whether this tile already points to an existing override tileset
        const existingOverride = draft.project.overrideTilesets.find(
          (t) => t.id === ctx.tilesetId,
        );

        let overrideTilesetId = existingOverride?.id;

        if (existingOverride) {
          // Re-use the same override tileset, just swap the asset
          existingOverride.assetId = newAssetId;
        } else {
          // Create a new single-tile override tileset
          const newId = generateTilesetId();
          overrideTilesetId = newId;
          // Borrow groupId from the source tileset (or use existing group)
          const sourceTileset = [
            ...draft.project.tilesets,
            ...draft.project.overrideTilesets,
          ].find((t) => t.id === ctx.tilesetId);
          draft.project.overrideTilesets.push({
            id: newId,
            name: `__override__`,
            groupId:
              sourceTileset?.groupId ?? draft.project.tilesetGroups[0]!.id,
            tileSize: sourceTileset?.tileSize ?? draft.tileSize,
            assetId: newAssetId,
            imageWidth: ctx.sw,
            imageHeight: ctx.sh,
            createdAt: Date.now(),
          });
        }

        // Evict the stale cache entry for the override tileset so MapCanvas
        // reloads from the new assetId on the next render.
        if (overrideTilesetId) evictTileset(overrideTilesetId);

        // Update ONLY the specific tile in the specific layer
        const layer = draft.project.layers.find((l) => l.id === ctx.layerId);
        if (layer && overrideTilesetId) {
          layer.tiles[`${ctx.tileX},${ctx.tileY}`] = {
            tilesetId: overrideTilesetId,
            sx: 0,
            sy: 0,
            sw: ctx.sw,
            sh: ctx.sh,
          };
        }
      });
    },
    [editor, setMainState],
  );

  const handleSaveImageLayer = useCallback(
    async (ctx: ImageLayerEditorContext) => {
      const frameData = editor.getCurrentFrameData();
      if (!frameData) return;

      const canvas = document.createElement("canvas");
      canvas.width = frameData.width;
      canvas.height = frameData.height;
      const canvasCtx = canvas.getContext("2d");
      if (!canvasCtx) return;
      canvasCtx.imageSmoothingEnabled = false;
      canvasCtx.putImageData(frameData, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) return;

      const buffer = await blob.arrayBuffer();
      const newAssetId = generateAssetId();
      await saveAsset(newAssetId, buffer, "image/png");

      let didUpdateLayer = false;
      setMainState((draft) => {
        const imageLayer = (draft.project?.imageLayers ?? []).find(
          (layer) => layer.id === ctx.layerId,
        );
        if (!imageLayer) return;

        imageLayer.assetId = newAssetId;
        imageLayer.width = frameData.width;
        imageLayer.height = frameData.height;
        didUpdateLayer = true;
      });

      if (!didUpdateLayer) {
        return;
      }

      evictImageLayer(ctx.assetId);
      setActiveImageLayerCtx((current) =>
        current && current.layerId === ctx.layerId
          ? { ...current, assetId: newAssetId }
          : current,
      );
    },
    [editor, setMainState],
  );

  const handleSave = useCallback(() => {
    if (activeImageLayerCtx) {
      void handleSaveImageLayer(activeImageLayerCtx);
    } else if (activeTileCtx) {
      void handleSaveTile(activeTileCtx);
    } else {
      setShowSaveDialog(true);
    }
  }, [
    activeImageLayerCtx,
    activeTileCtx,
    handleSaveImageLayer,
    handleSaveTile,
  ]);

  // Restore palette library when the active project changes
  useEffect(() => {
    if (!projectId || projectId === prevProjectIdRef.current) return;
    prevProjectIdRef.current = projectId;
    const savedPalettes = loadPaletteLibrary(projectId);
    if (savedPalettes && savedPalettes.length > 0) {
      editor.restorePaletteLibrary(savedPalettes);
    }
  }, [projectId, editor]);

  // Persist palette library to localStorage whenever it changes
  useEffect(() => {
    if (!projectId || !editor.state?.palettes) return;
    savePaletteLibrary(projectId, editor.state.palettes);
  }, [editor.state?.palettes, projectId]);

  // Keyboard shortcuts for tools
  useEffect(() => {
    const shortcuts: Record<string, ImageEditorTool> = {
      s: "selection",
      b: "pencil",
      e: "eraser",
      v: "move",
      g: "paint-bucket",
      l: "line",
      r: "rectangle",
      u: "contour",
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        ev.target instanceof HTMLInputElement ||
        ev.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Undo / redo — stop immediate propagation so the global map-editor
      // keyboard handler doesn't also fire controls.back() for the same event.
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "z" && !ev.shiftKey) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        editor.performUndo();
        return;
      }
      if (
        (ev.ctrlKey || ev.metaKey) &&
        (ev.key === "y" || (ev.key === "z" && ev.shiftKey))
      ) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        editor.performRedo();
        return;
      }

      // Save
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "s") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        handleSave();
        return;
      }

      // Tool shortcuts
      const tool = shortcuts[ev.key.toLowerCase()];
      if (tool) {
        editor.setTool(tool);
      }
    };

    // Use capture phase so this fires before the global map-editor handler,
    // and stopImmediatePropagation() prevents it from also calling controls.back().
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [editor, handleSave]);

  // Not initialized yet — show dialog only
  if (!editor.state) {
    return (
      <>
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Create an image to begin.
        </div>
        <NewImageDialog
          open={showNewDialog}
          onClose={() => setShowNewDialog(false)}
          onCreate={handleCreate}
        />
      </>
    );
  }

  const {
    width,
    height,
    zoom,
    tool,
    primaryColor,
    secondaryColor,
    brushSize,
    blurSize,
    blurIntensity,
    frames,
    currentFrameIndex,
    palettes,
    activePaletteId,
    isPlaying,
    fps,
    onionSkin,
    selection,
  } = editor.state;

  const currentFrameId = editor.getCurrentFrameId();
  const activeLayerData = editor.getActiveLayerData();
  const belowComposite = editor.getCompositeBelowActiveLayer();
  const aboveComposite = editor.getCompositeAboveActiveLayer();
  const previousFrameData = editor.getPreviousFrameData();

  // Determine whether the active layer is locked
  const activeLayerId = editor.state?.activeLayerId as
    | string
    | null
    | undefined;
  const isLayerLocked = (() => {
    if (!activeLayerId || !editor.state) return false;
    const layer = editor.state.layers.find(
      (l) => (l.id as string) === activeLayerId,
    );
    if (layer) return layer.locked;
    const imgLayer = editor.state.imageLayers.find(
      (l) => (l.id as string) === activeLayerId,
    );
    return imgLayer?.locked ?? false;
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <EditorToolbar
        zoom={zoom}
        brushSize={brushSize}
        tool={tool}
        blurSize={blurSize}
        blurIntensity={blurIntensity}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onZoom={editor.setZoom}
        onBrushSize={editor.setBrushSize}
        onBlurSize={editor.setBlurSize}
        onBlurIntensity={editor.setBlurIntensity}
        onNew={handleNew}
        onResize={handleResize}
        onSave={handleSave}
        onUndo={editor.performUndo}
        onRedo={editor.performRedo}
      />

      {/* Main resizable area: top (canvas+sidebar+palette) / bottom (layers+frames) */}
      <Group
        orientation="vertical"
        id="image-editor-vertical"
        className="flex-1 min-h-0"
      >
        {/* Top section: sidebar + canvas + palette */}
        <Panel defaultSize="70%" minSize="40%">
          <div className="flex h-full min-h-0">
            {/* Tool sidebar */}
            <ToolSidebar currentTool={tool} onSelectTool={editor.setTool} />

            {/* Canvas + Palette with resizable divider */}
            <Group
              orientation="horizontal"
              id="image-editor-layout"
              className="flex-1 min-w-0"
            >
              {/* Canvas */}
              <Panel defaultSize="75%" minSize="30%">
                <div className="relative h-full w-full flex">
                  <ImageCanvas
                    width={width}
                    height={height}
                    zoom={zoom}
                    tool={tool}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                    brushSize={brushSize}
                    blurSize={blurSize}
                    blurIntensity={blurIntensity}
                    currentFrameId={currentFrameId}
                    activeLayerData={activeLayerData}
                    belowComposite={belowComposite}
                    aboveComposite={aboveComposite}
                    previousFrameData={previousFrameData}
                    onionSkin={onionSkin}
                    selection={selection}
                    isLayerLocked={isLayerLocked}
                    onZoom={editor.setZoom}
                    onPushUndo={editor.pushUndoSnapshot}
                    onSelectionChange={editor.setSelection}
                    onFrameDataChange={editor.setFrameData}
                  />
                </div>
              </Panel>

              <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

              {/* Right-side panel: Palette */}
              <Panel defaultSize="25%" minSize="10%" maxSize="60%">
                <PalettePanel
                  palettes={palettes}
                  activePaletteId={activePaletteId}
                  onSwitchPalette={editor.switchPalette}
                  onRenamePalette={editor.renamePalette}
                  onDeletePalette={editor.deletePalette}
                  onDuplicatePalette={editor.duplicatePalette}
                  colors={getActivePalette(editor.state).colors}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  onSelectPrimary={editor.setPrimaryColor}
                  onSelectSecondary={editor.setSecondaryColor}
                  onAddColor={editor.addPaletteColor}
                  onRemoveColor={editor.removePaletteColor}
                  onUpdateColor={editor.updatePaletteColor}
                  onReorderColors={editor.reorderPaletteColors}
                  onImport={editor.importPalette}
                  onExport={editor.exportPalette}
                  onReset={editor.resetPalette}
                />
              </Panel>
            </Group>
          </div>
        </Panel>

        <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors" />

        {/* Bottom section: unified layers + frames timeline */}
        <Panel defaultSize="30%" minSize="15%">
          <TimelinePanel
            frames={frames}
            currentFrameIndex={currentFrameIndex}
            isPlaying={isPlaying}
            fps={fps}
            onionSkin={onionSkin}
            canvasWidth={width}
            canvasHeight={height}
            onSelectFrame={editor.setCurrentFrame}
            onAddFrame={editor.addFrame}
            onDuplicateFrame={editor.duplicateFrame}
            onDeleteFrame={editor.deleteFrame}
            onMoveFrame={editor.moveFrame}
            onPlay={editor.playAnimation}
            onStop={editor.stopAnimation}
            onSetFps={editor.setFps}
            onSetOnionSkin={editor.setOnionSkin}
          />
        </Panel>
      </Group>

      {/* Dialogs */}
      <NewImageDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreate={handleCreate}
      />
      <NewImageDialog
        open={showResizeDialog}
        onClose={() => setShowResizeDialog(false)}
        onCreate={handleResizeConfirm}
        initialWidth={width}
        initialHeight={height}
      />
      <SaveFormatDialog
        open={showSaveDialog}
        totalFrames={frames.length}
        onClose={() => setShowSaveDialog(false)}
        onSavePng={editor.exportPng}
        onSaveGif={editor.exportGif}
        onSaveSpriteSheet={editor.exportSpriteSheet}
      />
    </div>
  );
}
