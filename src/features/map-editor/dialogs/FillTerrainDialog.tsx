/**
 * FillTerrainDialog — Dialog for configuring weighted terrain tiles used by the
 * Fill Terrain tool.
 *
 * Workflow:
 *   1. The user opens this dialog from the Fill tool dropdown ("Fill Terrain").
 *   2. They pick a tileset from the dropdown at the top.
 *   3. The TilesetCanvas shows the tileset — click a tile to add it to the
 *      selection bar below.
 *   4. The TerrainTileSelector shows all selected tiles with probability
 *      sliders (0–100%).
 *   5. Optionally, the user saves the configuration as a named "Terrain" for
 *      reuse (stored in the Project).
 *   6. Clicking "Apply" closes the dialog and writes the terrain config into
 *      EditorState so the next fill click uses weighted random tiles.
 *
 * Saved terrains: the dialog also lets you load a previously saved terrain
 * from a dropdown, editing it in-place before applying.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TilesetCanvas } from "@/features/map-editor/components/TilesetCanvas";
import { TerrainTileSelector } from "@/features/map-editor/components/TerrainTileSelector";
import { useEditorStore } from "@/hooks/use-editor-store";
import { generateTerrainId } from "@/utils/ids";
import type { TerrainDialogProps } from "@/features/map-editor/types/dialogs";
import type { TerrainTile, TerrainId, TilesetId, Terrain } from "@/types";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FillTerrainDialog({
  open,
  onOpenChange,
  onApply,
  onDeleteTerrain,
  initialTerrainId,
  initialTiles,
  target,
}: TerrainDialogProps) {
  const { state, setState } = useEditorStore();
  const project = state.project;

  // -- Local state ----------------------------------------------------------
  const [selectedTilesetId, setSelectedTilesetId] = useState<TilesetId | null>(
    null,
  );
  const [terrainTiles, setTerrainTiles] = useState<TerrainTile[]>([]);
  const [zoom, setZoom] = useState(1);
  const [terrainName, setTerrainName] = useState("");
  const [selectedTerrainId, setSelectedTerrainId] = useState<TerrainId | null>(
    null,
  );
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Track the tile currently highlighted in the tileset canvas (for visual
  // feedback only — the tile is added to the bar on click, see handleTileSelect)
  const [canvasSelectedTile, setCanvasSelectedTile] = useState<{
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  } | null>(null);

  // -- Derived values -------------------------------------------------------
  const tilesets = project?.tilesets ?? [];
  const terrains = useMemo(() => project?.terrains ?? [], [project?.terrains]);
  const activeTileset =
    tilesets.find((t) => t.id === selectedTilesetId) ?? null;
  const targetTitle = target === "paint" ? "Paint Terrain" : "Fill Terrain";
  const targetDescription =
    target === "paint"
      ? "Select tiles and set their probabilities for weighted random brush painting."
      : "Select tiles and set their probabilities for weighted random fill.";

  // -----------------------------------------------------------------------
  // Reset local state when the dialog opens
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      const initialTerrain = initialTerrainId
        ? (terrains.find((terrain) => terrain.id === initialTerrainId) ?? null)
        : null;
      const initialSelection = initialTerrain
        ? initialTerrain.tiles.map((tile) => ({ ...tile }))
        : (initialTiles?.map((tile) => ({ ...tile })) ?? []);

      setSelectedTilesetId(
        initialTerrain?.tilesetId ??
          initialSelection[0]?.tileRef.tilesetId ??
          tilesets[0]?.id ??
          null,
      );
      setTerrainTiles(initialSelection);
      setZoom(1);
      setTerrainName(initialTerrain?.name ?? "");
      setSelectedTerrainId(initialTerrain?.id ?? null);
      setShowSaveInput(false);
      setCanvasSelectedTile(null);
    }
    // oxlint-disable-next-line react/exhaustive-deps
  }, [initialTerrainId, initialTiles, open]);

  // -----------------------------------------------------------------------
  // When the user picks a tile from the canvas, append it to the selection
  // bar with a default probability of 100%.
  // -----------------------------------------------------------------------
  const handleTileSelect = useCallback(
    (tile: { sx: number; sy: number; sw: number; sh: number }) => {
      if (!selectedTilesetId) return;
      setCanvasSelectedTile(tile);

      // Check for duplicate (same tile position)
      const isDuplicate = terrainTiles.some(
        (t) =>
          t.tileRef.tilesetId === selectedTilesetId &&
          t.tileRef.sx === tile.sx &&
          t.tileRef.sy === tile.sy,
      );
      if (isDuplicate) return;

      setTerrainTiles((prev) => [
        ...prev,
        {
          tileRef: {
            tilesetId: selectedTilesetId,
            sx: tile.sx,
            sy: tile.sy,
            sw: tile.sw,
            sh: tile.sh,
          },
          probability: 100,
        },
      ]);
    },
    [selectedTilesetId, terrainTiles],
  );

  // -----------------------------------------------------------------------
  // Load a saved terrain into the editor
  // -----------------------------------------------------------------------
  const handleLoadTerrain = useCallback(
    (terrainId: string) => {
      if (terrainId === "__none__") {
        setSelectedTerrainId(null);
        setTerrainTiles([]);
        setCanvasSelectedTile(null);
        return;
      }
      const terrain = terrains.find((t) => t.id === terrainId);
      if (!terrain) return;

      setSelectedTerrainId(terrain.id);
      setSelectedTilesetId(terrain.tilesetId);
      setTerrainTiles(terrain.tiles.map((t) => ({ ...t })));
      setTerrainName(terrain.name);
      setCanvasSelectedTile(null);
    },
    [terrains],
  );

  // -----------------------------------------------------------------------
  // When the tileset changes, clear the current tile selections (tiles from
  // a different tileset would have invalid references).
  // -----------------------------------------------------------------------
  const handleTilesetChange = useCallback((tilesetId: string) => {
    setSelectedTilesetId(tilesetId as TilesetId);
    setSelectedTerrainId(null);
    setTerrainName("");
    setTerrainTiles([]);
    setCanvasSelectedTile(null);
  }, []);

  // -----------------------------------------------------------------------
  // Save the current config as a named terrain to the project
  // -----------------------------------------------------------------------
  const handleSave = useCallback(() => {
    const name = terrainName.trim();
    if (!name || !selectedTilesetId || terrainTiles.length === 0) return;

    setState((draft) => {
      if (!draft.project) return;

      // If we're editing an existing terrain, update it in-place
      if (selectedTerrainId) {
        const existing = draft.project.terrains.find(
          (t) => t.id === selectedTerrainId,
        );
        if (existing) {
          existing.name = name;
          existing.tilesetId = selectedTilesetId;
          existing.tiles = terrainTiles;
          return;
        }
      }

      // Otherwise create a new one
      const terrain: Terrain = {
        id: generateTerrainId(),
        name,
        tilesetId: selectedTilesetId,
        tiles: terrainTiles,
      };
      draft.project.terrains.push(terrain);
      setSelectedTerrainId(terrain.id);
    });

    setShowSaveInput(false);
  }, [
    terrainName,
    selectedTilesetId,
    terrainTiles,
    selectedTerrainId,
    setState,
  ]);

  // -----------------------------------------------------------------------
  // Delete a saved terrain
  // -----------------------------------------------------------------------
  const handleDeleteTerrain = useCallback(() => {
    if (!selectedTerrainId) return;
    onDeleteTerrain(selectedTerrainId);
    setState((draft) => {
      if (!draft.project) return;
      draft.project.terrains = draft.project.terrains.filter(
        (t) => t.id !== selectedTerrainId,
      );
    });
    setSelectedTerrainId(null);
    setTerrainTiles([]);
    setTerrainName("");
  }, [onDeleteTerrain, selectedTerrainId, setState]);

  // -----------------------------------------------------------------------
  // Apply — close dialog and pass the terrain config to the parent
  // -----------------------------------------------------------------------
  const handleApply = useCallback(() => {
    if (terrainTiles.length === 0) return;
    onApply({
      terrainId: selectedTerrainId,
      tiles: terrainTiles.map((tile) => ({ ...tile })),
    });
    onOpenChange(false);
  }, [onApply, onOpenChange, selectedTerrainId, terrainTiles]);

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-150 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{targetTitle}</DialogTitle>
          <DialogDescription>{targetDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          {/* ---- Row 1: Saved terrains selector ---- */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="terrain-select"
              className="text-xs font-medium shrink-0"
            >
              Terrain:
            </Label>
            <Select
              name="terrain-select"
              value={selectedTerrainId ?? "__none__"}
              onValueChange={handleLoadTerrain}
            >
              <SelectTrigger id="terrain-select" className="h-7 text-xs flex-1">
                <SelectValue placeholder="(Unsaved)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">(New / Unsaved)</SelectItem>
                {terrains.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTerrainId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive"
                onMouseDown={handleDeleteTerrain}
              >
                Delete
              </Button>
            )}
          </div>

          {/* ---- Row 2: Tileset selector ---- */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="terrain-tileset"
              className="text-xs font-medium shrink-0"
            >
              Tileset:
            </Label>
            <Select
              name="terrain-tileset"
              value={selectedTilesetId ?? ""}
              onValueChange={handleTilesetChange}
            >
              <SelectTrigger
                id="terrain-tileset"
                className="h-7 text-xs flex-1"
              >
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

          {/* ---- Tileset canvas ---- */}
          <TilesetCanvas
            assetId={activeTileset?.assetId ?? null}
            tileSize={state.tileSize}
            zoom={zoom}
            onZoomChange={setZoom}
            selectedTile={canvasSelectedTile}
            onTileSelect={handleTileSelect}
            className="h-56 border border-border rounded-md"
            placeholder="Select a tileset above"
          />

          {/* ---- Selection bar (terrain tiles with sliders) ---- */}
          <TerrainTileSelector
            tiles={terrainTiles}
            onTilesChange={setTerrainTiles}
            tilesets={tilesets}
            tileSize={state.tileSize}
          />
        </div>

        {/* ---- Footer ---- */}
        <DialogFooter className="flex items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            {showSaveInput ? (
              <>
                <Input
                  id="terrain-name"
                  name="terrain-name"
                  placeholder="Terrain name"
                  value={terrainName}
                  onChange={(e) => setTerrainName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="h-7 w-40 text-xs"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onMouseDown={handleSave}
                  disabled={!terrainName.trim()}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onMouseDown={() => setShowSaveInput(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onMouseDown={() => setShowSaveInput(true)}
                disabled={terrainTiles.length === 0}
              >
                <Save className="h-3 w-3 mr-1" />
                Save Terrain
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
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
              onMouseDown={handleApply}
              disabled={terrainTiles.length === 0}
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
