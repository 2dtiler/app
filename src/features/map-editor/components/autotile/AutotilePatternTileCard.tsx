import { Button } from "@/components/ui/Button";
import { AutotilePatternDiagram } from "@/features/map-editor/components/autotile/AutotilePatternDiagram";
import type { AutotilePatternTileCardProps } from "@/features/map-editor/types/autotile-builder";

export function AutotilePatternTileCard({
  buttonId,
  buttonName,
  definition,
  isRequired,
  isSelected,
  onClear,
  tile,
  tileLabel,
  onPick,
}: AutotilePatternTileCardProps) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h5 className="text-xs font-medium text-foreground">
              {definition.label}
            </h5>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {isRequired ? "Required" : "Optional"}
            </span>
          </div>
          <p className="max-w-sm text-xs text-muted-foreground">
            {definition.description}
          </p>
        </div>

        <AutotilePatternDiagram definition={definition} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Assigned Tile
          </p>
          <p className="text-xs text-foreground">{tileLabel}</p>
          {tile ? (
            <p className="text-[11px] text-muted-foreground">
              This slot has a tile assigned.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {isRequired
                ? "This pattern should be assigned for a complete setup."
                : "Optional. Leave it empty to fall back to the paint tile."}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {tile && onClear && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onMouseDown={onClear}
            >
              Clear
            </Button>
          )}
          <Button
            type="button"
            id={buttonId}
            name={buttonName}
            variant={isSelected ? "default" : "outline"}
            size="xs"
            onMouseDown={onPick}
          >
            {tile ? "Change Tile" : "Pick Tile"}
          </Button>
        </div>
      </div>
    </div>
  );
}
