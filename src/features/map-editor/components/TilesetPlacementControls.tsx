import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { TilesetPlacementControlsProps } from "@/features/map-editor/types/tileset-import";

const TITLE_ID = "tileset-placement-controls-title";
const DESCRIPTION_ID = "tileset-placement-controls-description";

export function TilesetPlacementControls({
  pendingImport,
  position,
  tileSize,
  canvasSize,
  isBusy,
  error,
  onPositionChange,
  onPlace,
  onCancel,
}: TilesetPlacementControlsProps) {
  const tileX = Math.floor(position.x / tileSize);
  const tileY = Math.floor(position.y / tileSize);

  function updateTileX(value: string) {
    const nextTileX = Math.max(0, Number(value) || 0);
    onPositionChange({ x: nextTileX * tileSize, y: position.y });
  }

  function updateTileY(value: string) {
    const nextTileY = Math.max(0, Number(value) || 0);
    onPositionChange({ x: position.x, y: nextTileY * tileSize });
  }

  return (
    <div className="absolute left-3 bottom-3 z-30 pointer-events-none">
      <div
        role="dialog"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
        className="pointer-events-auto w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-border-visible bg-card p-3 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={TITLE_ID} className="text-sm font-medium text-foreground">
              Place Image
            </h2>
            <p id={DESCRIPTION_ID} className="sr-only">
              Set the tile-grid position for the imported image before placing
              it into the active tileset.
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {pendingImport.name} - canvas {canvasSize.width}x
              {canvasSize.height}px
            </p>
          </div>
          <Button type="button" size="sm" disabled={isBusy} onClick={onPlace}>
            Place
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="tileset-placement-x" className="text-xs">
              X tile
            </Label>
            <Input
              id="tileset-placement-x"
              name="tileset-placement-x"
              type="number"
              min={0}
              step={1}
              value={tileX}
              disabled={isBusy}
              onChange={(event) => updateTileX(event.target.value)}
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label htmlFor="tileset-placement-y" className="text-xs">
              Y tile
            </Label>
            <Input
              id="tileset-placement-y"
              name="tileset-placement-y"
              type="number"
              min={0}
              step={1}
              value={tileY}
              disabled={isBusy}
              onChange={(event) => updateTileY(event.target.value)}
              className="mt-1 h-8"
            />
          </div>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
