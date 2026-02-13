/**
 * TerrainTileSelector — A horizontal bar of tile slots for the Fill Terrain
 * configuration dialog.
 *
 * How it works:
 *   1. Each filled slot shows a small preview of the tile (drawn on a mini
 *      canvas), a probability slider (0–100%), and a delete button.
 *   2. The last slot is always an empty dashed square — it acts as a
 *      placeholder. When a tile is selected from the tileset canvas above,
 *      the parent calls `onAddTile` which appends the tile and creates a
 *      new empty slot automatically.
 *   3. Probability sliders default to equal weight but are fully adjustable.
 *
 * Props:
 *   - tiles: the current list of TerrainTile entries
 *   - onTilesChange: called when the list changes (add/remove/reweight)
 *   - tilesetAssetId: to load the tileset image for mini-previews
 *   - tileSize: the tile size in pixels
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getAssetUrl } from "@/lib/db";
import type { AssetId, TileSize, TerrainTile } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TerrainTileSelectorProps {
  tiles: TerrainTile[];
  onTilesChange: (tiles: TerrainTile[]) => void;
  tilesetAssetId: AssetId | null;
  tileSize: TileSize;
}

// ---------------------------------------------------------------------------
// Mini tile preview — draws a single tile from the tileset onto a tiny canvas
// ---------------------------------------------------------------------------

function TilePreview({
  image,
  sx,
  sy,
  sw,
  sh,
  size = 48,
}: {
  image: HTMLImageElement | null;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size);
  }, [image, sx, sy, sw, sh, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded border border-border"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TerrainTileSelector({
  tiles,
  onTilesChange,
  tilesetAssetId,
}: TerrainTileSelectorProps) {
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null);

  // -----------------------------------------------------------------------
  // Load the tileset image for mini-previews
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!tilesetAssetId) {
      setTilesetImage(null);
      return;
    }
    let revoke: string | null = null;
    let cancelled = false;

    getAssetUrl(tilesetAssetId).then((url) => {
      if (cancelled || !url) return;
      revoke = url;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setTilesetImage(img);
      };
      img.src = url;
    });

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [tilesetAssetId]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleProbabilityChange = useCallback(
    (index: number, value: number) => {
      const updated = tiles.map((t, i) =>
        i === index ? { ...t, probability: value } : t,
      );
      onTilesChange(updated);
    },
    [tiles, onTilesChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onTilesChange(tiles.filter((_, i) => i !== index));
    },
    [tiles, onTilesChange],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Selected Tiles ({tiles.length})
      </span>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {/* Filled tile slots */}
        {tiles.map((entry, index) => (
          <div
            key={index}
            className="flex flex-col items-center gap-1.5 shrink-0 p-2 rounded-md border border-border bg-muted/30"
          >
            {/* Mini tile preview */}
            <div className="relative">
              <TilePreview
                image={tilesetImage}
                sx={entry.tileRef.sx}
                sy={entry.tileRef.sy}
                sw={entry.tileRef.sw}
                sh={entry.tileRef.sh}
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => handleRemove(index)}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>

            {/* Probability slider */}
            <div className="flex items-center gap-1.5 w-24">
              <Slider
                min={0}
                max={100}
                step={1}
                value={[entry.probability]}
                onValueChange={([v]) => handleProbabilityChange(index, v)}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground w-7 text-right tabular-nums">
                {entry.probability}%
              </span>
            </div>
          </div>
        ))}

        {/* Empty placeholder slot — indicates where the next tile will go */}
        <div className="flex items-center justify-center shrink-0 w-[52px] h-[52px] rounded-md border-2 border-dashed border-muted-foreground/30 text-muted-foreground/40 self-start mt-2">
          <span className="text-lg">+</span>
        </div>
      </div>
    </div>
  );
}
