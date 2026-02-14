/**
 * TilesetCanvas — A reusable Canvas2D component for displaying and interacting
 * with a tileset image.
 *
 * Features:
 * - Loads the tileset image from IndexedDB via its assetId
 * - Draws the image at the current zoom level with a tile grid overlay
 * - Hover highlight on the tile under the cursor
 * - Click-to-select: reports the selected tile region back via `onTileSelect`
 * - Ctrl+Wheel zoom and middle-mouse pan via `useCanvasNavigation`
 * - Native scrollbars via overflow-auto container
 *
 * Used by:
 * - TilesetPanel (main sidebar tileset viewer)
 * - FillTerrainDialog (terrain configuration modal)
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { useCanvasNavigation } from "@/hooks/use-canvas-navigation";
import { getAssetUrl } from "@/lib/db";
import type { AssetId, TileSize, TilesetId } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pixel region within a tileset (no tilesetId — the parent knows which tileset) */
export interface TileRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface TilesetCanvasProps {
  /** The IndexedDB asset ID for the tileset image. Null hides the canvas. */
  assetId: AssetId | null;
  /** Tile size in pixels used to draw the grid */
  tileSize: TileSize;
  /** Current zoom level (0.5 – 4) */
  zoom: number;
  /** Called when the user changes zoom via Ctrl+Wheel */
  onZoomChange: (zoom: number) => void;
  /** Currently highlighted tile (orange border). Coordinates are in pixels. */
  selectedTile: TileRegion | null;
  /** Called when the user clicks a tile */
  onTileSelect: (tile: TileRegion) => void;
  /** Additional CSS classes for the outer container */
  className?: string;
  /** Placeholder text when no image is loaded */
  placeholder?: string;
  /**
   * When set, enables native HTML drag on tiles. The dragged data will
   * include the tilesetId so drop targets know which tileset the tile
   * comes from. Used by the Find & Replace dialog.
   */
  dragTilesetId?: TilesetId;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TilesetCanvas({
  assetId,
  tileSize,
  zoom,
  onZoomChange,
  selectedTile,
  onTileSelect,
  className = "",
  placeholder = "No tileset selected",
  dragTilesetId,
}: TilesetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Ctrl+Wheel zoom and middle-mouse pan
  useCanvasNavigation(containerRef, zoom, onZoomChange);

  // Clear image synchronously during render when asset is removed (avoids
  // the "setState in effect" lint error).
  const [prevAssetId, setPrevAssetId] = useState(assetId);
  if (assetId !== prevAssetId) {
    setPrevAssetId(assetId);
    if (!assetId) {
      setTilesetImage(null);
    }
  }

  // -----------------------------------------------------------------------
  // Step 1: Load the tileset image whenever the assetId changes.
  // We create a blob URL, load an HTMLImageElement, then clean up on unmount.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!assetId) return;
    let revoke: string | null = null;
    let cancelled = false;

    getAssetUrl(assetId).then((url) => {
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
  }, [assetId]);

  // -----------------------------------------------------------------------
  // Step 2: Redraw the canvas whenever the image, zoom, tileSize, hover, or
  // selection changes. The draw order is:
  //   1. Tileset image (scaled by zoom)
  //   2. Grid lines (orange, semi-transparent)
  //   3. Hover highlight (filled rectangle)
  //   4. Selected tile highlight (stroked rectangle)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tilesetImage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = tilesetImage.width * zoom;
    const h = tilesetImage.height * zoom;
    canvas.width = w;
    canvas.height = h;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tilesetImage, 0, 0, w, h);

    // Grid
    const ts = tileSize * zoom;
    ctx.strokeStyle = "rgba(255, 165, 0, 0.3)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += ts) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += ts) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    // Hover highlight
    if (hoverCell) {
      ctx.fillStyle = "rgba(255, 165, 0, 0.15)";
      ctx.fillRect(hoverCell.x * ts, hoverCell.y * ts, ts, ts);
    }

    // Selected tile highlight
    if (selectedTile) {
      ctx.strokeStyle = "rgba(255, 165, 0, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        selectedTile.sx * zoom + 1,
        selectedTile.sy * zoom + 1,
        selectedTile.sw * zoom - 2,
        selectedTile.sh * zoom - 2,
      );
    }
  }, [tilesetImage, zoom, tileSize, hoverCell, selectedTile]);

  // -----------------------------------------------------------------------
  // Step 3: Handle click → convert pixel coords to tile coords → call back
  // -----------------------------------------------------------------------
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!tilesetImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / (tileSize * zoom));
      const y = Math.floor((e.clientY - rect.top) / (tileSize * zoom));
      onTileSelect({
        sx: x * tileSize,
        sy: y * tileSize,
        sw: tileSize,
        sh: tileSize,
      });
    },
    [tilesetImage, zoom, tileSize, onTileSelect],
  );

  // -----------------------------------------------------------------------
  // Step 4: Handle hover → update hoverCell for the highlight overlay
  // -----------------------------------------------------------------------
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!tilesetImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / (tileSize * zoom));
      const y = Math.floor((e.clientY - rect.top) / (tileSize * zoom));
      setHoverCell({ x, y });
    },
    [tilesetImage, zoom, tileSize],
  );

  // -----------------------------------------------------------------------
  // Step 5: Handle drag start — enable native drag with tile JSON payload
  // -----------------------------------------------------------------------
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLCanvasElement>) => {
      if (!dragTilesetId || !tilesetImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / (tileSize * zoom));
      const y = Math.floor((e.clientY - rect.top) / (tileSize * zoom));
      const tileRef = {
        tilesetId: dragTilesetId,
        sx: x * tileSize,
        sy: y * tileSize,
        sw: tileSize,
        sh: tileSize,
      };
      e.dataTransfer.setData("application/json", JSON.stringify(tileRef));
      e.dataTransfer.effectAllowed = "copy";
    },
    [dragTilesetId, tilesetImage, zoom, tileSize],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      onMouseLeave={() => setHoverCell(null)}
    >
      {tilesetImage ? (
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          draggable={!!dragTilesetId}
          onMouseDown={handleClick}
          onMouseMove={handleMouseMove}
          onDragStart={dragTilesetId ? handleDragStart : undefined}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
          {placeholder}
        </div>
      )}
    </div>
  );
}
