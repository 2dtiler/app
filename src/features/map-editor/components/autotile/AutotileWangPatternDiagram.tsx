import type { AutotilePatternRelation } from "@/types";
import type { AutotileWangPatternDiagramProps } from "@/features/map-editor/types/autotile-dialog";
import { cn } from "@/utils/cn";

function getEdgeLabel(relation: AutotilePatternRelation): string {
  switch (relation) {
    case "same":
      return "Match";
    case "different":
      return "Open";
    case "ignore":
      return "Any";
  }
}

function getEdgeClassName(relation: AutotilePatternRelation): string {
  switch (relation) {
    case "same":
      return "border-primary/45 bg-primary/10 text-foreground";
    case "different":
      return "border-border-visible bg-secondary text-foreground";
    case "ignore":
      return "border-dashed border-border bg-transparent text-muted-foreground";
  }
}

function getEdgeDescription(
  edgeName: string,
  relation: AutotilePatternRelation,
): string {
  return `${edgeName} ${getEdgeLabel(relation).toLowerCase()}`;
}

export function AutotileWangPatternDiagram({
  definition,
  className,
}: AutotileWangPatternDiagramProps) {
  const north = definition.neighbors.north;
  const east = definition.neighbors.east;
  const south = definition.neighbors.south;
  const west = definition.neighbors.west;
  const description = [
    getEdgeDescription("top", north),
    getEdgeDescription("right", east),
    getEdgeDescription("bottom", south),
    getEdgeDescription("left", west),
  ].join(", ");

  const edgeCellClassName =
    "flex h-7 min-w-0 items-center justify-center rounded-md border px-1 text-center font-mono text-[8px] uppercase tracking-[0.08em]";

  return (
    <div
      role="img"
      aria-label={`${definition.label}. ${description}.`}
      className={cn("grid w-full max-w-28 grid-cols-3 gap-1", className)}
    >
      <div aria-hidden="true" />
      <div className={cn(edgeCellClassName, getEdgeClassName(north))}>
        {getEdgeLabel(north)}
      </div>
      <div aria-hidden="true" />
      <div className={cn(edgeCellClassName, getEdgeClassName(west))}>
        {getEdgeLabel(west)}
      </div>
      <div className="flex h-7 items-center justify-center rounded-md border border-foreground bg-foreground px-1 text-center font-mono text-[8px] uppercase tracking-[0.08em] text-background">
        Tile
      </div>
      <div className={cn(edgeCellClassName, getEdgeClassName(east))}>
        {getEdgeLabel(east)}
      </div>
      <div aria-hidden="true" />
      <div className={cn(edgeCellClassName, getEdgeClassName(south))}>
        {getEdgeLabel(south)}
      </div>
      <div aria-hidden="true" />
    </div>
  );
}
