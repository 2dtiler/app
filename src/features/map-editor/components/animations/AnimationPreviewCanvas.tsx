import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { resolveAnimationFrame } from "@/features/map-editor/lib/tileset-animations";
import type { AnimationPreviewCanvasProps } from "@/features/map-editor/types/animations";

export function AnimationPreviewCanvas({
  animation,
  animated = false,
  cellSize,
  className,
  image,
  selectedFrameIndex,
}: AnimationPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const width = Math.max(1, animation.widthInTiles) * cellSize;
  const height = Math.max(1, animation.heightInTiles) * cellSize;

  useEffect(() => {
    if (!animated) return;

    let animationFrameId = 0;
    const startedAt = performance.now();

    const tick = () => {
      setElapsedMs(performance.now() - startedAt);
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [animated]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;

    if (!image || animation.frames.length === 0) return;

    const resolvedFrameIndex = animated
      ? resolveAnimationFrame(animation, elapsedMs).frameIndex
      : (selectedFrameIndex ?? 0);
    const frame = animation.frames[resolvedFrameIndex] ?? animation.frames[0];

    for (const [cellIndex, cell] of frame.cells.entries()) {
      if (!cell) continue;
      const cellColumn = cellIndex % animation.widthInTiles;
      const cellRow = Math.floor(cellIndex / animation.widthInTiles);
      context.drawImage(
        image,
        cell.sx,
        cell.sy,
        cell.sw,
        cell.sh,
        cellColumn * cellSize,
        cellRow * cellSize,
        cellSize,
        cellSize,
      );
    }
  }, [
    animation,
    animated,
    cellSize,
    elapsedMs,
    height,
    image,
    selectedFrameIndex,
    width,
  ]);

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20",
        className,
      )}
      style={{
        aspectRatio: `${Math.max(1, animation.widthInTiles)} / ${Math.max(1, animation.heightInTiles)}`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        aria-hidden="true"
        className="h-full w-full object-contain [image-rendering:pixelated]"
      />
    </div>
  );
}
