import { useState, useCallback, useEffect, useRef } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useImageEditor } from "@/features/image-editor/hooks/use-image-editor";
import { useImageEditorRequestLoader } from "@/features/image-editor/hooks/use-image-editor-request-loader";
import { useImageEditorSaveActions } from "@/features/image-editor/hooks/use-image-editor-save-actions";
import { useEditorStore } from "@/hooks/use-editor-store";
import { loadPaletteLibrary, savePaletteLibrary } from "@/services/db";
import { getActivePalette } from "@/features/image-editor/types";
import type { ImageEditorProps } from "@/features/image-editor/types/image-editor-ui";
import { NewImageDialog } from "./NewImageDialog";
import { ImageCanvas } from "./ImageCanvas";
import { ToolSidebar } from "./ToolSidebar";
import { EditorToolbar } from "./EditorToolbar";
import { LospecPaletteDialog } from "./LospecPaletteDialog";
import { PalettePanel } from "./PalettePanel";
import { TimelinePanel } from "./TimelinePanel";
import { SaveFormatDialog } from "./SaveFormatDialog";
import { Button } from "@/components/ui/Button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import type { ImageEditorTool } from "@/features/image-editor/types";
import { resetCropState } from "@/features/image-editor/lib/image-editor-tools";

export function ImageEditor({ onRequestClose }: ImageEditorProps) {
  const editor = useImageEditor();
  const { state: mainState } = useEditorStore();
  const projectId = mainState.project?.id;
  const prevProjectIdRef = useRef<string | undefined>(undefined);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLospecDialog, setShowLospecDialog] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isClosingAfterSave, setIsClosingAfterSave] = useState(false);
  const {
    activeImageLayerCtx,
    activeTileCtx,
    setActiveImageLayerCtx,
    setActiveTileCtx,
  } = useImageEditorRequestLoader(editor, projectId, () => {
    setShowNewDialog(false);
  });
  const {
    closeAfterSaveRef,
    handleCloseSaveDialog,
    handleExportGif,
    handleExportPng,
    handleExportSpriteSheet,
    handleOpenExportDialog,
    handleSave,
    requestEditorClose,
  } = useImageEditorSaveActions(
    editor,
    activeTileCtx,
    activeImageLayerCtx,
    setActiveImageLayerCtx,
    onRequestClose,
    setShowUnsavedDialog,
    setIsClosingAfterSave,
    setShowSaveDialog,
  );

  useEffect(() => {
    if (!onRequestClose) return;

    const handleCloseRequest = () => {
      requestEditorClose();
    };

    window.addEventListener("image-editor-request-close", handleCloseRequest);
    return () => {
      window.removeEventListener(
        "image-editor-request-close",
        handleCloseRequest,
      );
    };
  }, [onRequestClose, requestEditorClose]);

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
  }, [setActiveImageLayerCtx, setActiveTileCtx]);

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

  const handleCancelCrop = useCallback(() => {
    resetCropState();
    editor.setSelection(null);
  }, [editor]);

  const handleApplyCrop = useCallback(() => {
    const cropSelection = editor.state?.selection;
    const frameId = editor.getCurrentFrameId();
    const layerData = editor.getActiveLayerData();
    if (!cropSelection || !frameId || !layerData) return;

    const minX = Math.max(0, cropSelection.x);
    const minY = Math.max(0, cropSelection.y);
    const maxX = Math.min(
      layerData.width,
      cropSelection.x + cropSelection.width,
    );
    const maxY = Math.min(
      layerData.height,
      cropSelection.y + cropSelection.height,
    );
    if (maxX <= minX || maxY <= minY) return;

    editor.pushUndoSnapshot();

    const nextData = new ImageData(
      new Uint8ClampedArray(layerData.data),
      layerData.width,
      layerData.height,
    );

    for (let y = 0; y < layerData.height; y += 1) {
      for (let x = 0; x < layerData.width; x += 1) {
        if (x >= minX && x < maxX && y >= minY && y < maxY) {
          continue;
        }
        const index = (y * layerData.width + x) * 4;
        nextData.data[index] = 0;
        nextData.data[index + 1] = 0;
        nextData.data[index + 2] = 0;
        nextData.data[index + 3] = 0;
      }
    }

    editor.setFrameData(frameId, nextData);
    resetCropState();
    editor.setSelection(null);
  }, [editor]);

  const handleSaveAndClose = useCallback(async () => {
    closeAfterSaveRef.current = true;

    if (activeImageLayerCtx || activeTileCtx) {
      setIsClosingAfterSave(true);
      const didSave = await handleSave();
      if (!didSave) {
        closeAfterSaveRef.current = false;
        setIsClosingAfterSave(false);
      }
      return;
    }

    setShowUnsavedDialog(false);
    setShowSaveDialog(true);
  }, [activeImageLayerCtx, activeTileCtx, closeAfterSaveRef, handleSave]);

  const handleDiscardAndClose = useCallback(() => {
    closeAfterSaveRef.current = false;
    setShowUnsavedDialog(false);
    onRequestClose?.();
  }, [closeAfterSaveRef, onRequestClose]);

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
      c: "crop",
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
        void handleSave();
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
  const canApplyCrop =
    tool === "crop" &&
    !!selection &&
    selection.width > 0 &&
    selection.height > 0;
  const canSaveToContext = !!(activeImageLayerCtx || activeTileCtx);

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
        tool={tool}
        blurIntensity={blurIntensity}
        canApplyCrop={canApplyCrop}
        canSave={canSaveToContext}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onZoom={editor.setZoom}
        onBlurIntensity={editor.setBlurIntensity}
        onApplyCrop={handleApplyCrop}
        onCancelCrop={handleCancelCrop}
        onNew={handleNew}
        onResize={handleResize}
        onSave={handleSave}
        onExport={handleOpenExportDialog}
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
            <ToolSidebar
              currentTool={tool}
              brushSize={brushSize}
              blurSize={blurSize}
              onSelectTool={editor.setTool}
              onBrushSize={editor.setBrushSize}
              onBlurSize={editor.setBlurSize}
            />

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
                    onResizeCanvas={editor.resizeCanvas}
                  />
                </div>
              </Panel>

              <Separator className="w-1.5 bg-border-visible/90 hover:bg-primary/50 transition-colors" />

              {/* Right-side panel: Palette */}
              <Panel defaultSize="25%" minSize="10%" maxSize="60%">
                <PalettePanel
                  palettes={palettes}
                  activePaletteId={activePaletteId}
                  onSwitchPalette={editor.switchPalette}
                  onOpenLospecDialog={() => setShowLospecDialog(true)}
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

        <Separator className="h-1.5 bg-border-visible/90 hover:bg-primary/50 transition-colors" />

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
        onClose={handleCloseSaveDialog}
        onSavePng={handleExportPng}
        onSaveGif={handleExportGif}
        onSaveSpriteSheet={handleExportSpriteSheet}
      />
      <LospecPaletteDialog
        open={showLospecDialog}
        onOpenChange={setShowLospecDialog}
        onImportPalette={editor.importLospecPalette}
      />
      <AlertDialog open={showUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes before closing?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved image changes. Save them before closing the
              Image/Sprite Editor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                closeAfterSaveRef.current = false;
                setShowUnsavedDialog(false);
                setIsClosingAfterSave(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={handleDiscardAndClose}>
              Don't Save
            </Button>
            <Button
              onClick={() => void handleSaveAndClose()}
              disabled={isClosingAfterSave}
            >
              {isClosingAfterSave ? "Saving..." : "Save"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
