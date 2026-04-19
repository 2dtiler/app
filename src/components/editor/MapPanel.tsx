import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  X,
  BoxSelect,
  Paintbrush,
  PaintBucket,
  Eraser,
  Settings,
  Trash2,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  RefreshCw,
  Scissors,
  Undo2,
  Redo2,
} from "lucide-react";
import { MapCanvas } from "./MapCanvas";
import { MapCanvasContextMenuContent } from "./MapPanel/MapCanvasContextMenuContent";
import { useMapCanvasContextMenu } from "./MapPanel/use-map-canvas-context-menu";
import type { MapCanvasImperativeHandle } from "@/types/map-canvas";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import { FillTerrainDialog } from "@/components/dialogs/FillTerrainDialog";
import { MapOptionsDialog } from "@/components/dialogs/MapOptionsDialog";
import { NewMapDialog } from "@/components/dialogs/NewMapDialog";
import { NewMapGroupDialog } from "@/components/dialogs/NewMapGroupDialog";
import { ObjectPropertiesDialogManager } from "@/components/editor/ObjectPropertiesDialogManager";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useTextObjectEditing } from "@/hooks/use-text-object-editing";
import { useCanvasNavigation } from "@/hooks/use-canvas-navigation";
import {
  generateMapId,
  generateMapGroupId,
  generateAssetId,
  generateLayerId,
  generateLayerGroupId,
  generateObjectId,
} from "@/lib/ids";
import { getAsset, saveAsset } from "@/lib/db";
import {
  flattenLayerTree,
  flattenImageLayers,
  flattenObjectLayers,
  getAllLayerIds,
  isLayerEffectivelyLocked,
  findLastLayerId,
} from "@/lib/layers";
import {
  BRUSH_SIZES,
  type EditorTool,
  type MapGroupId,
  type MapId,
  type LayerId,
  type LayerGroupId,
  type TileMapData,
  type TileLayer,
  type TileRef,
  type MapGroup,
  type LayerGroup,
  type TerrainTile,
  type MapSelection,
  type ImageLayer,
  type MapObject,
  type ObjectId,
  type ObjectType,
  type PropertyValue,
  DEFAULT_NEW_MAP_TYPE,
  type NewMapType,
} from "@/types";
import type { OrientAction } from "@/types/map-panel-context-menu";
import type {
  ImageLayerClipboard,
  TileClipboard,
} from "@/types/editor-helpers";
import { getGeometryForNewMapType } from "@/lib/map-geometry";
import { getFillRegion, pickWeightedTile } from "@/lib/terrain";
import {
  areTileRefsEqual,
  createTileStamp,
  getTileStampRef,
  isMultiTileStamp,
} from "@/lib/tile-stamp";
import { getClipboard, setClipboard } from "@/lib/tile-clipboard";
import {
  getImageLayerClipboard,
  setImageLayerClipboard,
} from "@/lib/image-layer-clipboard";
import { setImageLayerEditorContext } from "@/lib/image-layer-editor-context";
import { setTileEditorContext } from "@/lib/tile-editor-context";
import {
  clampTextObjectBounds,
  getDefaultTextObjectProperties,
} from "@/lib/text-objects";
import { zoomStore } from "@/lib/zoom-store";
import { TEXT_OBJECT_DEFAULTS } from "@/types";

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
  const topIdx = (topOrder as string[]).indexOf(refId);
  if (topIdx !== -1) {
    topOrder.splice(topIdx + 1, 0, newId as LayerId | LayerGroupId);
    return true;
  }

  for (const group of groups) {
    const idx = (group.childOrder as string[]).indexOf(refId);
    if (idx !== -1) {
      group.childOrder.splice(idx + 1, 0, newId as LayerId | LayerGroupId);
      return true;
    }
  }

  return false;
}

function removeLayerFromOrders(
  layerId: string,
  topOrder: (LayerId | LayerGroupId)[],
  groups: LayerGroup[],
): void {
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

export function MapPanel() {
  "use no memo";

  const { state, setState, controls } = useEditorStore();
  const { mapZoom } = useSyncExternalStore(
    zoomStore.subscribe,
    zoomStore.getSnapshot,
  );
  const project = state.project;
  const projectId = project?.id ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  /** Track clipboard content so Paste can be enabled for tiles and image layers. */
  const [hasTileClipboard, setHasTileClipboard] = useState(
    () => getClipboard() !== null,
  );
  const [hasImageLayerClipboard, setHasImageLayerClipboard] = useState(
    () => getImageLayerClipboard() !== null,
  );
  // --- Paint buffer for instant visual feedback ---
  // Tile changes are written here during a stroke.
  // The buffer is flushed to the store (single undo step) on pointer-up.
  // paintBufferVersion is only incremented on commit (pointer-up), not during stroke.
  const [paintBuffer] = useState(() => new Map<string, TileRef | null>());
  const [paintBufferVersion, setPaintBufferVersion] = useState(0);
  // Imperative handle to MapCanvas — bypasses React for per-tile drawing during strokes
  const mapCanvasRef = useRef<MapCanvasImperativeHandle | null>(null);

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
  const [newMapType, setNewMapType] = useState<NewMapType>(
    DEFAULT_NEW_MAP_TYPE,
  );
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const [fillTerrainDialogOpen, setFillTerrainDialogOpen] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<MapId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [propsObjectId, setPropsObjectId] = useState<ObjectId | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    zoomStore.setActiveMap(projectId ? state.activeMapId : null);
  }, [projectId, state.activeMapId]);

  // Ctrl+Wheel zoom and middle-mouse pan
  const handleSetMapZoom = useCallback((newZoom: number) => {
    zoomStore.setMapZoom(newZoom);
  }, []);
  useCanvasNavigation(containerRef, mapZoom, handleSetMapZoom);

  // Derived values needed by hooks (computed before early return)
  const activeMap = project?.maps.find((m) => m.id === state.activeMapId);
  const activeLayer = project?.layers.find((l) => l.id === state.activeLayerId);
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
    (project?.objects ?? []).find(
      (obj) =>
        obj.id === state.activeObjectId && obj.layerId === state.activeLayerId,
    ) ?? null;
  const activeObjectLayer = activeObject
    ? (flatObjectLayers.find((layer) => layer.id === activeObject.layerId) ??
      null)
    : null;
  const textObjectEditing = useTextObjectEditing(
    project?.objects ?? [],
    setState,
  );
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

  // Paint tile handler — called by MapCanvas on pointer events.
  // Paint/erase write to a lightweight buffer for instant rendering;
  // the buffer is flushed to the store on pointer-up (handlePaintEnd).
  const handlePaintTile = useCallback(
    (gx: number, gy: number) => {
      if (!activeMap || !activeLayer) return;
      // Check effective lock state (including group inheritance)
      const effectivelyLocked = isLayerEffectivelyLocked(
        activeLayer.id,
        activeMap.layerOrder,
        project?.layers ?? [],
        project?.layerGroups ?? [],
      );
      if (effectivelyLocked) return;

      const selectedStamp = state.selectedTile
        ? createTileStamp(state.selectedTile, state.tileSize)
        : null;

      if (state.currentTool === "paint") {
        if (!selectedStamp) return;

        if (isMultiTileStamp(selectedStamp)) {
          for (const cell of selectedStamp.cells) {
            const tx = gx + cell.dx;
            const ty = gy + cell.dy;
            if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles)
              continue;
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
              if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles)
                continue;
              paintBuffer.set(`${tx},${ty}`, { ...ref });
              // Draw directly onto the paint canvas — no React re-render
              mapCanvasRef.current?.drawBufferTile(tx, ty, ref);
            }
          }
        }
      } else if (state.currentTool === "erase") {
        const brushNum = parseInt(state.brushSize);
        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const tx = gx + dx;
            const ty = gy + dy;
            if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles)
              continue;
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

            if (committedRef === null) {
              paintBuffer.delete(key);
            } else {
              paintBuffer.set(key, null);
            }

            // Clear the active-layer canvas cell so the composite matches the
            // active layer's buffered state during the drag.
            mapCanvasRef.current?.eraseBufferTile(tx, ty);
          }
        }
      } else if (state.currentTool === "fill") {
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

        // Apply fill — single setState call = one undo step
        setState((draft) => {
          const layer = draft.project?.layers.find(
            (l) => l.id === state.activeLayerId,
          );
          if (!layer) return;

          if (isTerrain && state.activeFillTerrain) {
            // Terrain fill: each position gets a weighted-random tile
            for (const [x, y] of toFill) {
              const picked = pickWeightedTile(state.activeFillTerrain);
              if (picked) {
                layer.tiles[`${x},${y}`] = {
                  tilesetId: picked.tilesetId,
                  sx: picked.sx,
                  sy: picked.sy,
                  sw: picked.sw,
                  sh: picked.sh,
                };
              }
            }
          } else if (selectedStamp) {
            // Plain fill: single-tile fills write one tile, multi-tile fills repeat
            // the selected stamp with alignment anchored to map origin.
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
          }
        });
      }
    },
    [
      activeMap,
      activeLayer,
      state.currentTool,
      state.selectedTile,
      state.tileSize,
      state.brushSize,
      state.fillMode,
      state.activeFillTerrain,
      state.activeLayerId,
      setState,
      paintBuffer,
      project?.layers,
      project?.layerGroups,
    ],
  );

  // Flush paint buffer into a single store update (one undo step per stroke)
  const handlePaintEnd = useCallback(() => {
    if (paintBuffer.size === 0) return;

    const entries = Array.from(paintBuffer.entries());
    paintBuffer.clear();

    setState((draft) => {
      const layer = draft.project?.layers.find(
        (l) => l.id === state.activeLayerId,
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

    // paintBufferVersion bump redraws the active-layer canvas from committed
    // state after the buffered stroke is applied.
    setPaintBufferVersion((v) => v + 1);
  }, [setState, state.activeLayerId, paintBuffer]);

  const handleSelectionChange = useCallback(
    (sel: MapSelection | null) => {
      setState((draft) => {
        draft.mapSelection = sel;
      });
    },
    [setState],
  );

  // Move tiles from a source selection rect to a new position on the active layer.
  // This is a single undo step.
  const handleMoveTiles = useCallback(
    (src: MapSelection, destX: number, destY: number) => {
      setState((draft) => {
        const layer = draft.project?.layers.find(
          (l) => l.id === state.activeLayerId,
        );
        if (!layer) return;

        // 1. Snapshot all tiles inside the source rect
        const snapshot: { dx: number; dy: number; ref: TileRef }[] = [];
        for (let dy = 0; dy < src.height; dy++) {
          for (let dx = 0; dx < src.width; dx++) {
            const key = `${src.x + dx},${src.y + dy}`;
            const ref = layer.tiles[key];
            if (ref) snapshot.push({ dx, dy, ref: { ...ref } });
          }
        }

        // 2. Clear the source rect
        for (let dy = 0; dy < src.height; dy++) {
          for (let dx = 0; dx < src.width; dx++) {
            delete layer.tiles[`${src.x + dx},${src.y + dy}`];
          }
        }

        // 3. Write tiles at the destination
        for (const { dx, dy, ref } of snapshot) {
          const key = `${destX + dx},${destY + dy}`;
          layer.tiles[key] = ref;
        }
      });
    },
    [setState, state.activeLayerId],
  );

  // Move an image layer to a new pixel position
  const handleMoveImageLayer = useCallback(
    (layerId: string, x: number, y: number) => {
      setState((draft) => {
        const imgLayer = (draft.project?.imageLayers ?? []).find(
          (l) => l.id === layerId,
        );
        if (imgLayer) {
          imgLayer.x = x;
          imgLayer.y = y;
        }
      });
    },
    [setState],
  );

  // Resize an image layer to new position and dimensions
  const handleResizeImageLayer = useCallback(
    (layerId: string, x: number, y: number, width: number, height: number) => {
      setState((draft) => {
        const imgLayer = (draft.project?.imageLayers ?? []).find(
          (l) => l.id === layerId,
        );
        if (imgLayer) {
          imgLayer.x = x;
          imgLayer.y = y;
          imgLayer.width = width;
          imgLayer.height = height;
        }
      });
    },
    [setState],
  );

  // Create a new map object (called from MapCanvas after click-drag placement)
  const handleCreateObject = useCallback(
    (
      type: ObjectType,
      x: number,
      y: number,
      width: number,
      height: number,
      points: { x: number; y: number }[],
    ) => {
      if (!state.activeLayerId) return;
      const objectId = generateObjectId();
      const isText = type === "text";
      const textBounds = isText
        ? clampTextObjectBounds(width, height)
        : { width, height };
      const objCount = (project?.objects ?? []).filter(
        (o) => o.layerId === state.activeLayerId,
      ).length;
      setState((draft) => {
        if (!draft.project) return;
        if (!draft.project.objects) draft.project.objects = [];
        const newObj: MapObject = {
          id: objectId,
          layerId: state.activeLayerId!,
          name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${objCount + 1}`,
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
        draft.project.objects.push(newObj);
        // Add to object layer's objectOrder
        const layer = (draft.project.objectLayers ?? []).find(
          (l) => l.id === state.activeLayerId,
        );
        if (layer) {
          layer.objectOrder.push(objectId);
        }
        draft.activeObjectId = objectId;
        draft.pendingObjectType = null;
      });
      if (isText) {
        textObjectEditing.startEditing(objectId, TEXT_OBJECT_DEFAULTS.text);
      }
    },
    [setState, state.activeLayerId, project?.objects, textObjectEditing],
  );

  // Cancel pending object placement (e.g. Escape during polygon drawing)
  const handleCancelPendingObject = useCallback(() => {
    setState((draft) => {
      draft.pendingObjectType = null;
    });
  }, [setState]);

  // Move a map object to a new position
  const handleMoveObject = useCallback(
    (objectId: string, x: number, y: number) => {
      setState((draft) => {
        const obj = (draft.project?.objects ?? []).find(
          (o) => o.id === objectId,
        );
        if (obj) {
          obj.x = x;
          obj.y = y;
        }
      });
    },
    [setState],
  );

  // Resize a map object
  const handleResizeObject = useCallback(
    (objectId: string, x: number, y: number, width: number, height: number) => {
      setState((draft) => {
        const obj = (draft.project?.objects ?? []).find(
          (o) => o.id === objectId,
        );
        if (obj) {
          const textBounds =
            obj.type === "text"
              ? clampTextObjectBounds(width, height)
              : { width, height };
          obj.x = x;
          obj.y = y;
          obj.width = textBounds.width;
          obj.height = textBounds.height;
        }
      });
    },
    [setState],
  );

  // Update polygon points
  const handleUpdatePolygonPoints = useCallback(
    (objectId: string, points: { x: number; y: number }[]) => {
      setState((draft) => {
        const obj = (draft.project?.objects ?? []).find(
          (o) => o.id === objectId,
        );
        if (obj) {
          obj.points = points;
        }
      });
    },
    [setState],
  );

  // ---------------------------------------------------------------------------
  // Open tile in Image Editor
  // ---------------------------------------------------------------------------

  const handleOpenInImageEditor = useCallback(() => {
    if (!contextMenuTileRef.current || !activeLayer || !activeMap || !project)
      return;

    const { x, y } = contextMenuTileRef.current;
    const tileRef = activeLayer.tiles[`${x},${y}`];
    if (!tileRef) return;

    // Search both regular and override tilesets
    const allTilesets = [
      ...project.tilesets,
      ...(project.overrideTilesets ?? []),
    ];
    const tileset = allTilesets.find((t) => t.id === tileRef.tilesetId);
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
  }, [contextMenuTileRef, activeLayer, activeMap, project]);

  const handleOpenImageLayerInEditor = useCallback(() => {
    if (
      !activeImageLayer ||
      !hasContextMenuImageLayer ||
      activeImageLayer.locked
    )
      return;

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

  // ---------------------------------------------------------------------------
  // Copy / Cut / Paste tile operations
  // ---------------------------------------------------------------------------

  /**
   * Copy tiles to the clipboard.
   * - If a map selection exists, copies the full selection.
   * - If called from the context menu with no selection, copies a brush-sized
   *   region at the right-clicked tile.
   * - If neither applies (keyboard shortcut, no selection), falls back to
   *   copying the currently selected tileset tile(s) with the brush size.
   */
  const handleCopyTiles = useCallback(
    (fromContextMenu = false) => {
      // Priority 1: active map selection
      if (state.mapSelection && activeLayer) {
        const sel = state.mapSelection;
        const tiles: TileClipboard["tiles"] = [];
        for (let dy = 0; dy < sel.height; dy++) {
          for (let dx = 0; dx < sel.width; dx++) {
            const ref = activeLayer.tiles[`${sel.x + dx},${sel.y + dy}`];
            if (ref) tiles.push({ dx, dy, ref: { ...ref } });
          }
        }
        setExclusiveTileClipboard({
          tiles,
          width: sel.width,
          height: sel.height,
        });
        return;
      }

      // Priority 2: context menu position + brush size
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
            if (ref) tiles.push({ dx, dy, ref: { ...ref } });
          }
        }
        setExclusiveTileClipboard({
          tiles,
          width: brushNum,
          height: brushNum,
        });
        return;
      }

      // Priority 3 (keyboard fallback): copy from selected tileset tile
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
      state.mapSelection,
      state.brushSize,
      state.selectedTile,
      state.tileSize,
      activeLayer,
      activeMap,
      contextMenuTileRef,
      setExclusiveTileClipboard,
    ],
  );

  /**
   * Cut tiles from the active layer (copy + erase source).
   * When no selection, uses the brush-sized region at the right-clicked tile.
   * Not usable without a map/tile context.
   */
  const handleCutTiles = useCallback(
    (fromContextMenu = false) => {
      if (!activeLayer || !activeMap) return;
      if (activeLayer.locked) return;

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

      // Snapshot for clipboard
      const tiles: TileClipboard["tiles"] = [];
      for (let dy = 0; dy < region.height; dy++) {
        for (let dx = 0; dx < region.width; dx++) {
          const ref = activeLayer.tiles[`${region.x + dx},${region.y + dy}`];
          if (ref) tiles.push({ dx, dy, ref: { ...ref } });
        }
      }
      setExclusiveTileClipboard({
        tiles,
        width: region.width,
        height: region.height,
      });

      // Erase source
      const r = region;
      setState((draft) => {
        const layer = draft.project?.layers.find(
          (l) => l.id === state.activeLayerId,
        );
        if (!layer) return;
        for (let dy = 0; dy < r.height; dy++) {
          for (let dx = 0; dx < r.width; dx++) {
            delete layer.tiles[`${r.x + dx},${r.y + dy}`];
          }
        }
      });
    },
    [
      activeLayer,
      activeMap,
      contextMenuTileRef,
      state.mapSelection,
      state.brushSize,
      state.activeLayerId,
      setState,
      setExclusiveTileClipboard,
    ],
  );

  /**
   * Paste clipboard tiles onto the active tile layer.
   * - Context menu paste: places at the right-clicked tile position.
   * - Keyboard paste: places at the current selection's top-left, or (0, 0).
   * After pasting, switches to the select tool and creates a selection over
   * the pasted region so the result is immediately visible.
   */
  const handlePasteTiles = useCallback(
    (fromContextMenu = false) => {
      const clipboard = getClipboard();
      if (!clipboard || !activeMap || !activeLayer) return;
      if (activeLayer.locked) return;

      const destPos =
        fromContextMenu && contextMenuTileRef.current
          ? contextMenuTileRef.current
          : hoverTileRef.current
            ? hoverTileRef.current
            : state.mapSelection
              ? { x: state.mapSelection.x, y: state.mapSelection.y }
              : { x: 0, y: 0 };

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (l) => l.id === state.activeLayerId,
        );
        if (!layer) return;
        for (const { dx, dy, ref } of clipboard.tiles) {
          const tx = destPos.x + dx;
          const ty = destPos.y + dy;
          if (
            tx < 0 ||
            ty < 0 ||
            tx >= activeMap.widthInTiles ||
            ty >= activeMap.heightInTiles
          )
            continue;
          layer.tiles[`${tx},${ty}`] = { ...ref };
        }
        // Show pasted region as active selection
        draft.mapSelection = {
          x: destPos.x,
          y: destPos.y,
          width: clipboard.width,
          height: clipboard.height,
        };
        draft.currentTool = "select";
      });
    },
    [
      activeMap,
      activeLayer,
      contextMenuTileRef,
      hoverTileRef,
      state.mapSelection,
      state.activeLayerId,
      setState,
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
        (entry) => entry.id === state.activeMapId,
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

      const map = draft.project.maps.find((entry) => entry.id === activeMap.id);
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

      const r = region;
      setState((draft) => {
        const layer = draft.project?.layers.find(
          (l) => l.id === state.activeLayerId,
        );
        if (!layer) return;
        for (let dy = 0; dy < r.height; dy++) {
          for (let dx = 0; dx < r.width; dx++) {
            delete layer.tiles[`${r.x + dx},${r.y + dy}`];
          }
        }
      });
    },
    [
      activeLayer,
      activeMap,
      contextMenuTileRef,
      hasContextMenuTile,
      project?.layers,
      project?.layerGroups,
      setState,
      state.mapSelection,
      state.activeLayerId,
    ],
  );

  const handleDeleteImageLayer = useCallback(() => {
    if (!activeImageLayer || !activeMap || activeImageLayer.locked) return;

    setState((draft) => {
      if (!draft.project) return;

      const map = draft.project.maps.find((entry) => entry.id === activeMap.id);
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
        (obj) => obj.id !== activeObject.id,
      );

      const layer = (draft.project.objectLayers ?? []).find(
        (entry) => entry.id === activeObject.layerId,
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

  // ---------------------------------------------------------------------------
  // Orientation operations (rotate / flip) on a tile or selection
  // ---------------------------------------------------------------------------

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

      const r = region;
      const rotated = action === "rotateLeft" || action === "rotateRight";
      const nextWidth = rotated ? r.height : r.width;
      const nextHeight = rotated ? r.width : r.height;

      if (
        r.x + nextWidth > activeMap.widthInTiles ||
        r.y + nextHeight > activeMap.heightInTiles
      ) {
        return;
      }

      setState((draft) => {
        const layer = draft.project?.layers.find(
          (l) => l.id === state.activeLayerId,
        );
        if (!layer) return;

        const snapshot: TileClipboard["tiles"] = [];
        for (let dy = 0; dy < r.height; dy++) {
          for (let dx = 0; dx < r.width; dx++) {
            const ref = layer.tiles[`${r.x + dx},${r.y + dy}`];
            if (ref) snapshot.push({ dx, dy, ref: { ...ref } });
          }
        }

        for (let dy = 0; dy < r.height; dy++) {
          for (let dx = 0; dx < r.width; dx++) {
            delete layer.tiles[`${r.x + dx},${r.y + dy}`];
          }
        }

        for (const { dx, dy, ref } of snapshot) {
          let nextDx = dx;
          let nextDy = dy;

          if (action === "rotateLeft") {
            nextDx = dy;
            nextDy = r.width - 1 - dx;
          } else if (action === "rotateRight") {
            nextDx = r.height - 1 - dy;
            nextDy = dx;
          } else if (action === "flipH") {
            nextDx = r.width - 1 - dx;
          } else if (action === "flipV") {
            nextDy = r.height - 1 - dy;
          }

          const nextRef: TileRef = { ...ref };
          const rot = nextRef.rotation ?? 0;
          const fX = nextRef.flipX ?? false;
          const fY = nextRef.flipY ?? false;
          if (action === "rotateLeft") {
            nextRef.rotation = ((rot - 90 + 360) % 360) as 0 | 90 | 180 | 270;
          } else if (action === "rotateRight") {
            nextRef.rotation = ((rot + 90) % 360) as 0 | 90 | 180 | 270;
          } else if (action === "flipH") {
            nextRef.flipX = !fX;
          } else if (action === "flipV") {
            nextRef.flipY = !fY;
          }

          layer.tiles[`${r.x + nextDx},${r.y + nextDy}`] = nextRef;
        }

        if (draft.mapSelection) {
          draft.mapSelection = {
            x: r.x,
            y: r.y,
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
      state.mapSelection,
      state.activeLayerId,
      setState,
      project?.layers,
      project?.layerGroups,
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

  // Keep clipboard availability in sync with module-level clipboard stores.
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

  // Listen for keyboard shortcut events dispatched by use-keyboard-shortcuts
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
    const onDeleteSelection = () => {
      handleDeleteSelection(false);
    };
    window.addEventListener("tile-copy", onCopy);
    window.addEventListener("tile-cut", onCut);
    window.addEventListener("tile-paste", onPaste);
    window.addEventListener("map-delete-selection", onDeleteSelection);
    return () => {
      window.removeEventListener("tile-copy", onCopy);
      window.removeEventListener("tile-cut", onCut);
      window.removeEventListener("tile-paste", onPaste);
      window.removeEventListener("map-delete-selection", onDeleteSelection);
    };
  }, [
    handleCopySelection,
    handleCutSelection,
    handleDeleteSelection,
    handlePasteSelection,
  ]);

  // Derived flags for context menu item enablement
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
  /** Context-menu orient: only when select tool is active AND there's a tile, selection, or active image layer */
  const canOrientContextMenu =
    isSelectTool &&
    ((!!activeLayer &&
      !activeLayer.locked &&
      (!!state.mapSelection || hasContextMenuTile)) ||
      (!!activeImageLayer &&
        !activeImageLayer.locked &&
        hasContextMenuImageLayer));

  if (!project) return null;

  const activeGroup = project.mapGroups.find(
    (g) => g.id === state.activeMapGroupId,
  );
  const groupMaps = project.maps.filter(
    (m) => m.groupId === state.activeMapGroupId,
  );

  // Create a virtual map with all flattened layer IDs in correct tree order.
  // getAllLayerIds walks the tree and returns all leaf IDs (tile + image) in order.
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
    } else {
      setState((draft) => {
        draft.activeMapGroupId = value as MapGroupId;
        const firstInGroup = draft.project?.maps.find(
          (m) => m.groupId === value,
        );
        draft.activeMapId = firstInGroup?.id ?? null;
        draft.activeLayerId = null;
        if (firstInGroup) {
          draft.activeLayerId =
            findLastLayerId(
              firstInGroup.layerOrder,
              draft.project?.layers ?? [],
              draft.project?.layerGroups ?? [],
            ) ?? null;
        }
      });
    }
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
        const map = draft.project.maps.find((m) => m.id === deleteTarget.id);
        const mapsInGroup = map
          ? draft.project.maps.filter((m) => m.groupId === map.groupId)
          : [];
        const nextMapId = getAdjacentItemId(mapsInGroup, deleteTarget.id);
        if (map) {
          draft.project.layers = draft.project.layers.filter(
            (l) => l.mapId !== deleteTarget.id,
          );
          draft.project.imageLayers = (draft.project.imageLayers ?? []).filter(
            (l) => l.mapId !== deleteTarget.id,
          );
        }
        draft.project.maps = draft.project.maps.filter(
          (m) => m.id !== deleteTarget.id,
        );
        if (draft.activeMapId === deleteTarget.id) {
          draft.activeMapId = nextMapId as MapId | null;
          const nextMap = nextMapId
            ? draft.project.maps.find((m) => m.id === nextMapId)
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
          (m) => m.groupId === deleteTarget.id,
        );
        for (const map of mapsInGroup) {
          draft.project.layers = draft.project.layers.filter(
            (l) => l.mapId !== map.id,
          );
          draft.project.imageLayers = (draft.project.imageLayers ?? []).filter(
            (l) => l.mapId !== map.id,
          );
        }
        draft.project.maps = draft.project.maps.filter(
          (m) => m.groupId !== deleteTarget.id,
        );
        draft.project.mapGroups = draft.project.mapGroups.filter(
          (g) => g.id !== deleteTarget.id,
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
        const m = draft.project.maps.find((m) => m.id === renamingTabId);
        if (m) m.name = name;
      });
    }
    setRenamingTabId(null);
  }

  function handleDuplicateMap(sourceMap: TileMapData) {
    if (!project) return;
    const newMapId = generateMapId();

    // Build an ID mapping for layers and layer groups so we can remap layerOrder / childOrder
    const oldLayerIds = new Set<string>();
    const oldGroupIds = new Set<string>();

    // Collect all layer IDs belonging to this map
    for (const l of project.layers) {
      if (l.mapId === sourceMap.id) oldLayerIds.add(l.id);
    }
    for (const il of project.imageLayers ?? []) {
      if (il.mapId === sourceMap.id) oldLayerIds.add(il.id);
    }
    for (const g of project.layerGroups ?? []) {
      if (g.mapId === sourceMap.id) oldGroupIds.add(g.id);
    }

    const layerIdMap = new Map<string, LayerId>();
    const groupIdMap = new Map<string, LayerGroupId>();

    for (const id of oldLayerIds) layerIdMap.set(id, generateLayerId());
    for (const id of oldGroupIds) groupIdMap.set(id, generateLayerGroupId());

    const remapId = (id: LayerId | LayerGroupId): LayerId | LayerGroupId =>
      (layerIdMap.get(id) ?? groupIdMap.get(id) ?? id) as
        | LayerId
        | LayerGroupId;

    setState((draft) => {
      if (!draft.project) return;

      // Duplicate the map
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
          Object.entries(sourceMap.properties ?? {}).map(
            ([key, propertyValue]) => [key, { ...propertyValue }],
          ),
        ),
        layerOrder: sourceMap.layerOrder.map(remapId),
        createdAt: Date.now(),
      };
      draft.project.maps.push(newMap);

      // Duplicate layers
      for (const l of project.layers) {
        if (l.mapId !== sourceMap.id) continue;
        const newLayerId = layerIdMap.get(l.id)!;
        const newLayer: TileLayer = {
          id: newLayerId,
          mapId: newMapId,
          name: l.name,
          type: l.type,
          visible: l.visible,
          locked: l.locked,
          tiles: { ...l.tiles },
        };
        draft.project.layers.push(newLayer);
      }

      // Duplicate image layers
      for (const il of project.imageLayers ?? []) {
        if (il.mapId !== sourceMap.id) continue;
        const newLayerId = layerIdMap.get(il.id)!;
        const newImageLayer: ImageLayer = {
          id: newLayerId,
          mapId: newMapId,
          name: il.name,
          type: "image",
          visible: il.visible,
          locked: il.locked,
          assetId: il.assetId,
          x: il.x,
          y: il.y,
          width: il.width,
          height: il.height,
          rotation: il.rotation ?? 0,
          flipX: il.flipX ?? false,
          flipY: il.flipY ?? false,
          opacity: il.opacity ?? 100,
        };
        draft.project.imageLayers.push(newImageLayer);
      }

      // Duplicate layer groups
      for (const g of project.layerGroups ?? []) {
        if (g.mapId !== sourceMap.id) continue;
        const newGroupId = groupIdMap.get(g.id)!;
        const newGroup: LayerGroup = {
          id: newGroupId,
          mapId: newMapId,
          name: g.name,
          visible: g.visible,
          locked: g.locked,
          expanded: g.expanded,
          childOrder: g.childOrder.map(remapId),
        };
        draft.project.layerGroups.push(newGroup);
      }

      // Switch to the new map
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
  ) {
    if (!activeMap) return;

    const nextWidth = clampMapDimension(width, activeMap.widthInTiles);
    const nextHeight = clampMapDimension(height, activeMap.heightInTiles);

    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      map.widthInTiles = nextWidth;
      map.heightInTiles = nextHeight;
      if (properties) {
        map.properties = properties;
      }
      // Trim tiles outside bounds
      for (const layer of draft.project.layers) {
        if (layer.mapId !== map.id) continue;
        for (const key of Object.keys(layer.tiles)) {
          const [x, y] = key.split(",").map(Number);
          if (x >= nextWidth || y >= nextHeight) {
            delete layer.tiles[key];
          }
        }
      }
    });
  }

  function handleUpdateMapOptions(
    width: number,
    height: number,
    properties: Record<string, PropertyValue>,
  ) {
    handleSaveMapOptions(width, height, properties);
    setMapOptionsOpen(false);
  }

  const toolIcons: Record<EditorTool, typeof Paintbrush> = {
    select: BoxSelect,
    paint: Paintbrush,
    erase: Eraser,
    fill: PaintBucket,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Map toolbar */}
      <div className="flex items-center gap-1 px-1 py-0.5 border-b border-border bg-card shrink-0 flex-wrap min-h-10">
        {/* Select tool (no brush size dropdown) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={state.currentTool === "select" ? "default" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onMouseDown={() =>
                setState((draft) => {
                  draft.currentTool = "select";
                })
              }
            >
              <BoxSelect className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Select Tool (S)</TooltipContent>
        </Tooltip>

        {/* Paint tool with brush size dropdown */}
        {(["paint"] as EditorTool[]).map((tool) => {
          const Icon = toolIcons[tool];
          const isActive = state.currentTool === tool;
          return (
            <DropdownMenu key={tool}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      size="icon"
                      className="h-6 w-6"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  {tool.charAt(0).toUpperCase() + tool.slice(1)} Tool
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent>
                {BRUSH_SIZES.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onMouseDown={() =>
                      setState((draft) => {
                        draft.currentTool = tool;
                        draft.brushSize = size;
                      })
                    }
                  >
                    {size}
                    {state.currentTool === tool &&
                      state.brushSize === size &&
                      " ✓"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        {/* Fill tool dropdown — "Fill" (single tile) or "Fill Terrain" (weighted random) */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={state.currentTool === "fill" ? "default" : "ghost"}
                  size="icon"
                  className="h-6 w-6"
                >
                  <PaintBucket className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Fill Tool</TooltipContent>
          </Tooltip>
          <DropdownMenuContent>
            <DropdownMenuItem
              onMouseDown={() =>
                setState((draft) => {
                  draft.currentTool = "fill";
                  draft.fillMode = "fill";
                })
              }
            >
              Fill
              {state.currentTool === "fill" &&
                state.fillMode === "fill" &&
                " ✓"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onMouseDown={() => {
                setState((draft) => {
                  draft.currentTool = "fill";
                  draft.fillMode = "fillTerrain";
                });
                setFillTerrainDialogOpen(true);
              }}
            >
              Fill Terrain
              {state.currentTool === "fill" &&
                state.fillMode === "fillTerrain" &&
                " ✓"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Erase tool with brush size dropdown */}
        {(["erase"] as EditorTool[]).map((tool) => {
          const Icon = toolIcons[tool];
          const isActive = state.currentTool === tool;
          return (
            <DropdownMenu key={tool}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      size="icon"
                      className="h-6 w-6"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  {tool.charAt(0).toUpperCase() + tool.slice(1)} Tool
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent>
                {BRUSH_SIZES.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onMouseDown={() =>
                      setState((draft) => {
                        draft.currentTool = tool;
                        draft.brushSize = size;
                      })
                    }
                  >
                    {size}
                    {state.currentTool === tool &&
                      state.brushSize === size &&
                      " ✓"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Cut */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={!canCutToolbar}
              onMouseDown={() => {
                void handleCutSelection(false);
              }}
            >
              <Scissors className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cut (Ctrl+X)</TooltipContent>
        </Tooltip>

        {/* Orientation dropdown — active only when select tool is chosen */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={!canOrientToolbar}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Orientation (select tool only)</TooltipContent>
          </Tooltip>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={!canOrientToolbar}
              onMouseDown={() => handleOrientSelection("rotateLeft")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rotate Left 90°
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canOrientToolbar}
              onMouseDown={() => handleOrientSelection("rotateRight")}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Rotate Right 90°
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canOrientToolbar}
              onMouseDown={() => handleOrientSelection("flipH")}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              Flip Horizontal
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canOrientToolbar}
              onMouseDown={() => handleOrientSelection("flipV")}
            >
              <FlipVertical2 className="h-3.5 w-3.5" />
              Flip Vertical
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Zoom */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onMouseDown={() => handleZoom(-1)}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-muted-foreground w-8 text-center">
            {Math.round(mapZoom * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onMouseDown={() => handleZoom(1)}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Undo / Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={!controls.canBack()}
              onMouseDown={() => controls.back()}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={!controls.canForward()}
              onMouseDown={() => controls.forward()}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Map options */}
        {activeMap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onMouseDown={() => setMapOptionsOpen(true)}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Map Options</TooltipContent>
          </Tooltip>
        )}

        <span className="text-[10px] text-muted-foreground ml-auto">
          {state.currentTool === "fill"
            ? state.fillMode === "fillTerrain"
              ? "FILL TERRAIN"
              : "FILL"
            : state.currentTool.toUpperCase()}{" "}
          {state.currentTool !== "fill" &&
            state.currentTool !== "select" &&
            state.brushSize}
        </span>
      </div>

      {/* Group selector + Map tabs + Add */}
      <div className="flex items-center gap-1 px-1 py-0.5 border-b border-border bg-card shrink-0">
        <Select
          value={state.activeMapGroupId ?? ""}
          onValueChange={handleGroupChange}
        >
          <SelectTrigger className="h-6 w-25 text-xs shrink-0">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            {project.mapGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
            <SelectItem value="__add__">+ Add Group</SelectItem>
          </SelectContent>
        </Select>

        {activeGroup && project.mapGroups.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-destructive"
                onMouseDown={() =>
                  setDeleteTarget({
                    type: "group",
                    id: activeGroup.id,
                    name: activeGroup.name,
                  })
                }
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Group</TooltipContent>
          </Tooltip>
        )}

        {groupMaps.length > 0 && (
          <div className="flex-1 min-w-0 overflow-x-auto">
            <Tabs
              value={state.activeMapId ?? ""}
              onValueChange={(v) =>
                setState((draft) => {
                  draft.activeMapId = v as MapId;
                  const map = draft.project?.maps.find((m) => m.id === v);
                  if (map) {
                    draft.activeLayerId =
                      findLastLayerId(
                        map.layerOrder,
                        draft.project?.layers ?? [],
                        draft.project?.layerGroups ?? [],
                      ) ?? null;
                  }
                })
              }
            >
              <TabsList
                variant="editor"
                className="h-8 rounded-none bg-transparent p-0"
                scrollable
              >
                {groupMaps.map((m) => (
                  <div
                    key={m.id}
                    data-state={
                      state.activeMapId === m.id ? "active" : "inactive"
                    }
                    className="group/tab -mb-px flex h-7 min-w-0 items-center rounded-t-sm border border-transparent border-b-border/70 bg-muted/20 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground"
                  >
                    {renamingTabId === m.id ? (
                      <input
                        ref={renameInputRef}
                        id={`rename-map-tab-${m.id}`}
                        name={`rename-map-tab-${m.id}`}
                        aria-label={`Rename map ${m.name}`}
                        className="mx-1 h-6 w-28 rounded border border-primary bg-background px-1 text-xs"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingTabId(null);
                        }}
                      />
                    ) : (
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <TabsTrigger
                                    value={m.id}
                                    className="h-7 min-w-0 rounded-none px-2 text-[11px]"
                                    onDoubleClick={() =>
                                      handleTabDoubleClick(m)
                                    }
                                  >
                                    <span className="max-w-40 truncate">
                                      {m.name}
                                    </span>
                                  </TabsTrigger>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                Double Click to Rename
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onMouseDown={() => handleTabDoubleClick(m)}
                          >
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onMouseDown={() => handleDuplicateMap(m)}
                          >
                            Duplicate
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Close map ${m.name}`}
                          className="mr-1 flex h-5 w-5 flex-none items-center justify-center rounded-sm text-muted-foreground/80 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/tab:opacity-100 group-data-[state=active]/tab:opacity-100 group-hover/tab:pointer-events-auto group-data-[state=active]/tab:pointer-events-auto pointer-events-none"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteTarget({
                              type: "map",
                              id: m.id,
                              name: m.name,
                            });
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Close Map</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {!groupMaps.length && <div className="flex-1" />}

        <Button
          variant="default"
          size="sm"
          className="h-6 px-2 text-[10px] shrink-0"
          onMouseDown={handleAddMap}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Map
        </Button>
      </div>

      {/* Map canvas area */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={containerRef}
            className="flex-1 overflow-auto min-h-0"
            onContextMenu={handleMapContextMenu}
            onMouseMove={handleMapMouseMove}
            onMouseLeave={clearHoverTile}
          >
            {activeMap && flatMap ? (
              <MapCanvas
                map={flatMap as TileMapData}
                layers={flatLayers}
                tilesets={[
                  ...project.tilesets,
                  ...(project.overrideTilesets ?? []),
                ]}
                zoom={mapZoom}
                activeLayerId={state.activeLayerId}
                currentTool={state.currentTool}
                fillMode={state.fillMode}
                activeFillTerrain={state.activeFillTerrain}
                canPreviewFill={!activeLayerEffectivelyLocked}
                brushSize={state.brushSize}
                selectedTileSize={state.tileSize}
                selectedTile={state.selectedTile}
                onResizeMap={handleSaveMapOptions}
                onPaintTile={handlePaintTile}
                onPaintEnd={handlePaintEnd}
                paintBuffer={paintBuffer}
                paintBufferVersion={paintBufferVersion}
                imperativeRef={mapCanvasRef}
                mapSelection={state.mapSelection}
                onSelectionChange={handleSelectionChange}
                onMoveTiles={handleMoveTiles}
                imageLayers={flatImageLayers}
                onMoveImageLayer={handleMoveImageLayer}
                onResizeImageLayer={handleResizeImageLayer}
                objectLayers={flatObjectLayers}
                objects={flatObjects}
                activeObjectId={state.activeObjectId}
                pendingObjectType={state.pendingObjectType}
                onCreateObject={handleCreateObject}
                onCancelPendingObject={handleCancelPendingObject}
                onMoveObject={handleMoveObject}
                onResizeObject={handleResizeObject}
                onUpdatePolygonPoints={handleUpdatePolygonPoints}
                onSelectObject={(id) =>
                  setState((draft) => {
                    draft.activeObjectId = id as ObjectId | null;
                  })
                }
                editingTextObject={textObjectEditing.editing}
                onEditingTextChange={textObjectEditing.updateText}
                onCommitTextEditing={textObjectEditing.commitEditing}
                onCancelTextEditing={textObjectEditing.cancelEditing}
                onDoubleClickObject={(id) => {
                  setPropsObjectId(id as ObjectId);
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                {groupMaps.length === 0
                  ? "Click + to create a map"
                  : "Select a map tab"}
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <MapCanvasContextMenuContent
          canCopy={canCopy}
          canCut={canCut}
          canDeleteSelection={canDeleteSelection}
          canPaste={canPaste}
          canEditInImageEditor={canEditInImageEditor}
          canOrientContextMenu={canOrientContextMenu}
          hasContextMenuObject={hasContextMenuObject}
          onCopy={() => {
            void handleCopySelection(true);
          }}
          onCut={() => {
            void handleCutSelection(true);
          }}
          onDelete={() => {
            handleDeleteSelection(true);
          }}
          onPaste={() => {
            void handlePasteSelection(true);
          }}
          onEditInImageEditor={handleEditInImageEditor}
          onEditObjectProperties={() => {
            if (contextMenuObjectId) {
              setPropsObjectId(contextMenuObjectId);
            }
          }}
          onOrientSelection={(action) => {
            handleOrientSelection(action, true);
          }}
        />
      </ContextMenu>

      <NewMapDialog
        open={addMapOpen}
        onOpenChange={setAddMapOpen}
        name={newMapName}
        width={newMapWidth}
        height={newMapHeight}
        mapType={newMapType}
        tileSize={state.tileSize}
        onNameChange={setNewMapName}
        onWidthChange={setNewMapWidth}
        onHeightChange={setNewMapHeight}
        onMapTypeChange={setNewMapType}
        onCreate={handleCreateMap}
      />

      {/* Map options dialog */}
      {activeMap && (
        <MapOptionsDialog
          key={`${activeMap.id}-${mapOptionsOpen ? "open" : "closed"}`}
          open={mapOptionsOpen}
          onOpenChange={setMapOptionsOpen}
          map={activeMap}
          onSave={handleUpdateMapOptions}
        />
      )}

      {/* Fill terrain dialog */}
      <FillTerrainDialog
        open={fillTerrainDialogOpen}
        onOpenChange={setFillTerrainDialogOpen}
        onApply={(tiles: TerrainTile[]) => {
          setState((draft) => {
            draft.currentTool = "fill";
            draft.fillMode = "fillTerrain";
            draft.activeFillTerrain = tiles;
          });
        }}
      />

      <NewMapGroupDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        name={newGroupName}
        onNameChange={setNewGroupName}
        onCreate={handleCreateGroup}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}"
              {deleteTarget?.type === "group" && " and all maps in it"}. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onMouseDown={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Object properties dialog (opened by double-clicking object on canvas) */}
      <ObjectPropertiesDialogManager
        objectId={propsObjectId}
        open={!!propsObjectId}
        onOpenChange={(open) => !open && setPropsObjectId(null)}
      />
    </div>
  );
}
