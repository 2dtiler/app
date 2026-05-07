import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { MapPanelDialogs } from "./MapPanel/MapPanelDialogs";
import { MapPanelTabs } from "./MapPanel/MapPanelTabs";
import { MapPanelToolbar } from "./MapPanel/MapPanelToolbar";
import { MapPanelWorkspace } from "./MapPanel/MapPanelWorkspace";
import { useMapCanvasContextMenu } from "./MapPanel/use-map-canvas-context-menu";
import { useMapPanelCanvasActions } from "./MapPanel/use-map-panel-canvas-actions";
import { useMapPanelClipboardActions } from "./MapPanel/use-map-panel-clipboard-actions";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useTextObjectEditing } from "@/features/map-editor/hooks/use-text-object-editing";
import { useCanvasNavigation } from "@/hooks/use-canvas-navigation";
import {
  generateMapId,
  generateMapGroupId,
  generateLayerId,
  generateLayerGroupId,
} from "@/utils/ids";
import {
  flattenLayerTree,
  flattenImageLayers,
  flattenObjectLayers,
  findLastLayerId,
  getAllLayerIds,
  isLayerEffectivelyLocked,
} from "@/features/map-editor/lib/layers";
import {
  moveGroupedItem,
  moveOrderedGroup,
  reindexOrderedGroups,
  getAdjacentGroupedItemId,
} from "@/features/map-editor/lib/asset-manager";
import { deleteMapFromProject } from "@/features/map-editor/lib/map-management";
import { applyMapResizeToProject } from "@/features/map-editor/lib/map-resize";
import { getGeometryForNewMapType } from "@/features/map-editor/lib/map-geometry";
import { zoomStore } from "@/store/zoom-store";
import type {
  AppliedTerrainSelection,
  TerrainToolTarget,
} from "@/features/map-editor/types/dialogs";
import type {
  MapCanvasImperativeHandle,
  MapResizeRequest,
} from "@/features/map-editor/types/map-canvas";
import {
  DEFAULT_NEW_MAP_TYPE,
  type EditorState,
  type EditorTool,
  type ImageLayer,
  type LayerGroup,
  type LayerGroupId,
  type LayerId,
  type MapGroupId,
  type MapGroup,
  type MapId,
  type NewMapType,
  type ObjectId,
  type PropertyValue,
  type TerrainId,
  type TerrainTile,
  type TileLayer,
  type TileMapData,
  type TileRef,
  type QuickExportSurfaceProps,
} from "@/types";

function clampMapDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(256, Math.max(1, Math.round(value)));
}

function cloneTerrainTiles(tiles: TerrainTile[] | null): TerrainTile[] | null {
  return (
    tiles?.map((tile) => ({
      probability: tile.probability,
      tileRef: { ...tile.tileRef },
    })) ?? null
  );
}

export function MapPanel({
  quickExportControl,
  onImportMapFromFile,
}: QuickExportSurfaceProps & {
  onImportMapFromFile: (file: File) => Promise<boolean>;
}) {
  "use no memo";

  const { state, setState, controls } = useEditorStore();
  const { mapZoom } = useSyncExternalStore(
    zoomStore.subscribe,
    zoomStore.getSnapshot,
  );
  const project = state.project;
  const projectId = project?.id ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<MapCanvasImperativeHandle | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [paintBuffer] = useState(() => new Map<string, TileRef | null>());
  const [paintBufferVersion, setPaintBufferVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "map" | "group";
    id: string;
    name: string;
  } | null>(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addMapOpen, setAddMapOpen] = useState(false);
  const [newMapName, setNewMapName] = useState("Untitled Map");
  const [newMapWidth, setNewMapWidth] = useState(20);
  const [newMapHeight, setNewMapHeight] = useState(15);
  const [newMapType, setNewMapType] =
    useState<NewMapType>(DEFAULT_NEW_MAP_TYPE);
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const [terrainDialogOpen, setTerrainDialogOpen] = useState(false);
  const [terrainDialogTarget, setTerrainDialogTarget] =
    useState<TerrainToolTarget>("fill");
  const [terrainDialogInitialTerrainId, setTerrainDialogInitialTerrainId] =
    useState<TerrainId | null>(null);
  const [terrainDialogInitialTiles, setTerrainDialogInitialTiles] = useState<
    TerrainTile[] | null
  >(null);
  const [manageMapsOpen, setManageMapsOpen] = useState(false);
  const [manageMapsSelectedGroupId, setManageMapsSelectedGroupId] =
    useState<MapGroupId | null>(null);
  const [createMapTargetGroupId, setCreateMapTargetGroupId] =
    useState<MapGroupId | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<MapId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [propsObjectId, setPropsObjectId] = useState<ObjectId | null>(null);

  useEffect(() => {
    zoomStore.setActiveMap(projectId ? state.activeMapId : null);
  }, [projectId, state.activeMapId]);

  const handleSetMapZoom = useCallback((newZoom: number) => {
    zoomStore.setMapZoom(newZoom);
  }, []);

  useCanvasNavigation(containerRef, mapZoom, handleSetMapZoom);

  const activeMap = project?.maps.find((map) => map.id === state.activeMapId);
  const activeLayer = project?.layers.find(
    (layer) => layer.id === state.activeLayerId,
  );
  const activeLayerEffectivelyLocked =
    !!activeMap &&
    !!activeLayer &&
    isLayerEffectivelyLocked(
      activeLayer.id,
      activeMap.layerOrder,
      project?.layers ?? [],
      project?.layerGroups ?? [],
    );
  const layerGroups = project?.layerGroups ?? [];
  const projectImageLayers = project?.imageLayers ?? [];
  const projectObjectLayers = project?.objectLayers ?? [];
  const flatLayers = activeMap
    ? flattenLayerTree(activeMap.layerOrder, project?.layers ?? [], layerGroups)
    : [];
  const flatImageLayers = activeMap
    ? flattenImageLayers(activeMap.layerOrder, projectImageLayers, layerGroups)
    : [];
  const flatObjectLayers = activeMap
    ? flattenObjectLayers(
        activeMap.layerOrder,
        projectObjectLayers,
        layerGroups,
      )
    : [];
  const flatObjectLayerIds = new Set(
    flatObjectLayers.map((layer) => layer.id as string),
  );
  const projectObjects = project?.objects ?? [];
  const flatObjects = projectObjects.filter((object) =>
    flatObjectLayerIds.has(object.layerId as string),
  );
  const activeImageLayer =
    flatImageLayers.find((layer) => layer.id === state.activeLayerId) ?? null;
  const activeObject =
    projectObjects.find(
      (object) =>
        object.id === state.activeObjectId &&
        object.layerId === state.activeLayerId,
    ) ?? null;
  const activeObjectLayer = activeObject
    ? (flatObjectLayers.find((layer) => layer.id === activeObject.layerId) ??
      null)
    : null;
  const textObjectEditing = useTextObjectEditing(projectObjects, setState);

  const {
    contextMenuTileRef,
    hoverTileRef,
    contextMenuObjectId,
    hasContextMenuTile,
    hasContextMenuImageLayer,
    hasContextMenuObject,
    handleMapContextMenu,
    handleMapMouseMove,
    clearHoverTile,
  } = useMapCanvasContextMenu({
    containerRef,
    activeMap: activeMap ?? null,
    activeTileLayer: activeLayer ?? null,
    activeImageLayer,
    activeLayerId: state.activeLayerId,
    mapZoom,
    objects: flatObjects,
    onSelectObject: (id) => {
      setState((draft) => {
        draft.activeObjectId = id;
      });
    },
  });

  const {
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
  } = useMapPanelCanvasActions({
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
  });

  const {
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
  } = useMapPanelClipboardActions({
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
  });

  if (!project) return null;
  const currentProject = project;

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
      canDelete: !isLastGroup && itemCount === 0,
      deleteDisabledReason: isLastGroup
        ? "Projects must keep at least one map group."
        : itemCount > 0
          ? "Move or delete all maps in this group first."
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
  const flatAllIds = activeMap
    ? getAllLayerIds(activeMap.layerOrder, layerGroups)
    : [];
  const flatMap = activeMap ? { ...activeMap, layerOrder: flatAllIds } : null;

  function syncActiveMapStateForGroup(
    draft: EditorState,
    groupId: MapGroupId | null,
    mapId?: MapId | null,
  ) {
    draft.activeMapGroupId = groupId;
    const nextMap = mapId
      ? (draft.project?.maps.find((entry) => entry.id === mapId) ?? null)
      : groupId
        ? (draft.project?.maps.find((entry) => entry.groupId === groupId) ??
          null)
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

  function openManageMapsDialog(
    groupId: MapGroupId | null = state.activeMapGroupId,
  ) {
    setManageMapsSelectedGroupId(groupId ?? orderedMapGroups[0]?.id ?? null);
    setManageMapsOpen(true);
  }

  function handleZoom(direction: 1 | -1) {
    zoomStore.setMapZoom(mapZoom + direction * 0.5);
  }

  function handleAddMap(
    targetGroupId: MapGroupId | null = state.activeMapGroupId,
  ) {
    setCreateMapTargetGroupId(targetGroupId);
    setAddMapOpen(true);
    setNewMapName("Untitled Map");
    setNewMapWidth(20);
    setNewMapHeight(15);
    setNewMapType(DEFAULT_NEW_MAP_TYPE);
  }

  function handleCreateMap() {
    const targetGroupId = createMapTargetGroupId ?? activeGroup?.id ?? null;
    if (!targetGroupId) return;

    const name = newMapName.trim() || "Untitled Map";
    const mapId = generateMapId();
    const layerId = generateLayerId();
    const geometry = getGeometryForNewMapType(newMapType);

    setState((draft) => {
      if (!draft.project) return;

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
  }

  function handleGroupChange(value: string) {
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
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;

    const id = generateMapGroupId();
    setState((draft) => {
      if (!draft.project) return;

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
  }

  function handleRenameMapGroup(groupId: MapGroupId, name: string) {
    setState((draft) => {
      const group = draft.project?.mapGroups.find(
        (entry) => entry.id === groupId,
      );
      if (group) {
        group.name = name;
      }
    });
  }

  function handleRenameManagedMap(mapId: MapId, name: string) {
    setState((draft) => {
      const map = draft.project?.maps.find((entry) => entry.id === mapId);
      if (map) {
        map.name = name;
      }
    });
  }

  function handleDeleteEmptyMapGroup(groupId: MapGroupId) {
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
      if (!draft.project) return;
      if (draft.project.mapGroups.length <= 1) return;
      if (draft.project.maps.some((map) => map.groupId === groupId)) return;

      draft.project.mapGroups = draft.project.mapGroups.filter(
        (group) => group.id !== groupId,
      );
      reindexOrderedGroups(draft.project.mapGroups);

      if (draft.activeMapGroupId === groupId) {
        syncActiveMapStateForGroup(draft, fallbackGroupId as MapGroupId | null);
      }
    });

    setManageMapsSelectedGroupId(fallbackGroupId as MapGroupId | null);
  }

  function handleReorderMapGroups(
    dragId: MapGroupId,
    targetId: MapGroupId,
    position: "above" | "below",
  ) {
    setState((draft) => {
      if (!draft.project) return;
      const nextGroups = [...draft.project.mapGroups].sort(
        (left, right) => left.order - right.order,
      );
      if (!moveOrderedGroup(nextGroups, dragId, targetId, position)) {
        return;
      }

      draft.project.mapGroups = nextGroups;
    });
  }

  function handleMoveMapToGroup(mapId: MapId, targetGroupId: MapGroupId) {
    setState((draft) => {
      if (!draft.project) return;
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
  }

  function handleReorderMaps(
    dragId: MapId,
    targetId: MapId,
    position: "above" | "below",
  ) {
    setState((draft) => {
      if (!draft.project) return;

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
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;

    if (deleteTarget.type === "map") {
      setState((draft) => {
        if (!draft.project) return;

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
        if (!draft.project) return;

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
  }

  function handleTabDoubleClick(map: TileMapData) {
    setRenamingTabId(map.id);
    setRenameValue(map.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function commitRename() {
    if (!renamingTabId) return;

    const name = renameValue.trim();
    if (name) {
      handleRenameManagedMap(renamingTabId, name);
    }
    setRenamingTabId(null);
  }

  function handleDuplicateMap(sourceMap: TileMapData) {
    const newMapId = generateMapId();
    const oldLayerIds = new Set<string>();
    const oldGroupIds = new Set<string>();

    for (const layer of currentProject.layers) {
      if (layer.mapId === sourceMap.id) {
        oldLayerIds.add(layer.id);
      }
    }
    for (const layer of currentProject.imageLayers ?? []) {
      if (layer.mapId === sourceMap.id) {
        oldLayerIds.add(layer.id);
      }
    }
    for (const group of currentProject.layerGroups ?? []) {
      if (group.mapId === sourceMap.id) {
        oldGroupIds.add(group.id);
      }
    }

    const layerIdMap = new Map<string, LayerId>();
    const groupIdMap = new Map<string, LayerGroupId>();
    for (const id of oldLayerIds) {
      layerIdMap.set(id, generateLayerId());
    }
    for (const id of oldGroupIds) {
      groupIdMap.set(id, generateLayerGroupId());
    }

    const remapId = (id: LayerId | LayerGroupId): LayerId | LayerGroupId =>
      (layerIdMap.get(id) ?? groupIdMap.get(id) ?? id) as
        | LayerId
        | LayerGroupId;

    setState((draft) => {
      if (!draft.project) return;

      const newMap: TileMapData = {
        id: newMapId,
        name: `${sourceMap.name}_copy`,
        groupId: sourceMap.groupId,
        orientation: sourceMap.orientation,
        staggerAxis: sourceMap.staggerAxis,
        staggerIndex: sourceMap.staggerIndex,
        widthInTiles: sourceMap.widthInTiles,
        heightInTiles: sourceMap.heightInTiles,
        tileSize: sourceMap.tileSize,
        properties: Object.fromEntries(
          Object.entries(sourceMap.properties ?? {}).map(([key, value]) => [
            key,
            { ...value },
          ]),
        ),
        layerOrder: sourceMap.layerOrder.map(remapId),
        createdAt: Date.now(),
      };
      draft.project.maps.push(newMap);

      for (const layer of currentProject.layers) {
        if (layer.mapId !== sourceMap.id) continue;
        const newLayerId = layerIdMap.get(layer.id)!;
        const newLayer: TileLayer = {
          id: newLayerId,
          mapId: newMapId,
          name: layer.name,
          type: layer.type,
          visible: layer.visible,
          locked: layer.locked,
          tiles: { ...layer.tiles },
        };
        draft.project.layers.push(newLayer);
      }

      for (const layer of currentProject.imageLayers ?? []) {
        if (layer.mapId !== sourceMap.id) continue;
        const newLayerId = layerIdMap.get(layer.id)!;
        const newImageLayer: ImageLayer = {
          id: newLayerId,
          mapId: newMapId,
          name: layer.name,
          type: "image",
          visible: layer.visible,
          locked: layer.locked,
          assetId: layer.assetId,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation ?? 0,
          flipX: layer.flipX ?? false,
          flipY: layer.flipY ?? false,
          opacity: layer.opacity ?? 100,
        };
        draft.project.imageLayers.push(newImageLayer);
      }

      for (const group of currentProject.layerGroups ?? []) {
        if (group.mapId !== sourceMap.id) continue;
        const newGroupId = groupIdMap.get(group.id)!;
        const newGroup: LayerGroup = {
          id: newGroupId,
          mapId: newMapId,
          name: group.name,
          visible: group.visible,
          locked: group.locked,
          expanded: group.expanded,
          childOrder: group.childOrder.map(remapId),
        };
        draft.project.layerGroups.push(newGroup);
      }

      draft.activeMapId = newMapId;
      draft.activeLayerId =
        findLastLayerId(
          newMap.layerOrder,
          draft.project.layers,
          draft.project.layerGroups,
        ) ?? null;
    });
  }

  function handleSaveMapOptions(
    width: number,
    height: number,
    properties?: Record<string, PropertyValue>,
    resizeRequest?: MapResizeRequest,
  ) {
    if (!activeMap) return;

    const nextWidth = clampMapDimension(width, activeMap.widthInTiles);
    const nextHeight = clampMapDimension(height, activeMap.heightInTiles);

    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find(
        (entry) => entry.id === state.activeMapId,
      );
      if (!map) return;

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

  function handleResizeMap(request: MapResizeRequest) {
    handleSaveMapOptions(request.width, request.height, undefined, request);
  }

  function handleUpdateMapOptions(
    width: number,
    height: number,
    properties: Record<string, PropertyValue>,
  ) {
    handleSaveMapOptions(width, height, properties);
    setMapOptionsOpen(false);
  }

  function handleSelectTool(tool: EditorTool) {
    setState((draft) => {
      draft.currentTool = tool;
    });
  }

  function handleSelectBrushTool(
    tool: "paint" | "erase",
    size: EditorState["brushSize"],
  ) {
    setState((draft) => {
      draft.currentTool = tool;
      draft.brushSize = size;
      if (tool === "paint") {
        draft.paintMode = "paint";
      }
    });
  }

  function getSavedTerrain(terrainId: TerrainId) {
    return (
      project?.terrains.find((terrain) => terrain.id === terrainId) ?? null
    );
  }

  function handleOpenTerrainDialog(target: TerrainToolTarget) {
    setTerrainDialogTarget(target);
    setTerrainDialogInitialTerrainId(null);
    setTerrainDialogInitialTiles(null);
    setTerrainDialogOpen(true);
  }

  function handleSelectPaintTerrain(
    terrainId: TerrainId,
    size: EditorState["brushSize"],
  ) {
    const terrain = getSavedTerrain(terrainId);
    if (!terrain) {
      return;
    }

    setState((draft) => {
      draft.currentTool = "paint";
      draft.paintMode = "paintTerrain";
      draft.brushSize = size;
      draft.selectedPaintTerrainId = terrain.id;
      draft.activePaintTerrain = cloneTerrainTiles(terrain.tiles);
    });
  }

  function handleSelectAutotileTool(
    terrainId: NonNullable<EditorState["selectedAutotileTerrain"]>["terrainId"],
    size: EditorState["brushSize"],
  ) {
    setState((draft) => {
      if (!draft.activeTilesetId) {
        return;
      }

      draft.currentTool = "autotile";
      draft.brushSize = size;
      draft.selectedAutotileTerrain = {
        tilesetId: draft.activeTilesetId,
        terrainId,
      };
    });
  }

  function handleSelectFillMode(mode: EditorState["fillMode"]) {
    setState((draft) => {
      draft.currentTool = "fill";
      draft.fillMode = mode;
    });
  }

  function handleSelectFillTerrain(terrainId: TerrainId) {
    const terrain = getSavedTerrain(terrainId);
    if (!terrain) {
      return;
    }

    setState((draft) => {
      draft.currentTool = "fill";
      draft.fillMode = "fillTerrain";
      draft.selectedFillTerrainId = terrain.id;
      draft.activeFillTerrain = cloneTerrainTiles(terrain.tiles);
    });
  }

  function handleApplyTerrainSelection({
    terrainId,
    tiles,
  }: AppliedTerrainSelection) {
    const clonedTiles = cloneTerrainTiles(tiles);
    if (!clonedTiles || clonedTiles.length === 0) {
      return;
    }

    setState((draft) => {
      if (terrainDialogTarget === "paint") {
        draft.currentTool = "paint";
        draft.paintMode = "paintTerrain";
        draft.selectedPaintTerrainId = terrainId;
        draft.activePaintTerrain = clonedTiles;
        return;
      }

      draft.currentTool = "fill";
      draft.fillMode = "fillTerrain";
      draft.selectedFillTerrainId = terrainId;
      draft.activeFillTerrain = clonedTiles;
    });
  }

  function handleDeleteTerrain(terrainId: TerrainId) {
    setState((draft) => {
      if (draft.selectedPaintTerrainId === terrainId) {
        draft.selectedPaintTerrainId = null;
        draft.activePaintTerrain = null;
        if (draft.paintMode === "paintTerrain") {
          draft.paintMode = "paint";
        }
      }

      if (draft.selectedFillTerrainId === terrainId) {
        draft.selectedFillTerrainId = null;
        draft.activeFillTerrain = null;
        if (draft.fillMode === "fillTerrain") {
          draft.fillMode = "fill";
        }
      }
    });
  }

  function handleSelectMap(mapId: MapId) {
    setState((draft) => {
      draft.activeMapId = mapId;
      const map = draft.project?.maps.find((entry) => entry.id === mapId);
      draft.activeLayerId = map
        ? (findLastLayerId(
            map.layerOrder,
            draft.project?.layers ?? [],
            draft.project?.layerGroups ?? [],
          ) ?? null)
        : null;
    });
  }

  function handleOpenObjectProperties(objectId: ObjectId) {
    setPropsObjectId(objectId);
  }

  return (
    <div className="flex h-full flex-col">
      <MapPanelToolbar
        activeMap={activeMap}
        canCutToolbar={canCutToolbar}
        canOrientToolbar={canOrientToolbar}
        controls={controls}
        mapZoom={mapZoom}
        onCut={() => handleCutSelection(false)}
        onOpenMapOptions={() => setMapOptionsOpen(true)}
        onOrientSelection={handleOrientSelection}
        onSelectAutotileTool={handleSelectAutotileTool}
        onSelectBrushTool={handleSelectBrushTool}
        onSelectPaintMode={(mode) => {
          setState((draft) => {
            draft.currentTool = "paint";
            draft.paintMode = mode;
          });
        }}
        onSelectPaintTerrain={handleSelectPaintTerrain}
        onSelectFillMode={handleSelectFillMode}
        onSelectFillTerrain={handleSelectFillTerrain}
        onOpenTerrainDialog={handleOpenTerrainDialog}
        onSelectTool={handleSelectTool}
        onZoom={handleZoom}
        state={state}
      />

      <MapPanelTabs
        activeGroup={activeGroup}
        groupMaps={groupMaps}
        onAddMap={handleAddMap}
        onCancelRename={() => setRenamingTabId(null)}
        onCommitRename={commitRename}
        onDuplicateMap={handleDuplicateMap}
        onGroupChange={handleGroupChange}
        onRequestDeleteTarget={(target) => setDeleteTarget(target)}
        onSelectMap={handleSelectMap}
        onStartRenamingTab={handleTabDoubleClick}
        project={currentProject}
        renameInputRef={renameInputRef}
        renameValue={renameValue}
        renamingTabId={renamingTabId}
        setRenameValue={setRenameValue}
        state={state}
      />

      <MapPanelWorkspace
        activeLayerEffectivelyLocked={activeLayerEffectivelyLocked}
        activeMap={activeMap}
        canCopy={canCopy}
        canCut={canCut}
        canDeleteSelection={canDeleteSelection}
        canEditInImageEditor={canEditInImageEditor}
        canOrientContextMenu={canOrientContextMenu}
        canPaste={canPaste}
        clearHoverTile={clearHoverTile}
        containerRef={containerRef}
        contextMenuObjectId={contextMenuObjectId}
        flatImageLayers={flatImageLayers}
        flatLayers={flatLayers}
        flatMap={flatMap}
        flatObjectLayers={flatObjectLayers}
        flatObjects={flatObjects}
        groupMaps={groupMaps}
        handleMapContextMenu={handleMapContextMenu}
        handleMapMouseMove={handleMapMouseMove}
        hasContextMenuObject={hasContextMenuObject}
        mapCanvasRef={mapCanvasRef}
        mapZoom={mapZoom}
        onCancelPendingObject={handleCancelPendingObject}
        onCopySelection={handleCopySelection}
        onCreateObject={handleCreateObject}
        onCutSelection={handleCutSelection}
        onDeleteSelection={handleDeleteSelection}
        onEditInImageEditor={handleEditInImageEditor}
        onImportMapFromFile={onImportMapFromFile}
        onMoveImageLayer={handleMoveImageLayer}
        onMoveObject={handleMoveObject}
        onMoveTiles={handleMoveTiles}
        onOpenObjectProperties={handleOpenObjectProperties}
        onOrientSelection={handleOrientSelection}
        onPaintEnd={handlePaintEnd}
        onPaintTile={handlePaintTile}
        onPlaceAnimation={handlePlaceAnimation}
        onPasteSelection={handlePasteSelection}
        onResizeImageLayer={handleResizeImageLayer}
        onResizeMap={handleResizeMap}
        onResizeObject={handleResizeObject}
        onSelectObject={(objectId) => {
          setState((draft) => {
            draft.activeObjectId = objectId;
          });
        }}
        onSelectionChange={handleSelectionChange}
        onUpdatePolygonPoints={handleUpdatePolygonPoints}
        paintBuffer={paintBuffer}
        paintBufferVersion={paintBufferVersion}
        project={currentProject}
        quickExportControl={quickExportControl}
        state={state}
        textObjectEditing={textObjectEditing}
      />

      <MapPanelDialogs
        activeMap={activeMap}
        addGroupOpen={addGroupOpen}
        addMapOpen={addMapOpen}
        deleteTarget={deleteTarget}
        mapOptionsOpen={mapOptionsOpen}
        newGroupName={newGroupName}
        newMapHeight={newMapHeight}
        newMapName={newMapName}
        newMapType={newMapType}
        newMapWidth={newMapWidth}
        onApplyTerrainSelection={handleApplyTerrainSelection}
        onDeleteTerrain={handleDeleteTerrain}
        onCreateGroup={handleCreateGroup}
        onCreateMap={handleCreateMap}
        onDeleteEmptyGroup={handleDeleteEmptyMapGroup}
        onDeleteConfirm={handleDeleteConfirm}
        onImportMapFromFile={onImportMapFromFile}
        onManageMapsSelectedGroupChange={(groupId) =>
          setManageMapsSelectedGroupId(groupId)
        }
        onMoveMapToGroup={handleMoveMapToGroup}
        onRenameGroup={handleRenameMapGroup}
        onRenameMap={handleRenameManagedMap}
        onReorderGroups={handleReorderMapGroups}
        onReorderMaps={handleReorderMaps}
        onUpdateMapOptions={handleUpdateMapOptions}
        propsObjectId={propsObjectId}
        setAddGroupOpen={setAddGroupOpen}
        setAddMapOpen={setAddMapOpen}
        setDeleteTarget={setDeleteTarget}
        setManageMapsOpen={setManageMapsOpen}
        manageMapsGroups={manageMapsGroups}
        manageMapsItems={manageMapsItems}
        manageMapsOpen={manageMapsOpen}
        manageMapsSelectedGroupId={resolvedManageMapsSelectedGroupId}
        setMapOptionsOpen={setMapOptionsOpen}
        setNewGroupName={setNewGroupName}
        setNewMapHeight={setNewMapHeight}
        setNewMapName={setNewMapName}
        setNewMapType={setNewMapType}
        setNewMapWidth={setNewMapWidth}
        setPropsObjectId={setPropsObjectId}
        state={state}
        terrainDialogOpen={terrainDialogOpen}
        terrainDialogTarget={terrainDialogTarget}
        terrainDialogInitialTerrainId={terrainDialogInitialTerrainId}
        terrainDialogInitialTiles={terrainDialogInitialTiles}
        setTerrainDialogOpen={setTerrainDialogOpen}
      />
    </div>
  );
}
