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
import { applyMapResizeToProject } from "@/features/map-editor/lib/map-resize";
import { getGeometryForNewMapType } from "@/features/map-editor/lib/map-geometry";
import { zoomStore } from "@/store/zoom-store";
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
  type MapGroup,
  type MapGroupId,
  type MapId,
  type NewMapType,
  type ObjectId,
  type PropertyValue,
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

function getAdjacentItemId<T extends { id: string }>(
  items: T[],
  targetId: string,
): string | null {
  const index = items.findIndex((item) => item.id === targetId);
  if (index === -1) return null;
  return items[index + 1]?.id ?? items[index - 1]?.id ?? null;
}

export function MapPanel({ quickExportControl }: QuickExportSurfaceProps) {
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
  const [fillTerrainDialogOpen, setFillTerrainDialogOpen] = useState(false);
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
  const groupMaps = currentProject.maps.filter(
    (map) => map.groupId === state.activeMapGroupId,
  );
  const flatAllIds = activeMap
    ? getAllLayerIds(activeMap.layerOrder, layerGroups)
    : [];
  const flatMap = activeMap ? { ...activeMap, layerOrder: flatAllIds } : null;

  function handleZoom(direction: 1 | -1) {
    zoomStore.setMapZoom(mapZoom + direction * 0.5);
  }

  function handleAddMap() {
    setAddMapOpen(true);
    setNewMapName("Untitled Map");
    setNewMapWidth(20);
    setNewMapHeight(15);
    setNewMapType(DEFAULT_NEW_MAP_TYPE);
  }

  function handleCreateMap() {
    if (!activeGroup) return;

    const name = newMapName.trim() || "Untitled Map";
    const mapId = generateMapId();
    const layerId = generateLayerId();
    const geometry = getGeometryForNewMapType(newMapType);

    setState((draft) => {
      if (!draft.project) return;

      const map: TileMapData = {
        id: mapId,
        name,
        groupId: activeGroup.id,
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
      draft.activeMapId = mapId;
      draft.activeLayerId = layerId;
    });

    setAddMapOpen(false);
  }

  function handleGroupChange(value: string) {
    if (value === "__add__") {
      setAddGroupOpen(true);
      setNewGroupName("");
      return;
    }

    setState((draft) => {
      draft.activeMapGroupId = value as MapGroupId;
      const firstInGroup = draft.project?.maps.find(
        (map) => map.groupId === value,
      );
      draft.activeMapId = firstInGroup?.id ?? null;
      draft.activeLayerId = firstInGroup
        ? (findLastLayerId(
            firstInGroup.layerOrder,
            draft.project?.layers ?? [],
            draft.project?.layerGroups ?? [],
          ) ?? null)
        : null;
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
      draft.activeMapGroupId = id;
      draft.activeMapId = null;
      draft.activeLayerId = null;
    });
    setAddGroupOpen(false);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;

    if (deleteTarget.type === "map") {
      setState((draft) => {
        if (!draft.project) return;

        const map = draft.project.maps.find(
          (entry) => entry.id === deleteTarget.id,
        );
        const mapsInGroup = map
          ? draft.project.maps.filter((entry) => entry.groupId === map.groupId)
          : [];
        const nextMapId = getAdjacentItemId(mapsInGroup, deleteTarget.id);

        if (map) {
          draft.project.layers = draft.project.layers.filter(
            (layer) => layer.mapId !== deleteTarget.id,
          );
          draft.project.imageLayers = (draft.project.imageLayers ?? []).filter(
            (layer) => layer.mapId !== deleteTarget.id,
          );
        }

        draft.project.maps = draft.project.maps.filter(
          (entry) => entry.id !== deleteTarget.id,
        );

        if (draft.activeMapId === deleteTarget.id) {
          draft.activeMapId = nextMapId as MapId | null;
          const nextMap = nextMapId
            ? draft.project.maps.find((entry) => entry.id === nextMapId)
            : null;
          draft.activeLayerId = nextMap
            ? (findLastLayerId(
                nextMap.layerOrder,
                draft.project.layers,
                draft.project.layerGroups ?? [],
              ) ?? null)
            : null;
        }
      });
    } else {
      setState((draft) => {
        if (!draft.project) return;

        const mapsInGroup = draft.project.maps.filter(
          (map) => map.groupId === deleteTarget.id,
        );
        for (const map of mapsInGroup) {
          draft.project.layers = draft.project.layers.filter(
            (layer) => layer.mapId !== map.id,
          );
          draft.project.imageLayers = (draft.project.imageLayers ?? []).filter(
            (layer) => layer.mapId !== map.id,
          );
        }
        draft.project.maps = draft.project.maps.filter(
          (map) => map.groupId !== deleteTarget.id,
        );
        draft.project.mapGroups = draft.project.mapGroups.filter(
          (group) => group.id !== deleteTarget.id,
        );
        if (draft.activeMapGroupId === deleteTarget.id) {
          draft.activeMapGroupId = draft.project.mapGroups[0]?.id ?? null;
          draft.activeMapId = null;
          draft.activeLayerId = null;
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
      setState((draft) => {
        if (!draft.project) return;
        const map = draft.project.maps.find(
          (entry) => entry.id === renamingTabId,
        );
        if (map) {
          map.name = name;
        }
      });
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
    if (mode === "fillTerrain") {
      setFillTerrainDialogOpen(true);
    }
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
        onSelectFillMode={handleSelectFillMode}
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
        onMoveImageLayer={handleMoveImageLayer}
        onMoveObject={handleMoveObject}
        onMoveTiles={handleMoveTiles}
        onOpenObjectProperties={handleOpenObjectProperties}
        onOrientSelection={handleOrientSelection}
        onPaintEnd={handlePaintEnd}
        onPaintTile={handlePaintTile}
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
        fillTerrainDialogOpen={fillTerrainDialogOpen}
        mapOptionsOpen={mapOptionsOpen}
        newGroupName={newGroupName}
        newMapHeight={newMapHeight}
        newMapName={newMapName}
        newMapType={newMapType}
        newMapWidth={newMapWidth}
        onApplyTerrainFill={(tiles: TerrainTile[]) => {
          setState((draft) => {
            draft.currentTool = "fill";
            draft.fillMode = "fillTerrain";
            draft.activeFillTerrain = tiles;
          });
        }}
        onCreateGroup={handleCreateGroup}
        onCreateMap={handleCreateMap}
        onDeleteConfirm={handleDeleteConfirm}
        onUpdateMapOptions={handleUpdateMapOptions}
        propsObjectId={propsObjectId}
        setAddGroupOpen={setAddGroupOpen}
        setAddMapOpen={setAddMapOpen}
        setDeleteTarget={setDeleteTarget}
        setFillTerrainDialogOpen={setFillTerrainDialogOpen}
        setMapOptionsOpen={setMapOptionsOpen}
        setNewGroupName={setNewGroupName}
        setNewMapHeight={setNewMapHeight}
        setNewMapName={setNewMapName}
        setNewMapType={setNewMapType}
        setNewMapWidth={setNewMapWidth}
        setPropsObjectId={setPropsObjectId}
        state={state}
      />
    </div>
  );
}
