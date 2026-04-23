import { FillTerrainDialog } from "@/components/dialogs/FillTerrainDialog";
import { MapOptionsDialog } from "@/components/dialogs/MapOptionsDialog";
import { NewMapDialog } from "@/components/dialogs/NewMapDialog";
import { NewMapGroupDialog } from "@/components/dialogs/NewMapGroupDialog";
import { ObjectPropertiesDialogManager } from "@/components/editor/ObjectPropertiesDialogManager";
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
import type { MapPanelDialogsProps } from "@/types/map/map-panel";

export function MapPanelDialogs({
  activeMap,
  addGroupOpen,
  addMapOpen,
  deleteTarget,
  fillTerrainDialogOpen,
  mapOptionsOpen,
  newGroupName,
  newMapHeight,
  newMapName,
  newMapType,
  newMapWidth,
  onApplyTerrainFill,
  onCreateGroup,
  onCreateMap,
  onDeleteConfirm,
  onUpdateMapOptions,
  propsObjectId,
  setAddGroupOpen,
  setAddMapOpen,
  setDeleteTarget,
  setFillTerrainDialogOpen,
  setMapOptionsOpen,
  setNewGroupName,
  setNewMapHeight,
  setNewMapName,
  setNewMapType,
  setNewMapWidth,
  setPropsObjectId,
  state,
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
        open={fillTerrainDialogOpen}
        onOpenChange={setFillTerrainDialogOpen}
        onApply={onApplyTerrainFill}
      />

      <NewMapGroupDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        name={newGroupName}
        onNameChange={setNewGroupName}
        onCreate={onCreateGroup}
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
