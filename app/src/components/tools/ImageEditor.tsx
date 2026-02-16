import { useState, useCallback, useEffect } from "react";
import { useImageEditor } from "@/hooks/use-image-editor";
import { NewImageDialog } from "./image-editor/NewImageDialog";
import { ImageCanvas } from "./image-editor/ImageCanvas";
import { ToolSidebar } from "./image-editor/ToolSidebar";
import { EditorToolbar } from "./image-editor/EditorToolbar";
import { PalettePanel } from "./image-editor/PalettePanel";
import { FramesPanel } from "./image-editor/FramesPanel";
import { ExportDialog } from "./image-editor/ExportDialog";
import type { ImageEditorTool } from "@/types/image-editor";

export function ImageEditor() {
  const editor = useImageEditor();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);

  const handleCreate = useCallback(
    (w: number, h: number) => {
      editor.initProject(w, h);
      setShowNewDialog(false);
    },
    [editor],
  );

  const handleNew = useCallback(() => {
    setShowNewDialog(true);
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

      // Undo / redo
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "z" && !ev.shiftKey) {
        ev.preventDefault();
        const restored = editor.undoPixels();
        if (restored) {
          const frameId = editor.getCurrentFrameId();
          if (frameId) {
            editor.setFrameData(frameId, restored);
          }
        } else {
          // Nothing to undo in pixels — try undoing frame operation
          editor.undoFrameOp();
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "z" && ev.shiftKey) {
        ev.preventDefault();
        const restored = editor.redoPixels();
        if (restored) {
          const frameId = editor.getCurrentFrameId();
          if (frameId) {
            editor.setFrameData(frameId, restored);
          }
        } else {
          // Nothing to redo in pixels — try redoing frame operation
          editor.redoFrameOp();
        }
        return;
      }

      // Tool shortcuts
      const tool = shortcuts[ev.key.toLowerCase()];
      if (tool) {
        editor.setTool(tool);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

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
    palette,
    isPlaying,
    fps,
    onionSkin,
    selection,
  } = editor.state;

  const currentFrameId = editor.getCurrentFrameId();
  const currentFrameData = editor.getCurrentFrameData();
  const previousFrameData = editor.getPreviousFrameData();

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <EditorToolbar
        zoom={zoom}
        brushSize={brushSize}
        tool={tool}
        blurSize={blurSize}
        blurIntensity={blurIntensity}
        onZoom={editor.setZoom}
        onBrushSize={editor.setBrushSize}
        onBlurSize={editor.setBlurSize}
        onBlurIntensity={editor.setBlurIntensity}
        onNew={handleNew}
        onResize={handleResize}
        onExportPng={editor.exportPng}
        onExportGif={editor.exportGif}
        onExportSpriteSheet={() => setShowExportSheet(true)}
      />

      {/* Middle area: sidebar + canvas + palette */}
      <div className="flex flex-1 min-h-0">
        {/* Tool sidebar */}
        <ToolSidebar currentTool={tool} onSelectTool={editor.setTool} />

        {/* Canvas */}
        <div className="relative flex-1 min-w-0">
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
            currentFrameData={currentFrameData}
            previousFrameData={previousFrameData}
            onionSkin={onionSkin}
            selection={selection}
            onZoom={editor.setZoom}
            onPushUndo={editor.pushUndoSnapshot}
            onSelectionChange={editor.setSelection}
            onFrameDataChange={editor.setFrameData}
          />
        </div>

        {/* Palette panel */}
        <PalettePanel
          colors={palette.colors}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          onSelectPrimary={editor.setPrimaryColor}
          onSelectSecondary={editor.setSecondaryColor}
          onAddColor={editor.addPaletteColor}
          onRemoveColor={editor.removePaletteColor}
          onUpdateColor={editor.updatePaletteColor}
          onImport={editor.importPalette}
          onExport={editor.exportPalette}
          onReset={editor.resetPalette}
        />
      </div>

      {/* Frames panel at bottom */}
      <FramesPanel
        frames={frames}
        currentFrameIndex={currentFrameIndex}
        isPlaying={isPlaying}
        fps={fps}
        onionSkin={onionSkin}
        canvasWidth={width}
        canvasHeight={height}
        getFrameData={editor.getFrameData}
        onSelectFrame={editor.setCurrentFrame}
        onAddFrame={editor.addFrame}
        onDuplicateFrame={editor.duplicateFrame}
        onDeleteFrame={editor.deleteFrame}
        onPlay={editor.playAnimation}
        onStop={editor.stopAnimation}
        onSetFps={editor.setFps}
        onSetOnionSkin={editor.setOnionSkin}
      />

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
      <ExportDialog
        open={showExportSheet}
        totalFrames={frames.length}
        onClose={() => setShowExportSheet(false)}
        onExportSpriteSheet={editor.exportSpriteSheet}
      />
    </div>
  );
}
