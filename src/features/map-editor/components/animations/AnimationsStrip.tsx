import { useState } from "react";
import { Film, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { useAssetImage } from "@/features/map-editor/hooks/use-asset-image";
import {
  createAnimationDragPayload,
  TILESET_ANIMATION_DRAG_MIME,
} from "@/features/map-editor/lib/tileset-animations";
import { cn } from "@/utils/cn";
import { AnimationPreviewCanvas } from "./AnimationPreviewCanvas";
import type { AnimationStripProps } from "@/features/map-editor/types/animations";
import type { TilesetAnimation } from "@/types";

export function AnimationsStrip({
  activeAnimationId,
  animations,
  onAddAnimation,
  onDeleteAnimation,
  onEditAnimation,
  onSelectAnimation,
  tileset,
}: AnimationStripProps) {
  const image = useAssetImage(tileset.assetId);
  const [deleteTarget, setDeleteTarget] = useState<TilesetAnimation | null>(
    null,
  );

  return (
    <aside
      role="region"
      aria-label="Tileset animations"
      className="flex h-full min-h-0 flex-col border-r border-border bg-card/70"
    >
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Film className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Animations
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Add animation"
              onMouseDown={onAddAnimation}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add Animation</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {animations.length === 0 ? (
          <div className="flex h-full min-h-28 items-center justify-center">
            <Button
              type="button"
              variant="outline"
              size="xs"
              aria-label="Add animation"
              onMouseDown={onAddAnimation}
            >
              <Plus className="h-3 w-3" />
              Add Animation
            </Button>
          </div>
        ) : (
          <div role="list" className="flex flex-col gap-2">
            {animations.map((animation) => {
              const isActive = animation.id === activeAnimationId;

              return (
                <div
                  key={animation.id}
                  role="listitem"
                  className={cn(
                    "rounded-md border border-border bg-background/70 p-1.5 transition-colors",
                    isActive && "border-primary bg-primary/5",
                  )}
                  draggable
                  onDragStart={(event) => {
                    const payload = createAnimationDragPayload(
                      tileset.id,
                      animation.id,
                    );
                    event.dataTransfer.setData(
                      TILESET_ANIMATION_DRAG_MIME,
                      JSON.stringify(payload),
                    );
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <button
                    type="button"
                    className="flex w-full min-w-0 flex-col items-stretch gap-1 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Select animation ${animation.name}`}
                    aria-pressed={isActive}
                    onMouseDown={() => onSelectAnimation(animation)}
                  >
                    <AnimationPreviewCanvas
                      animation={animation}
                      animated={isActive}
                      cellSize={22}
                      image={image}
                      className="h-auto max-h-20 w-full"
                    />
                    <span className="truncate text-xs font-medium text-foreground">
                      {animation.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {animation.widthInTiles}x{animation.heightInTiles} /{" "}
                      {animation.frames.length} frame
                      {animation.frames.length === 1 ? "" : "s"}
                    </span>
                  </button>

                  <div className="mt-1 flex justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit animation ${animation.name}`}
                          onMouseDown={() => onEditAnimation(animation)}
                        >
                          <Pencil />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit Animation</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete animation ${animation.name}`}
                          onMouseDown={() => setDeleteTarget(animation)}
                        >
                          <Trash2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete Animation</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete animation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" from this
              tileset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onMouseDown={() => {
                if (deleteTarget) {
                  onDeleteAnimation(deleteTarget);
                }
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
