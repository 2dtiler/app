import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import { AUTOTILE_PATTERN_SLOTS } from "@/features/map-editor/lib/autotile-preset-rules";
import type { AutotilePatternGroupCardProps } from "@/features/map-editor/types/autotile-dialog";
import { cn } from "@/utils/cn";

function getGroupCell(
  row: number,
  column: number,
  cells: AutotilePatternGroupCardProps["group"]["cells"],
) {
  return (
    cells.find((cell) => cell.row === row && cell.column === column) ?? null
  );
}

export function AutotilePatternGroupCard({
  group,
  terrain,
  tilesetImage,
  activeSlotIds,
  selectionTarget,
  paintTile,
  onSelectSlot,
  onClearSlot,
  onSelectPaintTile,
  onClearPaintTile,
}: AutotilePatternGroupCardProps) {
  const activeSlotIdSet = new Set(activeSlotIds);

  return (
    <section role="region" aria-label={group.title}>
      <div className="mb-3 space-y-1">
        <h5 className="text-xs font-medium text-foreground">{group.title}</h5>
        <p className="text-xs text-muted-foreground">{group.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, index) => {
          const row = Math.floor(index / 3);
          const column = index % 3;
          const cell = getGroupCell(row, column, group.cells);
          const isPaintTileCell =
            group.id === "edges-outside" && row === 1 && column === 1;

          if (isPaintTileCell) {
            const isSelected =
              selectionTarget?.type === "terrain" &&
              selectionTarget.terrainId === terrain.id;

            return (
              <div key={`${group.id}-center`} className="relative">
                {paintTile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-background/90 text-muted-foreground shadow-sm hover:bg-background"
                    aria-label={`Clear paint tile for ${terrain.name}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onClearPaintTile();
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}

                <button
                  type="button"
                  id={`autotile-pattern-group-${terrain.id}-paint`}
                  name={`autotile-pattern-group-${terrain.id}-paint`}
                  aria-label={`Assign paint tile for ${terrain.name}`}
                  aria-pressed={isSelected}
                  title="Paint Tile"
                  className={cn(
                    "flex min-h-26 w-full flex-col items-center justify-center rounded-xl border p-2 text-center transition-colors",
                    isSelected
                      ? "border-foreground bg-secondary"
                      : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                  )}
                  onMouseDown={onSelectPaintTile}
                >
                  <AutotileTilePreview
                    image={tilesetImage}
                    region={paintTile}
                    size={60}
                    emptyLabel="Paint"
                    className="h-15 w-15"
                  />
                  <span className="mt-2 text-[11px] font-medium leading-tight text-foreground">
                    Paint Tile
                  </span>
                </button>
              </div>
            );
          }

          if (!cell) {
            return (
              <div
                key={`${group.id}-${row}-${column}`}
                aria-hidden="true"
                className="min-h-26 rounded-xl border border-dashed border-border bg-muted/10"
              />
            );
          }

          const definition = AUTOTILE_PATTERN_SLOTS[cell.slotId];
          const isActive = activeSlotIdSet.has(cell.slotId);
          const tile = terrain.patternTiles?.[cell.slotId] ?? null;
          const isSelected =
            selectionTarget?.type === "pattern" &&
            selectionTarget.terrainId === terrain.id &&
            selectionTarget.slotId === cell.slotId;

          if (!isActive) {
            return (
              <div
                key={`${group.id}-${cell.slotId}`}
                className="flex min-h-26 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-2 text-center opacity-45"
              >
                <span className="text-[11px] font-medium text-muted-foreground">
                  {definition.shortLabel}
                </span>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  Unused in this preset
                </span>
              </div>
            );
          }

          return (
            <div key={`${group.id}-${cell.slotId}`} className="relative">
              {tile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-background/90 text-muted-foreground shadow-sm hover:bg-background"
                  aria-label={`Clear ${definition.label}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onClearSlot(cell.slotId);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}

              <button
                type="button"
                id={`autotile-pattern-group-${terrain.id}-${cell.slotId}`}
                name={`autotile-pattern-group-${terrain.id}-${cell.slotId}`}
                aria-label={`Assign ${definition.label}`}
                aria-pressed={isSelected}
                title={definition.label}
                className={cn(
                  "flex min-h-26 w-full flex-col items-center justify-center rounded-xl border p-2 text-center transition-colors",
                  isSelected
                    ? "border-foreground bg-secondary"
                    : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                )}
                onMouseDown={() => onSelectSlot(cell.slotId)}
              >
                <AutotileTilePreview
                  image={tilesetImage}
                  region={tile}
                  size={60}
                  emptyLabel={definition.shortLabel}
                  className="h-[3.75rem] w-[3.75rem]"
                />
                <span className="mt-2 text-[11px] font-medium leading-tight text-foreground">
                  {definition.shortLabel}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
