import type { AutotilePatternDiagramProps } from "@/features/map-editor/types/autotile-builder";
import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import {
  AUTOTILE_NEIGHBOR_POSITIONS,
  type AutotileNeighborPosition,
  type AutotilePatternRelation,
} from "@/types";
import { cn } from "@/utils/cn";

const GRID_ORDER = [
  "northWest",
  "north",
  "northEast",
  "west",
  "center",
  "east",
  "southWest",
  "south",
  "southEast",
] as const;

function getCellLabel(relation: AutotilePatternRelation): string {
  switch (relation) {
    case "same":
      return "Same";
    case "different":
      return "Open";
    case "ignore":
      return "Any";
  }
}

function getCellClassName(relation: AutotilePatternRelation): string {
  switch (relation) {
    case "same":
      return "border-primary/40 bg-primary/10 text-foreground";
    case "different":
      return "border-border-visible bg-secondary text-foreground";
    case "ignore":
      return "border-dashed border-border bg-transparent text-muted-foreground";
  }
}

export function AutotilePatternDiagram({
  definition,
  centerCell,
}: AutotilePatternDiagramProps) {
  const diagramDescription = AUTOTILE_NEIGHBOR_POSITIONS.map((position) => {
    const relation = definition.neighbors[position];
    return `${position}: ${getCellLabel(relation)}`;
  }).join(", ");

  return (
    <div
      role={centerCell ? undefined : "img"}
      aria-label={`${definition.label}. ${diagramDescription}`}
      className="grid w-full max-w-38 grid-cols-3 gap-1"
    >
      {GRID_ORDER.map((cell) => {
        if (cell === "center") {
          if (centerCell) {
            const {
              emptyLabel = "Paint",
              image,
              isSelected,
              region,
              className,
              ...buttonProps
            } = centerCell;

            return (
              <button
                key={cell}
                type="button"
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border p-1 transition-colors",
                  isSelected
                    ? "border-foreground bg-secondary"
                    : "border-foreground bg-foreground text-background hover:border-border-visible hover:bg-muted/20",
                  className,
                )}
                {...buttonProps}
              >
                <AutotileTilePreview
                  image={image}
                  region={region}
                  size={34}
                  emptyLabel={emptyLabel}
                  ariaLabel={`${definition.label} tile preview`}
                  className="h-8 w-8"
                />
              </button>
            );
          }

          return (
            <div
              key={cell}
              className="flex aspect-square items-center justify-center rounded-md border border-foreground bg-foreground px-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-background"
            >
              Paint
            </div>
          );
        }

        const relation = definition.neighbors[cell as AutotileNeighborPosition];

        return (
          <div
            key={cell}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md border px-1 text-center font-mono text-[9px] uppercase tracking-[0.08em]",
              getCellClassName(relation),
            )}
          >
            {getCellLabel(relation)}
          </div>
        );
      })}
    </div>
  );
}
