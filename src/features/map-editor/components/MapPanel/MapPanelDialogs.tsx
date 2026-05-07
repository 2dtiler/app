import { FillTerrainDialog } from "@/features/map-editor/dialogs/FillTerrainDialog";
import { MapOptionsDialog } from "@/features/map-editor/dialogs/MapOptionsDialog";
import { NewMapDialog } from "@/features/map-editor/dialogs/NewMapDialog";
import { ManageMapsDialog } from "./ManageMapsDialog";
import { NewMapGroupDialog } from "@/components/dialogs/NewMapGroupDialog";
import { ObjectPropertiesDialogManager } from "@/features/map-editor/components/ObjectPropertiesDialogManager";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import type { MapPanelDialogsProps } from "@/features/map-editor/types/map-panel";

export function MapPanelDialogs({
  activeMap,
  addGroupOpen,
  addMapOpen,
  deleteTarget,
  manageMapsGroups,
  manageMapsItems,
  manageMapsOpen,
  manageMapsSelectedGroupId,
  mapOptionsOpen,
  newGroupName,
  newMapHeight,
  newMapName,
  newMapType,
  newMapWidth,
  onApplyTerrainSelection,
  onDeleteTerrain,
  onCreateGroup,
  onCreateMap,
  onDeleteEmptyGroup,
  onDeleteConfirm,
  onImportMapFromFile,
  onManageMapsSelectedGroupChange,
  onMoveMapToGroup,
  onRenameGroup,
  onRenameMap,
  onReorderGroups,
  onReorderMaps,
  onUpdateMapOptions,
  propsObjectId,
  setAddGroupOpen,
  setAddMapOpen,
  setDeleteTarget,
  setManageMapsOpen,
  setMapOptionsOpen,
  setNewGroupName,
  setNewMapHeight,
  setNewMapName,
  setNewMapType,
  setNewMapWidth,
  setPropsObjectId,
  state,
  terrainDialogOpen,
  terrainDialogTarget,
  terrainDialogInitialTerrainId,
  terrainDialogInitialTiles,
  setTerrainDialogOpen,
}: MapPanelDialogsProps) {
  return (
    <>
      <NewMapDialog
        open={addMapOpen}
        onOpenChange={setAddMapOpen}
        name={newMapName}
        width={newMapWidth}
        height={newMapHeight}
        mapType={newMapType}
        tileSize={state.tileSize}
        onNameChange={setNewMapName}
        onWidthChange={setNewMapWidth}
        onHeightChange={setNewMapHeight}
        onMapTypeChange={setNewMapType}
        onCreate={onCreateMap}
        onImportMapFromFile={onImportMapFromFile}
      />

      {activeMap && (
        <MapOptionsDialog
          key={`${activeMap.id}-${mapOptionsOpen ? "open" : "closed"}`}
          open={mapOptionsOpen}
          onOpenChange={setMapOptionsOpen}
          map={activeMap}
          onSave={onUpdateMapOptions}
        />
      )}

      <FillTerrainDialog
        open={terrainDialogOpen}
        onOpenChange={setTerrainDialogOpen}
        onApply={onApplyTerrainSelection}
        onDeleteTerrain={onDeleteTerrain}
        initialTerrainId={terrainDialogInitialTerrainId}
        initialTiles={terrainDialogInitialTiles}
        target={terrainDialogTarget}
      />

      <NewMapGroupDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        name={newGroupName}
        onNameChange={setNewGroupName}
        onCreate={onCreateGroup}
      />

      <ManageMapsDialog
        open={manageMapsOpen}
        onOpenChange={setManageMapsOpen}
        groups={manageMapsGroups}
        maps={manageMapsItems}
        selectedGroupId={manageMapsSelectedGroupId}
        onSelectedGroupChange={onManageMapsSelectedGroupChange}
        onCreateGroup={onCreateGroup}
        onCreateMap={onCreateMap}
        onRenameGroup={onRenameGroup}
        onDeleteGroup={onDeleteEmptyGroup}
        onRenameMap={onRenameMap}
        onDeleteMap={(mapId) => {
          const map = state.project?.maps.find((entry) => entry.id === mapId);
          if (!map) {
            return;
          }

          setDeleteTarget({
            type: "map",
            id: map.id,
            name: map.name,
          });
        }}
        onReorderGroups={onReorderGroups}
        onMoveMapToGroup={onMoveMapToGroup}
        onReorderMaps={onReorderMaps}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}"
              {deleteTarget?.type === "group" && " and all maps in it"}. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onMouseDown={onDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ObjectPropertiesDialogManager
        objectId={propsObjectId}
        open={!!propsObjectId}
        onOpenChange={(open) => !open && setPropsObjectId(null)}
      />
    </>
  );
}
