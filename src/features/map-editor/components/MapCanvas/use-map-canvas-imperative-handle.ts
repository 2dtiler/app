import { useEffect, type RefObject } from "react";
import { getDualDisplayOrigin, getMapCellBounds, getMapCellOrigin } from "@/features/map-editor/lib/map-geometry";
import type { MapCanvasProps } from "@/features/map-editor/types/map-canvas";
import type { TileMapData, TileRef } from "@/types";
import { drawTileWithOrientation, getTileImage } from "./texture-cache";

export function useMapCanvasImperativeHandle(
  imperativeRef: MapCanvasProps["imperativeRef"],
  paintCanvasRef: RefObject<HTMLCanvasElement | null>,
  map: TileMapData,
  scaledTile: number,
  usesPolygonCells: boolean,
  zoom: number,
  dualGrid: boolean,
) {
  useEffect(() => {
    if (!imperativeRef) return;

    imperativeRef.current = {
      drawBufferTile(gx: number, gy: number, ref: TileRef) {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const image = getTileImage(ref);
        if (!image) return;

        context.imageSmoothingEnabled = false;
        const origin = dualGrid
          ? getDualDisplayOrigin(map, zoom, gx, gy)
          : getMapCellOrigin(map, zoom, gx, gy);
        const bounds = dualGrid
          ? {
              x: origin.x,
              y: origin.y,
              width: scaledTile,
              height: scaledTile,
            }
          : getMapCellBounds(map, zoom, gx, gy);
        if (!usesPolygonCells) {
          context.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
        drawTileWithOrientation(
          context,
          image,
          ref,
          origin.x,
          origin.y,
          scaledTile,
        );
      },
      eraseBufferTile(gx: number, gy: number) {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        context.imageSmoothingEnabled = false;
        if (usesPolygonCells) return;

        const origin = dualGrid
          ? getDualDisplayOrigin(map, zoom, gx, gy)
          : getMapCellOrigin(map, zoom, gx, gy);
        context.clearRect(origin.x, origin.y, scaledTile, scaledTile);
      },
      clearPaintCanvas() {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);
      },
    };
  }, [dualGrid, imperativeRef, map, paintCanvasRef, scaledTile, usesPolygonCells, zoom]);
}
