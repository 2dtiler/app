import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import { AutotileWangPatternDiagram } from "@/features/map-editor/components/autotile/AutotileWangPatternDiagram";
import type { AutotileWangPatternEditorProps } from "@/features/map-editor/types/autotile-dialog";
import { cn } from "@/utils/cn";

export function AutotileWangPatternEditor({
  terrain,
  tilesetImage,
  patternDefinitions,
  requiredSlotIds,
  selectionTarget,
  onSelectSlot,
  onClearSlot,
  onSelectPaintTile,
  onClearPaintTile,
}: AutotileWangPatternEditorProps) {
  const configuredCount = requiredSlotIds.reduce(
    (count, slotId) => count + (terrain.patternTiles?.[slotId] ? 1 : 0),
    0,
  );
  const isPaintTileSelected =
    selectionTarget?.type === "terrain" &&
    selectionTarget.terrainId === terrain.id;

  return (
    <div className="space-y-4">
      <section role="region" aria-label="Wang paint tile">
        <div className="mb-3 space-y-1">
          <h5 className="text-xs font-medium text-foreground">Paint Tile</h5>
          <p className="text-xs text-muted-foreground">
            Choose the brush tile for this terrain, then assign the 16 edge
            combinations below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/70 p-3">
          <div className="relative w-full max-w-44">
            {terrain.paletteTile && (
              <Button
                type="button"
                id={`autotile-wang-paint-${terrain.id}-clear`}
                name={`autotile-wang-paint-${terrain.id}-clear`}
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
              id={`autotile-wang-paint-${terrain.id}`}
              name={`autotile-wang-paint-${terrain.id}`}
              aria-label={`Assign paint tile for ${terrain.name}`}
              aria-pressed={isPaintTileSelected}
              title="Paint Tile"
              className={cn(
                "flex min-h-26 w-full flex-col items-center justify-center rounded-xl border p-3 text-center transition-colors",
                isPaintTileSelected
                  ? "border-foreground bg-secondary"
                  : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
              )}
              onMouseDown={onSelectPaintTile}
            >
              <AutotileTilePreview
                image={tilesetImage}
                region={terrain.paletteTile}
                size={60}
                emptyLabel="Paint"
                ariaLabel={`Paint tile preview for ${terrain.name}`}
                className="h-15 w-15"
              />
              <span className="mt-2 text-[11px] font-medium leading-tight text-foreground">
                Paint Tile
              </span>
            </button>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Edge Coverage
            </p>
            <p className="text-xs text-foreground">
              {configuredCount} of {requiredSlotIds.length} Wang tiles assigned
            </p>
            <p className="text-[11px] text-muted-foreground">
              Match means that edge touches the same terrain. Open means it
              touches empty space, another terrain, or another tileset.
            </p>
          </div>
        </div>
      </section>

      <section role="region" aria-label="Wang pattern tiles">
        <div className="mb-3 space-y-1">
          <h5 className="text-xs font-medium text-foreground">Edge Patterns</h5>
          <p className="text-xs text-muted-foreground">
            Assign one tile for each top, right, bottom, and left edge state.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {patternDefinitions.map((definition) => {
            const tile = terrain.patternTiles?.[definition.id] ?? null;
            const isSelected =
              selectionTarget?.type === "pattern" &&
              selectionTarget.terrainId === terrain.id &&
              selectionTarget.slotId === definition.id;
            const buttonId = `autotile-wang-pattern-${terrain.id}-${definition.id}`;

            return (
              <div key={definition.id} className="relative">
                {tile && (
                  <Button
                    type="button"
                    id={`${buttonId}-clear`}
                    name={`${buttonId}-clear`}
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-1 top-1 z-10 h-5 w-5 rounded-full bg-background/90 text-muted-foreground shadow-sm hover:bg-background"
                    aria-label={`Clear ${definition.label}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onClearSlot(definition.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}

                <button
                  type="button"
                  id={buttonId}
                  name={buttonId}
                  aria-label={`Assign ${definition.label}`}
                  aria-pressed={isSelected}
                  title={definition.description}
                  className={cn(
                    "flex min-h-44 w-full flex-col items-center justify-between gap-2 rounded-xl border p-2 text-center transition-colors",
                    isSelected
                      ? "border-foreground bg-secondary"
                      : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                  )}
                  onMouseDown={() => onSelectSlot(definition.id)}
                >
                  <AutotileWangPatternDiagram definition={definition} />
                  <AutotileTilePreview
                    image={tilesetImage}
                    region={tile}
                    size={48}
                    emptyLabel={definition.shortLabel}
                    ariaLabel={`${definition.label} tile preview`}
                    className="h-12 w-12"
                  />
                  <span className="text-[10px] font-medium leading-tight text-foreground">
                    {definition.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
