import { Button } from "@/components/ui/Button";
import { AutotilePatternDiagram } from "@/features/map-editor/components/autotile/AutotilePatternDiagram";
import type { AutotilePatternTileCardProps } from "@/features/map-editor/types/autotile-builder";

export function AutotilePatternTileCard({
  buttonId,
  definition,
  image,
  isRequired,
  isSelected,
  onClear,
  tile,
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
        </div>

        <div className="flex items-start gap-2">
          <AutotilePatternDiagram
            definition={definition}
            centerCell={{
              id: buttonId,
              image,
              region: tile,
              isSelected,
              emptyLabel: definition.shortLabel,
              "aria-label": `Assign ${definition.label}`,
              "aria-pressed": isSelected,
              title: definition.label,
              onMouseDown: onPick,
            }}
          />

          {tile && onClear ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0"
              aria-label={`Clear ${definition.label}`}
              onMouseDown={onClear}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
