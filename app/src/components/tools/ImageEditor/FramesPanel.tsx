import { useRef, useEffect } from "react";
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
import type { Frame, FrameId } from "@/types/image-editor";
import type { FramesPanelProps } from "@/types/image-editor-ui";

function FrameThumbnail({
  frame,
  index,
  isActive,
  canvasWidth,
  canvasHeight,
  getFrameData,
  onClick,
}: {
  frame: Frame;
  index: number;
  isActive: boolean;
  canvasWidth: number;
  canvasHeight: number;
  getFrameData: (frameId: FrameId) => ImageData | null;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, 48, 48);

    const data = getFrameData(frame.id);
    if (!data) return;

    // Draw scaled to fit 48x48 thumbnail
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(data, 0, 0);

    const scale = Math.min(48 / canvasWidth, 48 / canvasHeight);
    const dw = canvasWidth * scale;
    const dh = canvasHeight * scale;
    const dx = (48 - dw) / 2;
    const dy = (48 - dh) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, dx, dy, dw, dh);
  });

  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex flex-col items-center gap-0.5 p-1 rounded cursor-pointer transition-colors ${
        isActive ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-accent"
      }`}
    >
      <canvas
        ref={canvasRef}
        width={48}
        height={48}
        className="rounded border border-border bg-neutral-800"
        style={{ imageRendering: "pixelated" }}
      />
      <span className="text-[9px] text-muted-foreground truncate max-w-12">
        {index + 1}
      </span>
    </button>
  );
}

export function FramesPanel({
  frames,
  currentFrameIndex,
  isPlaying,
  fps,
  onionSkin,
  canvasWidth,
  canvasHeight,
  getFrameData,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onPlay,
  onStop,
  onSetFps,
  onSetOnionSkin,
}: FramesPanelProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col border-t border-border bg-card h-full overflow-hidden">
        {/* Frame thumbnails strip */}
        <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto">
          {frames.map((frame, i) => (
            <FrameThumbnail
              key={frame.id}
              frame={frame}
              index={i}
              isActive={i === currentFrameIndex}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              getFrameData={getFrameData}
              onClick={() => onSelectFrame(i)}
            />
          ))}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onAddFrame}
                className="shrink-0"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Frame</TooltipContent>
          </Tooltip>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2 px-2 py-1 border-t border-border">
          {/* Frame actions */}
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

          {/* Play / Pause */}
          <div className="flex items-center gap-0.5">
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
          </div>

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
              id="onion-toggle"
              checked={onionSkin}
              onCheckedChange={onSetOnionSkin}
              className="scale-75"
            />
            <Label
              htmlFor="onion-toggle"
              className="text-[10px] text-muted-foreground"
            >
              Onion
            </Label>
          </div>

          {/* Frame info */}
          <div className="ml-auto text-[10px] text-muted-foreground">
            {currentFrameIndex + 1} / {frames.length}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
