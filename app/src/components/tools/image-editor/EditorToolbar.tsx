import { useRef } from "react";
import {
  FilePlus,
  FileImage,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Scaling,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ImageEditorTool } from "@/types/image-editor";

interface EditorToolbarProps {
  zoom: number;
  brushSize: number;
  tool: ImageEditorTool;
  blurSize: number;
  blurIntensity: number;
  onZoom: (z: number) => void;
  onBrushSize: (s: number) => void;
  onBlurSize: (s: number) => void;
  onBlurIntensity: (i: number) => void;
  onNew: () => void;
  onResize: () => void;
  onImport: (file: File) => void;
  onExportPng: () => void;
  onExportGif: () => void;
  onExportSpriteSheet: () => void;
}

export function EditorToolbar({
  zoom,
  brushSize,
  tool,
  blurSize,
  blurIntensity,
  onZoom,
  onBrushSize,
  onBlurSize,
  onBlurIntensity,
  onNew,
  onResize,
  onImport,
  onExportPng,
  onExportGif,
  onExportSpriteSheet,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileImage className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import Image</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onResize}>
                <Scaling className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Image Dimensions</TooltipContent>
          </Tooltip>

          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = "";
            }}
          />

          {/* Export dropdown */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs">
                    <Download className="size-3.5 mr-1" />
                    Export
                    <ChevronDown className="size-3 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Export image</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={onExportPng}>
                Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportGif}>
                Export as GIF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportSpriteSheet}>
                Export as Sprite Sheet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Brush size */}
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

        <div className="w-px h-5 bg-border" />

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
      </div>
    </TooltipProvider>
  );
}
