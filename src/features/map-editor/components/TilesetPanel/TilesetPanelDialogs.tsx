import { NewTilesetGroupDialog } from "@/components/dialogs/NewTilesetGroupDialog";
import { AnimationDialog } from "@/features/map-editor/dialogs/AnimationDialog";
import { AutotileDialog } from "@/features/map-editor/dialogs/AutotileDialog";
import { ManageTilesetsDialog } from "./ManageTilesetsDialog";
import { TilesetDeleteDialog } from "../TilesetDeleteDialog";
import type { TilesetPanelDialogsProps } from "@/features/map-editor/types/tileset-panel";

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
        onCreateGroup={onCreateGroup}
        onCreateTileset={onCreateTileset}
        onRenameGroup={onRenameGroup}
        onDeleteGroup={onDeleteEmptyGroup}
        onRenameTileset={onRenameTileset}
        onDeleteTileset={onDeleteTileset}
        onReorderGroups={onReorderGroups}
        onMoveTilesetToGroup={onMoveTilesetToGroup}
        onReorderTilesets={onReorderTilesets}
      />

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
