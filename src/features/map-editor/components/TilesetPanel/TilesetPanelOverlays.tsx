import { QuickExportButtonGroup } from "@/features/import-export/components/QuickExportButtonGroup";
import { TilesetImportChoiceDialog } from "../TilesetImportChoiceDialog";
import { TilesetPlacementControls } from "../TilesetPlacementControls";
import type { TilesetPanelOverlaysProps } from "@/features/map-editor/types/tileset-panel";

export function TilesetPanelOverlays({
  activeTileSize,
  activeTileset,
  imageImportError,
  imageImportMode,
  isDropTargetActive,
  isImageImportBusy,
  pendingImport,
  placementCanvasSize,
  placementPosition,
  quickExportControl,
  onAddToExisting,
  onCancel,
  onCreateNew,
  onPlace,
  onPositionChange,
}: TilesetPanelOverlaysProps) {
  return (
    <>
      {pendingImport && imageImportMode === "choice" ? (
        <TilesetImportChoiceDialog
          pendingImport={pendingImport}
          activeTileset={activeTileset}
          isBusy={isImageImportBusy}
          error={imageImportError}
          onCreateNew={onCreateNew}
          onAddToExisting={onAddToExisting}
          onCancel={onCancel}
        />
      ) : null}

      {pendingImport &&
      imageImportMode === "placement" &&
      activeTileset &&
      placementCanvasSize ? (
        <TilesetPlacementControls
          pendingImport={pendingImport}
          position={placementPosition}
          tileSize={activeTileSize}
          canvasSize={placementCanvasSize}
          isBusy={isImageImportBusy}
          error={imageImportError}
          onPositionChange={onPositionChange}
          onPlace={onPlace}
          onCancel={onCancel}
        />
      ) : null}

      <div className="absolute bottom-3 right-3 z-20">
        <QuickExportButtonGroup
          buttonId="tileset-quick-export-button"
          buttonName="tileset-quick-export-button"
          dropdownButtonId="tileset-quick-export-dropdown"
          dropdownButtonName="tileset-quick-export-dropdown"
          state={quickExportControl}
        />
      </div>

      {isDropTargetActive ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary bg-background/80">
          <span className="rounded-md bg-background/90 px-3 py-2 text-xs font-medium text-foreground shadow-sm">
            Drop a file to choose tileset import options
          </span>
        </div>
      ) : null}
    </>
  );
}
