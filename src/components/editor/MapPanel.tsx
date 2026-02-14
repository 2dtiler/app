import { useRef, useState, useEffect, useCallback, memo } from "react";
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
} from "lucide-react";
import { MapCanvas } from "./MapCanvas";
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FillTerrainDialog } from "@/components/dialogs/FillTerrainDialog";
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
} from "@/types";
import { pickWeightedTile } from "@/lib/terrain";

export function MapPanel() {
  const { state, setState } = useEditorStore();
  const project = state.project;

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Paint buffer for instant visual feedback ---
  // Tile changes are written here during a stroke and rendered immediately.
  // The buffer is flushed to the store (single undo step) on pointer-up.
  // Using useState (not useRef) so the Map can be read safely during render.
  const [paintBuffer] = useState(() => new Map<string, TileRef | null>());
  const [paintBufferVersion, setPaintBufferVersion] = useState(0);
  const rafRef = useRef<number>(0);

  const schedulePaintRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setPaintBufferVersion((v) => v + 1);
    });
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+Wheel zoom and middle-mouse pan
  const handleSetMapZoom = useCallback(
    (newZoom: number) => {
      setState((draft) => {
        draft.mapZoom = newZoom;
      });
    },
    [setState],
  );
  useCanvasNavigation(containerRef, state.mapZoom, handleSetMapZoom);

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
          }
        }
        schedulePaintRender();
      } else if (state.currentTool === "erase") {
        const brushNum = parseInt(state.brushSize);
        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const tx = gx + dx;
            const ty = gy + dy;
            if (tx >= activeMap.widthInTiles || ty >= activeMap.heightInTiles)
              continue;
            paintBuffer.set(`${tx},${ty}`, null);
          }
        }
        schedulePaintRender();
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
      schedulePaintRender,
      paintBuffer,
      project?.layers,
      project?.layerGroups,
    ],
  );

  // Flush paint buffer into a single store update (one undo step per stroke)
  const handlePaintEnd = useCallback(() => {
    if (paintBuffer.size === 0) return;

    // Cancel any pending render frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

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

    // Trigger re-render to clear buffer visuals (now committed tiles)
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
  // Create a virtual map with all flattened layer IDs in correct tree order.
  // getAllLayerIds walks the tree and returns all leaf IDs (tile + image) in order.
  const flatAllIds = activeMap
    ? getAllLayerIds(activeMap.layerOrder, layerGroups)
    : [];
  const flatMap = activeMap ? { ...activeMap, layerOrder: flatAllIds } : null;

  function handleZoom(direction: 1 | -1) {
    setState((draft) => {
      const next = draft.mapZoom + direction * 0.5;
      draft.mapZoom = Math.max(0.5, Math.min(4, next));
    });
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
              onClick={() =>
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
                    onClick={() =>
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
              onClick={() =>
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
              onClick={() => {
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
                onClick={() => handleZoom(-1)}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-muted-foreground w-8 text-center">
            {Math.round(state.mapZoom * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleZoom(1)}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Map options */}
        {activeMap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setMapOptionsOpen(true)}
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
                onClick={() =>
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
                            onClick={() => handleTabDoubleClick(m)}
                          >
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleDuplicateMap(m)}
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
                          onClick={() =>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleAddMap}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add Map</TooltipContent>
        </Tooltip>
      </div>

      {/* Map canvas area — PixiJS renderer */}
      <div ref={containerRef} className="flex-1 overflow-auto min-h-0">
        {activeMap && flatMap ? (
          <MapCanvas
            map={flatMap as TileMapData}
            layers={flatLayers}
            tilesets={project.tilesets}
            zoom={state.mapZoom}
            activeLayerId={state.activeLayerId}
            currentTool={state.currentTool}
            brushSize={state.brushSize}
            selectedTile={state.selectedTile}
            onPaintTile={handlePaintTile}
            onPaintEnd={handlePaintEnd}
            paintBuffer={paintBuffer}
            paintBufferVersion={paintBufferVersion}
            mapSelection={state.mapSelection}
            onSelectionChange={handleSelectionChange}
            onMoveTiles={handleMoveTiles}
            imageLayers={flatImageLayers}
            onMoveImageLayer={handleMoveImageLayer}
            onResizeImageLayer={handleResizeImageLayer}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {groupMaps.length === 0
              ? "Click + to create a map"
              : "Select a map tab"}
          </div>
        )}
      </div>

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
              onClick={() => setAddMapOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateMap}>
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
              onClick={() => setAddGroupOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateGroup}
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
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onResize(width, height)}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
