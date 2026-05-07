import { useCallback } from "react";
import { generateObjectId } from "@/utils/ids";
import {
  areTileRefsEqual,
  createTileStamp,
  getTileStampRef,
  isMultiTileStamp,
} from "@/features/map-editor/lib/tile-stamp";
import {
  getFillRegion,
  pickWeightedTile,
} from "@/features/map-editor/lib/terrain";
import {
  classifyAutotileTile as classifyAutotileTileConfig,
  getPaintableAutotileTerrainById,
  resolveAutotileWrites as resolveAutotileWriteSet,
} from "@/features/map-editor/lib/autotile";
import { resolveAnimationPlacementStamp } from "@/features/map-editor/lib/tileset-animations";
import {
  clampTextObjectBounds,
  getDefaultTextObjectProperties,
} from "@/features/map-editor/lib/text-objects";
import { setImageLayerEditorContext } from "@/features/image-editor/lib/image-layer-editor-context";
import { setTileEditorContext } from "@/features/map-editor/lib/tile-editor-context";
import { isLayerEffectivelyLocked } from "@/features/map-editor/lib/layers";
import type { MapCanvasProps } from "@/features/map-editor/types/map-canvas";
import type { MapObject, ObjectType, TileRef } from "@/types";
import type { TilesetAnimationDragPayload } from "@/features/map-editor/types/animations";
import { TEXT_OBJECT_DEFAULTS as textObjectDefaults } from "@/types";
import type {
  MapPanelCanvasActionParams,
  MapPanelCanvasActionResult,
} from "@/features/map-editor/types/map-panel";

export function useMapPanelCanvasActions({
  activeImageLayer,
  activeLayer,
  activeMap,
  contextMenuTileRef,
  hasContextMenuImageLayer,
  layerGroups,
  mapCanvasRef,
  paintBuffer,
  project,
  setPaintBufferVersion,
  setState,
  state,
  textObjectEditing,
}: MapPanelCanvasActionParams): MapPanelCanvasActionResult {
  const getAnimationStamp = useCallback(
    (payload?: TilesetAnimationDragPayload) => {
      return resolveAnimationPlacementStamp(
        project?.tilesets,
        payload?.tilesetId ?? state.selectedAnimation?.tilesetId,
        payload?.animationId ?? state.selectedAnimation?.animationId,
      );
    },
    [project?.tilesets, state.selectedAnimation],
  );

  const canPlaceOnActiveLayer = useCallback(() => {
    if (!activeMap || !activeLayer) return false;

    return !isLayerEffectivelyLocked(
      activeLayer.id,
      activeMap.layerOrder,
      project?.layers ?? [],
      layerGroups,
    );
  }, [activeLayer, activeMap, layerGroups, project?.layers]);

  const handlePaintTile = useCallback(
    (gx: number, gy: number) => {
      if (!activeMap || !activeLayer) return;

      if (!canPlaceOnActiveLayer()) return;

      const selectedStamp = state.selectedTile
        ? createTileStamp(state.selectedTile, state.tileSize)
        : null;
      const selectedAutotileTileset = state.selectedAutotileTerrain
        ? (project?.tilesets.find(
            (tileset) =>
              tileset.id === state.selectedAutotileTerrain?.tilesetId,
          ) ?? null)
        : null;

      const buildEffectiveTiles = () => {
        const effectiveTiles = { ...activeLayer.tiles };
        for (const [key, ref] of paintBuffer.entries()) {
          if (ref === null) {
            delete effectiveTiles[key];
          } else {
            effectiveTiles[key] = ref;
          }
        }

        return effectiveTiles;
      };

      const applyResolvedWrites = (resolved: Map<string, TileRef | null>) => {
        for (const [key, ref] of resolved.entries()) {
          const [tx, ty] = key.split(",").map(Number);
          const committedRef = activeLayer.tiles[key] ?? null;

          if (ref === null) {
            if (committedRef === null) {
              paintBuffer.delete(key);
            } else {
              paintBuffer.set(key, null);
            }
            mapCanvasRef.current?.eraseBufferTile(tx, ty);
            continue;
          }

          if (areTileRefsEqual(committedRef, ref)) {
            paintBuffer.delete(key);
            mapCanvasRef.current?.eraseBufferTile(tx, ty);
            continue;
          }

          paintBuffer.set(key, ref);
          mapCanvasRef.current?.drawBufferTile(tx, ty, ref);
        }
      };

      if (state.currentTool === "autotile") {
        const autotile = selectedAutotileTileset?.autotile;
        const selectedTerrain = state.selectedAutotileTerrain
          ? getPaintableAutotileTerrainById(
              autotile,
              state.selectedAutotileTerrain.terrainId,
            )
          : null;

        if (!selectedAutotileTileset || !autotile || !selectedTerrain) {
          return;
        }

        const brushNum = parseInt(state.brushSize);
        const writes = [] as Parameters<
          typeof resolveAutotileWriteSet
        >[0]["writes"];

        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const tx = gx + dx;
            const ty = gy + dy;
            if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles) {
              continue;
            }

            writes.push({
              x: tx,
              y: ty,
              terrainId: selectedTerrain.id,
            });
          }
        }

        if (writes.length === 0) {
          return;
        }

        const resolved = resolveAutotileWriteSet({
          autotile,
          baseTiles: buildEffectiveTiles(),
          mapWidth: activeMap.widthInTiles,
          mapHeight: activeMap.heightInTiles,
          tilesetId: selectedAutotileTileset.id,
          writes,
        });

        applyResolvedWrites(resolved);

        return;
      }

      if (state.currentTool === "animation") {
        const stamp = getAnimationStamp();
        if (!stamp) return;

        for (const cell of stamp.cells) {
          const tx = gx + cell.dx;
          const ty = gy + cell.dy;
          if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles) {
            continue;
          }

          const ref = { ...cell.ref };
          paintBuffer.set(`${tx},${ty}`, ref);
          mapCanvasRef.current?.drawBufferTile(tx, ty, ref);
        }

        return;
      }

      if (state.currentTool === "paint") {
        if (state.paintMode === "paintTerrain") {
          if (!state.activePaintTerrain || state.activePaintTerrain.length === 0) {
            return;
          }

          const brushNum = parseInt(state.brushSize);

          for (let dy = 0; dy < brushNum; dy++) {
            for (let dx = 0; dx < brushNum; dx++) {
              const tx = gx + dx;
              const ty = gy + dy;
              if (
                tx >= activeMap.widthInTiles ||
                ty >= activeMap.heightInTiles
              ) {
                continue;
              }

              const picked = pickWeightedTile(state.activePaintTerrain);
              if (!picked) {
                continue;
              }

              const ref = { ...picked };
              paintBuffer.set(`${tx},${ty}`, ref);
              mapCanvasRef.current?.drawBufferTile(tx, ty, ref);
            }
          }

          return;
        }

        if (!selectedStamp) return;

        if (isMultiTileStamp(selectedStamp)) {
          for (const cell of selectedStamp.cells) {
            const tx = gx + cell.dx;
            const ty = gy + cell.dy;
            if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles) {
              continue;
            }

            const ref = { ...cell.ref };
            paintBuffer.set(`${tx},${ty}`, ref);
            mapCanvasRef.current?.drawBufferTile(tx, ty, ref);
          }
        } else {
          const brushNum = parseInt(state.brushSize);
          const ref = selectedStamp.cells[0].ref;

          for (let dy = 0; dy < brushNum; dy++) {
            for (let dx = 0; dx < brushNum; dx++) {
              const tx = gx + dx;
              const ty = gy + dy;
              if (
                tx >= activeMap.widthInTiles ||
                ty >= activeMap.heightInTiles
              ) {
                continue;
              }

              paintBuffer.set(`${tx},${ty}`, { ...ref });
              mapCanvasRef.current?.drawBufferTile(tx, ty, ref);
            }
          }
        }

        return;
      }

      if (state.currentTool === "erase") {
        const brushNum = parseInt(state.brushSize);
        const effectiveTiles = buildEffectiveTiles();
        const directEraseTargets = [] as {
          committedRef: TileRef | null;
          key: string;
          x: number;
          y: number;
        }[];
        const directEraseKeys = new Set<string>();
        const autotileEraseConfigs = new Map<
          Parameters<typeof resolveAutotileWriteSet>[0]["tilesetId"],
          Parameters<typeof resolveAutotileWriteSet>[0]["autotile"]
        >();
        const autotileEraseWrites = new Map<
          Parameters<typeof resolveAutotileWriteSet>[0]["tilesetId"],
          Parameters<typeof resolveAutotileWriteSet>[0]["writes"]
        >();

        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const tx = gx + dx;
            const ty = gy + dy;
            if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles) {
              continue;
            }

            const key = `${tx},${ty}`;
            const committedRef = activeLayer.tiles[key] ?? null;
            const bufferedRef = paintBuffer.has(key)
              ? paintBuffer.get(key)
              : undefined;
            const effectiveRef =
              bufferedRef === undefined ? committedRef : bufferedRef;

            if (effectiveRef === null && committedRef === null) {
              paintBuffer.delete(key);
              continue;
            }

            const autotileTileset = effectiveRef
              ? (project?.tilesets.find(
                  (tileset) =>
                    tileset.id === effectiveRef.tilesetId && !!tileset.autotile,
                ) ?? null)
              : null;
            const autotileTerrainId =
              autotileTileset && autotileTileset.autotile
                ? classifyAutotileTileConfig(
                    autotileTileset.autotile,
                    autotileTileset.id,
                    effectiveRef,
                  )
                : null;

            if (autotileTileset?.autotile && autotileTerrainId) {
              const writes = autotileEraseWrites.get(autotileTileset.id);
              if (writes) {
                writes.push({ x: tx, y: ty, terrainId: null });
              } else {
                autotileEraseWrites.set(autotileTileset.id, [
                  { x: tx, y: ty, terrainId: null },
                ]);
                autotileEraseConfigs.set(
                  autotileTileset.id,
                  autotileTileset.autotile,
                );
              }

              continue;
            }

            directEraseKeys.add(key);
            directEraseTargets.push({
              committedRef,
              key,
              x: tx,
              y: ty,
            });
          }
        }

        for (const [tilesetId, writes] of autotileEraseWrites.entries()) {
          const autotile = autotileEraseConfigs.get(tilesetId);
          if (!autotile) {
            continue;
          }

          const baseTiles = { ...effectiveTiles };

          for (const key of directEraseKeys) {
            delete baseTiles[key];
          }

          for (const [
            otherTilesetId,
            otherWrites,
          ] of autotileEraseWrites.entries()) {
            if (otherTilesetId === tilesetId) {
              continue;
            }

            for (const write of otherWrites) {
              delete baseTiles[`${write.x},${write.y}`];
            }
          }

          const resolved = resolveAutotileWriteSet({
            autotile,
            baseTiles,
            mapWidth: activeMap.widthInTiles,
            mapHeight: activeMap.heightInTiles,
            tilesetId,
            writes,
          });

          applyResolvedWrites(resolved);
        }

        for (const { committedRef, key, x, y } of directEraseTargets) {
          if (committedRef === null) {
            paintBuffer.delete(key);
          } else {
            paintBuffer.set(key, null);
          }

          mapCanvasRef.current?.eraseBufferTile(x, y);
        }

        return;
      }

      if (state.currentTool !== "fill") {
        return;
      }

      const isTerrain = state.fillMode === "fillTerrain";
      const toFill = getFillRegion({
        map: activeMap,
        layer: activeLayer,
        mapWidth: activeMap.widthInTiles,
        mapHeight: activeMap.heightInTiles,
        startX: gx,
        startY: gy,
        fillMode: state.fillMode,
        selectedTile: state.selectedTile,
        activeFillTerrain: state.activeFillTerrain,
      });

      if (toFill.length === 0) return;

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (candidate) => candidate.id === state.activeLayerId,
        );
        if (!layer) return;

        if (isTerrain && state.activeFillTerrain) {
          for (const [x, y] of toFill) {
            const picked = pickWeightedTile(state.activeFillTerrain);
            if (!picked) continue;

            layer.tiles[`${x},${y}`] = {
              tilesetId: picked.tilesetId,
              sx: picked.sx,
              sy: picked.sy,
              sw: picked.sw,
              sh: picked.sh,
            };
          }

          return;
        }

        if (!selectedStamp) return;

        let changed = false;
        for (const [x, y] of toFill) {
          const key = `${x},${y}`;
          const nextRef = { ...getTileStampRef(selectedStamp, x, y) };
          if (areTileRefsEqual(layer.tiles[key] ?? null, nextRef)) {
            continue;
          }

          layer.tiles[key] = nextRef;
          changed = true;
        }

        if (!changed) return;
      });
    },
    [
      activeLayer,
      activeMap,
      canPlaceOnActiveLayer,
      getAnimationStamp,
      mapCanvasRef,
      paintBuffer,
      project?.tilesets,
      setState,
      state.activeFillTerrain,
      state.activeLayerId,
      state.activePaintTerrain,
      state.brushSize,
      state.currentTool,
      state.fillMode,
      state.paintMode,
      state.selectedAutotileTerrain,
      state.selectedTile,
      state.tileSize,
    ],
  );

  const handlePlaceAnimation = useCallback(
    (gx: number, gy: number, payload: TilesetAnimationDragPayload) => {
      if (!activeMap || !activeLayer || !canPlaceOnActiveLayer()) return;

      const stamp = getAnimationStamp(payload);
      if (!stamp) return;

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (candidate) => candidate.id === state.activeLayerId,
        );
        if (!layer) return;

        for (const cell of stamp.cells) {
          const tx = gx + cell.dx;
          const ty = gy + cell.dy;
          if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles) {
            continue;
          }

          layer.tiles[`${tx},${ty}`] = { ...cell.ref };
        }
      });
    },
    [
      activeLayer,
      activeMap,
      canPlaceOnActiveLayer,
      getAnimationStamp,
      setState,
      state.activeLayerId,
    ],
  );

  const handlePaintEnd = useCallback(() => {
    if (paintBuffer.size === 0) return;

    const entries = Array.from(paintBuffer.entries());
    paintBuffer.clear();

    setState((draft) => {
      const layer = draft.project?.layers.find(
        (candidate) => candidate.id === state.activeLayerId,
      );
      if (!layer) return;

      for (const [key, ref] of entries) {
        if (ref === null) {
          delete layer.tiles[key];
        } else {
          layer.tiles[key] = ref;
        }
      }
    });

    setPaintBufferVersion((value) => value + 1);
  }, [paintBuffer, setPaintBufferVersion, setState, state.activeLayerId]);

  const handleSelectionChange = useCallback(
    (selection: Parameters<MapCanvasProps["onSelectionChange"]>[0]) => {
      setState((draft) => {
        draft.mapSelection = selection;
      });
    },
    [setState],
  );

  const handleMoveTiles = useCallback(
    (
      source: Parameters<MapCanvasProps["onMoveTiles"]>[0],
      destX: Parameters<MapCanvasProps["onMoveTiles"]>[1],
      destY: Parameters<MapCanvasProps["onMoveTiles"]>[2],
    ) => {
      setState((draft) => {
        const layer = draft.project?.layers.find(
          (candidate) => candidate.id === state.activeLayerId,
        );
        if (!layer) return;

        const snapshot: { dx: number; dy: number; ref: TileRef }[] = [];
        for (let dy = 0; dy < source.height; dy++) {
          for (let dx = 0; dx < source.width; dx++) {
            const key = `${source.x + dx},${source.y + dy}`;
            const ref = layer.tiles[key];
            if (ref) {
              snapshot.push({ dx, dy, ref: { ...ref } });
            }
          }
        }

        for (let dy = 0; dy < source.height; dy++) {
          for (let dx = 0; dx < source.width; dx++) {
            delete layer.tiles[`${source.x + dx},${source.y + dy}`];
          }
        }

        for (const { dx, dy, ref } of snapshot) {
          layer.tiles[`${destX + dx},${destY + dy}`] = ref;
        }
      });
    },
    [setState, state.activeLayerId],
  );

  const handleMoveImageLayer = useCallback(
    (
      layerId: Parameters<MapCanvasProps["onMoveImageLayer"]>[0],
      x: Parameters<MapCanvasProps["onMoveImageLayer"]>[1],
      y: Parameters<MapCanvasProps["onMoveImageLayer"]>[2],
    ) => {
      setState((draft) => {
        const imageLayer = (draft.project?.imageLayers ?? []).find(
          (candidate) => candidate.id === layerId,
        );
        if (!imageLayer) return;

        imageLayer.x = x;
        imageLayer.y = y;
      });
    },
    [setState],
  );

  const handleResizeImageLayer = useCallback(
    (
      layerId: Parameters<MapCanvasProps["onResizeImageLayer"]>[0],
      x: Parameters<MapCanvasProps["onResizeImageLayer"]>[1],
      y: Parameters<MapCanvasProps["onResizeImageLayer"]>[2],
      width: Parameters<MapCanvasProps["onResizeImageLayer"]>[3],
      height: Parameters<MapCanvasProps["onResizeImageLayer"]>[4],
    ) => {
      setState((draft) => {
        const imageLayer = (draft.project?.imageLayers ?? []).find(
          (candidate) => candidate.id === layerId,
        );
        if (!imageLayer) return;

        imageLayer.x = x;
        imageLayer.y = y;
        imageLayer.width = width;
        imageLayer.height = height;
      });
    },
    [setState],
  );

  const handleCreateObject = useCallback(
    (
      type: ObjectType,
      x: number,
      y: number,
      width: number,
      height: number,
      points: { x: number; y: number }[],
    ) => {
      const activeLayerId = state.activeLayerId;
      if (!activeLayerId) return;

      const objectId = generateObjectId();
      const isText = type === "text";
      const textBounds = isText
        ? clampTextObjectBounds(width, height)
        : { width, height };
      const objectCount = (project?.objects ?? []).filter(
        (object) => object.layerId === activeLayerId,
      ).length;

      setState((draft) => {
        if (!draft.project) return;
        if (!draft.project.objects) {
          draft.project.objects = [];
        }

        const newObject: MapObject = {
          id: objectId,
          layerId: activeLayerId,
          name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${objectCount + 1}`,
          type,
          x,
          y,
          width: textBounds.width,
          height: textBounds.height,
          rotation: 0,
          points,
          visible: true,
          locked: false,
          properties: isText ? getDefaultTextObjectProperties() : {},
        };

        draft.project.objects.push(newObject);

        const layer = (draft.project.objectLayers ?? []).find(
          (candidate) => candidate.id === activeLayerId,
        );
        if (layer) {
          layer.objectOrder.push(objectId);
        }

        draft.activeObjectId = objectId;
        draft.pendingObjectType = null;
      });

      if (isText) {
        textObjectEditing.startEditing(objectId, textObjectDefaults.text);
      }
    },
    [project?.objects, setState, state.activeLayerId, textObjectEditing],
  );

  const handleCancelPendingObject = useCallback(() => {
    setState((draft) => {
      draft.pendingObjectType = null;
    });
  }, [setState]);

  const handleMoveObject = useCallback(
    (
      objectId: Parameters<MapCanvasProps["onMoveObject"]>[0],
      x: Parameters<MapCanvasProps["onMoveObject"]>[1],
      y: Parameters<MapCanvasProps["onMoveObject"]>[2],
    ) => {
      setState((draft) => {
        const object = (draft.project?.objects ?? []).find(
          (candidate) => candidate.id === objectId,
        );
        if (!object) return;

        object.x = x;
        object.y = y;
      });
    },
    [setState],
  );

  const handleResizeObject = useCallback(
    (
      objectId: Parameters<MapCanvasProps["onResizeObject"]>[0],
      x: Parameters<MapCanvasProps["onResizeObject"]>[1],
      y: Parameters<MapCanvasProps["onResizeObject"]>[2],
      width: Parameters<MapCanvasProps["onResizeObject"]>[3],
      height: Parameters<MapCanvasProps["onResizeObject"]>[4],
    ) => {
      setState((draft) => {
        const object = (draft.project?.objects ?? []).find(
          (candidate) => candidate.id === objectId,
        );
        if (!object) return;

        const textBounds =
          object.type === "text"
            ? clampTextObjectBounds(width, height)
            : { width, height };
        object.x = x;
        object.y = y;
        object.width = textBounds.width;
        object.height = textBounds.height;
      });
    },
    [setState],
  );

  const handleUpdatePolygonPoints = useCallback(
    (
      objectId: Parameters<MapCanvasProps["onUpdatePolygonPoints"]>[0],
      points: Parameters<MapCanvasProps["onUpdatePolygonPoints"]>[1],
    ) => {
      setState((draft) => {
        const object = (draft.project?.objects ?? []).find(
          (candidate) => candidate.id === objectId,
        );
        if (!object) return;

        object.points = points;
      });
    },
    [setState],
  );

  const handleOpenInImageEditor = useCallback(() => {
    if (!contextMenuTileRef.current || !activeLayer || !activeMap || !project) {
      return;
    }

    const { x, y } = contextMenuTileRef.current;
    const tileRef = activeLayer.tiles[`${x},${y}`];
    if (!tileRef) return;

    const allTilesets = [
      ...project.tilesets,
      ...(project.overrideTilesets ?? []),
    ];
    const tileset = allTilesets.find(
      (candidate) => candidate.id === tileRef.tilesetId,
    );
    if (!tileset) return;

    setTileEditorContext({
      tilesetId: tileRef.tilesetId,
      assetId: tileset.assetId,
      sx: tileRef.sx,
      sy: tileRef.sy,
      sw: tileRef.sw,
      sh: tileRef.sh,
      layerId: activeLayer.id,
      tileX: x,
      tileY: y,
    });

    window.dispatchEvent(new CustomEvent("open-image-editor"));
  }, [activeLayer, activeMap, contextMenuTileRef, project]);

  const handleOpenImageLayerInEditor = useCallback(() => {
    if (
      !activeImageLayer ||
      !hasContextMenuImageLayer ||
      activeImageLayer.locked
    ) {
      return;
    }

    setImageLayerEditorContext({
      layerId: activeImageLayer.id,
      assetId: activeImageLayer.assetId,
      width: activeImageLayer.width,
      height: activeImageLayer.height,
    });

    window.dispatchEvent(new CustomEvent("open-image-editor"));
  }, [activeImageLayer, hasContextMenuImageLayer]);

  const handleEditInImageEditor = useCallback(() => {
    if (activeImageLayer) {
      handleOpenImageLayerInEditor();
      return;
    }

    handleOpenInImageEditor();
  }, [activeImageLayer, handleOpenImageLayerInEditor, handleOpenInImageEditor]);

  return {
    handleCancelPendingObject,
    handleCreateObject,
    handleEditInImageEditor,
    handleMoveImageLayer,
    handleMoveObject,
    handleMoveTiles,
    handlePaintEnd,
    handlePaintTile,
    handlePlaceAnimation,
    handleResizeImageLayer,
    handleResizeObject,
    handleSelectionChange,
    handleUpdatePolygonPoints,
  };
}
