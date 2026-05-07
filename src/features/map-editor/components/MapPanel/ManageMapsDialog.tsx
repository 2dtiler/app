import { AssetManagerDialog } from "@/features/map-editor/components/AssetManagerDialog";
import type { ManageMapsDialogProps } from "@/features/map-editor/types/map-panel";

export function ManageMapsDialog({
  open,
  onOpenChange,
  groups,
  maps,
  selectedGroupId,
  onSelectedGroupChange,
  onCreateGroup,
  onCreateMap,
  onRenameGroup,
  onDeleteGroup,
  onRenameMap,
  onDeleteMap,
  onReorderGroups,
  onMoveMapToGroup,
  onReorderMaps,
}: ManageMapsDialogProps) {
  return (
    <AssetManagerDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Manage Maps"
      description="Organize map groups and maps for larger projects without leaving the editor."
      groupSectionTitle="Map Groups"
      itemSectionTitle="Maps"
      createGroupLabel="New Group"
      createItemLabel="New Map"
      emptyItemsMessage="This group has no maps yet."
      groups={groups}
      items={maps}
      selectedGroupId={selectedGroupId}
      onSelectGroup={(groupId) =>
        onSelectedGroupChange(
          groupId as ManageMapsDialogProps["selectedGroupId"] & string,
        )
      }
      onCreateGroup={onCreateGroup}
      onCreateItem={(groupId) =>
        onCreateMap(
          groupId as ManageMapsDialogProps["selectedGroupId"] & string,
        )
      }
      onRenameGroup={(groupId, name) =>
        onRenameGroup(
          groupId as ManageMapsDialogProps["selectedGroupId"] & string,
          name,
        )
      }
      onDeleteGroup={(groupId) =>
        onDeleteGroup(
          groupId as ManageMapsDialogProps["selectedGroupId"] & string,
        )
      }
      onRenameItem={(itemId, name) =>
        onRenameMap(
          itemId as Parameters<ManageMapsDialogProps["onRenameMap"]>[0],
          name,
        )
      }
      onDeleteItem={(itemId) =>
        onDeleteMap(
          itemId as Parameters<ManageMapsDialogProps["onDeleteMap"]>[0],
        )
      }
      onReorderGroups={(dragId, targetId, position) =>
        onReorderGroups(
          dragId as Parameters<ManageMapsDialogProps["onReorderGroups"]>[0],
          targetId as Parameters<ManageMapsDialogProps["onReorderGroups"]>[1],
          position,
        )
      }
      onMoveItemToGroup={(itemId, targetGroupId) =>
        onMoveMapToGroup(
          itemId as Parameters<ManageMapsDialogProps["onMoveMapToGroup"]>[0],
          targetGroupId as Parameters<
            ManageMapsDialogProps["onMoveMapToGroup"]
          >[1],
        )
      }
      onReorderItems={(dragId, targetId, position) =>
        onReorderMaps(
          dragId as Parameters<ManageMapsDialogProps["onReorderMaps"]>[0],
          targetId as Parameters<ManageMapsDialogProps["onReorderMaps"]>[1],
          position,
        )
      }
    />
  );
}
