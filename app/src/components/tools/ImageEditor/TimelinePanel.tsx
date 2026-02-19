/**
 * TimelinePanel — unified layers + frames grid for the Image / Sprite Editor.
 *
 * Layout (Aseprite-style):
 *   [sticky layer name]  [frame cell] [frame cell] …
 *   [sticky layer name]  [frame cell] [frame cell] …
 *   ─────────────────────────────────────────────────
 *   [+ Add Layer]     │  [copy][del][▶] FPS [12] onion
 *
 * A single `overflow: auto` container holds every row. Each layer-name cell
 * is `position: sticky; left: 0` so it never scrolls away horizontally, and
 * vertical scroll syncs naturally because the names are part of the same row.
 */

import { useRef, useEffect, useState } from "react";
import { Plus, Copy, Trash2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
/** Pixel width reserved for the sticky layer-name column. */
const NAME_W = 160;
/** Thumbnail size rendered inside each frame cell. */
const THUMB = 40;

// ─── FrameCell ────────────────────────────────────────────────────────────────

function FrameCell({
  layerId,
  isGroup,
  frame,
  frameIndex,
  isActiveFrame,
  isActiveLayer,
  canvasWidth,
  canvasHeight,
  getLayerFrameData,
  onSelect,
}: {
  layerId: string;
  isGroup: boolean;
  frame: Frame;
  frameIndex: number;
  isActiveFrame: boolean;
  isActiveLayer: boolean;
  canvasWidth: number;
  canvasHeight: number;
  getLayerFrameData: (frameId: FrameId, layerId: string) => ImageData | null;
  onSelect: () => void;
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
    <button
      onClick={onSelect}
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
  );
}

// ─── TimelinePanel ────────────────────────────────────────────────────────────

export interface TimelinePanelProps {
  frames: Frame[];
  currentFrameIndex: number;
  isPlaying: boolean;
  fps: number;
  onionSkin: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: () => void;
  onDeleteFrame: () => void;
  onPlay: () => void;
  onStop: () => void;
  onSetFps: (fps: number) => void;
  onSetOnionSkin: (on: boolean) => void;
}

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
  onPlay,
  onStop,
  onSetFps,
  onSetOnionSkin,
}: TimelinePanelProps) {
  const editor = useImageEditor();
  const state = editor.state;

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
      <div className="flex flex-col h-full border-t border-border bg-card overflow-hidden">
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
                  className="shrink-0 bg-card border-r border-border z-10 flex items-center overflow-hidden"
                  style={{
                    width: NAME_W,
                    minWidth: NAME_W,
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
                    isActiveFrame={i === currentFrameIndex}
                    isActiveLayer={isActiveLayer}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    getLayerFrameData={editor.getLayerFrameData}
                    onSelect={() => {
                      if (!isGroup) editor.setActiveImageEditorLayer(rowId);
                      onSelectFrame(i);
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
            style={{ width: NAME_W, minWidth: NAME_W }}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={onAddFrame}>
                  <Plus className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add Frame</TooltipContent>
            </Tooltip>

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
