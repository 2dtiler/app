import { ContextMenu, ContextMenuTrigger } from "@/components/ui/ContextMenu";
import { QuickExportButtonGroup } from "@/features/import-export/components/QuickExportButtonGroup";
import { MapCanvas } from "@/features/map-editor/components/MapCanvas";
import { MapCanvasContextMenuContent } from "./MapCanvasContextMenuContent";
import type { MapPanelWorkspaceProps } from "@/features/map-editor/types/map-panel";
import type { ObjectId, TileMapData } from "@/types";

export function MapPanelWorkspace({
  activeLayerEffectivelyLocked,
  activeMap,
  canCopy,
  canCut,
  canDeleteSelection,
  canEditInImageEditor,
  canOrientContextMenu,
  canPaste,
  clearHoverTile,
  containerRef,
  contextMenuObjectId,
  flatImageLayers,
  flatLayers,
  flatMap,
  flatObjectLayers,
  flatObjects,
  groupMaps,
  handleMapContextMenu,
  handleMapMouseMove,
  hasContextMenuObject,
  mapCanvasRef,
  mapZoom,
  onCancelPendingObject,
  onCopySelection,
  onCreateObject,
  onCutSelection,
  onDeleteSelection,
  onEditInImageEditor,
  onMoveImageLayer,
  onMoveObject,
  onMoveTiles,
  onOpenObjectProperties,
  onOrientSelection,
  onPaintEnd,
  onPaintTile,
  onPlaceAnimation,
  onPasteSelection,
  onResizeImageLayer,
  onResizeMap,
  onResizeObject,
  onSelectObject,
  onSelectionChange,
  onUpdatePolygonPoints,
  paintBuffer,
  paintBufferVersion,
  project,
  quickExportControl,
  state,
  textObjectEditing,
}: MapPanelWorkspaceProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative min-h-0 flex-1">
          <div
            ref={containerRef}
            className="h-full min-h-0 overflow-auto"
            onContextMenu={handleMapContextMenu}
            onMouseMove={handleMapMouseMove}
            onMouseLeave={clearHoverTile}
          >
            {activeMap && flatMap ? (
              <MapCanvas
                map={flatMap as TileMapData}
                layers={flatLayers}
                tilesets={[
                  ...project.tilesets,
                  ...(project.overrideTilesets ?? []),
                ]}
                zoom={mapZoom}
                activeLayerId={state.activeLayerId}
                currentTool={state.currentTool}
                fillMode={state.fillMode}
                activeFillTerrain={state.activeFillTerrain}
                canPreviewFill={!activeLayerEffectivelyLocked}
                brushSize={state.brushSize}
                selectedTileSize={state.tileSize}
                selectedTile={state.selectedTile}
                onResizeMap={onResizeMap}
                onPaintTile={onPaintTile}
                onPlaceAnimation={onPlaceAnimation}
                onPaintEnd={onPaintEnd}
                paintBuffer={paintBuffer}
                paintBufferVersion={paintBufferVersion}
                imperativeRef={mapCanvasRef}
                mapSelection={state.mapSelection}
                onSelectionChange={onSelectionChange}
                onMoveTiles={onMoveTiles}
                imageLayers={flatImageLayers}
                onMoveImageLayer={onMoveImageLayer}
                onResizeImageLayer={onResizeImageLayer}
                objectLayers={flatObjectLayers}
                objects={flatObjects}
                activeObjectId={state.activeObjectId}
                pendingObjectType={state.pendingObjectType}
                onCreateObject={onCreateObject}
                onCancelPendingObject={onCancelPendingObject}
                onMoveObject={onMoveObject}
                onResizeObject={onResizeObject}
                onUpdatePolygonPoints={onUpdatePolygonPoints}
                onSelectObject={(id) => onSelectObject(id as ObjectId | null)}
                editingTextObject={textObjectEditing.editing}
                onEditingTextChange={textObjectEditing.updateText}
                onCommitTextEditing={textObjectEditing.commitEditing}
                onCancelTextEditing={textObjectEditing.cancelEditing}
                onDoubleClickObject={(id) =>
                  onOpenObjectProperties(id as ObjectId)
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {groupMaps.length === 0
                  ? "Click '+ Add Map' to create a map"
                  : "Select a map tab"}
              </div>
            )}
          </div>
          {activeMap && flatMap ? (
            <div className="absolute bottom-3 right-3 z-20">
              <QuickExportButtonGroup
                buttonId="map-quick-export-button"
                buttonName="map-quick-export-button"
                dropdownButtonId="map-quick-export-dropdown"
                dropdownButtonName="map-quick-export-dropdown"
                state={quickExportControl}
              />
            </div>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <MapCanvasContextMenuContent
        canCopy={canCopy}
        canCut={canCut}
        canDeleteSelection={canDeleteSelection}
        canPaste={canPaste}
        canEditInImageEditor={canEditInImageEditor}
        canOrientContextMenu={canOrientContextMenu}
        hasContextMenuObject={hasContextMenuObject}
        onCopy={() => {
          void onCopySelection(true);
        }}
        onCut={() => {
          void onCutSelection(true);
        }}
        onDelete={() => {
          onDeleteSelection(true);
        }}
        onPaste={() => {
          void onPasteSelection(true);
        }}
        onEditInImageEditor={onEditInImageEditor}
        onEditObjectProperties={() => {
          if (contextMenuObjectId) {
            onOpenObjectProperties(contextMenuObjectId);
          }
        }}
        onOrientSelection={(action) => {
          onOrientSelection(action, true);
        }}
      />
    </ContextMenu>
  );
}
