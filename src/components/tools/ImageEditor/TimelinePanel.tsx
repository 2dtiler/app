/**
 * TimelinePanel — unified layers + frames grid for the Image / Sprite Editor.
 *
 * Layout (Aseprite-style):
 *   [sticky layer name]  [frame cell] [frame cell] …
 *   [sticky layer name]  [frame cell] [frame cell] …
 *   ─────────────────────────────────────────────────
 *   [+ Add Layer]     │  [copy][del][▶] FPS [6] onion
 *
 * A single `overflow: auto` container holds every row. Each layer-name cell
 * is `position: sticky; left: 0` so it never scrolls away horizontally, and
 * vertical scroll syncs naturally because the names are part of the same row.
 */

import { useRef, useEffect, useState } from "react";
import {
  Plus,
  Copy,
  Trash2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Label } from "@/components/ui/Label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/Tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import type { TimelinePanelProps } from "@/types/image-editor/image-editor-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { AddLayerDialog } from "@/components/dialogs/AddLayerDialog";
import { useImageEditor } from "@/hooks/use-image-editor";
import {
  buildImageEditorDisplayTree,
  isImageEditorAncestorOf,
} from "@/lib/layers";
import { LayerRow } from "@/components/editor/LayersPanel/LayerRow";
import { GroupRow } from "@/components/editor/LayersPanel/GroupRow";
import { cn } from "@/lib/utils";
import type { Frame, FrameId } from "@/types/image-editor";

// ─── constants ────────────────────────────────────────────────────────────────

/** Pixel height of every timeline row. Must match frame-cell height. */
const ROW_H = 64;
/** Default pixel width of the sticky layer-name column. User can drag to resize. */
const DEFAULT_NAME_W = 240;
/** Thumbnail size rendered inside each frame cell. */
const THUMB = 40;

// ─── FrameCell ────────────────────────────────────────────────────────────────

function FrameCell({
  layerId,
  isGroup,
  frame,
  frameIndex,
  frameCount,
  isActiveFrame,
  isActiveLayer,
  canvasWidth,
  canvasHeight,
  getLayerFrameData,
  onSelect,
  onDelete,
  onDuplicate,
  onMoveLeft,
  onMoveRight,
}: {
  layerId: string;
  isGroup: boolean;
  frame: Frame;
  frameIndex: number;
  frameCount: number;
  isActiveFrame: boolean;
  isActiveLayer: boolean;
  canvasWidth: number;
  canvasHeight: number;
  getLayerFrameData: (frameId: FrameId, layerId: string) => ImageData | null;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw the thumbnail whenever frame data changes (runs after every render).
  useEffect(() => {
    if (isGroup) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, THUMB, THUMB);

    const data = getLayerFrameData(frame.id, layerId);
    if (!data) return;

    const tmp = document.createElement("canvas");
    tmp.width = canvasWidth;
    tmp.height = canvasHeight;
    const tmpCtx = tmp.getContext("2d")!;
    tmpCtx.putImageData(data, 0, 0);

    const scale = Math.min(THUMB / canvasWidth, THUMB / canvasHeight);
    const dw = canvasWidth * scale;
    const dh = canvasHeight * scale;
    const dx = (THUMB - dw) / 2;
    const dy = (THUMB - dh) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, dx, dy, dw, dh);
  });

  const isCurrent = isActiveFrame && isActiveLayer;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onSelect}
          onContextMenu={onSelect}
          style={{ width: ROW_H, height: ROW_H }}
          className={cn(
            "shrink-0 flex flex-col items-center justify-center gap-0.5 transition-colors border-r border-b border-border/30",
            isCurrent
              ? "bg-primary/20 ring-1 ring-inset ring-primary"
              : isActiveFrame
                ? "bg-primary/10"
                : isActiveLayer
                  ? "bg-accent/30"
                  : "hover:bg-accent/20",
          )}
        >
          {isGroup ? (
            <div
              style={{ width: THUMB, height: THUMB }}
              className="rounded border border-border/30 bg-muted/20"
            />
          ) : (
            <canvas
              ref={canvasRef}
              width={THUMB}
              height={THUMB}
              className="rounded border border-border bg-neutral-800"
              style={{ imageRendering: "pixelated" }}
            />
          )}
          <span className="text-[9px] text-muted-foreground leading-none">
            {frameIndex + 1}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="size-3 mr-2" />
          Duplicate Frame
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={frameIndex === 0} onClick={onMoveLeft}>
          <ChevronLeft className="size-3 mr-2" />
          Move Frame Left
        </ContextMenuItem>
        <ContextMenuItem
          disabled={frameIndex === frameCount - 1}
          onClick={onMoveRight}
        >
          <ChevronRight className="size-3 mr-2" />
          Move Frame Right
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={frameCount <= 1}
          onClick={onDelete}
        >
          <Trash2 className="size-3 mr-2" />
          Delete Frame
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ─── TimelinePanel ────────────────────────────────────────────────────────────

export function TimelinePanel({
  frames,
  currentFrameIndex,
  isPlaying,
  fps,
  onionSkin,
  canvasWidth,
  canvasHeight,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onMoveFrame,
  onPlay,
  onStop,
  onSetFps,
  onSetOnionSkin,
}: TimelinePanelProps) {
  const editor = useImageEditor();
  const state = editor.state;
  const rootRef = useRef<HTMLDivElement>(null);

  // ── layer panel state (mirrors ImageEditorLayersPanel) ──────────────────────
  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    isGroup: boolean;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragIsGroup, setDragIsGroup] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<{
    targetId: string;
    position: "above" | "below" | "inside";
  } | null>(null);

  // ── resizable layer-name column ─────────────────────────────────────────────
  const [nameW, setNameW] = useState(DEFAULT_NAME_W);
  const dividerDragRef = useRef<{
    active: boolean;
    startX: number;
    startW: number;
  }>({ active: false, startX: 0, startW: DEFAULT_NAME_W });
  const userResizedRef = useRef(false);
  const initializedWidthRef = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const applyInitialWidth = () => {
      if (userResizedRef.current || initializedWidthRef.current) return;
      const initialWidth = Math.round(root.clientWidth * 0.25);
      if (initialWidth <= 0) return;
      const clampedWidth = Math.max(160, Math.min(420, initialWidth));
      setNameW(clampedWidth);
      dividerDragRef.current.startW = clampedWidth;
      initializedWidthRef.current = true;
    };

    const resizeObserver = new ResizeObserver(() => {
      applyInitialWidth();
    });

    resizeObserver.observe(root);
    applyInitialWidth();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  function handleDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    userResizedRef.current = true;
    dividerDragRef.current = { active: true, startX: e.clientX, startW: nameW };

    function onMouseMove(ev: MouseEvent) {
      if (!dividerDragRef.current.active) return;
      const delta = ev.clientX - dividerDragRef.current.startX;
      setNameW(
        Math.max(100, Math.min(400, dividerDragRef.current.startW + delta)),
      );
    }

    function onMouseUp() {
      dividerDragRef.current.active = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  if (!state) return null;

  const layers = state.layers ?? [];
  const imageLayers = state.imageLayers ?? [];
  const layerGroups = state.layerGroups ?? [];
  const layerOrder = state.layerOrder ?? [];
  const totalItems = layers.length + imageLayers.length;

  const treeNodes = buildImageEditorDisplayTree(
    layerOrder,
    layers,
    imageLayers,
    layerGroups,
  );

  // ── drag-and-drop ───────────────────────────────────────────────────────────

  function handleDragStart(id: string, isGroup: boolean) {
    setDragId(id);
    setDragIsGroup(isGroup);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragIsGroup(false);
    setDropIndicator(null);
  }

  function handleDragOverRow(
    e: React.DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || dragId === targetId) {
      setDropIndicator(null);
      return;
    }
    if (dragIsGroup && isImageEditorAncestorOf(dragId, targetId, layerGroups)) {
      setDropIndicator(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    let position: "above" | "below" | "inside";
    if (targetIsGroup) {
      if (ratio < 0.25) position = "above";
      else if (ratio > 0.75) position = "below";
      else position = "inside";
    } else {
      position = ratio < 0.5 ? "above" : "below";
    }
    setDropIndicator({ targetId, position });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || !dropIndicator) {
      handleDragEnd();
      return;
    }
    editor.moveImageEditorLayerIntoOrder(
      dragId,
      dropIndicator.targetId,
      dropIndicator.position,
    );
    handleDragEnd();
  }

  // ── create / delete / rename ────────────────────────────────────────────────

  function handleCreateLayer(
    name: string,
    type: "tile" | "group" | "image" | "object",
  ) {
    if (type === "group") editor.addImageEditorLayerGroup(name);
    else if (type === "image") editor.addImageEditorImageLayer(name);
    else editor.addRasterLayer(name);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.isGroup) editor.deleteImageEditorGroup(deleteTarget.id);
    else editor.deleteImageEditorLayer(deleteTarget.id);
    setDeleteTarget(null);
  }

  function handleDoubleClick(id: string, name: string) {
    setRenamingId(id);
    setRenameValue(name);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) editor.renameImageEditorLayer(renamingId, name);
    setRenamingId(null);
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div
        ref={rootRef}
        className="relative flex flex-col h-full border-t border-border bg-card overflow-hidden"
      >
        {/* Draggable vertical divider between the layer-name column and frames */}
        <div
          className="absolute top-0 bottom-0 z-20 w-1.5 bg-border-visible/90 cursor-col-resize shadow-[0_0_0_1px_rgba(0,0,0,0.12)] hover:bg-primary/50 active:bg-primary/70 transition-colors"
          style={{ left: nameW - 2 }}
          onMouseDown={handleDividerMouseDown}
        />
        {/* ── Scrollable grid ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto min-h-0">
          {treeNodes.map((node) => {
            const isGroup = node.type === "group";
            const rowId = isGroup
              ? (node.group.id as string)
              : (node.layer.id as string);
            const isActiveLayer =
              !isGroup &&
              (node.layer.id as string) === (state.activeLayerId as string);

            return (
              <div
                key={rowId}
                className="flex border-b border-border/30"
                style={{ height: ROW_H }}
              >
                {/* Sticky layer-name cell */}
                <div
                  className={cn(
                    "shrink-0 border-r border-border z-10 flex items-center overflow-hidden",
                    isActiveLayer ? "bg-accent" : "bg-card",
                  )}
                  style={{
                    width: nameW,
                    minWidth: nameW,
                    position: "sticky",
                    left: 0,
                  }}
                >
                  {isGroup ? (
                    <GroupRow
                      group={node.group}
                      depth={node.depth}
                      parentGroupId={node.parentGroupId}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      onRenameValueChange={setRenameValue}
                      onDoubleClick={handleDoubleClick}
                      onCommitRename={commitRename}
                      onCancelRename={() => setRenamingId(null)}
                      onToggleExpand={editor.toggleImageEditorGroupExpanded}
                      onToggleVisibility={editor.toggleImageEditorLayerVisible}
                      onToggleLock={editor.toggleImageEditorLayerLocked}
                      onMove={editor.moveImageEditorLayerItem}
                      onDelete={(id, name) =>
                        setDeleteTarget({ id, name, isGroup: true })
                      }
                      onDuplicate={editor.duplicateImageEditorGroup}
                      isDragging={dragId === node.group.id}
                      dropIndicator={
                        dropIndicator?.targetId === node.group.id
                          ? dropIndicator.position
                          : null
                      }
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOverRow}
                      onDrop={handleDrop}
                    />
                  ) : (
                    <LayerRow
                      layer={node.layer}
                      depth={node.depth}
                      parentGroupId={node.parentGroupId}
                      isActive={isActiveLayer}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      onRenameValueChange={setRenameValue}
                      onDoubleClick={handleDoubleClick}
                      onCommitRename={commitRename}
                      onCancelRename={() => setRenamingId(null)}
                      onSelect={editor.setActiveImageEditorLayer}
                      onToggleVisibility={editor.toggleImageEditorLayerVisible}
                      onToggleLock={editor.toggleImageEditorLayerLocked}
                      onMove={editor.moveImageEditorLayerItem}
                      onDelete={(id, name) =>
                        setDeleteTarget({ id, name, isGroup: false })
                      }
                      onDuplicate={editor.duplicateImageEditorLayer}
                      isDragging={dragId === node.layer.id}
                      dropIndicator={
                        dropIndicator?.targetId === node.layer.id
                          ? dropIndicator.position
                          : null
                      }
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOverRow}
                      onDrop={handleDrop}
                    />
                  )}
                </div>

                {/* Frame cells for this layer */}
                {frames.map((frame, i) => (
                  <FrameCell
                    key={frame.id}
                    layerId={rowId}
                    isGroup={isGroup}
                    frame={frame}
                    frameIndex={i}
                    frameCount={frames.length}
                    isActiveFrame={i === currentFrameIndex}
                    isActiveLayer={isActiveLayer}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    getLayerFrameData={editor.getLayerFrameData}
                    onSelect={() => {
                      if (!isGroup) editor.setActiveImageEditorLayer(rowId);
                      onSelectFrame(i);
                    }}
                    onDelete={() => {
                      onSelectFrame(i);
                      onDeleteFrame();
                    }}
                    onDuplicate={() => {
                      onSelectFrame(i);
                      onDuplicateFrame();
                    }}
                    onMoveLeft={() => {
                      onSelectFrame(i);
                      onMoveFrame("left");
                    }}
                    onMoveRight={() => {
                      onSelectFrame(i);
                      onMoveFrame("right");
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* ── Bottom toolbar ───────────────────────────────────────────────── */}
        <div className="flex items-center border-t border-border shrink-0 h-8">
          {/* Layer actions — same width as the sticky name column */}
          <div
            className="shrink-0 border-r border-border flex items-center px-2"
            style={{ width: nameW, minWidth: nameW }}
          >
            <Button
              variant="default"
              size="sm"
              className="h-5 px-2 text-[10px]"
              onMouseDown={() => setAddLayerOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Add Layer
            </Button>
          </div>

          {/* Frame actions */}
          <div className="flex items-center gap-2 px-2 overflow-x-auto">
            {/* Add frame */}
            <Button
              variant="default"
              size="sm"
              className="h-5 px-2 text-[10px]"
              onClick={onAddFrame}
            >
              <Plus className="h-3 w-3" />
              Add Frame
            </Button>

            <div className="w-px h-4 bg-border" />

            {/* Duplicate / delete frame */}
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onDuplicateFrame}
                  >
                    <Copy className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Duplicate Frame</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onDeleteFrame}
                    disabled={frames.length <= 1}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Frame</TooltipContent>
              </Tooltip>
            </div>

            <div className="w-px h-4 bg-border" />

            {/* Play / pause */}
            {isPlaying ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={onStop}>
                    <Pause className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pause</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={onPlay}>
                    <Play className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Play Animation</TooltipContent>
              </Tooltip>
            )}

            <div className="w-px h-4 bg-border" />

            {/* FPS */}
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground">FPS:</Label>
              <Input
                id="animation-fps"
                name="animation-fps"
                type="number"
                min={1}
                max={60}
                value={fps}
                onChange={(e) => onSetFps(Number(e.target.value))}
                className="w-12 h-5 text-[10px] px-1"
              />
            </div>

            <div className="w-px h-4 bg-border" />

            {/* Onion skin */}
            <div className="flex items-center gap-1">
              <Switch
                id="timeline-onion-toggle"
                checked={onionSkin}
                onCheckedChange={onSetOnionSkin}
                className="scale-75"
              />
              <Label
                htmlFor="timeline-onion-toggle"
                className="text-[10px] text-muted-foreground"
              >
                Onion
              </Label>
            </div>

            {/* Frame counter */}
            <div className="ml-4 text-[10px] text-muted-foreground">
              {currentFrameIndex + 1} / {frames.length}
            </div>
          </div>
        </div>

        {/* ── Dialogs ──────────────────────────────────────────────────────── */}
        <AddLayerDialog
          open={addLayerOpen}
          onOpenChange={setAddLayerOpen}
          defaultName={`Layer ${totalItems + 1}`}
          onCreateLayer={handleCreateLayer}
          allowedTypes={["tile", "image", "group"]}
        />

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {deleteTarget?.isGroup ? "layer group" : "layer"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &quot;{deleteTarget?.name}&quot;
                {deleteTarget?.isGroup && " and all layers inside it"}. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onMouseDown={handleDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
