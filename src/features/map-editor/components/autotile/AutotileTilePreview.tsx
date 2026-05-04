import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import type { AutotileTilePreviewProps } from "@/features/map-editor/types/autotile-dialog";

export function AutotileTilePreview({
  image,
  region,
  size = 56,
  className,
  emptyLabel = "Empty",
  ariaLabel,
}: AutotileTilePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, size, size);
    context.imageSmoothingEnabled = false;

    if (!image || !region) {
      return;
    }

    context.drawImage(
      image,
      region.sx,
      region.sy,
      region.sw,
      region.sh,
      0,
      0,
      size,
      size,
    );
  }, [image, region, size]);

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? (region ? "Assigned tile preview" : emptyLabel)}
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/20",
        className,
      )}
      style={{ height: size, width: size }}
    >
      {region ? (
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          aria-hidden="true"
          className="h-full w-full"
        />
      ) : (
        <span className="px-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {emptyLabel}
        </span>
      )}
    </div>
  );
}
