import {
  getAdjacentGroupedItemId,
  moveGroupedItem,
  moveOrderedGroup,
  reindexOrderedGroups,
} from "@/features/map-editor/lib/asset-manager";
import { findLastLayerId } from "@/features/map-editor/lib/layers";
import { deleteMapFromProject } from "@/features/map-editor/lib/map-management";
import { getGeometryForNewMapType } from "@/features/map-editor/lib/map-geometry";
import { applyMapResizeToProject } from "@/features/map-editor/lib/map-resize";
import type {
  CreateMapPanelMapManagementParams,
  CreateMapPanelMapManagementResult,
} from "@/features/map-editor/types/map-panel";
import {
  DEFAULT_NEW_MAP_TYPE,
  type EditorState,
  type MapGroup,
  type MapGroupId,
  type MapId,
  type PropertyValue,
  type TileLayer,
  type TileMapData,
} from "@/types";
import {
  generateLayerId,
  generateMapGroupId,
  generateMapId,
} from "@/utils/ids";

function clampMapDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(256, Math.max(1, Math.round(value)));
}

function syncActiveMapStateForGroup(
  draft: EditorState,
  groupId: MapGroupId | null,
  mapId?: MapId | null,
) {
  draft.activeMapGroupId = groupId;
  const nextMap = mapId
    ? (draft.project?.maps.find((entry) => entry.id === mapId) ?? null)
    : groupId
      ? (draft.project?.maps.find((entry) => entry.groupId === groupId) ?? null)
      : null;

  draft.activeMapId = nextMap?.id ?? null;
  draft.activeLayerId = nextMap
    ? (findLastLayerId(
        nextMap.layerOrder,
        draft.project?.layers ?? [],
        draft.project?.layerGroups ?? [],
      ) ?? null)
    : null;

  if (
    draft.activeObjectId &&
    !(draft.project?.objects ?? []).some(
      (object) => object.id === draft.activeObjectId,
    )
  ) {
    draft.activeObjectId = null;
  }
}

export function createMapPanelMapManagement({
  createMapTargetGroupId,
  currentProject,
  deleteTarget,
  manageMapsSelectedGroupId,
  mapOptionsTargetMapId,
  newGroupName,
  newMapHeight,
  newMapName,
  newMapType,
  newMapWidth,
  setAddGroupOpen,
  setAddMapOpen,
  setCreateMapTargetGroupId,
  setDeleteTarget,
  setManageMapsOpen,
  setManageMapsSelectedGroupId,
  setMapOptionsOpen,
  setMapOptionsTargetMapId,
  setNewGroupName,
  setNewMapHeight,
  setNewMapName,
  setNewMapType,
  setNewMapWidth,
  setState,
  state,
}: CreateMapPanelMapManagementParams): CreateMapPanelMapManagementResult {
  const activeGroup = currentProject.mapGroups.find(
    (group) => group.id === state.activeMapGroupId,
  );
  const orderedMapGroups = [...currentProject.mapGroups].sort(
    (left, right) => left.order - right.order,
  );
  const groupMaps = currentProject.maps.filter(
    (map) => map.groupId === state.activeMapGroupId,
  );
  const resolvedManageMapsSelectedGroupId = orderedMapGroups.some(
    (group) => group.id === manageMapsSelectedGroupId,
  )
    ? manageMapsSelectedGroupId
    : (orderedMapGroups[0]?.id ?? null);
  const manageMapsGroups = orderedMapGroups.map((group) => {
    const itemCount = currentProject.maps.filter(
      (map) => map.groupId === group.id,
    ).length;
    const isLastGroup = orderedMapGroups.length <= 1;

    return {
      id: group.id,
      name: group.name,
      itemCount,
      canDelete: !isLastGroup,
      deleteDisabledReason: isLastGroup
        ? "Projects must keep at least one map group."
        : undefined,
    };
  });
  const manageMapsItems = currentProject.maps
    .filter((map) => map.groupId === resolvedManageMapsSelectedGroupId)
    .map((map) => ({
      id: map.id,
      name: map.name,
      subtitle: `${map.widthInTiles} × ${map.heightInTiles} tiles`,
    }));
  const mapOptionsMap = currentProject.maps.find(
    (map) => map.id === (mapOptionsTargetMapId ?? state.activeMapId),
  );

  const openManageMapsDialog: CreateMapPanelMapManagementResult["openManageMapsDialog"] =
    (groupId = state.activeMapGroupId) => {
      setManageMapsSelectedGroupId(groupId ?? orderedMapGroups[0]?.id ?? null);
      setManageMapsOpen(true);
    };

  const handleAddMap: CreateMapPanelMapManagementResult["handleAddMap"] = (
    targetGroupId = state.activeMapGroupId,
  ) => {
    setCreateMapTargetGroupId(targetGroupId);
    setAddMapOpen(true);
    setNewMapName("Untitled Map");
    setNewMapWidth(20);
    setNewMapHeight(15);
    setNewMapType(DEFAULT_NEW_MAP_TYPE);
  };

  const handleCreateMap: CreateMapPanelMapManagementResult["handleCreateMap"] =
    () => {
      const targetGroupId = createMapTargetGroupId ?? activeGroup?.id ?? null;
      if (!targetGroupId) {
        return;
      }

      const name = newMapName.trim() || "Untitled Map";
      const mapId = generateMapId();
      const layerId = generateLayerId();
      const geometry = getGeometryForNewMapType(newMapType);

      setState((draft) => {
        if (!draft.project) {
          return;
        }

        const map: TileMapData = {
          id: mapId,
          name,
          groupId: targetGroupId,
          ...geometry,
          widthInTiles: newMapWidth,
          heightInTiles: newMapHeight,
          tileSize: draft.tileSize,
          properties: {},
          layerOrder: [layerId],
          createdAt: Date.now(),
        };
        const layer: TileLayer = {
          id: layerId,
          mapId,
          name: "Layer 1",
          type: "tile",
          visible: true,
          locked: false,
          tiles: {},
        };

        draft.project.maps.push(map);
        draft.project.layers.push(layer);
        draft.activeMapGroupId = targetGroupId;
        draft.activeMapId = mapId;
        draft.activeLayerId = layerId;
      });

      setAddMapOpen(false);
      setCreateMapTargetGroupId(null);
      setManageMapsSelectedGroupId(targetGroupId);
    };

  const handleGroupChange: CreateMapPanelMapManagementResult["handleGroupChange"] =
    (value) => {
      if (value === "__add__") {
        setAddGroupOpen(true);
        setNewGroupName("");
        return;
      }

      if (value === "__manage__") {
        openManageMapsDialog();
        return;
      }

      setState((draft) => {
        syncActiveMapStateForGroup(draft, value as MapGroupId);
      });
    };

  const handleCreateGroup: CreateMapPanelMapManagementResult["handleCreateGroup"] =
    () => {
      const name = newGroupName.trim();
      if (!name) {
        return;
      }

      const id = generateMapGroupId();
      setState((draft) => {
        if (!draft.project) {
          return;
        }

        const group: MapGroup = {
          id,
          name,
          order: draft.project.mapGroups.length,
        };
        draft.project.mapGroups.push(group);
        reindexOrderedGroups(draft.project.mapGroups);
        syncActiveMapStateForGroup(draft, id);
      });

      setAddGroupOpen(false);
      setManageMapsSelectedGroupId(id);
    };

  const handleRenameMapGroup: CreateMapPanelMapManagementResult["handleRenameMapGroup"] =
    (groupId, name) => {
      setState((draft) => {
        const group = draft.project?.mapGroups.find(
          (entry) => entry.id === groupId,
        );
        if (group) {
          group.name = name;
        }
      });
    };

  const handleRenameManagedMap: CreateMapPanelMapManagementResult["handleRenameManagedMap"] =
    (mapId, name) => {
      setState((draft) => {
        const map = draft.project?.maps.find((entry) => entry.id === mapId);
        if (map) {
          map.name = name;
        }
      });
    };

  const handleDeleteEmptyMapGroup: CreateMapPanelMapManagementResult["handleDeleteEmptyMapGroup"] =
    (groupId) => {
      const groupIndex = orderedMapGroups.findIndex(
        (group) => group.id === groupId,
      );
      const remainingGroups = orderedMapGroups.filter(
        (group) => group.id !== groupId,
      );
      const fallbackGroupId =
        remainingGroups[Math.min(groupIndex, remainingGroups.length - 1)]?.id ??
        remainingGroups[0]?.id ??
        null;

      setState((draft) => {
        if (!draft.project) {
          return;
        }
        if (draft.project.mapGroups.length <= 1) {
          return;
        }
        if (draft.project.maps.some((map) => map.groupId === groupId)) {
          return;
        }

        draft.project.mapGroups = draft.project.mapGroups.filter(
          (group) => group.id !== groupId,
        );
        reindexOrderedGroups(draft.project.mapGroups);

        if (draft.activeMapGroupId === groupId) {
          syncActiveMapStateForGroup(
            draft,
            fallbackGroupId as MapGroupId | null,
          );
        }
      });

      setManageMapsSelectedGroupId(fallbackGroupId as MapGroupId | null);
    };

  const handleReorderMapGroups: CreateMapPanelMapManagementResult["handleReorderMapGroups"] =
    (dragId, targetId, position) => {
      setState((draft) => {
        if (!draft.project) {
          return;
        }

        const nextGroups = [...draft.project.mapGroups].sort(
          (left, right) => left.order - right.order,
        );
        if (!moveOrderedGroup(nextGroups, dragId, targetId, position)) {
          return;
        }

        draft.project.mapGroups = nextGroups;
      });
    };

  const handleMoveMapToGroup: CreateMapPanelMapManagementResult["handleMoveMapToGroup"] =
    (mapId, targetGroupId) => {
      setState((draft) => {
        if (!draft.project) {
          return;
        }

        if (
          !moveGroupedItem(draft.project.maps, mapId, {
            targetGroupId,
          })
        ) {
          return;
        }

        if (draft.activeMapId === mapId) {
          draft.activeMapGroupId = targetGroupId;
        }
      });

      setManageMapsSelectedGroupId(targetGroupId);
    };

  const handleReorderMaps: CreateMapPanelMapManagementResult["handleReorderMaps"] =
    (dragId, targetId, position) => {
      setState((draft) => {
        if (!draft.project) {
          return;
        }

        const targetMap = draft.project.maps.find(
          (entry) => entry.id === targetId,
        );
        if (!targetMap) {
          return;
        }

        if (
          !moveGroupedItem(draft.project.maps, dragId, {
            targetGroupId: targetMap.groupId,
            targetItemId: targetId,
            position,
          })
        ) {
          return;
        }

        if (draft.activeMapId === dragId) {
          draft.activeMapGroupId = targetMap.groupId;
        }
      });
    };

  const handleDeleteConfirm: CreateMapPanelMapManagementResult["handleDeleteConfirm"] =
    () => {
      if (!deleteTarget) {
        return;
      }

      if (deleteTarget.type === "map") {
        setState((draft) => {
          if (!draft.project) {
            return;
          }

          const map = draft.project.maps.find(
            (entry) => entry.id === deleteTarget.id,
          );
          const nextMapId = getAdjacentGroupedItemId(
            draft.project.maps,
            deleteTarget.id,
          );

          if (map) {
            const removed = deleteMapFromProject(draft.project, map.id);
            if (
              draft.activeObjectId &&
              removed.objectIds.includes(draft.activeObjectId as string)
            ) {
              draft.activeObjectId = null;
            }
          }

          if (draft.activeMapId === deleteTarget.id) {
            syncActiveMapStateForGroup(
              draft,
              map?.groupId ?? null,
              nextMapId as MapId | null,
            );
          }
        });
      } else {
        setState((draft) => {
          if (!draft.project) {
            return;
          }

          const mapsInGroup = draft.project.maps.filter(
            (map) => map.groupId === deleteTarget.id,
          );
          const removedObjectIds: string[] = [];
          for (const map of mapsInGroup) {
            const removed = deleteMapFromProject(draft.project, map.id);
            removedObjectIds.push(...removed.objectIds);
          }
          draft.project.mapGroups = draft.project.mapGroups.filter(
            (group) => group.id !== deleteTarget.id,
          );
          reindexOrderedGroups(draft.project.mapGroups);
          if (
            draft.activeObjectId &&
            removedObjectIds.includes(draft.activeObjectId as string)
          ) {
            draft.activeObjectId = null;
          }
          if (draft.activeMapGroupId === deleteTarget.id) {
            syncActiveMapStateForGroup(
              draft,
              draft.project.mapGroups[0]?.id ?? null,
            );
          }
        });
      }

      setDeleteTarget(null);
    };

  const handleMapOptionsOpenChange: CreateMapPanelMapManagementResult["handleMapOptionsOpenChange"] =
    (open) => {
      setMapOptionsOpen(open);
      if (!open) {
        setMapOptionsTargetMapId(null);
      }
    };

  const handleOpenMapOptions: CreateMapPanelMapManagementResult["handleOpenMapOptions"] =
    (mapId = state.activeMapId) => {
      if (!mapId) {
        return;
      }

      setMapOptionsTargetMapId(mapId);
      setMapOptionsOpen(true);
    };

  function handleSaveMapOptions(
    targetMapId: MapId | null,
    width: number,
    height: number,
    properties?: Record<string, PropertyValue>,
    resizeRequest?: Parameters<
      CreateMapPanelMapManagementResult["handleResizeMap"]
    >[0],
  ) {
    if (!targetMapId) {
      return;
    }

    const targetMap = currentProject.maps.find(
      (entry) => entry.id === targetMapId,
    );
    if (!targetMap) {
      return;
    }

    const nextWidth = clampMapDimension(width, targetMap.widthInTiles);
    const nextHeight = clampMapDimension(height, targetMap.heightInTiles);

    setState((draft) => {
      if (!draft.project) {
        return;
      }

      const map = draft.project.maps.find((entry) => entry.id === targetMapId);
      if (!map) {
        return;
      }

      applyMapResizeToProject(draft.project, {
        mapId: map.id,
        width: nextWidth,
        height: nextHeight,
        properties,
        originOffsetXInTiles: resizeRequest?.originOffsetXInTiles,
        originOffsetYInTiles: resizeRequest?.originOffsetYInTiles,
      });
    });
  }

  const handleResizeMap: CreateMapPanelMapManagementResult["handleResizeMap"] =
    (request) => {
      handleSaveMapOptions(
        state.activeMapId,
        request.width,
        request.height,
        undefined,
        request,
      );
    };

  const handleUpdateMapOptions: CreateMapPanelMapManagementResult["handleUpdateMapOptions"] =
    (width, height, properties) => {
      handleSaveMapOptions(
        mapOptionsTargetMapId ?? state.activeMapId,
        width,
        height,
        properties,
      );
      handleMapOptionsOpenChange(false);
    };

  return {
    activeGroup,
    groupMaps,
    handleAddMap,
    handleCreateGroup,
    handleCreateMap,
    handleDeleteConfirm,
    handleDeleteEmptyMapGroup,
    handleGroupChange,
    handleMapOptionsOpenChange,
    handleMoveMapToGroup,
    handleOpenMapOptions,
    handleRenameManagedMap,
    handleRenameMapGroup,
    handleReorderMapGroups,
    handleReorderMaps,
    handleResizeMap,
    handleUpdateMapOptions,
    manageMapsGroups,
    manageMapsItems,
    mapOptionsMap,
    openManageMapsDialog,
    resolvedManageMapsSelectedGroupId,
  };
}
