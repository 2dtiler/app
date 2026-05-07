import { AssetManagerDialog } from "@/features/map-editor/components/AssetManagerDialog";
import type { ManageTilesetsDialogProps } from "@/features/map-editor/types/tileset-panel";

export function ManageTilesetsDialog({
  open,
  onOpenChange,
  groups,
  tilesets,
  selectedGroupId,
  onSelectedGroupChange,
  onCreateGroup,
  onCreateTileset,
  onRenameGroup,
  onDeleteGroup,
  onRenameTileset,
  onDeleteTileset,
  onReorderGroups,
  onMoveTilesetToGroup,
  onReorderTilesets,
}: ManageTilesetsDialogProps) {
  return (
    <AssetManagerDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Manage Tilesets"
      description="Reorganize tileset groups and tilesets without losing the current editor context."
      groupSectionTitle="Tileset Groups"
      itemSectionTitle="Tilesets"
      createGroupLabel="New Group"
      createItemLabel="New Tileset"
      emptyItemsMessage="This group has no tilesets yet."
      groups={groups}
      items={tilesets}
      selectedGroupId={selectedGroupId}
      onSelectGroup={(groupId) =>
        onSelectedGroupChange(
          groupId as ManageTilesetsDialogProps["selectedGroupId"] & string,
        )
      }
      onCreateGroup={onCreateGroup}
      onCreateItem={(groupId) =>
        onCreateTileset(
          groupId as ManageTilesetsDialogProps["selectedGroupId"] & string,
        )
      }
      onRenameGroup={(groupId, name) =>
        onRenameGroup(
          groupId as ManageTilesetsDialogProps["selectedGroupId"] & string,
          name,
        )
      }
      onDeleteGroup={(groupId) =>
        onDeleteGroup(
          groupId as ManageTilesetsDialogProps["selectedGroupId"] & string,
        )
      }
      onRenameItem={(itemId, name) =>
        onRenameTileset(
          itemId as Parameters<ManageTilesetsDialogProps["onRenameTileset"]>[0],
          name,
        )
      }
      onDeleteItem={(itemId) =>
        onDeleteTileset(
          itemId as Parameters<ManageTilesetsDialogProps["onDeleteTileset"]>[0],
        )
      }
      onReorderGroups={(dragId, targetId, position) =>
        onReorderGroups(
          dragId as Parameters<ManageTilesetsDialogProps["onReorderGroups"]>[0],
          targetId as Parameters<
            ManageTilesetsDialogProps["onReorderGroups"]
          >[1],
          position,
        )
      }
      onMoveItemToGroup={(itemId, targetGroupId) =>
        onMoveTilesetToGroup(
          itemId as Parameters<
            ManageTilesetsDialogProps["onMoveTilesetToGroup"]
          >[0],
          targetGroupId as Parameters<
            ManageTilesetsDialogProps["onMoveTilesetToGroup"]
          >[1],
        )
      }
      onReorderItems={(dragId, targetId, position) =>
        onReorderTilesets(
          dragId as Parameters<
            ManageTilesetsDialogProps["onReorderTilesets"]
          >[0],
          targetId as Parameters<
            ManageTilesetsDialogProps["onReorderTilesets"]
          >[1],
          position,
        )
      }
    />
  );
}
