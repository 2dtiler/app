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
 * - FillTerrainDialog (terrain configuration dialog)
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { useCanvasNavigation } from "@/hooks/use-canvas-navigation";
import { snapTilesetPlacementPosition } from "@/features/map-editor/lib/tileset-image-merge";
import { getAssetUrl } from "@/services/db";
import type { TilesetCanvasProps } from "@/features/map-editor/types/editor-ui";
import type { TilesetImageImportPosition } from "@/features/map-editor/types/tileset-import";

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
  selectionMode = "single",
  className = "",
  placeholder = "No tileset selected",
  dragTilesetId,
  onContextMenuTile,
  placementPreview,
  onPlacementChange,
}: TilesetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragSelection, setDragSelection] = useState<{
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const placementDragOffsetRef = useRef<TilesetImageImportPosition | null>(
    null,
  );
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const isPlacementMode = !!placementPreview;

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

    const canvasPixelWidth = placementPreview
      ? Math.max(
          tilesetImage.width,
          placementPreview.position.x + placementPreview.width,
        )
      : tilesetImage.width;
    const canvasPixelHeight = placementPreview
      ? Math.max(
          tilesetImage.height,
          placementPreview.position.y + placementPreview.height,
        )
      : tilesetImage.height;
    const w = canvasPixelWidth * zoom;
    const h = canvasPixelHeight * zoom;
    canvas.width = w;
    canvas.height = h;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(
      tilesetImage,
      0,
      0,
      tilesetImage.width * zoom,
      tilesetImage.height * zoom,
    );

    if (placementPreview) {
      const placementX = placementPreview.position.x * zoom;
      const placementY = placementPreview.position.y * zoom;
      const placementWidth = placementPreview.width * zoom;
      const placementHeight = placementPreview.height * zoom;

      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.drawImage(
        placementPreview.image,
        placementX,
        placementY,
        placementWidth,
        placementHeight,
      );
      ctx.restore();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        placementX + 1,
        placementY + 1,
        placementWidth - 2,
        placementHeight - 2,
      );
    }

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
    if (hoverCell && !dragSelection && !placementPreview) {
      ctx.fillStyle = "rgba(255, 165, 0, 0.15)";
      ctx.fillRect(hoverCell.x * ts, hoverCell.y * ts, ts, ts);
    }

    // Selected tile highlight
    const renderedSelection = dragSelection ?? selectedTile;
    if (renderedSelection && !placementPreview) {
      ctx.strokeStyle = "rgba(255, 165, 0, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        renderedSelection.sx * zoom + 1,
        renderedSelection.sy * zoom + 1,
        renderedSelection.sw * zoom - 2,
        renderedSelection.sh * zoom - 2,
      );
    }
  }, [
    tilesetImage,
    zoom,
    tileSize,
    hoverCell,
    selectedTile,
    dragSelection,
    placementPreview,
  ]);

  // -----------------------------------------------------------------------
  // Step 3: Convert client coordinates into grid-snapped cell coordinates.
  // -----------------------------------------------------------------------
  const getTileCellFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!tilesetImage) return null;
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const maxX = Math.max(0, Math.ceil(tilesetImage.width / tileSize) - 1);
      const maxY = Math.max(0, Math.ceil(tilesetImage.height / tileSize) - 1);
      const x = Math.min(
        maxX,
        Math.max(0, Math.floor((clientX - rect.left) / (tileSize * zoom))),
      );
      const y = Math.min(
        maxY,
        Math.max(0, Math.floor((clientY - rect.top) / (tileSize * zoom))),
      );
      return { x, y };
    },
    [tilesetImage, tileSize, zoom],
  );

  const getTileRegion = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxX = Math.max(start.x, end.x);
      const maxY = Math.max(start.y, end.y);
      return {
        sx: minX * tileSize,
        sy: minY * tileSize,
        sw: (maxX - minX + 1) * tileSize,
        sh: (maxY - minY + 1) * tileSize,
      };
    },
    [tileSize],
  );

  const getCanvasPointFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.floor((clientX - rect.left) / zoom),
        y: Math.floor((clientY - rect.top) / zoom),
      };
    },
    [zoom],
  );

  const getPlacementPositionFromClientPoint = useCallback(
    (clientX: number, clientY: number, offset: TilesetImageImportPosition) => {
      const point = getCanvasPointFromClientPoint(clientX, clientY);
      if (!point) return null;
      return snapTilesetPlacementPosition(
        {
          x: point.x - offset.x,
          y: point.y - offset.y,
        },
        tileSize,
      );
    },
    [getCanvasPointFromClientPoint, tileSize],
  );

  const commitSelectionAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const start = selectionStartRef.current;
      const end = getTileCellFromClientPoint(clientX, clientY);
      if (!start || !end) return;
      onTileSelect(getTileRegion(start, end));
      setDragSelection(null);
      selectionStartRef.current = null;
    },
    [getTileCellFromClientPoint, getTileRegion, onTileSelect],
  );

  const clearDragSelection = useCallback(() => {
    selectionStartRef.current = null;
    setDragSelection(null);
    placementDragOffsetRef.current = null;
  }, []);

  const stopDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopDragListeners();
    };
  }, [stopDragListeners]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!tilesetImage || e.button !== 0) return;

      if (placementPreview && onPlacementChange) {
        e.preventDefault();
        stopDragListeners();

        const point = getCanvasPointFromClientPoint(e.clientX, e.clientY);
        if (!point) return;

        const withinPreview =
          point.x >= placementPreview.position.x &&
          point.y >= placementPreview.position.y &&
          point.x <= placementPreview.position.x + placementPreview.width &&
          point.y <= placementPreview.position.y + placementPreview.height;
        const offset = withinPreview
          ? {
              x: point.x - placementPreview.position.x,
              y: point.y - placementPreview.position.y,
            }
          : { x: 0, y: 0 };

        placementDragOffsetRef.current = offset;
        const initialPosition = getPlacementPositionFromClientPoint(
          e.clientX,
          e.clientY,
          offset,
        );
        if (initialPosition) onPlacementChange(initialPosition);

        const handleWindowMouseMove = (event: MouseEvent) => {
          const nextPosition = getPlacementPositionFromClientPoint(
            event.clientX,
            event.clientY,
            placementDragOffsetRef.current ?? { x: 0, y: 0 },
          );
          if (nextPosition) onPlacementChange(nextPosition);
        };

        const handleWindowMouseUp = (event: MouseEvent) => {
          const nextPosition = getPlacementPositionFromClientPoint(
            event.clientX,
            event.clientY,
            placementDragOffsetRef.current ?? { x: 0, y: 0 },
          );
          if (nextPosition) onPlacementChange(nextPosition);
          clearDragSelection();
          stopDragListeners();
        };

        const handleWindowBlur = () => {
          clearDragSelection();
          stopDragListeners();
        };

        window.addEventListener("mousemove", handleWindowMouseMove);
        window.addEventListener("mouseup", handleWindowMouseUp, {
          once: true,
        });
        window.addEventListener("blur", handleWindowBlur, { once: true });
        dragCleanupRef.current = () => {
          window.removeEventListener("mousemove", handleWindowMouseMove);
          window.removeEventListener("mouseup", handleWindowMouseUp);
          window.removeEventListener("blur", handleWindowBlur);
        };
        return;
      }

      const cell = getTileCellFromClientPoint(e.clientX, e.clientY);
      if (!cell) return;

      if (selectionMode === "rectangle") {
        e.preventDefault();
        stopDragListeners();
        selectionStartRef.current = cell;
        setDragSelection(getTileRegion(cell, cell));

        const handleWindowMouseMove = (event: MouseEvent) => {
          const nextCell = getTileCellFromClientPoint(
            event.clientX,
            event.clientY,
          );
          if (!nextCell || !selectionStartRef.current) return;
          setHoverCell(nextCell);
          setDragSelection(getTileRegion(selectionStartRef.current, nextCell));
        };

        const handleWindowMouseUp = (event: MouseEvent) => {
          commitSelectionAtPoint(event.clientX, event.clientY);
          stopDragListeners();
        };

        const handleWindowBlur = () => {
          clearDragSelection();
          stopDragListeners();
        };

        window.addEventListener("mousemove", handleWindowMouseMove);
        window.addEventListener("mouseup", handleWindowMouseUp, {
          once: true,
        });
        window.addEventListener("blur", handleWindowBlur, { once: true });
        dragCleanupRef.current = () => {
          window.removeEventListener("mousemove", handleWindowMouseMove);
          window.removeEventListener("mouseup", handleWindowMouseUp);
          window.removeEventListener("blur", handleWindowBlur);
        };
        return;
      }

      onTileSelect(getTileRegion(cell, cell));
    },
    [
      tilesetImage,
      clearDragSelection,
      commitSelectionAtPoint,
      getCanvasPointFromClientPoint,
      getPlacementPositionFromClientPoint,
      getTileCellFromClientPoint,
      getTileRegion,
      onTileSelect,
      onPlacementChange,
      placementPreview,
      selectionMode,
      stopDragListeners,
    ],
  );

  // -----------------------------------------------------------------------
  // Step 4: Handle hover → update hoverCell for the highlight overlay
  // -----------------------------------------------------------------------
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlacementMode) return;
      if (selectionMode === "rectangle") return;
      const cell = getTileCellFromClientPoint(e.clientX, e.clientY);
      if (cell) setHoverCell(cell);
    },
    [getTileCellFromClientPoint, isPlacementMode, selectionMode],
  );

  // -----------------------------------------------------------------------
  // Step 5: Handle drag start — enable native drag with tile JSON payload
  // -----------------------------------------------------------------------
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLCanvasElement>) => {
      if (!dragTilesetId || !tilesetImage || isPlacementMode) return;
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
    [dragTilesetId, tilesetImage, isPlacementMode, zoom, tileSize],
  );

  // -----------------------------------------------------------------------
  // Step 6: Handle right-click — report tile grid coords without showing
  // the browser's default context menu (parent handles the ContextMenu).
  // -----------------------------------------------------------------------
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onContextMenuTile || !tilesetImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / (tileSize * zoom));
      const y = Math.floor((e.clientY - rect.top) / (tileSize * zoom));
      onContextMenuTile(x, y);
      // Do NOT prevent default here — the ContextMenuTrigger in the parent
      // relies on the contextmenu event bubbling up to it.
    },
    [onContextMenuTile, tilesetImage, tileSize, zoom],
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
          className={isPlacementMode ? "cursor-move" : "cursor-crosshair"}
          draggable={!!dragTilesetId && !isPlacementMode}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onDragStart={
            dragTilesetId && !isPlacementMode ? handleDragStart : undefined
          }
          onContextMenu={onContextMenuTile ? handleContextMenu : undefined}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
          {placeholder}
        </div>
      )}
    </div>
  );
}
