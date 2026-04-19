import { useCallback, useRef, useState } from "react";
import { pointHitsObjectBody } from "@/components/editor/MapCanvas/object-utils";
import type { ObjectId } from "@/types";
import type {
  MapCanvasContextMenuTile,
  UseMapCanvasContextMenuParams,
  UseMapCanvasContextMenuResult,
} from "@/types/map-panel-context-menu";

export function useMapCanvasContextMenu({
  containerRef,
  activeMap,
  activeTileLayer,
  activeImageLayer,
  activeLayerId,
  mapZoom,
  objects,
  onSelectObject,
}: UseMapCanvasContextMenuParams): UseMapCanvasContextMenuResult {
  const contextMenuTileRef = useRef<MapCanvasContextMenuTile | null>(null);
  const hoverTileRef = useRef<MapCanvasContextMenuTile | null>(null);
  const [contextMenuObjectId, setContextMenuObjectId] =
    useState<ObjectId | null>(null);
  const [hasContextMenuTile, setHasContextMenuTile] = useState(false);
  const [hasContextMenuImageLayer, setHasContextMenuImageLayer] =
    useState(false);

  const eventToMapPoint = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      return {
        x: e.clientX - rect.left + container.scrollLeft,
        y: e.clientY - rect.top + container.scrollTop,
      };
    },
    [containerRef],
  );

  const eventToTile = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!activeMap) return null;

      const point = eventToMapPoint(e);
      if (!point) return null;

      const scaledTile = activeMap.tileSize * mapZoom;
      return {
        x: Math.max(
          0,
          Math.min(
            Math.floor(point.x / scaledTile),
            activeMap.widthInTiles - 1,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            Math.floor(point.y / scaledTile),
            activeMap.heightInTiles - 1,
          ),
        ),
      };
    },
    [activeMap, eventToMapPoint, mapZoom],
  );

  const handleMapContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const point = eventToMapPoint(e);
      const tile = eventToTile(e);

      if (tile) {
        contextMenuTileRef.current = tile;
        const tileRef = activeTileLayer?.tiles[`${tile.x},${tile.y}`] ?? null;
        setHasContextMenuTile(!!tileRef);
      } else {
        setHasContextMenuTile(false);
      }

      if (point && activeImageLayer?.visible) {
        const scaledX = activeImageLayer.x * mapZoom;
        const scaledY = activeImageLayer.y * mapZoom;
        const scaledWidth = activeImageLayer.width * mapZoom;
        const scaledHeight = activeImageLayer.height * mapZoom;
        const withinImageLayer =
          point.x >= scaledX &&
          point.x <= scaledX + scaledWidth &&
          point.y >= scaledY &&
          point.y <= scaledY + scaledHeight;
        setHasContextMenuImageLayer(withinImageLayer);
      } else {
        setHasContextMenuImageLayer(false);
      }

      if (point && activeLayerId) {
        const targetObject = objects
          .filter(
            (object) => object.layerId === activeLayerId && object.visible,
          )
          .reverse()
          .find((object) =>
            pointHitsObjectBody(object, point.x, point.y, mapZoom),
          );

        const nextObjectId = (targetObject?.id as ObjectId | undefined) ?? null;
        setContextMenuObjectId(nextObjectId);
        if (nextObjectId) {
          onSelectObject(nextObjectId);
        }
      } else {
        setContextMenuObjectId(null);
      }
    },
    [
      activeImageLayer,
      activeLayerId,
      activeTileLayer,
      eventToMapPoint,
      eventToTile,
      mapZoom,
      objects,
      onSelectObject,
    ],
  );

  const handleMapMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      hoverTileRef.current = eventToTile(e);
    },
    [eventToTile],
  );

  const clearHoverTile = useCallback(() => {
    hoverTileRef.current = null;
  }, []);

  return {
    contextMenuTileRef,
    hoverTileRef,
    contextMenuObjectId,
    hasContextMenuTile,
    hasContextMenuImageLayer,
    hasContextMenuObject: contextMenuObjectId !== null,
    handleMapContextMenu,
    handleMapMouseMove,
    clearHoverTile,
  };
}
