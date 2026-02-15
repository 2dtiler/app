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
  ImageLayer,
  ObjectLayer,
} from "@/types";

// ---------------------------------------------------------------------------
// Index Map builder (js-index-maps: O(1) lookups instead of O(n) .find())
// ---------------------------------------------------------------------------

function buildGroupMap(groups: readonly LayerGroup[]): Map<string, LayerGroup> {
  return new Map(groups.map((g) => [g.id as string, g]));
}

function buildLayerMap(layers: readonly TileLayer[]): Map<string, TileLayer> {
  return new Map(layers.map((l) => [l.id as string, l]));
}

function buildImageLayerMap(
  layers: readonly ImageLayer[],
): Map<string, ImageLayer> {
  return new Map(layers.map((l) => [l.id as string, l]));
}

function buildObjectLayerMap(
  layers: readonly ObjectLayer[],
): Map<string, ObjectLayer> {
  return new Map(layers.map((l) => [l.id as string, l]));
}

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
  const groupMap = buildGroupMap(groups);
  return getAllLayerIdsImpl(layerOrder, groupMap);
}

function getAllLayerIdsImpl(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  groupMap: Map<string, LayerGroup>,
): LayerId[] {
  const result: LayerId[] = [];
  for (const id of layerOrder) {
    const group = groupMap.get(id as string);
    if (group) {
      result.push(...getAllLayerIdsImpl(group.childOrder, groupMap));
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
  const groupMap = buildGroupMap(groups);
  return getAllGroupIdsImpl(layerOrder, groupMap);
}

function getAllGroupIdsImpl(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  groupMap: Map<string, LayerGroup>,
): LayerGroupId[] {
  const result: LayerGroupId[] = [];
  for (const id of layerOrder) {
    const group = groupMap.get(id as string);
    if (group) {
      result.push(group.id);
      result.push(...getAllGroupIdsImpl(group.childOrder, groupMap));
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
  const groupMap = buildGroupMap(groups);
  const layerMap = buildLayerMap(layers);
  return flattenLayerTreeImpl(
    layerOrder,
    layerMap,
    groupMap,
    parentVisible,
    parentLocked,
  );
}

function flattenLayerTreeImpl(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  layerMap: Map<string, TileLayer>,
  groupMap: Map<string, LayerGroup>,
  parentVisible: boolean,
  parentLocked: boolean,
): TileLayer[] {
  const result: TileLayer[] = [];
  for (const id of layerOrder) {
    const group = groupMap.get(id as string);
    if (group) {
      result.push(
        ...flattenLayerTreeImpl(
          group.childOrder,
          layerMap,
          groupMap,
          parentVisible && group.visible,
          parentLocked || group.locked,
        ),
      );
    } else {
      const layer = layerMap.get(id as string);
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
 * Flatten the layer tree to extract image layers in render order (bottom-to-top)
 * with effective visibility and lock state inherited from parent groups.
 */
export function flattenImageLayers(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  imageLayers: readonly ImageLayer[],
  groups: readonly LayerGroup[],
  parentVisible = true,
  parentLocked = false,
): ImageLayer[] {
  const groupMap = buildGroupMap(groups);
  const imageLayerMap = buildImageLayerMap(imageLayers);
  return flattenImageLayersImpl(
    layerOrder,
    imageLayerMap,
    groupMap,
    parentVisible,
    parentLocked,
  );
}

function flattenImageLayersImpl(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  imageLayerMap: Map<string, ImageLayer>,
  groupMap: Map<string, LayerGroup>,
  parentVisible: boolean,
  parentLocked: boolean,
): ImageLayer[] {
  const result: ImageLayer[] = [];
  for (const id of layerOrder) {
    const group = groupMap.get(id as string);
    if (group) {
      result.push(
        ...flattenImageLayersImpl(
          group.childOrder,
          imageLayerMap,
          groupMap,
          parentVisible && group.visible,
          parentLocked || group.locked,
        ),
      );
    } else {
      const layer = imageLayerMap.get(id as string);
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
 * Flatten the layer tree to extract object layers in render order (bottom-to-top)
 * with effective visibility and lock state inherited from parent groups.
 */
export function flattenObjectLayers(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  objectLayers: readonly ObjectLayer[],
  groups: readonly LayerGroup[],
  parentVisible = true,
  parentLocked = false,
): ObjectLayer[] {
  const groupMap = buildGroupMap(groups);
  const objectLayerMap = buildObjectLayerMap(objectLayers);
  return flattenObjectLayersImpl(
    layerOrder,
    objectLayerMap,
    groupMap,
    parentVisible,
    parentLocked,
  );
}

function flattenObjectLayersImpl(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  objectLayerMap: Map<string, ObjectLayer>,
  groupMap: Map<string, LayerGroup>,
  parentVisible: boolean,
  parentLocked: boolean,
): ObjectLayer[] {
  const result: ObjectLayer[] = [];
  for (const id of layerOrder) {
    const group = groupMap.get(id as string);
    if (group) {
      result.push(
        ...flattenObjectLayersImpl(
          group.childOrder,
          objectLayerMap,
          groupMap,
          parentVisible && group.visible,
          parentLocked || group.locked,
        ),
      );
    } else {
      const layer = objectLayerMap.get(id as string);
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
  imageLayers: readonly ImageLayer[] = [],
  objectLayers: readonly ObjectLayer[] = [],
): LayerId | null {
  const groupMap = buildGroupMap(groups);
  const layerMap = buildLayerMap(layers);
  const imageLayerMap = buildImageLayerMap(imageLayers);
  const objectLayerMap = buildObjectLayerMap(objectLayers);
  return findLastLayerIdImpl(
    layerOrder,
    layerMap,
    groupMap,
    imageLayerMap,
    objectLayerMap,
  );
}

function findLastLayerIdImpl(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  layerMap: Map<string, TileLayer>,
  groupMap: Map<string, LayerGroup>,
  imageLayerMap: Map<string, ImageLayer> = new Map(),
  objectLayerMap: Map<string, ObjectLayer> = new Map(),
): LayerId | null {
  // Walk in reverse (top to bottom visually)
  for (let i = layerOrder.length - 1; i >= 0; i--) {
    const id = layerOrder[i];
    const group = groupMap.get(id as string);
    if (group) {
      const found = findLastLayerIdImpl(
        group.childOrder,
        layerMap,
        groupMap,
        imageLayerMap,
        objectLayerMap,
      );
      if (found) return found;
    } else {
      const layer = layerMap.get(id as string);
      if (layer) return layer.id;
      const imgLayer = imageLayerMap.get(id as string);
      if (imgLayer) return imgLayer.id;
      const objLayer = objectLayerMap.get(id as string);
      if (objLayer) return objLayer.id;
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
  // Check top level first (js-early-exit)
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
  imageLayers: readonly ImageLayer[] = [],
  objectLayers: readonly ObjectLayer[] = [],
): boolean {
  const layerMap = buildLayerMap(layers);
  const layer = layerMap.get(layerId as string);
  if (layer) {
    if (layer.locked) return true;
  } else {
    const imageLayerMap = buildImageLayerMap(imageLayers);
    const imgLayer = imageLayerMap.get(layerId as string);
    if (imgLayer) {
      if (imgLayer.locked) return true;
    } else {
      const objectLayerMap = buildObjectLayerMap(objectLayers);
      const objLayer = objectLayerMap.get(layerId as string);
      if (objLayer) {
        if (objLayer.locked) return true;
      } else {
        return true; // not found = locked
      }
    }
  }

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
      type: "imageLayer";
      layer: ImageLayer;
      depth: number;
      parentGroupId: LayerGroupId | null;
    }
  | {
      type: "objectLayer";
      layer: ObjectLayer;
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
  imageLayers: readonly ImageLayer[] = [],
  objectLayers: readonly ObjectLayer[] = [],
): LayerTreeNode[] {
  // Build index maps at top level; reuse via inner impl for recursion
  const groupMap = buildGroupMap(groups);
  const layerMap = buildLayerMap(layers);
  const imageLayerMap = buildImageLayerMap(imageLayers);
  const objectLayerMap = buildObjectLayerMap(objectLayers);
  return buildDisplayTreeImpl(
    order,
    layerMap,
    groupMap,
    imageLayerMap,
    objectLayerMap,
    depth,
    parentGroupId,
  );
}

function buildDisplayTreeImpl(
  order: readonly (LayerId | LayerGroupId)[],
  layerMap: Map<string, TileLayer>,
  groupMap: Map<string, LayerGroup>,
  imageLayerMap: Map<string, ImageLayer>,
  objectLayerMap: Map<string, ObjectLayer>,
  depth: number,
  parentGroupId: LayerGroupId | null,
): LayerTreeNode[] {
  const nodes: LayerTreeNode[] = [];
  // Display top-to-bottom = reverse of bottom-to-top order
  for (const id of [...order].reverse()) {
    const group = groupMap.get(id as string);
    if (group) {
      nodes.push({ type: "group", group, depth, parentGroupId });
      if (group.expanded) {
        nodes.push(
          ...buildDisplayTreeImpl(
            group.childOrder,
            layerMap,
            groupMap,
            imageLayerMap,
            objectLayerMap,
            depth + 1,
            group.id,
          ),
        );
      }
    } else {
      const layer = layerMap.get(id as string);
      if (layer) {
        nodes.push({ type: "layer", layer, depth, parentGroupId });
      } else {
        const imgLayer = imageLayerMap.get(id as string);
        if (imgLayer) {
          nodes.push({
            type: "imageLayer",
            layer: imgLayer,
            depth,
            parentGroupId,
          });
        } else {
          const objLayer = objectLayerMap.get(id as string);
          if (objLayer) {
            nodes.push({
              type: "objectLayer",
              layer: objLayer,
              depth,
              parentGroupId,
            });
          }
        }
      }
    }
  }
  return nodes;
}
