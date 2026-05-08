import { useState } from "react";
import { NewTilesetGroupDialog } from "@/components/dialogs/NewTilesetGroupDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { AnimationDialog } from "@/features/map-editor/dialogs/AnimationDialog";
import { AutotileDialog } from "@/features/map-editor/dialogs/AutotileDialog";
import { ManageTilesetsDialog } from "./ManageTilesetsDialog";
import { TilesetDeleteDialog } from "../TilesetDeleteDialog";
import type { TilesetPanelDialogsProps } from "@/features/map-editor/types/tileset-panel";
import type { TilesetGroupId } from "@/types";

export function TilesetPanelDialogs({
  activeTileset,
  addGroupOpen,
  animationDialogOpen,
  autotileDialogOpen,
  deleteTarget,
  editingAnimation,
  manageTilesetGroups,
  manageTilesetItems,
  manageTilesetsOpen,
  manageTilesetsSelectedGroupId,
  newGroupName,
  onCreateGroup,
  onCreateTileset,
  onDeleteConfirm,
  onDeleteEmptyGroup,
  onDeleteTileset,
  onMoveTilesetToGroup,
  onRenameGroup,
  onRenameTileset,
  onReorderGroups,
  onReorderTilesets,
  onSaveAnimation,
  onSaveAutotile,
  setAddGroupOpen,
  setAnimationDialogOpen,
  setAutotileDialogOpen,
  setDeleteTarget,
  setManageTilesetsOpen,
  setManageTilesetsSelectedGroupId,
  setNewGroupName,
}: TilesetPanelDialogsProps) {
  const [blockedDeleteGroupName, setBlockedDeleteGroupName] = useState<
    string | null
  >(null);

  function handleRequestCreateGroup() {
    setNewGroupName("");
    setAddGroupOpen(true);
  }

  function handleRequestDeleteGroup(groupId: string) {
    const group = manageTilesetGroups.find((entry) => entry.id === groupId);
    if (!group) {
      return;
    }

    if (group.itemCount > 0) {
      setBlockedDeleteGroupName(group.name);
      return;
    }

    onDeleteEmptyGroup(groupId as TilesetGroupId);
  }

  return (
    <>
      <NewTilesetGroupDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        name={newGroupName}
        onNameChange={setNewGroupName}
        onCreate={onCreateGroup}
      />

      <ManageTilesetsDialog
        open={manageTilesetsOpen}
        onOpenChange={setManageTilesetsOpen}
        groups={manageTilesetGroups}
        tilesets={manageTilesetItems}
        selectedGroupId={manageTilesetsSelectedGroupId}
        onSelectedGroupChange={setManageTilesetsSelectedGroupId}
        onCreateGroup={handleRequestCreateGroup}
        onCreateTileset={onCreateTileset}
        onRenameGroup={onRenameGroup}
        onDeleteGroup={handleRequestDeleteGroup}
        onRenameTileset={onRenameTileset}
        onDeleteTileset={onDeleteTileset}
        onReorderGroups={onReorderGroups}
        onMoveTilesetToGroup={onMoveTilesetToGroup}
        onReorderTilesets={onReorderTilesets}
      />

      {blockedDeleteGroupName ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setBlockedDeleteGroupName(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Can&apos;t delete this group yet
              </AlertDialogTitle>
              <AlertDialogDescription>
                Move or delete all tilesets in this group first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>OK</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {activeTileset ? (
        <AutotileDialog
          key={`${activeTileset.id}-${autotileDialogOpen ? "open" : "closed"}`}
          open={autotileDialogOpen}
          onOpenChange={setAutotileDialogOpen}
          onSave={onSaveAutotile}
          tileset={activeTileset}
        />
      ) : null}

      {activeTileset && animationDialogOpen ? (
        <AnimationDialog
          key={`${activeTileset.id}-${editingAnimation?.id ?? "new"}-open`}
          animation={editingAnimation}
          open={animationDialogOpen}
          onOpenChange={setAnimationDialogOpen}
          onSave={onSaveAnimation}
          tileset={activeTileset}
        />
      ) : null}

      <TilesetDeleteDialog
        deleteTarget={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={onDeleteConfirm}
      />
    </>
  );
}
