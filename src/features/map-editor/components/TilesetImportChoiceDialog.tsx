import { Button } from "@/components/ui/Button";
import type { TilesetImportChoiceDialogProps } from "@/features/map-editor/types/tileset-import";

const TITLE_ID = "tileset-import-choice-title";
const DESCRIPTION_ID = "tileset-import-choice-description";

export function TilesetImportChoiceDialog({
  pendingImport,
  activeTileset,
  isBusy,
  error,
  onCreateNew,
  onAddToExisting,
  onCancel,
}: TilesetImportChoiceDialogProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/40 p-3 pointer-events-none">
      <div
        role="dialog"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
        className="pointer-events-auto w-[min(22rem,calc(100%-1.5rem))] rounded-md border border-border-visible bg-card p-4 shadow-lg"
      >
        <div className="space-y-1">
          <h2 id={TITLE_ID} className="text-sm font-medium text-foreground">
            Add Tileset Image
          </h2>
          <p id={DESCRIPTION_ID} className="sr-only">
            Choose whether the selected image becomes a new tileset or is placed
            into the active tileset.
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {pendingImport.fileName} - {pendingImport.width}x
            {pendingImport.height}px
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            disabled={isBusy}
            onClick={onCreateNew}
          >
            Create new tileset
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy || !activeTileset}
            onClick={onAddToExisting}
          >
            Add to active tileset
          </Button>
        </div>
        <div className="mt-2 flex justify-end">
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
