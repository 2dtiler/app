import type { AutotilePatternDiagramProps } from "@/features/map-editor/types/autotile-builder";
import type {
  AutotileNeighborPosition,
  AutotilePatternRelation,
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
}: AutotilePatternDiagramProps) {
  return (
    <div
      aria-hidden="true"
      className="grid w-full max-w-[9.5rem] grid-cols-3 gap-1"
    >
      {GRID_ORDER.map((cell) => {
        if (cell === "center") {
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
