import { AutotileTilePreview } from "@/features/map-editor/components/autotile/AutotileTilePreview";
import type { AutotileDualGridSetupPanelProps } from "@/features/map-editor/types/autotile-dialog";

export function AutotileDualGridSetupPanel({
  terrain,
  tilesetImage,
}: AutotileDualGridSetupPanelProps) {
  return (
    <section
      role="region"
      aria-label="Dual Grid TileMapDual atlas"
      className="space-y-3 rounded-xl border border-border bg-background/70 p-3"
    >
      <div className="space-y-1">
        <h5 className="text-xs font-medium text-foreground">
          Dual Grid (TileMapDual 4×4)
        </h5>
        <p className="text-xs text-muted-foreground">
          This tileset must be a 4×4 Godot TileMapDual atlas starting at the
          top-left cell. The 15 corner tiles and paint tile are assigned
          automatically. Mask 0 at column 0, row 3 stays empty.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <AutotileTilePreview
          image={tilesetImage}
          region={terrain.paletteTile}
          size={60}
          emptyLabel="Fill"
          className="h-15 w-15"
          ariaLabel={`Fully filled Dual Grid paint tile for ${terrain.name}`}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Paint Tile
          </p>
          <p className="text-xs text-foreground">
            {terrain.paletteTile
              ? `Atlas cell (2, 1) at pixel (${terrain.paletteTile.sx}, ${terrain.paletteTile.sy})`
              : "Waiting for a 4×4 TileMapDual atlas"}
          </p>
        </div>
      </div>
    </section>
  );
}
