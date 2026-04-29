import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MapResizeRequest,
  UseMapResizeParams,
  UseMapResizeReturn,
} from "@/features/map-editor/types/map-canvas";

function clampMapDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(256, Math.max(1, Math.round(value)));
}

function getResizeDeltaInTiles(delta: number, scaledTile: number): number {
  if (scaledTile <= 0) return 0;
  if (delta >= 0) {
    return Math.floor(delta / scaledTile);
  }
  return Math.ceil(delta / scaledTile);
}

export function useMapResize({
  mapWidth,
  mapHeight,
  scaledTile,
  onResizeMap,
}: UseMapResizeParams): UseMapResizeReturn {
  const mapResizeActionRef =
    useRef<UseMapResizeReturn["mapResizeActionRef"]["current"]>(null);
  const [activeMapResizeHandle, setActiveMapResizeHandle] =
    useState<UseMapResizeReturn["activeMapResizeHandle"]>(null);
  const [hoveredMapResizeHandle, setHoveredMapResizeHandle] =
    useState<UseMapResizeReturn["hoveredMapResizeHandle"]>(null);
  const [mapResizePreview, setMapResizePreview] =
    useState<UseMapResizeReturn["mapResizePreview"]>(null);

  const endMapResize = useCallback(
    (commit: boolean) => {
      const action = mapResizeActionRef.current;
      if (!action) return;

      mapResizeActionRef.current = null;
      setActiveMapResizeHandle(null);
      setHoveredMapResizeHandle(null);
      setMapResizePreview(null);

      if (
        commit &&
        (action.nextWidth !== action.origWidth ||
          action.nextHeight !== action.origHeight)
      ) {
        const request: MapResizeRequest = {
          width: action.nextWidth,
          height: action.nextHeight,
        };
        if (action.nextOriginOffsetXInTiles !== 0) {
          request.originOffsetXInTiles = action.nextOriginOffsetXInTiles;
        }
        if (action.nextOriginOffsetYInTiles !== 0) {
          request.originOffsetYInTiles = action.nextOriginOffsetYInTiles;
        }
        onResizeMap(request);
      }
    },
    [onResizeMap],
  );

  const updateMapResizePreview = useCallback(
    (clientX: number, clientY: number) => {
      const action = mapResizeActionRef.current;
      if (!action) return;

      const deltaTilesX = getResizeDeltaInTiles(
        clientX - action.startClientX,
        scaledTile,
      );
      const deltaTilesY = getResizeDeltaInTiles(
        clientY - action.startClientY,
        scaledTile,
      );
      const nextOriginOffsetXInTiles =
        action.handle === "w" || action.handle === "nw"
          ? clampMapDimension(
              action.origWidth - deltaTilesX,
              action.origWidth,
            ) - action.origWidth
          : 0;
      const nextOriginOffsetYInTiles =
        action.handle === "n" || action.handle === "nw"
          ? clampMapDimension(
              action.origHeight - deltaTilesY,
              action.origHeight,
            ) - action.origHeight
          : 0;
      const nextWidth = clampMapDimension(
        action.origWidth +
          (action.handle === "e" || action.handle === "se"
            ? deltaTilesX
            : action.handle === "w" || action.handle === "nw"
              ? -deltaTilesX
              : 0),
        action.origWidth,
      );
      const nextHeight = clampMapDimension(
        action.origHeight +
          (action.handle === "s" || action.handle === "se"
            ? deltaTilesY
            : action.handle === "n" || action.handle === "nw"
              ? -deltaTilesY
              : 0),
        action.origHeight,
      );

      action.nextWidth = nextWidth;
      action.nextHeight = nextHeight;
      action.nextOriginOffsetXInTiles = nextOriginOffsetXInTiles;
      action.nextOriginOffsetYInTiles = nextOriginOffsetYInTiles;
      setMapResizePreview({
        width: nextWidth,
        height: nextHeight,
        originOffsetXInTiles: nextOriginOffsetXInTiles,
        originOffsetYInTiles: nextOriginOffsetYInTiles,
      });
    },
    [scaledTile],
  );

  const beginMapResize = useCallback(
    (
      handle: UseMapResizeReturn["activeMapResizeHandle"],
      event: Parameters<UseMapResizeReturn["beginMapResize"]>[1],
    ) => {
      if (!handle || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      mapResizeActionRef.current = {
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        origWidth: mapWidth,
        origHeight: mapHeight,
        nextWidth: mapWidth,
        nextHeight: mapHeight,
        nextOriginOffsetXInTiles: 0,
        nextOriginOffsetYInTiles: 0,
      };
      setActiveMapResizeHandle(handle);
      setHoveredMapResizeHandle(handle);
      setMapResizePreview({
        width: mapWidth,
        height: mapHeight,
        originOffsetXInTiles: 0,
        originOffsetYInTiles: 0,
      });
    },
    [mapHeight, mapWidth],
  );

  useEffect(() => {
    if (!activeMapResizeHandle) return;

    function handleWindowPointerMove(event: PointerEvent) {
      event.preventDefault();
      updateMapResizePreview(event.clientX, event.clientY);
    }

    function handleWindowPointerUp(event: PointerEvent) {
      if (event.button !== 0) return;
      endMapResize(true);
    }

    function handleWindowPointerCancel() {
      endMapResize(false);
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [activeMapResizeHandle, endMapResize, updateMapResizePreview]);

  return {
    activeMapResizeHandle,
    hoveredMapResizeHandle,
    mapResizeActionRef,
    mapResizePreview,
    previewWidth: mapResizePreview?.width ?? mapWidth,
    previewHeight: mapResizePreview?.height ?? mapHeight,
    beginMapResize,
    isResizing: activeMapResizeHandle !== null,
    setHoveredMapResizeHandle,
  };
}
