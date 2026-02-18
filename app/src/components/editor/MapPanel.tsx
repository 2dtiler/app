import {
  useRef,
  useState,
  useEffect,
  useCallback,
  memo,
  useSyncExternalStore,
} from "react";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  BoxSelect,
  Paintbrush,
  PaintBucket,
  Eraser,
  Settings,
  Trash2,
  Copy,
  Scissors,
  ClipboardPaste,
  Undo2,
  Redo2,
  Pencil,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  RefreshCw,
} from "lucide-react";
import { MapCanvas } from "./MapCanvas";
import type { MapCanvasImperativeHandle } from "./MapCanvas";
import { tilesetImageCache } from "./MapCanvas/texture-cache";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FillTerrainDialog } from "@/components/dialogs/FillTerrainDialog";
import { ObjectPropertiesDialog } from "@/components/dialogs/ObjectPropertiesDialog";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useCanvasNavigation } from "@/hooks/use-canvas-navigation";
import {
  generateMapId,
  generateMapGroupId,
  generateLayerId,
  generateLayerGroupId,
} from "@/lib/ids";
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
} from "@/types";
import { generateObjectId } from "@/lib/ids";
import { pickWeightedTile } from "@/lib/terrain";
import {
  getClipboard,
  setClipboard,
  type TileClipboard,
} from "@/lib/tile-clipboard";
import { setTileEditorContext } from "@/lib/tile-editor-context";
import { zoomStore } from "@/lib/zoom-store";

export function MapPanel() {
  const { state, setState, controls } = useEditorStore();
  const { mapZoom } = useSyncExternalStore(
    zoomStore.subscribe,
    zoomStore.getSnapshot,
  );
  const project = state.project;

  const containerRef = useRef<HTMLDivElement>(null);
  /** Tile grid position captured on the most recent right-click (context menu). */
  const contextMenuTileRef = useRef<{ x: number; y: number } | null>(null);
  /** Tile grid position under the mouse cursor, updated on every mouse move over the map. */
  const hoverTileRef = useRef<{ x: number; y: number } | null>(null);
  /** Tracks whether the tile clipboard has content so Paste can be enabled. */
  const [hasClipboard, setHasClipboard] = useState(
    () => getClipboard() !== null,
  );
  /**
   * Tracks whether the right-clicked position has a tile (to enable
   * "Open tile in Image Editor").
   */
  const [hasContextMenuTile, setHasContextMenuTile] = useState(false);

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
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const [fillTerrainDialogOpen, setFillTerrainDialogOpen] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<MapId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [propsObjectId, setPropsObjectId] = useState<ObjectId | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+Wheel zoom and middle-mouse pan
  const handleSetMapZoom = useCallback((newZoom: number) => {
    zoomStore.setMapZoom(newZoom);
  }, []);
  useCanvasNavigation(containerRef, mapZoom, handleSetMapZoom);

  // Derived values needed by hooks (computed before early return)
  const activeMap = project?.maps.find((m) => m.id === state.activeMapId);
  const activeLayer = project?.layers.find((l) => l.id === state.activeLayerId);

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

      if (state.currentTool === "paint") {
        if (!state.selectedTile) return;
        const brushNum = parseInt(state.brushSize);
        const ref = state.selectedTile;

        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const tx = gx + dx;
            const ty = gy + dy;
            if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles)
              continue;
            paintBuffer.set(`${tx},${ty}`, {
              tilesetId: ref.tilesetId,
              sx: ref.sx,
              sy: ref.sy,
              sw: ref.sw,
              sh: ref.sh,
            });
            // Draw directly onto the paint canvas — no React re-render
            mapCanvasRef.current?.drawBufferTile(tx, ty, ref);
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
            paintBuffer.set(`${tx},${ty}`, null);
            // Erase directly on the paint canvas — no React re-render
            mapCanvasRef.current?.eraseBufferTile(tx, ty);
          }
        }
      } else if (state.currentTool === "fill") {
        // ---------------------
        // Fill Tool — two modes:
        //   "fill"        → flood-fill with the single selected tile
        //   "fillTerrain" → flood-fill with weighted-random terrain tiles
        // ---------------------

        const isTerrain = state.fillMode === "fillTerrain";

        // Validate that we have tile data to fill with
        if (isTerrain) {
          if (!state.activeFillTerrain || state.activeFillTerrain.length === 0)
            return;
        } else {
          if (!state.selectedTile) return;
        }
        if (!activeLayer) return;

        const w = activeMap.widthInTiles;
        const h = activeMap.heightInTiles;

        const targetKey = `${gx},${gy}`;
        const targetTile = activeLayer.tiles[targetKey] ?? null;

        // For plain fill, skip if clicked tile already matches selected tile
        if (!isTerrain && state.selectedTile) {
          const ref = state.selectedTile;
          if (
            targetTile &&
            targetTile.tilesetId === ref.tilesetId &&
            targetTile.sx === ref.sx &&
            targetTile.sy === ref.sy
          ) {
            return;
          }
        }

        // BFS flood fill — collect all 4-connected tiles matching the target
        const visited = new Set<string>();
        const queue: [number, number][] = [[gx, gy]];
        const toFill: [number, number][] = [];
        let qi = 0;

        while (qi < queue.length) {
          const [x, y] = queue[qi++];
          const key = `${x},${y}`;
          if (visited.has(key)) continue;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          visited.add(key);

          const current = activeLayer.tiles[key] ?? null;
          const matches =
            (current === null && targetTile === null) ||
            (current !== null &&
              targetTile !== null &&
              current.tilesetId === targetTile.tilesetId &&
              current.sx === targetTile.sx &&
              current.sy === targetTile.sy);

          if (!matches) continue;
          toFill.push([x, y]);
          queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

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
          } else if (state.selectedTile) {
            // Plain fill: every position gets the same tile
            const ref = state.selectedTile;
            for (const [x, y] of toFill) {
              layer.tiles[`${x},${y}`] = {
                tilesetId: ref.tilesetId,
                sx: ref.sx,
                sy: ref.sy,
                sw: ref.sw,
                sh: ref.sh,
              };
            }
          }
        });
      }
    },
    [
      activeMap,
      activeLayer,
      state.currentTool,
      state.selectedTile,
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

    // Clear the paint canvas imperatively — no lingering buffer visuals
    mapCanvasRef.current?.clearPaintCanvas();

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

    // paintBufferVersion bump triggers the main draw effect so committed tiles
    // replace what was on the paint canvas.
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
          width,
          height,
          rotation: 0,
          points,
          visible: true,
          locked: false,
          properties: {},
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
    },
    [setState, state.activeLayerId, project?.objects],
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
          obj.x = x;
          obj.y = y;
          obj.width = width;
          obj.height = height;
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

    // Only proceed if the tileset image is already cached (it should be visible
    // on the map canvas at the time the user right-clicks it).
    if (!tilesetImageCache.has(tileRef.tilesetId)) return;

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

  // ---------------------------------------------------------------------------
  // Copy / Cut / Paste tile operations
  // ---------------------------------------------------------------------------

  /**
   * Shared helper: convert a MouseEvent position to a clamped tile coordinate.
   */
  const eventToTile = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!activeMap) return null;
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const rawX = e.clientX - rect.left + el.scrollLeft;
      const rawY = e.clientY - rect.top + el.scrollTop;
      const scaledTile = activeMap.tileSize * mapZoom;
      return {
        x: Math.max(
          0,
          Math.min(Math.floor(rawX / scaledTile), activeMap.widthInTiles - 1),
        ),
        y: Math.max(
          0,
          Math.min(Math.floor(rawY / scaledTile), activeMap.heightInTiles - 1),
        ),
      };
    },
    [activeMap, mapZoom],
  );

  /**
   * Capture tile position from a right-click on the map canvas container.
   * The div handles scrolling so we subtract the scroll offset from client coords.
   */
  const handleMapContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const tile = eventToTile(e);
      if (tile) {
        contextMenuTileRef.current = tile;
        const tileRef = activeLayer?.tiles[`${tile.x},${tile.y}`] ?? null;
        setHasContextMenuTile(!!tileRef);
      } else {
        setHasContextMenuTile(false);
      }
    },
    [eventToTile, activeLayer],
  );

  /**
   * Track the cursor tile position so keyboard paste (Ctrl+V) can paste at
   * the mouse location rather than always at the copy origin.
   */
  const handleMapMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const tile = eventToTile(e);
      hoverTileRef.current = tile;
    },
    [eventToTile],
  );

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
        setClipboard({ tiles, width: sel.width, height: sel.height });
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
        setClipboard({ tiles, width: brushNum, height: brushNum });
        return;
      }

      // Priority 3 (keyboard fallback): copy from selected tileset tile
      if (!fromContextMenu && state.selectedTile && project) {
        const brushNum = parseInt(state.brushSize);
        const ts = state.tileSize;
        const tileset = project.tilesets.find(
          (t) => t.id === state.selectedTile!.tilesetId,
        );
        if (!tileset) return;
        const startTx = state.selectedTile.sx / ts;
        const startTy = state.selectedTile.sy / ts;
        const tiles: TileClipboard["tiles"] = [];
        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const px = (startTx + dx) * ts;
            const py = (startTy + dy) * ts;
            if (px + ts > tileset.imageWidth || py + ts > tileset.imageHeight)
              continue;
            tiles.push({
              dx,
              dy,
              ref: {
                tilesetId: state.selectedTile!.tilesetId,
                sx: px,
                sy: py,
                sw: ts,
                sh: ts,
              },
            });
          }
        }
        setClipboard({ tiles, width: brushNum, height: brushNum });
      }
    },
    [
      state.mapSelection,
      state.brushSize,
      state.selectedTile,
      state.tileSize,
      activeLayer,
      activeMap,
      project,
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
      setClipboard({ tiles, width: region.width, height: region.height });

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
      state.mapSelection,
      state.brushSize,
      state.activeLayerId,
      setState,
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
    [activeMap, activeLayer, state.mapSelection, state.activeLayerId, setState],
  );

  // ---------------------------------------------------------------------------
  // Orientation operations (rotate / flip) on a tile or selection
  // ---------------------------------------------------------------------------

  type OrientAction = "rotateLeft" | "rotateRight" | "flipH" | "flipV";

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
      setState((draft) => {
        const layer = draft.project?.layers.find(
          (l) => l.id === state.activeLayerId,
        );
        if (!layer) return;
        for (let dy = 0; dy < r.height; dy++) {
          for (let dx = 0; dx < r.width; dx++) {
            const key = `${r.x + dx},${r.y + dy}`;
            const tile = layer.tiles[key];
            if (!tile) continue;
            const rot = tile.rotation ?? 0;
            const fX = tile.flipX ?? false;
            const fY = tile.flipY ?? false;
            if (action === "rotateLeft") {
              tile.rotation = ((rot - 90 + 360) % 360) as 0 | 90 | 180 | 270;
            } else if (action === "rotateRight") {
              tile.rotation = ((rot + 90) % 360) as 0 | 90 | 180 | 270;
            } else if (action === "flipH") {
              tile.flipX = !fX;
            } else if (action === "flipV") {
              tile.flipY = !fY;
            }
          }
        }
      });
    },
    [
      activeLayer,
      activeMap,
      state.mapSelection,
      state.activeLayerId,
      setState,
      project?.layers,
      project?.layerGroups,
    ],
  );

  // Keep hasClipboard in sync when clipboard changes
  useEffect(() => {
    const onClipboardChange = () => setHasClipboard(getClipboard() !== null);
    window.addEventListener("tile-clipboard-change", onClipboardChange);
    return () =>
      window.removeEventListener("tile-clipboard-change", onClipboardChange);
  }, []);

  // Listen for keyboard shortcut events dispatched by use-keyboard-shortcuts
  useEffect(() => {
    const onCopy = () => handleCopyTiles(false);
    const onCut = () => handleCutTiles(false);
    const onPaste = () => handlePasteTiles(false);
    window.addEventListener("tile-copy", onCopy);
    window.addEventListener("tile-cut", onCut);
    window.addEventListener("tile-paste", onPaste);
    return () => {
      window.removeEventListener("tile-copy", onCopy);
      window.removeEventListener("tile-cut", onCut);
      window.removeEventListener("tile-paste", onPaste);
    };
  }, [handleCopyTiles, handleCutTiles, handlePasteTiles]);

  // Derived flags for context menu item enablement
  const isTileLayerActive = !!activeLayer && !activeLayer.locked;
  const canCopy = !!activeMap && !!activeLayer;
  const canCut = !!activeMap && isTileLayerActive;
  const canCutToolbar = canCut && !!state.mapSelection;
  const canPaste = hasClipboard && !!activeMap && isTileLayerActive;
  const canOpenInEditor = !!activeMap && !!activeLayer && hasContextMenuTile;
  const isSelectTool = state.currentTool === "select";
  /** Context-menu orient: only when select tool is active AND there's a tile or selection */
  const canOrientContextMenu =
    isSelectTool &&
    !!activeLayer &&
    !activeLayer.locked &&
    (!!state.mapSelection || hasContextMenuTile);

  if (!project) return null;

  const activeGroup = project.mapGroups.find(
    (g) => g.id === state.activeMapGroupId,
  );
  const groupMaps = project.maps.filter(
    (m) => m.groupId === state.activeMapGroupId,
  );

  // Flatten layer tree for rendering — applies group visibility/lock
  const layerGroups = project.layerGroups ?? [];
  const projectImageLayers = project.imageLayers ?? [];
  const flatLayers = activeMap
    ? flattenLayerTree(activeMap.layerOrder, project.layers, layerGroups)
    : [];
  const flatImageLayers = activeMap
    ? flattenImageLayers(activeMap.layerOrder, projectImageLayers, layerGroups)
    : [];
  const projectObjectLayers = project.objectLayers ?? [];
  const flatObjectLayers = activeMap
    ? flattenObjectLayers(
        activeMap.layerOrder,
        projectObjectLayers,
        layerGroups,
      )
    : [];
  // Collect all objects for flat object layers
  const flatObjectLayerIds = new Set(
    flatObjectLayers.map((l) => l.id as string),
  );
  const projectObjects = project.objects ?? [];
  const flatObjects = projectObjects.filter((o) =>
    flatObjectLayerIds.has(o.layerId as string),
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
  }

  function handleCreateMap() {
    if (!activeGroup) return;
    const name = newMapName.trim() || "Untitled Map";
    const mapId = generateMapId();
    const layerId = generateLayerId();

    setState((draft) => {
      if (!draft.project) return;
      const map: TileMapData = {
        id: mapId,
        name,
        groupId: activeGroup.id,
        widthInTiles: newMapWidth,
        heightInTiles: newMapHeight,
        tileSize: draft.tileSize,
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
          draft.activeMapId = null;
          draft.activeLayerId = null;
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
        widthInTiles: sourceMap.widthInTiles,
        heightInTiles: sourceMap.heightInTiles,
        tileSize: sourceMap.tileSize,
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

  function handleResizeMap(width: number, height: number) {
    if (!activeMap) return;
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      map.widthInTiles = width;
      map.heightInTiles = height;
      // Trim tiles outside bounds
      for (const layer of draft.project.layers) {
        if (layer.mapId !== map.id) continue;
        for (const key of Object.keys(layer.tiles)) {
          const [x, y] = key.split(",").map(Number);
          if (x >= width || y >= height) {
            delete layer.tiles[key];
          }
        }
      }
    });
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

        {/* Tool selector with brush size */}
        {(["paint", "erase"] as EditorTool[]).map((tool) => {
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

        {/* Undo / Redo / Cut */}
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={!canCutToolbar}
              onMouseDown={() => handleCutTiles(false)}
            >
              <Scissors className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cut Selection (Ctrl+X)</TooltipContent>
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
                  disabled={!isSelectTool}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Orientation (select tool only)</TooltipContent>
          </Tooltip>
          <DropdownMenuContent>
            <DropdownMenuItem
              disabled={!state.mapSelection || !isTileLayerActive}
              onMouseDown={() => handleOrientTiles("rotateLeft")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rotate Left 90°
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!state.mapSelection || !isTileLayerActive}
              onMouseDown={() => handleOrientTiles("rotateRight")}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Rotate Right 90°
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!state.mapSelection || !isTileLayerActive}
              onMouseDown={() => handleOrientTiles("flipH")}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              Flip Horizontal
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!state.mapSelection || !isTileLayerActive}
              onMouseDown={() => handleOrientTiles("flipV")}
            >
              <FlipVertical2 className="h-3.5 w-3.5" />
              Flip Vertical
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
                className="h-7 bg-transparent rounded-none p-0"
                scrollable
              >
                {groupMaps.map((m) => (
                  <div key={m.id} className="flex items-center group">
                    {renamingTabId === m.id ? (
                      <input
                        ref={renameInputRef}
                        className="h-6 w-24 px-1 text-xs bg-background border border-primary rounded"
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
                                    className="h-6 px-2 text-xs rounded-none"
                                    onDoubleClick={() =>
                                      handleTabDoubleClick(m)
                                    }
                                  >
                                    {m.name}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive"
                          onMouseDown={() =>
                            setDeleteTarget({
                              type: "map",
                              id: m.id,
                              name: m.name,
                            })
                          }
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete Map</TooltipContent>
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

      {/* Map canvas area — PixiJS renderer */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={containerRef}
            className="flex-1 overflow-auto min-h-0"
            onContextMenu={handleMapContextMenu}
            onMouseMove={handleMapMouseMove}
            onMouseLeave={() => {
              hoverTileRef.current = null;
            }}
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
                brushSize={state.brushSize}
                selectedTile={state.selectedTile}
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
                onDoubleClickObject={(id) => setPropsObjectId(id as ObjectId)}
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
        <ContextMenuContent>
          <ContextMenuItem
            disabled={!canCopy}
            onSelect={() => handleCopyTiles(true)}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
            <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canCut}
            onSelect={() => handleCutTiles(true)}
          >
            <Scissors className="h-3.5 w-3.5" />
            Cut
            <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canPaste}
            onSelect={() => handlePasteTiles(true)}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            Paste
            <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canOpenInEditor}
            onSelect={handleOpenInImageEditor}
          >
            <Pencil className="h-3.5 w-3.5" />
            Open tile in Image Editor
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!canOrientContextMenu}>
              <RefreshCw className="h-3.5 w-3.5" />
              Orientation
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                onSelect={() => handleOrientTiles("rotateLeft", true)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Rotate Left 90°
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => handleOrientTiles("rotateRight", true)}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Rotate Right 90°
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => handleOrientTiles("flipH", true)}
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
                Flip Horizontal
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => handleOrientTiles("flipV", true)}
              >
                <FlipVertical2 className="h-3.5 w-3.5" />
                Flip Vertical
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>

      {/* Add map dialog */}
      <Dialog open={addMapOpen} onOpenChange={setAddMapOpen}>
        <DialogContent className="sm:max-w-90">
          <DialogHeader>
            <DialogTitle>New Map</DialogTitle>
            <DialogDescription className="sr-only">
              Configure the new map properties
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                id="new-map-name"
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs">Width (tiles)</Label>
                <Input
                  id="new-map-width"
                  type="number"
                  min={1}
                  max={256}
                  value={newMapWidth}
                  onChange={(e) => setNewMapWidth(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Height (tiles)</Label>
                <Input
                  id="new-map-height"
                  type="number"
                  min={1}
                  max={256}
                  value={newMapHeight}
                  onChange={(e) => setNewMapHeight(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Map pixel size: {newMapWidth * state.tileSize} ×{" "}
              {newMapHeight * state.tileSize}px (tile size: {state.tileSize}px)
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={() => setAddMapOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onMouseDown={handleCreateMap}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Map options dialog */}
      {activeMap && (
        <MapOptionsDialog
          open={mapOptionsOpen}
          onOpenChange={setMapOptionsOpen}
          map={activeMap}
          onResize={handleResizeMap}
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

      {/* Add group dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>New Map Group</DialogTitle>
            <DialogDescription className="sr-only">
              Enter a name for the new map group
            </DialogDescription>
          </DialogHeader>
          <Input
            id="new-map-group-name"
            placeholder="Group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={() => setAddGroupOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onMouseDown={handleCreateGroup}
              disabled={!newGroupName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      {(() => {
        const propsObject = propsObjectId
          ? (project.objects ?? []).find((o) => o.id === propsObjectId)
          : null;
        if (!propsObject) return null;
        return (
          <ObjectPropertiesDialog
            open={!!propsObjectId}
            onOpenChange={(o) => !o && setPropsObjectId(null)}
            object={propsObject}
            onSave={(updatedProps, updatedName) => {
              setState((draft) => {
                const obj = (draft.project?.objects ?? []).find(
                  (o) => o.id === propsObjectId,
                );
                if (obj) {
                  obj.properties = updatedProps as typeof obj.properties;
                  if (updatedName) obj.name = updatedName;
                }
              });
              setPropsObjectId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map Options sub-dialog
// ---------------------------------------------------------------------------

const MapOptionsDialog = memo(function MapOptionsDialog({
  open,
  onOpenChange,
  map,
  onResize,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  map: TileMapData;
  onResize: (w: number, h: number) => void;
}) {
  const [width, setWidth] = useState(map.widthInTiles);
  const [height, setHeight] = useState(map.heightInTiles);
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevMap, setPrevMap] = useState(map);

  if (open !== prevOpen || map !== prevMap) {
    setPrevOpen(open);
    setPrevMap(map);
    if (open) {
      setWidth(map.widthInTiles);
      setHeight(map.heightInTiles);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>Map Options — {map.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit map dimensions and tile size
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label className="text-xs">Width (tiles)</Label>
            <Input
              id="map-options-width"
              type="number"
              min={1}
              max={256}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Height (tiles)</Label>
            <Input
              id="map-options-height"
              type="number"
              min={1}
              max={256}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Pixel size: {width * map.tileSize} × {height * map.tileSize}px
        </p>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onMouseDown={() => onResize(width, height)}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
