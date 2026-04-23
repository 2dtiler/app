import { useCallback, useEffect, useState } from "react";
import { getAsset, saveAsset } from "@/services/db";
import { generateAssetId, generateLayerId } from "@/utils/ids";
import {
  findLastLayerId,
  isLayerEffectivelyLocked,
} from "@/features/map-editor/lib/layers";
import {
  getImageLayerClipboard,
  setImageLayerClipboard,
} from "@/features/map-editor/lib/image-layer-clipboard";
import {
  getClipboard,
  setClipboard,
} from "@/features/map-editor/lib/tile-clipboard";
import { createTileStamp } from "@/features/map-editor/lib/tile-stamp";
import type { OrientAction } from "@/types/map/map-panel-context-menu";
import type {
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  TileRef,
} from "@/types";
import type {
  ImageLayerClipboard,
  TileClipboard,
} from "@/types/editor/editor-helpers";
import type {
  MapPanelClipboardActionParams,
  MapPanelClipboardActionResult,
} from "@/types/map/map-panel";

const IMAGE_LAYER_PASTE_OFFSET = 16;

function cloneArrayBuffer(data: ArrayBuffer): ArrayBuffer {
  return data.slice(0);
}

function insertLayerAfter(
  refId: string,
  newId: string,
  topOrder: (LayerId | LayerGroupId)[],
  groups: LayerGroup[],
): boolean {
  const topIndex = (topOrder as string[]).indexOf(refId);
  if (topIndex !== -1) {
    topOrder.splice(topIndex + 1, 0, newId as LayerId | LayerGroupId);
    return true;
  }

  for (const group of groups) {
    const groupIndex = (group.childOrder as string[]).indexOf(refId);
    if (groupIndex === -1) continue;

    group.childOrder.splice(groupIndex + 1, 0, newId as LayerId | LayerGroupId);
    return true;
  }

  return false;
}

function removeLayerFromOrders(
  layerId: string,
  topOrder: (LayerId | LayerGroupId)[],
  groups: LayerGroup[],
) {
  const removeFromOrder = (order: (LayerId | LayerGroupId)[]) => {
    const index = (order as string[]).indexOf(layerId);
    if (index !== -1) {
      order.splice(index, 1);
    }
  };

  removeFromOrder(topOrder);
  for (const group of groups) {
    removeFromOrder(group.childOrder);
  }
}

export function useMapPanelClipboardActions({
  activeImageLayer,
  activeLayer,
  activeLayerEffectivelyLocked,
  activeMap,
  activeObject,
  activeObjectLayer,
  contextMenuTileRef,
  hasContextMenuImageLayer,
  hasContextMenuTile,
  hoverTileRef,
  project,
  setState,
  state,
}: MapPanelClipboardActionParams): MapPanelClipboardActionResult {
  const [hasTileClipboard, setHasTileClipboard] = useState(
    () => getClipboard() !== null,
  );
  const [hasImageLayerClipboard, setHasImageLayerClipboard] = useState(
    () => getImageLayerClipboard() !== null,
  );

  const setExclusiveTileClipboard = useCallback(
    (data: TileClipboard | null) => {
      setClipboard(data);
      setImageLayerClipboard(null);
    },
    [],
  );

  const setExclusiveImageLayerClipboard = useCallback(
    (data: ImageLayerClipboard | null) => {
      setImageLayerClipboard(data);
      setClipboard(null);
    },
    [],
  );

  const handleCopyTiles = useCallback(
    (fromContextMenu = false) => {
      if (state.mapSelection && activeLayer) {
        const selection = state.mapSelection;
        const tiles: TileClipboard["tiles"] = [];
        for (let dy = 0; dy < selection.height; dy++) {
          for (let dx = 0; dx < selection.width; dx++) {
            const ref =
              activeLayer.tiles[`${selection.x + dx},${selection.y + dy}`];
            if (ref) {
              tiles.push({ dx, dy, ref: { ...ref } });
            }
          }
        }

        setExclusiveTileClipboard({
          tiles,
          width: selection.width,
          height: selection.height,
        });
        return;
      }

      if (
        fromContextMenu &&
        contextMenuTileRef.current &&
        activeLayer &&
        activeMap
      ) {
        const { x, y } = contextMenuTileRef.current;
        const brushNum = parseInt(state.brushSize);
        const tiles: TileClipboard["tiles"] = [];
        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const ref = activeLayer.tiles[`${x + dx},${y + dy}`];
            if (ref) {
              tiles.push({ dx, dy, ref: { ...ref } });
            }
          }
        }

        setExclusiveTileClipboard({
          tiles,
          width: brushNum,
          height: brushNum,
        });
        return;
      }

      if (!fromContextMenu && state.selectedTile) {
        const stamp = createTileStamp(state.selectedTile, state.tileSize);
        setExclusiveTileClipboard({
          tiles: stamp.cells.map((cell) => ({
            dx: cell.dx,
            dy: cell.dy,
            ref: { ...cell.ref },
          })),
          width: stamp.width,
          height: stamp.height,
        });
      }
    },
    [
      activeLayer,
      activeMap,
      contextMenuTileRef,
      setExclusiveTileClipboard,
      state.brushSize,
      state.mapSelection,
      state.selectedTile,
      state.tileSize,
    ],
  );

  const handleCutTiles = useCallback(
    (fromContextMenu = false) => {
      if (!activeLayer || !activeMap || activeLayer.locked) return;

      let region: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null = null;

      if (state.mapSelection) {
        region = state.mapSelection;
      } else if (fromContextMenu && contextMenuTileRef.current) {
        const brushNum = parseInt(state.brushSize);
        region = {
          x: contextMenuTileRef.current.x,
          y: contextMenuTileRef.current.y,
          width: brushNum,
          height: brushNum,
        };
      }

      if (!region) return;

      const tiles: TileClipboard["tiles"] = [];
      for (let dy = 0; dy < region.height; dy++) {
        for (let dx = 0; dx < region.width; dx++) {
          const ref = activeLayer.tiles[`${region.x + dx},${region.y + dy}`];
          if (ref) {
            tiles.push({ dx, dy, ref: { ...ref } });
          }
        }
      }

      setExclusiveTileClipboard({
        tiles,
        width: region.width,
        height: region.height,
      });

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (candidate) => candidate.id === state.activeLayerId,
        );
        if (!layer) return;

        for (let dy = 0; dy < region.height; dy++) {
          for (let dx = 0; dx < region.width; dx++) {
            delete layer.tiles[`${region.x + dx},${region.y + dy}`];
          }
        }
      });
    },
    [
      activeLayer,
      activeMap,
      contextMenuTileRef,
      setExclusiveTileClipboard,
      setState,
      state.activeLayerId,
      state.brushSize,
      state.mapSelection,
    ],
  );

  const handlePasteTiles = useCallback(
    (fromContextMenu = false) => {
      const clipboard = getClipboard();
      if (!clipboard || !activeMap || !activeLayer || activeLayer.locked) {
        return;
      }

      const destination =
        fromContextMenu && contextMenuTileRef.current
          ? contextMenuTileRef.current
          : hoverTileRef.current
            ? hoverTileRef.current
            : state.mapSelection
              ? { x: state.mapSelection.x, y: state.mapSelection.y }
              : { x: 0, y: 0 };

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (candidate) => candidate.id === state.activeLayerId,
        );
        if (!layer) return;

        for (const { dx, dy, ref } of clipboard.tiles) {
          const tx = destination.x + dx;
          const ty = destination.y + dy;
          if (
            tx < 0 ||
            ty < 0 ||
            tx >= activeMap.widthInTiles ||
            ty >= activeMap.heightInTiles
          ) {
            continue;
          }

          layer.tiles[`${tx},${ty}`] = { ...ref };
        }

        draft.mapSelection = {
          x: destination.x,
          y: destination.y,
          width: clipboard.width,
          height: clipboard.height,
        };
        draft.currentTool = "select";
      });
    },
    [
      activeLayer,
      activeMap,
      contextMenuTileRef,
      hoverTileRef,
      setState,
      state.activeLayerId,
      state.mapSelection,
    ],
  );

  const handleCopyImageLayer = useCallback(async () => {
    if (!activeImageLayer) return;

    const asset = await getAsset(activeImageLayer.assetId);
    if (!asset) return;

    setExclusiveImageLayerClipboard({
      name: activeImageLayer.name,
      x: activeImageLayer.x,
      y: activeImageLayer.y,
      width: activeImageLayer.width,
      height: activeImageLayer.height,
      rotation: activeImageLayer.rotation ?? 0,
      flipX: activeImageLayer.flipX ?? false,
      flipY: activeImageLayer.flipY ?? false,
      opacity: activeImageLayer.opacity ?? 100,
      mimeType: asset.mimeType,
      data: cloneArrayBuffer(asset.data),
      operation: "copy",
    });
  }, [activeImageLayer, setExclusiveImageLayerClipboard]);

  const handleCutImageLayer = useCallback(async () => {
    if (!activeImageLayer || activeImageLayer.locked) return;

    const asset = await getAsset(activeImageLayer.assetId);
    if (!asset) return;

    setExclusiveImageLayerClipboard({
      name: activeImageLayer.name,
      x: activeImageLayer.x,
      y: activeImageLayer.y,
      width: activeImageLayer.width,
      height: activeImageLayer.height,
      rotation: activeImageLayer.rotation ?? 0,
      flipX: activeImageLayer.flipX ?? false,
      flipY: activeImageLayer.flipY ?? false,
      opacity: activeImageLayer.opacity ?? 100,
      mimeType: asset.mimeType,
      data: cloneArrayBuffer(asset.data),
      operation: "cut",
    });

    setState((draft) => {
      if (!draft.project) return;

      const map = draft.project.maps.find(
        (candidate) => candidate.id === state.activeMapId,
      );
      if (!map) return;

      const groups = draft.project.layerGroups ?? [];
      removeLayerFromOrders(activeImageLayer.id, map.layerOrder, groups);
      draft.project.imageLayers = (draft.project.imageLayers ?? []).filter(
        (layer) => layer.id !== activeImageLayer.id,
      );

      if (draft.activeLayerId === activeImageLayer.id) {
        draft.activeLayerId =
          findLastLayerId(
            map.layerOrder,
            draft.project.layers,
            groups,
            draft.project.imageLayers ?? [],
            draft.project.objectLayers ?? [],
          ) ?? null;
      }
    });
  }, [
    activeImageLayer,
    setExclusiveImageLayerClipboard,
    setState,
    state.activeMapId,
  ]);

  const handlePasteImageLayer = useCallback(async () => {
    if (!activeMap) return;

    const clipboard = getImageLayerClipboard();
    if (!clipboard) return;

    const newLayerId = generateLayerId();
    const newAssetId = generateAssetId();
    await saveAsset(
      newAssetId,
      cloneArrayBuffer(clipboard.data),
      clipboard.mimeType,
    );

    setState((draft) => {
      if (!draft.project) return;

      const map = draft.project.maps.find(
        (candidate) => candidate.id === activeMap.id,
      );
      if (!map) return;

      const groups = draft.project.layerGroups ?? [];
      const nextLayer: ImageLayer = {
        id: newLayerId,
        mapId: activeMap.id,
        name:
          clipboard.operation === "copy"
            ? `${clipboard.name} copy`
            : clipboard.name,
        type: "image",
        visible: true,
        locked: false,
        assetId: newAssetId,
        x: clipboard.x + IMAGE_LAYER_PASTE_OFFSET,
        y: clipboard.y + IMAGE_LAYER_PASTE_OFFSET,
        width: clipboard.width,
        height: clipboard.height,
        rotation: clipboard.rotation,
        flipX: clipboard.flipX,
        flipY: clipboard.flipY,
        opacity: clipboard.opacity,
      };

      const imageLayers =
        draft.project.imageLayers ?? (draft.project.imageLayers = []);
      imageLayers.push(nextLayer);

      const inserted = draft.activeLayerId
        ? insertLayerAfter(
            draft.activeLayerId,
            newLayerId,
            map.layerOrder,
            groups,
          )
        : false;
      if (!inserted) {
        map.layerOrder.push(newLayerId);
      }

      draft.activeLayerId = newLayerId;
      draft.currentTool = "select";
    });

    if (clipboard.operation === "cut") {
      setExclusiveImageLayerClipboard({
        ...clipboard,
        operation: "copy",
      });
    }
  }, [activeMap, setExclusiveImageLayerClipboard, setState]);

  const handleCopySelection = useCallback(
    async (fromContextMenu = false) => {
      if (activeImageLayer) {
        await handleCopyImageLayer();
        return;
      }

      handleCopyTiles(fromContextMenu);
    },
    [activeImageLayer, handleCopyImageLayer, handleCopyTiles],
  );

  const handleCutSelection = useCallback(
    async (fromContextMenu = false) => {
      if (activeImageLayer) {
        await handleCutImageLayer();
        return;
      }

      handleCutTiles(fromContextMenu);
    },
    [activeImageLayer, handleCutImageLayer, handleCutTiles],
  );

  const handlePasteSelection = useCallback(
    async (fromContextMenu = false) => {
      if (getImageLayerClipboard()) {
        await handlePasteImageLayer();
        return;
      }

      handlePasteTiles(fromContextMenu);
    },
    [handlePasteImageLayer, handlePasteTiles],
  );

  const handleDeleteTiles = useCallback(
    (fromContextMenu = false) => {
      if (!activeLayer || !activeMap) return;

      const effectivelyLocked = isLayerEffectivelyLocked(
        activeLayer.id,
        activeMap.layerOrder,
        project?.layers ?? [],
        project?.layerGroups ?? [],
      );
      if (effectivelyLocked) return;

      let region: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null = null;

      if (state.mapSelection) {
        region = state.mapSelection;
      } else if (
        fromContextMenu &&
        contextMenuTileRef.current &&
        hasContextMenuTile
      ) {
        region = {
          x: contextMenuTileRef.current.x,
          y: contextMenuTileRef.current.y,
          width: 1,
          height: 1,
        };
      }

      if (!region) return;

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (candidate) => candidate.id === state.activeLayerId,
        );
        if (!layer) return;

        for (let dy = 0; dy < region.height; dy++) {
          for (let dx = 0; dx < region.width; dx++) {
            delete layer.tiles[`${region.x + dx},${region.y + dy}`];
          }
        }
      });
    },
    [
      activeLayer,
      activeMap,
      contextMenuTileRef,
      hasContextMenuTile,
      project?.layerGroups,
      project?.layers,
      setState,
      state.activeLayerId,
      state.mapSelection,
    ],
  );

  const handleDeleteImageLayer = useCallback(() => {
    if (!activeImageLayer || !activeMap || activeImageLayer.locked) return;

    setState((draft) => {
      if (!draft.project) return;

      const map = draft.project.maps.find(
        (candidate) => candidate.id === activeMap.id,
      );
      if (!map) return;

      const groups = draft.project.layerGroups ?? [];
      removeLayerFromOrders(activeImageLayer.id, map.layerOrder, groups);
      draft.project.imageLayers = (draft.project.imageLayers ?? []).filter(
        (layer) => layer.id !== activeImageLayer.id,
      );

      if (draft.activeLayerId === activeImageLayer.id) {
        draft.activeLayerId =
          findLastLayerId(
            map.layerOrder,
            draft.project.layers,
            groups,
            draft.project.imageLayers ?? [],
            draft.project.objectLayers ?? [],
          ) ?? null;
      }

      draft.mapSelection = null;
    });
  }, [activeImageLayer, activeMap, setState]);

  const handleDeleteObject = useCallback(() => {
    if (!activeObject || !activeObjectLayer) return;
    if (activeObject.locked || activeObjectLayer.locked) return;

    setState((draft) => {
      if (!draft.project) return;

      draft.project.objects = (draft.project.objects ?? []).filter(
        (object) => object.id !== activeObject.id,
      );

      const layer = (draft.project.objectLayers ?? []).find(
        (candidate) => candidate.id === activeObject.layerId,
      );
      if (layer) {
        layer.objectOrder = layer.objectOrder.filter(
          (objectId) => objectId !== activeObject.id,
        );
      }

      if (draft.activeObjectId === activeObject.id) {
        draft.activeObjectId = null;
      }
    });
  }, [activeObject, activeObjectLayer, setState]);

  const handleDeleteSelection = useCallback(
    (fromContextMenu = false) => {
      if (state.currentTool !== "select") return;

      if (activeObject) {
        handleDeleteObject();
        return;
      }

      if (activeImageLayer) {
        handleDeleteImageLayer();
        return;
      }

      handleDeleteTiles(fromContextMenu);
    },
    [
      activeImageLayer,
      activeObject,
      handleDeleteImageLayer,
      handleDeleteObject,
      handleDeleteTiles,
      state.currentTool,
    ],
  );

  const handleOrientTiles = useCallback(
    (action: OrientAction, fromContextMenu = false) => {
      if (!activeLayer || !activeMap) return;

      const effectivelyLocked = isLayerEffectivelyLocked(
        activeLayer.id,
        activeMap.layerOrder,
        project?.layers ?? [],
        project?.layerGroups ?? [],
      );
      if (effectivelyLocked) return;

      let region: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null = null;

      if (state.mapSelection) {
        region = state.mapSelection;
      } else if (fromContextMenu && contextMenuTileRef.current) {
        region = {
          x: contextMenuTileRef.current.x,
          y: contextMenuTileRef.current.y,
          width: 1,
          height: 1,
        };
      }

      if (!region) return;

      const rotated = action === "rotateLeft" || action === "rotateRight";
      const nextWidth = rotated ? region.height : region.width;
      const nextHeight = rotated ? region.width : region.height;
      if (
        region.x + nextWidth > activeMap.widthInTiles ||
        region.y + nextHeight > activeMap.heightInTiles
      ) {
        return;
      }

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (candidate) => candidate.id === state.activeLayerId,
        );
        if (!layer) return;

        const snapshot: TileClipboard["tiles"] = [];
        for (let dy = 0; dy < region.height; dy++) {
          for (let dx = 0; dx < region.width; dx++) {
            const ref = layer.tiles[`${region.x + dx},${region.y + dy}`];
            if (ref) {
              snapshot.push({ dx, dy, ref: { ...ref } });
            }
          }
        }

        for (let dy = 0; dy < region.height; dy++) {
          for (let dx = 0; dx < region.width; dx++) {
            delete layer.tiles[`${region.x + dx},${region.y + dy}`];
          }
        }

        for (const { dx, dy, ref } of snapshot) {
          let nextDx = dx;
          let nextDy = dy;

          if (action === "rotateLeft") {
            nextDx = dy;
            nextDy = region.width - 1 - dx;
          } else if (action === "rotateRight") {
            nextDx = region.height - 1 - dy;
            nextDy = dx;
          } else if (action === "flipH") {
            nextDx = region.width - 1 - dx;
          } else if (action === "flipV") {
            nextDy = region.height - 1 - dy;
          }

          const nextRef: TileRef = { ...ref };
          const rotation = nextRef.rotation ?? 0;
          const flipX = nextRef.flipX ?? false;
          const flipY = nextRef.flipY ?? false;
          if (action === "rotateLeft") {
            nextRef.rotation = ((rotation - 90 + 360) % 360) as
              | 0
              | 90
              | 180
              | 270;
          } else if (action === "rotateRight") {
            nextRef.rotation = ((rotation + 90) % 360) as 0 | 90 | 180 | 270;
          } else if (action === "flipH") {
            nextRef.flipX = !flipX;
          } else if (action === "flipV") {
            nextRef.flipY = !flipY;
          }

          layer.tiles[`${region.x + nextDx},${region.y + nextDy}`] = nextRef;
        }

        if (draft.mapSelection) {
          draft.mapSelection = {
            x: region.x,
            y: region.y,
            width: nextWidth,
            height: nextHeight,
          };
        }
      });
    },
    [
      activeLayer,
      activeMap,
      contextMenuTileRef,
      project?.layerGroups,
      project?.layers,
      setState,
      state.activeLayerId,
      state.mapSelection,
    ],
  );

  const handleOrientImageLayer = useCallback(
    (action: OrientAction) => {
      if (!activeImageLayer || activeImageLayer.locked) return;

      setState((draft) => {
        const layer = (draft.project?.imageLayers ?? []).find(
          (entry) => entry.id === activeImageLayer.id,
        );
        if (!layer) return;

        const rotation = layer.rotation ?? 0;
        const flipX = layer.flipX ?? false;
        const flipY = layer.flipY ?? false;

        if (action === "rotateLeft") {
          layer.rotation = ((rotation - 90 + 360) % 360) as 0 | 90 | 180 | 270;
          return;
        }

        if (action === "rotateRight") {
          layer.rotation = ((rotation + 90) % 360) as 0 | 90 | 180 | 270;
          return;
        }

        if (action === "flipH") {
          layer.flipX = !flipX;
          return;
        }

        if (action === "flipV") {
          layer.flipY = !flipY;
        }
      });
    },
    [activeImageLayer, setState],
  );

  const handleOrientSelection = useCallback(
    (action: OrientAction, fromContextMenu = false) => {
      if (activeImageLayer) {
        handleOrientImageLayer(action);
        return;
      }

      handleOrientTiles(action, fromContextMenu);
    },
    [activeImageLayer, handleOrientImageLayer, handleOrientTiles],
  );

  useEffect(() => {
    const onTileClipboardChange = () => {
      setHasTileClipboard(getClipboard() !== null);
    };
    const onImageClipboardChange = () => {
      setHasImageLayerClipboard(getImageLayerClipboard() !== null);
    };

    window.addEventListener("tile-clipboard-change", onTileClipboardChange);
    window.addEventListener(
      "image-layer-clipboard-change",
      onImageClipboardChange,
    );

    return () => {
      window.removeEventListener(
        "tile-clipboard-change",
        onTileClipboardChange,
      );
      window.removeEventListener(
        "image-layer-clipboard-change",
        onImageClipboardChange,
      );
    };
  }, []);

  useEffect(() => {
    const onCopy = () => {
      void handleCopySelection(false);
    };
    const onCut = () => {
      void handleCutSelection(false);
    };
    const onPaste = () => {
      void handlePasteSelection(false);
    };
    const onDelete = () => {
      handleDeleteSelection(false);
    };

    window.addEventListener("tile-copy", onCopy);
    window.addEventListener("tile-cut", onCut);
    window.addEventListener("tile-paste", onPaste);
    window.addEventListener("map-delete-selection", onDelete);

    return () => {
      window.removeEventListener("tile-copy", onCopy);
      window.removeEventListener("tile-cut", onCut);
      window.removeEventListener("tile-paste", onPaste);
      window.removeEventListener("map-delete-selection", onDelete);
    };
  }, [
    handleCopySelection,
    handleCutSelection,
    handleDeleteSelection,
    handlePasteSelection,
  ]);

  const isTileLayerActive = !!activeLayer && !activeLayer.locked;
  const isImageLayerActive = !!activeImageLayer;
  const isImageLayerEditable = !!activeImageLayer && !activeImageLayer.locked;
  const canCopy = !!activeMap && (!!activeLayer || isImageLayerActive);
  const canCut = !!activeMap && (isTileLayerActive || isImageLayerEditable);
  const canCutToolbar =
    isImageLayerEditable || (canCut && !!state.mapSelection);
  const canPaste =
    !!activeMap &&
    (hasImageLayerClipboard || (hasTileClipboard && isTileLayerActive));
  const canOpenTileInEditor =
    !!activeMap && !!activeLayer && hasContextMenuTile;
  const canOpenImageLayerInEditor =
    !!activeMap &&
    !!activeImageLayer &&
    activeImageLayer.visible &&
    !activeImageLayer.locked &&
    hasContextMenuImageLayer;
  const canEditInImageEditor = activeImageLayer
    ? canOpenImageLayerInEditor
    : canOpenTileInEditor;
  const isSelectTool = state.currentTool === "select";
  const canDeleteObject =
    isSelectTool &&
    !!activeObject &&
    !!activeObjectLayer &&
    !activeObject.locked &&
    !activeObjectLayer.locked;
  const canDeleteImageLayer =
    isSelectTool && !!activeImageLayer && !activeImageLayer.locked;
  const canDeleteTiles =
    isSelectTool &&
    !!state.mapSelection &&
    !!activeLayer &&
    !activeLayerEffectivelyLocked;
  const canDeleteContextTile =
    isSelectTool &&
    !!activeLayer &&
    !activeLayerEffectivelyLocked &&
    hasContextMenuTile;
  const canDeleteSelection =
    canDeleteObject ||
    canDeleteImageLayer ||
    canDeleteTiles ||
    canDeleteContextTile;
  const canOrientToolbar =
    isSelectTool &&
    ((!!state.mapSelection && isTileLayerActive) ||
      (!!activeImageLayer && !activeImageLayer.locked));
  const canOrientContextMenu =
    isSelectTool &&
    ((!!activeLayer &&
      !activeLayer.locked &&
      (!!state.mapSelection || hasContextMenuTile)) ||
      (!!activeImageLayer &&
        !activeImageLayer.locked &&
        hasContextMenuImageLayer));

  return {
    canCopy,
    canCut,
    canCutToolbar,
    canDeleteSelection,
    canEditInImageEditor,
    canOrientContextMenu,
    canOrientToolbar,
    canPaste,
    handleCopySelection,
    handleCutSelection,
    handleDeleteSelection,
    handleOrientSelection,
    handlePasteSelection,
  };
}
