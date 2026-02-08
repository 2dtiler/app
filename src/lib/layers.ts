/**
 * Layer tree utility functions.
 *
 * Layer groups create a tree structure. These helpers flatten, traverse,
 * and query the tree for rendering, export, and UI purposes.
 */

import type {
  LayerId,
  LayerGroupId,
  LayerGroup,
  TileLayer,
} from "@/types";

// ---------------------------------------------------------------------------
// Tree traversal
// ---------------------------------------------------------------------------

/**
 * Recursively collect all LayerIds from a layer order (including nested groups).
 */
export function getAllLayerIds(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  groups: readonly LayerGroup[],
): LayerId[] {
  const result: LayerId[] = [];
  for (const id of layerOrder) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      result.push(...getAllLayerIds(group.childOrder, groups));
    } else {
      result.push(id as LayerId);
    }
  }
  return result;
}

/**
 * Recursively collect all LayerGroupIds from a layer order.
 */
export function getAllGroupIds(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  groups: readonly LayerGroup[],
): LayerGroupId[] {
  const result: LayerGroupId[] = [];
  for (const id of layerOrder) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      result.push(group.id);
      result.push(...getAllGroupIds(group.childOrder, groups));
    }
  }
  return result;
}

/**
 * Flatten the layer tree into an ordered list of TileLayer objects
 * (bottom-to-top) with effective visibility and lock state applied.
 *
 * Group visibility/lock is inherited by children.
 */
export function flattenLayerTree(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  layers: readonly TileLayer[],
  groups: readonly LayerGroup[],
  parentVisible = true,
  parentLocked = false,
): TileLayer[] {
  const result: TileLayer[] = [];
  for (const id of layerOrder) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      result.push(
        ...flattenLayerTree(
          group.childOrder,
          layers,
          groups,
          parentVisible && group.visible,
          parentLocked || group.locked,
        ),
      );
    } else {
      const layer = layers.find((l) => l.id === id);
      if (layer) {
        result.push({
          ...layer,
          visible: parentVisible && layer.visible,
          locked: parentLocked || layer.locked,
        });
      }
    }
  }
  return result;
}

/**
 * Find the topmost (last in render order) LayerId in the tree.
 * Useful for selecting a default layer after deletion.
 */
export function findLastLayerId(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  layers: readonly TileLayer[],
  groups: readonly LayerGroup[],
): LayerId | null {
  // Walk in reverse (top to bottom visually)
  for (let i = layerOrder.length - 1; i >= 0; i--) {
    const id = layerOrder[i];
    const group = groups.find((g) => g.id === id);
    if (group) {
      const found = findLastLayerId(group.childOrder, layers, groups);
      if (found) return found;
    } else {
      const layer = layers.find((l) => l.id === id);
      if (layer) return layer.id;
    }
  }
  return null;
}

/**
 * Find the parent group that directly contains a given item (layer or group).
 * Returns null if the item is at the top level.
 */
export function findParentGroupId(
  itemId: LayerId | LayerGroupId,
  layerOrder: readonly (LayerId | LayerGroupId)[],
  groups: readonly LayerGroup[],
): LayerGroupId | null {
  // Check top level first
  const itemIdStr = itemId as string;
  if (layerOrder.some((id) => (id as string) === itemIdStr)) return null;

  // Search through groups
  for (const group of groups) {
    if (group.childOrder.some((id) => (id as string) === itemIdStr))
      return group.id;
    // For deeply nested groups, recurse
    const nested = findParentGroupId(itemId, group.childOrder, groups);
    if (nested !== null) return nested;
  }
  return null;
}

/**
 * Check if a given layer's effective locked state is true,
 * considering parent group inheritance.
 */
export function isLayerEffectivelyLocked(
  layerId: LayerId,
  layerOrder: readonly (LayerId | LayerGroupId)[],
  layers: readonly TileLayer[],
  groups: readonly LayerGroup[],
): boolean {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return true;
  if (layer.locked) return true;

  // Walk up the group hierarchy
  let currentId: LayerId | LayerGroupId = layerId;
  let parentId = findParentGroupId(currentId, layerOrder, groups);
  while (parentId !== null) {
    const parentGroup = groups.find((g) => g.id === parentId);
    if (parentGroup?.locked) return true;
    currentId = parentId;
    parentId = findParentGroupId(currentId, layerOrder, groups);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Display tree (for layers panel UI)
// ---------------------------------------------------------------------------

/**
 * Check whether `ancestorId` is an ancestor of `descendantId` in the tree.
 * Used to prevent dropping a group into itself or its own descendants.
 */
export function isAncestorOf(
  ancestorId: string,
  descendantId: string,
  groups: readonly LayerGroup[],
): boolean {
  if (ancestorId === descendantId) return true;
  const group = groups.find((g) => g.id === ancestorId);
  if (!group) return false;
  for (const childId of group.childOrder) {
    if (isAncestorOf(childId as string, descendantId, groups)) return true;
  }
  return false;
}

export type LayerTreeNode =
  | {
      type: "layer";
      layer: TileLayer;
      depth: number;
      parentGroupId: LayerGroupId | null;
    }
  | {
      type: "group";
      group: LayerGroup;
      depth: number;
      parentGroupId: LayerGroupId | null;
    };

/**
 * Build a flat list of tree nodes for rendering in the layers panel.
 * Returns nodes in display order (top-to-bottom = reversed render order).
 */
export function buildDisplayTree(
  order: readonly (LayerId | LayerGroupId)[],
  layers: readonly TileLayer[],
  groups: readonly LayerGroup[],
  depth = 0,
  parentGroupId: LayerGroupId | null = null,
): LayerTreeNode[] {
  const nodes: LayerTreeNode[] = [];
  // Display top-to-bottom = reverse of bottom-to-top order
  for (const id of [...order].reverse()) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      nodes.push({ type: "group", group, depth, parentGroupId });
      if (group.expanded) {
        nodes.push(
          ...buildDisplayTree(
            group.childOrder,
            layers,
            groups,
            depth + 1,
            group.id,
          ),
        );
      }
    } else {
      const layer = layers.find((l) => l.id === id);
      if (layer) {
        nodes.push({ type: "layer", layer, depth, parentGroupId });
      }
    }
  }
  return nodes;
}
