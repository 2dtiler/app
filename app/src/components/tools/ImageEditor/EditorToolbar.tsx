import {
  FilePlus,
  Save,
  ZoomIn,
  ZoomOut,
  Scaling,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/Tooltip";

import type { EditorToolbarProps } from "@/types/image-editor-ui";

export function EditorToolbar({
  zoom,
  brushSize,
  tool,
  blurSize,
  blurIntensity,
  canApplyCrop,
  canUndo,
  canRedo,
  onZoom,
  onBrushSize,
  onBlurSize,
  onBlurIntensity,
  onApplyCrop,
  onCancelCrop,
  onNew,
  onResize,
  onSave,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 px-2 py-1 bg-card border-b border-border min-h-10 shrink-0">
        {/* File actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onNew}>
                <FilePlus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Image</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onResize}>
                <Scaling className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Image Dimensions</TooltipContent>
          </Tooltip>

          {/* Save button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" onClick={onSave}>
                <Save className="size-3.5 mr-1" />
                Save
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save (Ctrl+S)</TooltipContent>
          </Tooltip>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Brush size */}
        {(tool === "pencil" || tool === "eraser" || tool === "line") && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Brush: {brushSize}px
            </span>
            <Slider
              min={1}
              max={16}
              value={[brushSize]}
              onValueChange={([v]) => onBrushSize(v)}
              className="w-24"
            />
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  onZoom(Math.max(1, zoom - (zoom < 4 ? 1 : zoom < 16 ? 2 : 4)))
                }
              >
                <ZoomOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <span className="text-xs text-muted-foreground w-12 text-center tabular-nums">
            {zoom}x
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  onZoom(
                    Math.min(64, zoom + (zoom < 4 ? 1 : zoom < 16 ? 2 : 4)),
                  )
                }
              >
                <ZoomIn className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>

        {/* Blur settings (visible only when blur tool is active) */}
        {tool === "blur" && (
          <>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Size: {blurSize}
              </span>
              <Slider
                min={1}
                max={8}
                value={[blurSize]}
                onValueChange={([v]) => onBlurSize(v)}
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Intensity: {blurIntensity}%
              </span>
              <Slider
                min={1}
                max={100}
                value={[blurIntensity]}
                onValueChange={([v]) => onBlurIntensity(v)}
                className="w-20"
              />
            </div>
          </>
        )}

        {tool === "crop" && (
          <>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                onClick={onCancelCrop}
                disabled={!canApplyCrop}
              >
                Cancel
              </Button>
              <Button size="xs" onClick={onApplyCrop} disabled={!canApplyCrop}>
                Apply Crop
              </Button>
            </div>
          </>
        )}

        <div className="w-px h-5 bg-border" />
      </div>
    </TooltipProvider>
  );
}
