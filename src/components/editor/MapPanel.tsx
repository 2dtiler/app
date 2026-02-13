import { useRef, useState, useEffect, useCallback } from "react";
import {
  Plus,
  ZoomIn,
  ZoomOut,
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditorStore } from "@/hooks/use-editor-store";
import { generateMapId, generateMapGroupId, generateLayerId } from "@/lib/ids";
import {
  flattenLayerTree,
  isLayerEffectivelyLocked,
  findLastLayerId,
} from "@/lib/layers";
import {
  BRUSH_SIZES,
  type EditorTool,
  type MapGroupId,
  type MapId,
  type TileMapData,
  type TileLayer,
  type TileRef,
  type MapGroup,
} from "@/types";

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
  const [renamingTabId, setRenamingTabId] = useState<MapId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  const activeGroup = project.mapGroups.find(
    (g) => g.id === state.activeMapGroupId,
  );
  const groupMaps = project.maps.filter(
    (m) => m.groupId === state.activeMapGroupId,
  );
  const activeMap = project.maps.find((m) => m.id === state.activeMapId);
  const activeLayer = project.layers.find((l) => l.id === state.activeLayerId);

  // Flatten layer tree for rendering — applies group visibility/lock
  const layerGroups = project.layerGroups ?? [];
  const flatLayers = activeMap
    ? flattenLayerTree(activeMap.layerOrder, project.layers, layerGroups)
    : [];
  // Create a virtual map with a flat layerOrder for the canvas
  const flatMap = activeMap
    ? { ...activeMap, layerOrder: flatLayers.map((l) => l.id) }
    : null;

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
        if (!state.selectedTile || !activeLayer) return;
        const ref = state.selectedTile;
        const w = activeMap.widthInTiles;
        const h = activeMap.heightInTiles;

        const targetKey = `${gx},${gy}`;
        const targetTile = activeLayer.tiles[targetKey] ?? null;

        if (
          targetTile &&
          targetTile.tilesetId === ref.tilesetId &&
          targetTile.sx === ref.sx &&
          targetTile.sy === ref.sy
        ) {
          return;
        }

        // BFS flood fill
        const visited = new Set<string>();
        const queue: [number, number][] = [[gx, gy]];
        const toFill: [number, number][] = [];

        while (queue.length > 0) {
          const [x, y] = queue.shift()!;
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

        setState((draft) => {
          const layer = draft.project?.layers.find(
            (l) => l.id === state.activeLayerId,
          );
          if (!layer) return;
          for (const [x, y] of toFill) {
            layer.tiles[`${x},${y}`] = {
              tilesetId: ref.tilesetId,
              sx: ref.sx,
              sy: ref.sy,
              sw: ref.sw,
              sh: ref.sh,
            };
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
      state.activeLayerId,
      setState,
      schedulePaintRender,
      paintBuffer,
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
    paint: Paintbrush,
    erase: Eraser,
    fill: PaintBucket,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Map toolbar */}
      <div className="flex items-center gap-1 px-1 py-0.5 border-b border-border bg-card shrink-0 flex-wrap min-h-10">
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={state.currentTool === "fill" ? "default" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() =>
                setState((draft) => {
                  draft.currentTool = "fill";
                })
              }
            >
              <PaintBucket className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fill Tool</TooltipContent>
        </Tooltip>

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
          {state.currentTool.toUpperCase()}{" "}
          {state.currentTool !== "fill" && state.brushSize}
        </span>
      </div>

      {/* Group selector + Map tabs + Add */}
      <div className="flex items-center gap-1 px-1 py-0.5 border-b border-border bg-card shrink-0">
        <Select
          value={state.activeMapGroupId ?? ""}
          onValueChange={handleGroupChange}
        >
          <SelectTrigger className="h-6 w-[100px] text-xs shrink-0">
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <TabsTrigger
                              value={m.id}
                              className="h-6 px-2 text-xs rounded-none"
                              onDoubleClick={() => handleTabDoubleClick(m)}
                            >
                              {m.name}
                            </TabsTrigger>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Double Click to Rename</TooltipContent>
                      </Tooltip>
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
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>New Map</DialogTitle>
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

      {/* Add group dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>New Map Group</DialogTitle>
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

function MapOptionsDialog({
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

  useEffect(() => {
    if (open) {
      setWidth(map.widthInTiles);
      setHeight(map.heightInTiles);
    }
  }, [open, map]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>Map Options — {map.name}</DialogTitle>
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
}
