export type AssetManagerDragType = "group" | "item";

export type AssetManagerGroupDropPosition = "above" | "below" | "inside";

export type AssetManagerItemDropPosition = "above" | "below";

export interface AssetManagerGroupLike {
  id: string;
  name: string;
  order: number;
}

export interface AssetManagerItemLike {
  id: string;
  name: string;
  groupId: string;
}

export interface AssetManagerGroupViewModel {
  id: string;
  name: string;
  itemCount: number;
  canDelete: boolean;
  deleteDisabledReason?: string;
}

export interface AssetManagerItemViewModel {
  id: string;
  name: string;
  subtitle?: string;
}

export interface AssetManagerDragState {
  type: AssetManagerDragType;
  id: string;
}

export interface AssetManagerGroupDropState {
  targetId: string;
  position: AssetManagerGroupDropPosition;
}

export interface AssetManagerItemDropState {
  targetId: string;
  position: AssetManagerItemDropPosition;
}

export interface AssetManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  groupSectionTitle: string;
  itemSectionTitle: string;
  createGroupLabel: string;
  createItemLabel: string;
  emptyItemsMessage: string;
  groups: AssetManagerGroupViewModel[];
  items: AssetManagerItemViewModel[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
  onCreateItem: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRenameItem: (itemId: string, name: string) => void;
  onDeleteItem: (itemId: string) => void;
  onReorderGroups: (
    dragId: string,
    targetId: string,
    position: Exclude<AssetManagerGroupDropPosition, "inside">,
  ) => void;
  onMoveItemToGroup: (itemId: string, targetGroupId: string) => void;
  onReorderItems: (
    dragId: string,
    targetId: string,
    position: AssetManagerItemDropPosition,
  ) => void;
}

export interface MoveGroupedItemOptions {
  targetGroupId: string;
  targetItemId?: string;
  position?: AssetManagerItemDropPosition;
}

export interface DeletedMapEntities {
  layerIds: string[];
  layerGroupIds: string[];
  objectLayerIds: string[];
  objectIds: string[];
}
