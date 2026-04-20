/**
 * useSceneInteraction — encapsulates all pointer-driven interaction state and
 * handlers for the map canvas: painting, tile selection, image layer drag/resize,
 * object drag/resize/placement, and polygon drawing.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type {
  ImageLayer,
  MapObject,
  ObjectType,
  TileRef,
  MapSelection,
} from "@/types";
import type {
  FillPreviewCacheState,
  ObjectInteractionOverride,
  ScenePointerDownEvent,
  SceneInteractionHandlerContext,
  ScenePointerPosition,
  ScenePointerUpEvent,
  ImageDragAction,
  ImageResizeAction,
  ObjectDragAction,
  ObjectPlaceAction,
  ObjectResizeAction,
  PolyVertexDragAction,
  ResizeHandle,
  SelectionAction,
  UseSceneInteractionParams,
  UseSceneInteractionReturn,
} from "@/types/map-canvas";
import {
  getMapCellAtPoint,
  getMapCellOrigin,
  getMapCellPolygon,
  getMapPixelSize,
} from "@/lib/map-geometry";
import { getImageLayerHandlePositions } from "./image-layer-transform";
import { getTileImage } from "./texture-cache";
import { getFillRegion } from "@/lib/terrain";
import { createTileStamp, isMultiTileStamp } from "@/lib/tile-stamp";
import {
  commitPolygonObject,
  handleScenePointerDown,
  handleScenePointerLeave,
  handleScenePointerMove,
  handleScenePointerUp,
} from "./scene-interaction-handlers";

export type { UseSceneInteractionReturn } from "@/types/map-canvas";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSceneInteraction({
  map,
  layers,
  zoom,
  activeLayerId,
  currentTool,
  fillMode,
  activeFillTerrain,
  canPreviewFill,
  brushSize,
  selectedTileSize,
  onPaintTile,
  onPaintEnd,
  mapSelection,
  onSelectionChange,
  onMoveTiles,
  imageLayers,
  onMoveImageLayer,
  onResizeImageLayer,
  objectLayers,
  objects,
  activeObjectId,
  pendingObjectType,
  onCreateObject,
  onMoveObject,
  onResizeObject,
  onUpdatePolygonPoints,
  onSelectObject,
  onCancelPendingObject,
  onDoubleClickObject,
  overlayCanvasRef,
  scaledTile,
  mapW,
  mapH,
  selectedTile,
}: UseSceneInteractionParams): UseSceneInteractionReturn {
  const isPaintingRef = useRef(false);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const fillPreviewCacheRef = useRef<FillPreviewCacheState>({
    tileKey: null,
    layer: null,
    fillMode,
    selectedTile,
    activeFillTerrain,
    region: [],
  });

  // --- Selection state ---
  const selActionRef = useRef<SelectionAction | null>(null);
  const [liveSelection, setLiveSelection] = useState<MapSelection | null>(null);
  const [moveTilesSnapshot, setMoveTilesSnapshot] = useState<
    { dx: number; dy: number; ref: TileRef }[] | null
  >(null);
  const [isMoving, setIsMoving] = useState(false);
  const renderedSelection = liveSelection ?? mapSelection;

  // --- Image layer drag state ---
  const imageDragRef = useRef<ImageDragAction | null>(null);
  const [liveImagePos, setLiveImagePos] = useState<{
    layerId: string;
    x: number;
    y: number;
  } | null>(null);

  // --- Image layer resize state ---
  const imageResizeRef = useRef<ImageResizeAction | null>(null);
  const [liveImageResize, setLiveImageResize] = useState<{
    layerId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(
    null,
  );
  const [hoveredHandle, setHoveredHandle] = useState<ResizeHandle | null>(null);

  // --- Object hover cursor state ---
  const [hoveredObjectCursor, setHoveredObjectCursor] = useState<string | null>(
    null,
  );

  // --- Shift key tracking for aspect ratio constraint ---
  const shiftKeyRef = useRef(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftKeyRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftKeyRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // --- Object placement state ---
  const objectPlaceRef = useRef<ObjectPlaceAction | null>(null);

  // --- Manual double-click detection ---
  const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const lastObjectClickRef = useRef<{
    time: number;
    x: number;
    y: number;
    objectId: string;
  } | null>(null);

  const [liveObjectPlace, setLiveObjectPlace] = useState<{
    type: ObjectType;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // --- Polygon drawing state ---
  const [polygonPoints, setPolygonPoints] = useState<
    { x: number; y: number }[]
  >([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polygonCursorPos, setPolygonCursorPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [prevPendingObjectType, setPrevPendingObjectType] =
    useState(pendingObjectType);

  // --- Object drag state ---
  const objectDragRef = useRef<ObjectDragAction | null>(null);
  const [liveObjectPos, setLiveObjectPos] = useState<{
    objectId: string;
    x: number;
    y: number;
  } | null>(null);

  // --- Object resize state ---
  const objectResizeRef = useRef<ObjectResizeAction | null>(null);
  const [liveObjectResize, setLiveObjectResize] = useState<{
    objectId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // --- Polygon vertex drag state ---
  const polyVertexDragRef = useRef<PolyVertexDragAction | null>(null);
  const [livePolyVertex, setLivePolyVertex] = useState<{
    objectId: string;
    vertexIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const mapPixelSize = getMapPixelSize(map, zoom);

  const getGridPos = useCallback(
    (globalX: number, globalY: number) => {
      return getMapCellAtPoint(map, zoom, { x: globalX, y: globalY });
    },
    [map, zoom],
  );

  const getClampedGridPos = useCallback(
    (globalX: number, globalY: number) => {
      const clampedX = Math.max(0, Math.min(globalX, mapPixelSize.width - 1));
      const clampedY = Math.max(0, Math.min(globalY, mapPixelSize.height - 1));
      return getGridPos(clampedX, clampedY);
    },
    [getGridPos, mapPixelSize.height, mapPixelSize.width],
  );

  const traceCellPath = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      const polygon = getMapCellPolygon(map, zoom, x, y);
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (const point of polygon.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
    },
    [map, zoom],
  );

  const drawCellHighlight = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      fillStyle: string,
      strokeStyle: string,
      lineWidth: number,
    ) => {
      traceCellPath(ctx, x, y);
      ctx.fillStyle = fillStyle;
      ctx.fill();
      traceCellPath(ctx, x, y);
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    },
    [traceCellPath],
  );

  const clearOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;

    const ctx = overlay.getContext("2d");
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
  }, [overlayCanvasRef]);

  const drawOverlayPreview = useCallback(
    (
      pointer: { x: number; y: number } | null,
      pointerGridPos = pointer ? getGridPos(pointer.x, pointer.y) : null,
    ) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) return;

      const ctx = overlay.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.imageSmoothingEnabled = false;

      if (!pointerGridPos || currentTool === "select") return;

      const activeLayer =
        layers.find((layer) => layer.id === activeLayerId) ?? null;
      const isNonTileLayerActive =
        objectLayers.some((layer) => layer.id === activeLayerId) ||
        imageLayers.some((layer) => layer.id === activeLayerId);
      const isBlockedDrawPreview =
        isNonTileLayerActive &&
        (currentTool === "paint" ||
          currentTool === "erase" ||
          currentTool === "fill");
      const selectedStamp =
        currentTool === "paint" && selectedTile
          ? createTileStamp(selectedTile, selectedTileSize)
          : null;
      let fillPreviewRegion: [number, number][] = [];

      if (currentTool === "fill" && canPreviewFill && activeLayer) {
        const tileKey = `${pointerGridPos.x},${pointerGridPos.y}`;
        const cachedPreview = fillPreviewCacheRef.current;

        if (
          cachedPreview.tileKey === tileKey &&
          cachedPreview.layer === activeLayer &&
          cachedPreview.fillMode === fillMode &&
          cachedPreview.selectedTile === selectedTile &&
          cachedPreview.activeFillTerrain === activeFillTerrain
        ) {
          fillPreviewRegion = cachedPreview.region;
        } else {
          fillPreviewRegion = getFillRegion({
            map,
            layer: activeLayer,
            mapWidth: mapW,
            mapHeight: mapH,
            startX: pointerGridPos.x,
            startY: pointerGridPos.y,
            fillMode,
            selectedTile,
            activeFillTerrain,
          });
          fillPreviewCacheRef.current = {
            tileKey,
            layer: activeLayer,
            fillMode,
            selectedTile,
            activeFillTerrain,
            region: fillPreviewRegion,
          };
        }
      }

      const brushNum = parseInt(brushSize);

      if (isBlockedDrawPreview) {
        const previewWidth =
          currentTool === "paint" &&
          selectedStamp &&
          isMultiTileStamp(selectedStamp)
            ? selectedStamp.width
            : currentTool === "fill"
              ? 1
              : brushNum;
        const previewHeight =
          currentTool === "paint" &&
          selectedStamp &&
          isMultiTileStamp(selectedStamp)
            ? selectedStamp.height
            : currentTool === "fill"
              ? 1
              : brushNum;
        for (let dy = 0; dy < previewHeight; dy++) {
          for (let dx = 0; dx < previewWidth; dx++) {
            const tx = pointerGridPos.x + dx;
            const ty = pointerGridPos.y + dy;
            if (tx >= mapW || ty >= mapH) continue;
            drawCellHighlight(
              ctx,
              tx,
              ty,
              "rgba(220, 38, 38, 0.22)",
              "rgba(220, 38, 38, 0.95)",
              2,
            );
          }
        }
        return;
      }

      if (currentTool === "fill") {
        if (fillPreviewRegion.length === 0) return;

        for (const [tx, ty] of fillPreviewRegion) {
          drawCellHighlight(
            ctx,
            tx,
            ty,
            "rgba(255, 165, 0, 0.2)",
            "rgba(255, 165, 0, 0.55)",
            1,
          );
        }
        return;
      }

      const previewWidth =
        selectedStamp && isMultiTileStamp(selectedStamp)
          ? selectedStamp.width
          : brushNum;
      const previewHeight =
        selectedStamp && isMultiTileStamp(selectedStamp)
          ? selectedStamp.height
          : brushNum;
      for (let dy = 0; dy < previewHeight; dy++) {
        for (let dx = 0; dx < previewWidth; dx++) {
          const tx = pointerGridPos.x + dx;
          const ty = pointerGridPos.y + dy;
          if (tx >= mapW || ty >= mapH) continue;
          drawCellHighlight(
            ctx,
            tx,
            ty,
            "rgba(255, 165, 0, 0.2)",
            "rgba(255, 165, 0, 0.8)",
            2,
          );
        }
      }

      if (currentTool !== "paint" || !selectedTile || !selectedStamp) return;

      const tileImg = getTileImage(selectedTile);
      if (!tileImg) return;

      ctx.globalAlpha = 0.5;
      if (isMultiTileStamp(selectedStamp)) {
        for (const cell of selectedStamp.cells) {
          const tx = pointerGridPos.x + cell.dx;
          const ty = pointerGridPos.y + cell.dy;
          if (tx >= mapW || ty >= mapH) continue;
          const origin = getMapCellOrigin(map, zoom, tx, ty);
          ctx.drawImage(
            tileImg,
            cell.ref.sx,
            cell.ref.sy,
            cell.ref.sw,
            cell.ref.sh,
            origin.x,
            origin.y,
            scaledTile,
            scaledTile,
          );
        }
      } else {
        const ref = selectedStamp.cells[0].ref;
        for (let dy = 0; dy < brushNum; dy++) {
          for (let dx = 0; dx < brushNum; dx++) {
            const tx = pointerGridPos.x + dx;
            const ty = pointerGridPos.y + dy;
            if (tx >= mapW || ty >= mapH) continue;
            const origin = getMapCellOrigin(map, zoom, tx, ty);
            ctx.drawImage(
              tileImg,
              ref.sx,
              ref.sy,
              ref.sw,
              ref.sh,
              origin.x,
              origin.y,
              scaledTile,
              scaledTile,
            );
          }
        }
      }
      ctx.globalAlpha = 1;
    },
    [
      activeFillTerrain,
      activeLayerId,
      brushSize,
      canPreviewFill,
      currentTool,
      drawCellHighlight,
      fillMode,
      getGridPos,
      imageLayers,
      layers,
      map,
      mapH,
      mapW,
      objectLayers,
      overlayCanvasRef,
      scaledTile,
      selectedTile,
      selectedTileSize,
      zoom,
    ],
  );

  useEffect(() => {
    if (lastPointerPosRef.current) {
      drawOverlayPreview(lastPointerPosRef.current);
      return;
    }

    clearOverlay();
  }, [clearOverlay, drawOverlayPreview]);

  const isInsideSelection = useCallback(
    (globalX: number, globalY: number, sel: MapSelection): boolean => {
      const cell = getGridPos(globalX, globalY);
      if (!cell) return false;
      return (
        cell.x >= sel.x &&
        cell.x < sel.x + sel.width &&
        cell.y >= sel.y &&
        cell.y < sel.y + sel.height
      );
    },
    [getGridPos],
  );

  const getInteractiveImageLayer = useCallback(
    (imgLayer: ImageLayer) => {
      const resize =
        liveImageResize?.layerId === imgLayer.id ? liveImageResize : null;
      const drag = liveImagePos?.layerId === imgLayer.id ? liveImagePos : null;

      return {
        ...imgLayer,
        x: resize?.x ?? drag?.x ?? imgLayer.x,
        y: resize?.y ?? drag?.y ?? imgLayer.y,
        width: resize?.width ?? imgLayer.width,
        height: resize?.height ?? imgLayer.height,
        rotation: imgLayer.rotation ?? 0,
        flipX: imgLayer.flipX ?? false,
        flipY: imgLayer.flipY ?? false,
      };
    },
    [liveImagePos, liveImageResize],
  );

  const getImageLayerHandles = useCallback(
    (imgLayer: ImageLayer): [ResizeHandle, number, number][] => {
      return getImageLayerHandlePositions(
        getInteractiveImageLayer(imgLayer),
      ).map(([handle, x, y]) => [handle, x * zoom, y * zoom]);
    },
    [getInteractiveImageLayer, zoom],
  );

  const getObjectInteractionOverrides = useCallback(
    (object: MapObject): ObjectInteractionOverride => {
      const resize =
        liveObjectResize?.objectId === object.id ? liveObjectResize : null;
      const drag = liveObjectPos?.objectId === object.id ? liveObjectPos : null;
      return {
        x: resize?.x ?? drag?.x,
        y: resize?.y ?? drag?.y,
        width: resize?.width,
        height: resize?.height,
      };
    },
    [liveObjectPos, liveObjectResize],
  );

  const handleHitSize = 12;
  const hitTestResizeHandle = useCallback(
    (globalX: number, globalY: number): ResizeHandle | null => {
      if (currentTool !== "select") return null;
      const activeImgLayer = imageLayers.find((l) => l.id === activeLayerId);
      if (!activeImgLayer) return null;
      const handles = getImageLayerHandles(activeImgLayer);
      const half = handleHitSize / 2;
      for (const [handle, cx, cy] of handles) {
        if (Math.abs(globalX - cx) <= half && Math.abs(globalY - cy) <= half) {
          return handle;
        }
      }
      return null;
    },
    [currentTool, imageLayers, activeLayerId, getImageLayerHandles],
  );

  // ---------------------------------------------------------------------------
  // Reset polygon state when pendingObjectType changes away from polygon
  // (render-phase side-effect pattern)
  // ---------------------------------------------------------------------------
  if (prevPendingObjectType !== pendingObjectType) {
    setPrevPendingObjectType(pendingObjectType);
    if (pendingObjectType !== "polygon") {
      setIsDrawingPolygon(false);
      setPolygonPoints([]);
      setPolygonCursorPos(null);
    }
  }
  useEffect(() => {
    if (pendingObjectType !== "polygon") {
      lastClickRef.current = null;
    }
  }, [pendingObjectType]);

  // ---------------------------------------------------------------------------
  // Clear hover overlay when switching tools
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
  }, [currentTool, overlayCanvasRef]);

  // ---------------------------------------------------------------------------
  // Keyboard handler for polygon drawing (Escape / Enter)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isDrawingPolygon) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsDrawingPolygon(false);
        setPolygonPoints([]);
        setPolygonCursorPos(null);
        lastClickRef.current = null;
        onCancelPendingObject?.();
      }
      if (e.key === "Enter" && polygonPoints.length >= 3) {
        e.preventDefault();
        e.stopPropagation();
        commitPolygonObject(
          polygonPoints,
          onCreateObject,
          setIsDrawingPolygon,
          setPolygonPoints,
          setPolygonCursorPos,
          lastClickRef,
        );
      }
    }

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [isDrawingPolygon, polygonPoints, onCreateObject, onCancelPendingObject]);

  // ---------------------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------------------

  const handlerContext = useMemo<SceneInteractionHandlerContext>(
    () => ({
      activeLayerId,
      activeObjectId,
      clearOverlay,
      currentTool,
      drawOverlayPreview,
      fillPreviewCacheRef,
      getClampedGridPos,
      getGridPos,
      getInteractiveImageLayer,
      getObjectInteractionOverrides,
      hitTestResizeHandle,
      imageDragRef,
      imageLayers,
      imageResizeRef,
      isDrawingPolygon,
      isInsideSelection,
      isPaintingRef,
      lastClickRef,
      lastObjectClickRef,
      lastPointerPosRef,
      layers,
      liveImagePos,
      liveImageResize,
      liveObjectPlace,
      liveObjectPos,
      liveObjectResize,
      livePolyVertex,
      liveSelection,
      mapH,
      mapW,
      objectDragRef,
      objectLayers,
      objectPlaceRef,
      objects,
      objectResizeRef,
      onCreateObject,
      onDoubleClickObject,
      onMoveImageLayer,
      onMoveObject,
      onMoveTiles,
      onPaintEnd,
      onPaintTile,
      onResizeImageLayer,
      onResizeObject,
      onSelectionChange,
      onSelectObject,
      onUpdatePolygonPoints,
      pendingObjectType,
      polygonCursorPos,
      polygonPoints,
      polyVertexDragRef,
      renderedSelection,
      selActionRef,
      setHoveredHandle,
      setHoveredObjectCursor,
      setIsDrawingPolygon,
      setIsMoving,
      setLiveImagePos,
      setLiveImageResize,
      setLiveObjectPlace,
      setLiveObjectPos,
      setLiveObjectResize,
      setLivePolyVertex,
      setLiveSelection,
      setMoveTilesSnapshot,
      setPolygonCursorPos,
      setPolygonPoints,
      setResizingHandle,
      shiftKeyRef,
      zoom,
    }),
    [
      activeLayerId,
      activeObjectId,
      clearOverlay,
      currentTool,
      drawOverlayPreview,
      getClampedGridPos,
      getGridPos,
      getInteractiveImageLayer,
      getObjectInteractionOverrides,
      hitTestResizeHandle,
      imageLayers,
      isDrawingPolygon,
      isInsideSelection,
      layers,
      liveImagePos,
      liveImageResize,
      liveObjectPlace,
      liveObjectPos,
      liveObjectResize,
      livePolyVertex,
      liveSelection,
      mapH,
      mapW,
      objectLayers,
      objects,
      onCreateObject,
      onDoubleClickObject,
      onMoveImageLayer,
      onMoveObject,
      onMoveTiles,
      onPaintEnd,
      onPaintTile,
      onResizeImageLayer,
      onResizeObject,
      onSelectionChange,
      onSelectObject,
      onUpdatePolygonPoints,
      pendingObjectType,
      polygonCursorPos,
      polygonPoints,
      renderedSelection,
      zoom,
    ],
  );

  const handlePointerDown = useCallback(
    (event: ScenePointerDownEvent) => {
      handleScenePointerDown(event, handlerContext);
    },
    [handlerContext],
  );

  const handlePointerMove = useCallback(
    (event: ScenePointerPosition) => {
      handleScenePointerMove(event, handlerContext);
    },
    [handlerContext],
  );

  const handlePointerUp = useCallback(
    (event?: ScenePointerUpEvent) => {
      handleScenePointerUp(event, handlerContext);
    },
    [handlerContext],
  );

  const handlePointerLeave = useCallback(() => {
    handleScenePointerLeave(handlerContext);
  }, [handlerContext]);

  return {
    overlayCanvasRef,
    renderedSelection,
    liveSelection,
    moveTilesSnapshot,
    liveImagePos,
    liveImageResize,
    liveObjectPos,
    liveObjectResize,
    liveObjectPlace,
    livePolyVertex,
    isDrawingPolygon,
    polygonPoints,
    polygonCursorPos,
    isMoving,
    resizingHandle,
    hoveredHandle,
    hoveredObjectCursor,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
  };
}
