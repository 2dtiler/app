/**
 * FindReplaceDialog — Modal for finding and replacing tile patterns across
 * layers of the active map.
 *
 * Workflow:
 *   1. The user opens this dialog via Edit → Find and Replace (⌘H).
 *   2. They pick a tileset from the dropdown at the top.
 *   3. They choose which layers to target (default: all layers).
 *   4. They pick a grid size (1×1 through 5×5).
 *   5. The TilesetCanvas shows the tileset — click a tile to select it,
 *      then click a cell in the "Find" or "Replace" grid to place it.
 *   6. Clicking "Find and Replace" scans the active map across the selected
 *      layers, finds all occurrences of the find-pattern, and replaces them
 *      with the replace-pattern in a single undo step.
 *
 * Empty cells in the find grid act as wildcards (match any tile or empty).
 * Empty cells in the replace grid leave the existing tile untouched.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TilesetCanvas } from "@/components/editor/TilesetCanvas";
import { useEditorStore } from "@/hooks/use-editor-store";
import { getAllLayerIds } from "@/lib/layers";
import { getAssetUrl } from "@/lib/db";
import type { TileRef, TilesetId, LayerId, AssetId } from "@/types";
import type {
  FindReplaceDialogProps,
  FindReplaceGridSize as GridSize,
} from "@/types/dialogs";

// ---------------------------------------------------------------------------
// Grid sizes
// ---------------------------------------------------------------------------

const GRID_SIZES = [1, 2, 3, 4, 5] as const;

// ---------------------------------------------------------------------------
// Tile Cell — renders a single tile from a tileset image using <canvas>
// ---------------------------------------------------------------------------

function TileCell({
  tileRef,
  tileSize,
  assetId,
  onMouseDown,
  onClear,
}: {
  tileRef: TileRef | null;
  tileSize: number;
  assetId: AssetId | null;
  /** Called when the user clicks this cell — parent places the active tile */
  onMouseDown: () => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw the tile whenever the ref or image changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const displaySize = 32;
    canvas.width = displaySize;
    canvas.height = displaySize;

    // Checkerboard background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, displaySize, displaySize);
    ctx.fillStyle = "#16213e";
    for (let cy = 0; cy < displaySize; cy += 8) {
      for (let cx = 0; cx < displaySize; cx += 8) {
        if ((cx / 8 + cy / 8) % 2 === 0) {
          ctx.fillRect(cx, cy, 8, 8);
        }
      }
    }

    if (!tileRef || !assetId) return;

    let cancelled = false;
    getAssetUrl(assetId).then((url) => {
      if (cancelled || !url) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        // Re-draw checkerboard then tile
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, displaySize, displaySize);
        ctx.fillStyle = "#16213e";
        for (let cy = 0; cy < displaySize; cy += 8) {
          for (let cx = 0; cx < displaySize; cx += 8) {
            if ((cx / 8 + cy / 8) % 2 === 0) {
              ctx.fillRect(cx, cy, 8, 8);
            }
          }
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          img,
          tileRef.sx,
          tileRef.sy,
          tileRef.sw,
          tileRef.sh,
          0,
          0,
          displaySize,
          displaySize,
        );
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });

    return () => {
      cancelled = true;
    };
  }, [tileRef, assetId, tileSize]);

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      className={`border cursor-pointer transition-colors hover:border-orange-400/60 ${
        tileRef ? "border-border" : "border-dashed border-muted-foreground/30"
      }`}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        onClear();
      }}
      title={
        tileRef
          ? "Click to replace, right-click to clear"
          : "Click to place selected tile"
      }
    />
  );
}

// ---------------------------------------------------------------------------
// TilePatternGrid — N×N grid of TileCells
// ---------------------------------------------------------------------------

function TilePatternGrid({
  label,
  grid,
  gridSize,
  tileSize,
  tilesetAssetMap,
  onCellClick,
  onCellClear,
}: {
  label: string;
  grid: (TileRef | null)[][];
  gridSize: number;
  tileSize: number;
  /** Map from TilesetId → AssetId for rendering tiles */
  tilesetAssetMap: Map<string, AssetId>;
  onCellClick: (row: number, col: number) => void;
  onCellClear: (row: number, col: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div
        className="inline-grid gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, 32px)`,
          gridTemplateRows: `repeat(${gridSize}, 32px)`,
        }}
      >
        {grid.map((row, gy) =>
          row.map((cell, gx) => (
            <TileCell
              key={`${gy}-${gx}`}
              tileRef={cell}
              tileSize={tileSize}
              assetId={
                cell
                  ? (tilesetAssetMap.get(cell.tilesetId as string) ?? null)
                  : null
              }
              onMouseDown={() => onCellClick(gy, gx)}
              onClear={() => onCellClear(gy, gx)}
            />
          )),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer Multi-Select Popover
// ---------------------------------------------------------------------------

function LayerMultiSelect({
  layers,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  layers: { id: LayerId; name: string }[];
  selectedIds: Set<string>;
  onToggle: (id: LayerId) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const label =
    selectedIds.size === layers.length
      ? "All layers"
      : selectedIds.size === 0
        ? "No layers"
        : `${selectedIds.size} layer${selectedIds.size > 1 ? "s" : ""} selected`;

  return (
    <div className="relative flex-1" ref={containerRef}>
      <button
        type="button"
        className="flex h-7 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-xs shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
        onMouseDown={() => setOpen(!open)}
      >
        <span className="truncate">{label}</span>
        <svg
          className="h-3 w-3 opacity-50 shrink-0 ml-1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          <div className="flex gap-1 mb-1">
            <button
              type="button"
              className="flex-1 rounded px-2 py-0.5 text-[10px] font-medium hover:bg-accent"
              onMouseDown={onSelectAll}
            >
              Select All
            </button>
            <button
              type="button"
              className="flex-1 rounded px-2 py-0.5 text-[10px] font-medium hover:bg-accent"
              onMouseDown={onDeselectAll}
            >
              Deselect All
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {layers.map((l) => (
              <label
                key={l.id}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded border-input"
                  checked={selectedIds.has(l.id as string)}
                  onChange={() => onToggle(l.id)}
                />
                <span className="truncate">{l.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: create an empty grid
// ---------------------------------------------------------------------------

function createEmptyGrid(size: number): (TileRef | null)[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FindReplaceDialog({
  open,
  onOpenChange,
}: FindReplaceDialogProps) {
  const { state, setState } = useEditorStore();
  const project = state.project;

  // -- Local state ----------------------------------------------------------
  const [selectedTilesetId, setSelectedTilesetId] = useState<TilesetId | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [gridSize, setGridSize] = useState<GridSize>(1);
  const [findGrid, setFindGrid] = useState<(TileRef | null)[][]>(
    createEmptyGrid(1),
  );
  const [replaceGrid, setReplaceGrid] = useState<(TileRef | null)[][]>(
    createEmptyGrid(1),
  );
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(
    new Set(),
  );
  const [canvasSelectedTile, setCanvasSelectedTile] = useState<{
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // -- Derived values -------------------------------------------------------
  const tilesets = project?.tilesets ?? [];
  const activeTileset =
    tilesets.find((t) => t.id === selectedTilesetId) ?? null;

  // Build tileset ID → asset ID map for rendering tiles from any tileset
  const tilesetAssetMap = new Map<string, AssetId>();
  for (const ts of tilesets) {
    tilesetAssetMap.set(ts.id as string, ts.assetId);
  }

  // Get layers for the active map
  const activeMap =
    project?.maps.find((m) => m.id === state.activeMapId) ?? null;
  const allMapLayerIds = useMemo(
    () =>
      activeMap
        ? getAllLayerIds(activeMap.layerOrder, project?.layerGroups ?? [])
        : [],
    [activeMap, project?.layerGroups],
  );
  const allMapLayers = useMemo(
    () =>
      allMapLayerIds
        .map((lid) => project?.layers.find((l) => l.id === lid))
        .filter((l): l is NonNullable<typeof l> => !!l),
    [allMapLayerIds, project?.layers],
  );

  // -----------------------------------------------------------------------
  // Reset local state when the dialog opens
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      setSelectedTilesetId(tilesets[0]?.id ?? null);
      setZoom(1);
      setGridSize(1);
      setFindGrid(createEmptyGrid(1));
      setReplaceGrid(createEmptyGrid(1));
      setCanvasSelectedTile(null);
      setResultMessage(null);
      // Select all layers by default
      const ids = new Set<string>(allMapLayerIds.map((id) => id as string));
      setSelectedLayerIds(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // -----------------------------------------------------------------------
  // Handle grid size change — reset both grids
  // -----------------------------------------------------------------------
  const handleGridSizeChange = useCallback((value: string) => {
    const size = parseInt(value, 10) as GridSize;
    setGridSize(size);
    setFindGrid(createEmptyGrid(size));
    setReplaceGrid(createEmptyGrid(size));
    setResultMessage(null);
  }, []);

  // -----------------------------------------------------------------------
  // Handle tileset change
  // -----------------------------------------------------------------------
  const handleTilesetChange = useCallback((tilesetId: string) => {
    setSelectedTilesetId(tilesetId as TilesetId);
    setCanvasSelectedTile(null);
  }, []);

  // -----------------------------------------------------------------------
  // Handle tile select on tileset canvas (visual highlight only)
  // -----------------------------------------------------------------------
  const handleTileSelect = useCallback(
    (tile: { sx: number; sy: number; sw: number; sh: number }) => {
      setCanvasSelectedTile(tile);
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Build the currently selected TileRef from tileset canvas selection
  // -----------------------------------------------------------------------
  const activeTileRef: TileRef | null = useMemo(
    () =>
      canvasSelectedTile && selectedTilesetId
        ? {
            tilesetId: selectedTilesetId,
            sx: canvasSelectedTile.sx,
            sy: canvasSelectedTile.sy,
            sw: canvasSelectedTile.sw,
            sh: canvasSelectedTile.sh,
          }
        : null,
    [canvasSelectedTile, selectedTilesetId],
  );

  // -----------------------------------------------------------------------
  // Grid cell handlers — click places the active tile, right-click clears
  // -----------------------------------------------------------------------
  const handleFindCellClick = useCallback(
    (row: number, col: number) => {
      if (!activeTileRef) return;
      setFindGrid((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = activeTileRef;
        return next;
      });
      setResultMessage(null);
    },
    [activeTileRef],
  );

  const handleFindCellClear = useCallback((row: number, col: number) => {
    setFindGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = null;
      return next;
    });
    setResultMessage(null);
  }, []);

  const handleReplaceCellClick = useCallback(
    (row: number, col: number) => {
      if (!activeTileRef) return;
      setReplaceGrid((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = activeTileRef;
        return next;
      });
      setResultMessage(null);
    },
    [activeTileRef],
  );

  const handleReplaceCellClear = useCallback((row: number, col: number) => {
    setReplaceGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = null;
      return next;
    });
    setResultMessage(null);
  }, []);

  // -----------------------------------------------------------------------
  // Layer multi-select handlers
  // -----------------------------------------------------------------------
  const handleLayerToggle = useCallback((id: LayerId) => {
    setSelectedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id as string)) {
        next.delete(id as string);
      } else {
        next.add(id as string);
      }
      return next;
    });
  }, []);

  const handleSelectAllLayers = useCallback(() => {
    setSelectedLayerIds(new Set(allMapLayerIds.map((id) => id as string)));
  }, [allMapLayerIds]);

  const handleDeselectAllLayers = useCallback(() => {
    setSelectedLayerIds(new Set());
  }, []);

  // -----------------------------------------------------------------------
  // Check if find grid has at least one tile
  // -----------------------------------------------------------------------
  const hasFindTile = findGrid.some((row) => row.some((cell) => cell !== null));

  // -----------------------------------------------------------------------
  // Find and Replace — core logic
  // -----------------------------------------------------------------------
  const handleFindReplace = useCallback(() => {
    if (!activeMap || !project || selectedLayerIds.size === 0) return;

    const mapId = activeMap.id;
    const targetLayerIds = new Set(selectedLayerIds);

    // Snapshot the find/replace grids
    const findSnapshot = findGrid.map((r) => [...r]);
    const replaceSnapshot = replaceGrid.map((r) => [...r]);
    const gs = gridSize;
    const activeLayerId = state.activeLayerId;

    let replacementCount = 0;

    setState((draft) => {
      if (!draft.project) return;

      const map = draft.project.maps.find((m) => m.id === mapId);
      if (!map) return;

      // Get target layers
      const layers = draft.project.layers.filter(
        (l) => l.mapId === mapId && targetLayerIds.has(l.id as string),
      );
      if (layers.length === 0) return;

      // Scan every valid top-left position in the map
      for (let y = 0; y <= map.heightInTiles - gs; y++) {
        for (let x = 0; x <= map.widthInTiles - gs; x++) {
          // Check if find pattern matches at (x, y) cross-layer
          let matches = true;
          // Track which layer matched at each cell (for replacement)
          const matchedLayers: ((typeof layers)[number] | null)[][] =
            Array.from({ length: gs }, () =>
              Array.from({ length: gs }, () => null),
            );

          for (let dy = 0; dy < gs && matches; dy++) {
            for (let dx = 0; dx < gs && matches; dx++) {
              const findCell = findSnapshot[dy][dx];
              if (!findCell) continue; // wildcard — matches anything

              const key = `${x + dx},${y + dy}`;
              let found = false;
              for (const layer of layers) {
                const existing = layer.tiles[key];
                if (
                  existing &&
                  existing.tilesetId === findCell.tilesetId &&
                  existing.sx === findCell.sx &&
                  existing.sy === findCell.sy
                ) {
                  matchedLayers[dy][dx] = layer;
                  found = true;
                  break;
                }
              }
              if (!found) matches = false;
            }
          }

          if (!matches) continue;

          // Apply replacement
          replacementCount++;
          for (let dy = 0; dy < gs; dy++) {
            for (let dx = 0; dx < gs; dx++) {
              const replaceCell = replaceSnapshot[dy][dx];
              if (!replaceCell) continue; // leave untouched

              const key = `${x + dx},${y + dy}`;

              // Determine which layer to write to
              let targetLayer = matchedLayers[dy][dx];
              if (!targetLayer) {
                // For wildcard find-cells: use the first layer that has a tile
                // at this position, or fall back to the active layer
                for (const layer of layers) {
                  if (layer.tiles[key]) {
                    targetLayer = layer;
                    break;
                  }
                }
                if (!targetLayer) {
                  // Fall back to active layer if it's in the selection
                  targetLayer =
                    layers.find((l) => l.id === activeLayerId) ?? layers[0];
                }
              }

              if (targetLayer) {
                targetLayer.tiles[key] = {
                  tilesetId: replaceCell.tilesetId,
                  sx: replaceCell.sx,
                  sy: replaceCell.sy,
                  sw: replaceCell.sw,
                  sh: replaceCell.sh,
                };
              }
            }
          }
        }
      }
    });

    setResultMessage(
      replacementCount > 0
        ? `Replaced ${replacementCount} occurrence${replacementCount !== 1 ? "s" : ""}`
        : "No matches found",
    );

    // Close the dialog after applying
    onOpenChange(false);
  }, [
    activeMap,
    project,
    selectedLayerIds,
    findGrid,
    replaceGrid,
    gridSize,
    state.activeLayerId,
    setState,
    onOpenChange,
  ]);

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-180 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Find and Replace</DialogTitle>
          <DialogDescription>
            Click a tile in the tileset to select it, then click a cell in the
            grids below to place it. Right-click a cell to clear it. Empty Find
            cells act as wildcards.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          {/* ---- Row 1: Tileset selector ---- */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium shrink-0">Tileset:</span>
            <Select
              value={selectedTilesetId ?? ""}
              onValueChange={handleTilesetChange}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Select a tileset" />
              </SelectTrigger>
              <SelectContent>
                {tilesets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ---- Row 2: Layer selector ---- */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium shrink-0">Layers:</span>
            <LayerMultiSelect
              layers={allMapLayers.map((l) => ({ id: l.id, name: l.name }))}
              selectedIds={selectedLayerIds}
              onToggle={handleLayerToggle}
              onSelectAll={handleSelectAllLayers}
              onDeselectAll={handleDeselectAllLayers}
            />
          </div>

          {/* ---- Row 3: Grid size selector ---- */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium shrink-0">Pattern size:</span>
            <Select
              value={String(gridSize)}
              onValueChange={handleGridSizeChange}
            >
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRID_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}×{s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ---- Tileset canvas ---- */}
          <TilesetCanvas
            assetId={activeTileset?.assetId ?? null}
            tileSize={state.tileSize}
            zoom={zoom}
            onZoomChange={setZoom}
            selectedTile={canvasSelectedTile}
            onTileSelect={handleTileSelect}
            className="h-48 border border-border rounded-md"
            placeholder="Select a tileset above"
          />

          {/* ---- Find / Replace grids ---- */}
          <div className="flex items-start justify-center gap-8">
            <TilePatternGrid
              label="Find"
              grid={findGrid}
              gridSize={gridSize}
              tileSize={state.tileSize}
              tilesetAssetMap={tilesetAssetMap}
              onCellClick={handleFindCellClick}
              onCellClear={handleFindCellClear}
            />
            <div className="flex items-center self-center pt-5">
              <svg
                className="h-5 w-5 text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
            <TilePatternGrid
              label="Replace"
              grid={replaceGrid}
              gridSize={gridSize}
              tileSize={state.tileSize}
              tilesetAssetMap={tilesetAssetMap}
              onCellClick={handleReplaceCellClick}
              onCellClear={handleReplaceCellClear}
            />
          </div>

          {/* ---- Result message ---- */}
          {resultMessage && (
            <div className="text-center text-xs text-muted-foreground">
              {resultMessage}
            </div>
          )}
        </div>

        {/* ---- Footer ---- */}
        <DialogFooter className="flex items-center gap-2 sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onMouseDown={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onMouseDown={handleFindReplace}
            disabled={!hasFindTile || selectedLayerIds.size === 0}
          >
            Find and Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
