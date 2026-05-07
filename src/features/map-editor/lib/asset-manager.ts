import type {
  AssetManagerDragType,
  AssetManagerGroupDropPosition,
  AssetManagerGroupLike,
  AssetManagerItemDropPosition,
  AssetManagerItemLike,
  MoveGroupedItemOptions,
} from "@/features/map-editor/types/asset-manager";

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) {
      return index;
    }
  }

  return -1;
}

export function getAssetManagerGroupDropPosition(
  dragType: AssetManagerDragType,
  pointerOffsetY: number,
  rowHeight: number,
): AssetManagerGroupDropPosition {
  if (dragType === "item") {
    return "inside";
  }

  const ratio = rowHeight <= 0 ? 0 : pointerOffsetY / rowHeight;

  if (ratio < 0.25) {
    return "above";
  }

  if (ratio > 0.75) {
    return "below";
  }

  return "inside";
}

export function getAssetManagerItemDropPosition(
  pointerOffsetY: number,
  rowHeight: number,
): AssetManagerItemDropPosition {
  const ratio = rowHeight <= 0 ? 0 : pointerOffsetY / rowHeight;
  return ratio < 0.5 ? "above" : "below";
}

export function reindexOrderedGroups<T extends AssetManagerGroupLike>(
  groups: T[],
): void {
  groups.forEach((group, index) => {
    group.order = index;
  });
}

export function moveOrderedGroup<T extends AssetManagerGroupLike>(
  groups: T[],
  dragId: string,
  targetId: string,
  position: Exclude<AssetManagerGroupDropPosition, "inside">,
): boolean {
  if (dragId === targetId) {
    return false;
  }

  const dragIndex = groups.findIndex((group) => group.id === dragId);
  const targetIndex = groups.findIndex((group) => group.id === targetId);

  if (dragIndex === -1 || targetIndex === -1) {
    return false;
  }

  const [draggedGroup] = groups.splice(dragIndex, 1);
  if (!draggedGroup) {
    return false;
  }

  const nextTargetIndex = groups.findIndex((group) => group.id === targetId);
  if (nextTargetIndex === -1) {
    groups.splice(dragIndex, 0, draggedGroup);
    return false;
  }

  const insertIndex =
    position === "below" ? nextTargetIndex + 1 : nextTargetIndex;
  groups.splice(insertIndex, 0, draggedGroup);
  reindexOrderedGroups(groups);
  return true;
}

export function moveGroupedItem<T extends AssetManagerItemLike>(
  items: T[],
  dragId: string,
  options: MoveGroupedItemOptions,
): boolean {
  const dragIndex = items.findIndex((item) => item.id === dragId);
  if (dragIndex === -1) {
    return false;
  }

  const draggedItem = items[dragIndex]!;
  if (
    options.targetItemId === dragId &&
    draggedItem.groupId === options.targetGroupId
  ) {
    return false;
  }

  const [removedItem] = items.splice(dragIndex, 1);
  if (!removedItem) {
    return false;
  }

  removedItem.groupId = options.targetGroupId as T["groupId"];

  if (options.targetItemId) {
    const targetIndex = items.findIndex(
      (item) => item.id === options.targetItemId,
    );
    if (targetIndex !== -1) {
      const insertIndex =
        options.position === "below" ? targetIndex + 1 : targetIndex;
      items.splice(insertIndex, 0, removedItem);
      return true;
    }
  }

  const lastGroupIndex = findLastIndex(
    items,
    (item) => item.groupId === options.targetGroupId,
  );
  if (lastGroupIndex === -1) {
    items.push(removedItem);
    return true;
  }

  items.splice(lastGroupIndex + 1, 0, removedItem);
  return true;
}

export function getAdjacentGroupedItemId<T extends AssetManagerItemLike>(
  items: T[],
  targetId: string,
): string | null {
  const targetItem = items.find((item) => item.id === targetId);
  if (!targetItem) {
    return null;
  }

  const groupItems = items.filter(
    (item) => item.groupId === targetItem.groupId,
  );
  const targetIndex = groupItems.findIndex((item) => item.id === targetId);
  if (targetIndex === -1) {
    return null;
  }

  return (
    groupItems[targetIndex + 1]?.id ?? groupItems[targetIndex - 1]?.id ?? null
  );
}
