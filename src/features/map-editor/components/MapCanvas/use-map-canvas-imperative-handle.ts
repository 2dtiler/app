import { useEffect, type RefObject } from "react";
import { getMapCellBounds } from "@/features/map-editor/lib/map-geometry";
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
        const bounds = getMapCellBounds(map, zoom, gx, gy);
        if (!usesPolygonCells) {
          context.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
        drawTileWithOrientation(
          context,
          image,
          ref,
          bounds.x,
          bounds.y,
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

        const bounds = getMapCellBounds(map, zoom, gx, gy);
        context.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
      },
      clearPaintCanvas() {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);
      },
    };
  }, [imperativeRef, map, paintCanvasRef, scaledTile, usesPolygonCells, zoom]);
}