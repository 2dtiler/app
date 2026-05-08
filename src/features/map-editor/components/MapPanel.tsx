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
import { createMapPanelMapManagement } from "@/features/map-editor/lib/map-panel-map-management";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useTextObjectEditing } from "@/features/map-editor/hooks/use-text-object-editing";
import { useCanvasNavigation } from "@/hooks/use-canvas-navigation";
import {
  generateMapId,
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
import { zoomStore } from "@/store/zoom-store";
import type {
  AppliedTerrainSelection,
  TerrainToolTarget,
} from "@/features/map-editor/types/dialogs";
import type { MapCanvasImperativeHandle } from "@/features/map-editor/types/map-canvas";
import {
  DEFAULT_NEW_MAP_TYPE,
  type EditorState,
  type EditorTool,
  type ImageLayer,
  type LayerGroup,
  type LayerGroupId,
  type LayerId,
  type MapGroupId,
  type MapId,
  type NewMapType,
  type ObjectId,
  type TerrainId,
  type TerrainTile,
  type TileLayer,
  type TileMapData,
  type TileRef,
  type QuickExportSurfaceProps,
} from "@/types";

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
  const [mapOptionsTargetMapId, setMapOptionsTargetMapId] =
    useState<MapId | null>(null);
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
  const {
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
    resolvedManageMapsSelectedGroupId,
  } = createMapPanelMapManagement({
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
  });
  const flatAllIds = activeMap
    ? getAllLayerIds(activeMap.layerOrder, layerGroups)
    : [];
  const flatMap = activeMap ? { ...activeMap, layerOrder: flatAllIds } : null;

  function handleZoom(direction: 1 | -1) {
    zoomStore.setMapZoom(mapZoom + direction * 0.5);
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
        onOpenMapOptions={() => handleOpenMapOptions()}
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
        addGroupOpen={addGroupOpen}
        addMapOpen={addMapOpen}
        deleteTarget={deleteTarget}
        mapOptionsOpen={mapOptionsOpen}
        mapOptionsMap={mapOptionsMap}
        newGroupName={newGroupName}
        newMapHeight={newMapHeight}
        newMapName={newMapName}
        newMapType={newMapType}
        newMapWidth={newMapWidth}
        onApplyTerrainSelection={handleApplyTerrainSelection}
        onDeleteTerrain={handleDeleteTerrain}
        onCreateGroup={handleCreateGroup}
        onCreateMap={handleCreateMap}
        onDeleteConfirm={handleDeleteConfirm}
        onImportMapFromFile={onImportMapFromFile}
        onMapOptionsOpenChange={handleMapOptionsOpenChange}
        onManageMapsSelectedGroupChange={(groupId) =>
          setManageMapsSelectedGroupId(groupId)
        }
        onMoveMapToGroup={handleMoveMapToGroup}
        onRequestCreateMap={handleAddMap}
        onRequestDeleteGroup={handleDeleteEmptyMapGroup}
        onRequestEditMap={handleOpenMapOptions}
        onRenameGroup={handleRenameMapGroup}
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
