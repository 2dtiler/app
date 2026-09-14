import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { AutotilePatternTileCard } from "@/features/map-editor/components/autotile/AutotilePatternTileCard";
import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import { countConfiguredAssignments } from "@/features/map-editor/lib/autotile-dialog";
import type { AutotileBlobPatternEditorProps } from "@/features/map-editor/types/autotile-dialog";
import { cn } from "@/utils/cn";

export function AutotileBlobPatternEditor({
  terrain,
  tilesetImage,
  cardGroups,
  definitionMap,
  requiredSlotIds,
  selectionTarget,
  defaultOpenGroupIds,
  onSelectPaintTile,
  onClearPaintTile,
  onSelectSlot,
  onClearSlot,
}: AutotileBlobPatternEditorProps) {
  const paintSelected =
    selectionTarget?.type === "terrain" &&
    selectionTarget.terrainId === terrain.id;

  return (
    <div className="space-y-4">
      <section role="region" aria-label="Paint tile">
        <div className="mb-3 space-y-1">
          <h5 className="text-xs font-medium text-foreground">Paint Tile</h5>
          <p className="text-xs text-muted-foreground">
            Choose the base terrain tile, then assign the 47 blob patterns
            below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/70 p-3">
          <button
            type="button"
            id={`autotile-pattern-group-${terrain.id}-paint`}
            name={`autotile-pattern-group-${terrain.id}-paint`}
            aria-label={`Assign paint tile for ${terrain.name}`}
            aria-pressed={paintSelected}
            className={cn(
              "flex min-h-26 w-full max-w-44 flex-col items-center justify-center rounded-xl border p-3 text-center transition-colors",
              paintSelected
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
              className="h-15 w-15"
            />
            <span className="mt-2 text-[11px] font-medium leading-tight text-foreground">
              Paint Tile
            </span>
          </button>

          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Assigned Tile
            </p>
            <p className="text-xs text-foreground">
              {terrain.paletteTile
                ? `Pixel origin (${terrain.paletteTile.sx}, ${terrain.paletteTile.sy})`
                : "No tile assigned yet"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Blob rules fall back to this tile when no assigned pattern
              matches.
            </p>
          </div>

          {terrain.paletteTile && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onMouseDown={onClearPaintTile}
            >
              Clear
            </Button>
          )}
        </div>
      </section>

      <section role="region" aria-label="Blob pattern tiles">
        <div className="mb-3 space-y-1">
          <h5 className="text-xs font-medium text-foreground">Blob Patterns</h5>
          <p className="text-xs text-muted-foreground">
            The 47 valid gated 8-neighbor masks are grouped by shape so you can
            work through large tilesets faster.
          </p>
        </div>

        <Accordion
          key={`${terrain.id}-blob-patterns`}
          type="multiple"
          defaultValue={defaultOpenGroupIds}
          className="rounded-xl border border-border bg-background/70 px-3"
        >
          {cardGroups.map((group) => {
            const groupAssignedCount = countConfiguredAssignments(
              terrain,
              group.slotIds,
            );

            return (
              <AccordionItem key={group.id} value={group.id}>
                <AccordionTrigger className="gap-3 py-4 text-left hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pr-2">
                    <div className="min-w-0 space-y-1">
                      <h6 className="text-xs font-medium text-foreground">
                        {group.title}
                      </h6>
                      <p className="text-xs text-muted-foreground">
                        {group.description}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {groupAssignedCount}/{group.slotIds.length}
                    </span>
                  </div>
                </AccordionTrigger>

                <AccordionContent>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {group.slotIds.map((slotId) => {
                      const definition = definitionMap.get(slotId);

                      if (!definition) {
                        return null;
                      }

                      const tile =
                        terrain.patternTiles?.[definition.id] ?? null;
                      const isSelected =
                        selectionTarget?.type === "pattern" &&
                        selectionTarget.terrainId === terrain.id &&
                        selectionTarget.slotId === definition.id;

                      return (
                        <AutotilePatternTileCard
                          key={`${terrain.id}-${definition.id}`}
                          buttonId={`autotile-pattern-card-${terrain.id}-${definition.id}`}
                          definition={definition}
                          image={tilesetImage}
                          isRequired={requiredSlotIds.includes(definition.id)}
                          isSelected={isSelected}
                          onClear={
                            tile ? () => onClearSlot(definition.id) : undefined
                          }
                          tile={tile}
                          onPick={() => onSelectSlot(definition.id)}
                        />
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>
    </div>
  );
}
