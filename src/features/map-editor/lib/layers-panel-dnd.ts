import type { LayerDropPosition } from "@/features/map-editor/types/layers-panel";
import type { LayerGroup, LayerGroupId, LayerId, TileMapData } from "@/types";

export function getLayerDropPosition(
  targetIsGroup: boolean,
  pointerOffsetY: number,
  rowHeight: number,
): LayerDropPosition {
  const ratio = rowHeight <= 0 ? 0 : pointerOffsetY / rowHeight;

  if (targetIsGroup) {
    if (ratio < 0.25) {
      return "above";
    }
    if (ratio > 0.75) {
      return "below";
    }
    return "inside";
  }

  return ratio < 0.5 ? "above" : "below";
}

function removeFromOrder(
  order: (LayerId | LayerGroupId)[],
  dragId: string,
) {
  const itemIndex = (order as string[]).indexOf(dragId);
  if (itemIndex !== -1) {
    order.splice(itemIndex, 1);
  }
}

function findTargetOrder(
  layerOrder: TileMapData["layerOrder"],
  layerGroups: LayerGroup[],
  targetId: string,
) {
  if ((layerOrder as string[]).includes(targetId)) {
    return layerOrder;
  }

  return (
    layerGroups.find((group) => (group.childOrder as string[]).includes(targetId))
      ?.childOrder ?? null
  );
}

export function applyLayerDrop(
  layerOrder: TileMapData["layerOrder"],
  layerGroups: LayerGroup[],
  dragId: string,
  targetId: string,
  position: LayerDropPosition,
) {
  removeFromOrder(layerOrder, dragId);
  for (const group of layerGroups) {
    removeFromOrder(group.childOrder, dragId);
  }

  if (position === "inside") {
    const targetGroup = layerGroups.find((group) => group.id === targetId);
    if (targetGroup) {
      targetGroup.childOrder.push(dragId as LayerId | LayerGroupId);
      targetGroup.expanded = true;
    }
    return;
  }

  const targetOrder = findTargetOrder(layerOrder, layerGroups, targetId);
  if (!targetOrder) {
    return;
  }

  const targetIndex = (targetOrder as string[]).indexOf(targetId);
  if (targetIndex === -1) {
    return;
  }

  const insertIndex = position === "above" ? targetIndex + 1 : targetIndex;
  targetOrder.splice(insertIndex, 0, dragId as LayerId | LayerGroupId);
}