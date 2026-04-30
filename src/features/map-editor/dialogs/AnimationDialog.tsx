import { useMemo, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TilesetCanvas } from "@/features/map-editor/components/TilesetCanvas";
import { AnimationPreviewCanvas } from "@/features/map-editor/components/animations/AnimationPreviewCanvas";
import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import { useAssetImage } from "@/features/map-editor/hooks/use-asset-image";
import {
  getAnimationCellCount,
  normalizeTilesetAnimation,
} from "@/features/map-editor/lib/tileset-animations";
import { generateTilesetAnimationId } from "@/utils/ids";
import { cn } from "@/utils/cn";
import type { AnimationDialogProps } from "@/features/map-editor/types/dialogs";
import type {
  TilesetAnimation,
  TilesetAnimationFrame,
  TilesetAnimationTileRegion,
} from "@/types";

const DEFAULT_FRAME_DURATION_MS = 120;
const MAX_GRID_SIZE = 8;
const MAX_FRAME_COUNT = 24;

function createEmptyFrame(cellCount: number): TilesetAnimationFrame {
  return {
    durationMs: DEFAULT_FRAME_DURATION_MS,
    cells: Array.from({ length: cellCount }, () => null),
  };
}

function createDraftAnimation(
  animation: TilesetAnimation | null | undefined,
): TilesetAnimation {
  const now = Date.now();

  if (animation) {
    return normalizeTilesetAnimation({
      ...animation,
      frames: animation.frames.map((frame) => ({
        durationMs: frame.durationMs,
        cells: frame.cells.map((cell) => (cell ? { ...cell } : null)),
      })),
    });
  }

  return {
    id: generateTilesetAnimationId(),
    name: "Animation",
    widthInTiles: 1,
    heightInTiles: 1,
    frames: [createEmptyFrame(1)],
    createdAt: now,
    updatedAt: now,
  };
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function resizeFrameCells(
  frame: TilesetAnimationFrame,
  nextCellCount: number,
): TilesetAnimationFrame {
  return {
    durationMs: frame.durationMs,
    cells: Array.from(
      { length: nextCellCount },
      (_, cellIndex) => frame.cells[cellIndex] ?? null,
    ),
  };
}

export function AnimationDialog({
  animation,
  open,
  onOpenChange,
  onSave,
  tileset,
}: AnimationDialogProps) {
  const [draft, setDraft] = useState<TilesetAnimation>(() =>
    createDraftAnimation(animation),
  );
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [activeCellIndex, setActiveCellIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const image = useAssetImage(tileset.assetId);
  const cellCount = getAnimationCellCount(draft);
  const activeFrame = draft.frames[activeFrameIndex] ?? draft.frames[0];
  const activeCell = activeFrame?.cells[activeCellIndex] ?? null;

  const gridCells = useMemo(
    () => Array.from({ length: cellCount }, (_, cellIndex) => cellIndex),
    [cellCount],
  );

  function updateGridSize(widthInTiles: number, heightInTiles: number) {
    const nextWidth = clampInteger(widthInTiles, 1, MAX_GRID_SIZE);
    const nextHeight = clampInteger(heightInTiles, 1, MAX_GRID_SIZE);
    const nextCellCount = nextWidth * nextHeight;

    setDraft((current) => ({
      ...current,
      widthInTiles: nextWidth,
      heightInTiles: nextHeight,
      frames: current.frames.map((frame) =>
        resizeFrameCells(frame, nextCellCount),
      ),
      updatedAt: Date.now(),
    }));
    setActiveCellIndex((current) => Math.min(current, nextCellCount - 1));
  }

  function updateFrameCount(frameCount: number) {
    const nextFrameCount = clampInteger(frameCount, 1, MAX_FRAME_COUNT);

    setDraft((current) => {
      const nextCellCount = getAnimationCellCount(current);
      const nextFrames = current.frames.slice(0, nextFrameCount);

      while (nextFrames.length < nextFrameCount) {
        nextFrames.push(createEmptyFrame(nextCellCount));
      }

      return {
        ...current,
        frames: nextFrames,
        updatedAt: Date.now(),
      };
    });
    setActiveFrameIndex((current) => Math.min(current, nextFrameCount - 1));
  }

  function updateActiveFrameDuration(durationMs: number) {
    const nextDurationMs = clampInteger(durationMs, 1, 9999);

    setDraft((current) => ({
      ...current,
      frames: current.frames.map((frame, frameIndex) =>
        frameIndex === activeFrameIndex
          ? { ...frame, durationMs: nextDurationMs }
          : frame,
      ),
      updatedAt: Date.now(),
    }));
  }

  function assignTileToActiveCell(region: TilesetAnimationTileRegion) {
    setDraft((current) => ({
      ...current,
      frames: current.frames.map((frame, frameIndex) => {
        if (frameIndex !== activeFrameIndex) return frame;

        return {
          ...frame,
          cells: frame.cells.map((cell, cellIndex) =>
            cellIndex === activeCellIndex ? { ...region } : cell,
          ),
        };
      }),
      updatedAt: Date.now(),
    }));
    setError(null);
    setActiveCellIndex((current) => (current + 1) % cellCount);
  }

  function handleSave() {
    const normalized = normalizeTilesetAnimation({
      ...draft,
      name: draft.name.trim(),
      updatedAt: Date.now(),
    });

    if (!normalized.name) {
      setError("Name is required.");
      return;
    }

    const missingCell = normalized.frames.some((frame) =>
      frame.cells.some((cell) => !cell),
    );
    if (missingCell) {
      setError("Assign every grid cell in every frame.");
      return;
    }

    onSave(normalized);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(42rem,92vh)] sm:max-w-7xl flex-col overflow-hidden">
        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {animation ? "Edit Animation" : "Create Animation"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(23rem,1fr)]">
            <section className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Tileset Picker</h3>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Zoom tileset picker out"
                    onClick={() =>
                      setZoom((current) => Math.max(0.5, current - 0.5))
                    }
                  >
                    <ZoomOut />
                  </Button>
                  <span className="w-10 text-center text-[11px] text-muted-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Zoom tileset picker in"
                    onClick={() =>
                      setZoom((current) => Math.min(8, current + 0.5))
                    }
                  >
                    <ZoomIn />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
                <TilesetCanvas
                  assetId={tileset.assetId}
                  tileSize={tileset.tileSize}
                  selectedTile={activeCell}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  onTileSelect={assignTileToActiveCell}
                  selectionMode="single"
                  className="h-full min-h-0"
                />
              </div>
            </section>

            <section className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="animation-name">Name</Label>
                  <Input
                    id="animation-name"
                    name="animation-name"
                    value={draft.name}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                        updatedAt: Date.now(),
                      }));
                      setError(null);
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="animation-grid-width">Grid Width</Label>
                  <Input
                    id="animation-grid-width"
                    name="animation-grid-width"
                    type="number"
                    min={1}
                    max={MAX_GRID_SIZE}
                    value={draft.widthInTiles}
                    onChange={(event) =>
                      updateGridSize(
                        Number(event.target.value),
                        draft.heightInTiles,
                      )
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="animation-grid-height">Grid Height</Label>
                  <Input
                    id="animation-grid-height"
                    name="animation-grid-height"
                    type="number"
                    min={1}
                    max={MAX_GRID_SIZE}
                    value={draft.heightInTiles}
                    onChange={(event) =>
                      updateGridSize(
                        draft.widthInTiles,
                        Number(event.target.value),
                      )
                    }
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="animation-frame-count">Frame Count</Label>
                  <Input
                    id="animation-frame-count"
                    name="animation-frame-count"
                    type="number"
                    min={1}
                    max={MAX_FRAME_COUNT}
                    value={draft.frames.length}
                    onChange={(event) =>
                      updateFrameCount(Number(event.target.value))
                    }
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="mb-3 flex flex-wrap items-center gap-1">
                  {draft.frames.map((_, frameIndex) => (
                    <Button
                      key={frameIndex}
                      type="button"
                      variant={
                        frameIndex === activeFrameIndex ? "default" : "outline"
                      }
                      size="xs"
                      aria-label={`Select frame ${frameIndex + 1}`}
                      onClick={() => setActiveFrameIndex(frameIndex)}
                    >
                      {frameIndex + 1}
                    </Button>
                  ))}
                </div>

                <div
                  role="grid"
                  aria-label="Animation frame cells"
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${draft.widthInTiles}, minmax(0, 1fr))`,
                  }}
                >
                  {gridCells.map((cellIndex) => {
                    const cell = activeFrame?.cells[cellIndex] ?? null;
                    const isActive = cellIndex === activeCellIndex;

                    return (
                      <button
                        key={cellIndex}
                        type="button"
                        role="gridcell"
                        aria-label={`Select animation cell ${cellIndex + 1}`}
                        aria-selected={isActive}
                        className={cn(
                          "flex min-w-0 items-center justify-center rounded-lg border border-border bg-muted/20 p-1 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
                          isActive && "border-primary bg-primary/10",
                        )}
                        onClick={() => setActiveCellIndex(cellIndex)}
                      >
                        <AutotileTilePreview
                          image={image}
                          region={cell}
                          size={42}
                          emptyLabel="Empty"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Preview</h3>
                    <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-lg bg-muted/20 p-3">
                      <AnimationPreviewCanvas
                        animation={draft}
                        animated
                        cellSize={48}
                        image={image}
                        className="max-h-56 max-w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="animation-frame-duration">
                      Selected Frame Duration
                    </Label>
                    <Input
                      id="animation-frame-duration"
                      name="animation-frame-duration"
                      type="number"
                      min={1}
                      max={9999}
                      value={
                        activeFrame?.durationMs ?? DEFAULT_FRAME_DURATION_MS
                      }
                      onChange={(event) =>
                        updateActiveFrameDuration(Number(event.target.value))
                      }
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Applies to frame {activeFrameIndex + 1} only.
                    </p>
                  </div>
                </div>
              </div>

              {error ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </section>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save Animation</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
