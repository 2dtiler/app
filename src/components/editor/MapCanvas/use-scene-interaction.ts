/**
 * useSceneInteraction — encapsulates all pointer-driven interaction state and
 * handlers for the map canvas: painting, tile selection, image layer drag/resize,
 * object drag/resize/placement, and polygon drawing.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type {
  ImageLayer,
  MapObject,
  ObjectType,
  TileLayer,
  TileRef,
  EditorState,
  MapSelection,
} from "@/types";
import type {
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
import { computeResize, RESIZE_CURSORS } from "./resize-utils";
import {
  getImageLayerHandlePositions,
  pointInImageLayer,
  resizeImageLayerFromHandle,
} from "./image-layer-transform";
import {
  getBoxObjectHandlePositions,
  pointHitsObjectBody,
  isBoxObjectType,
} from "./object-utils";
import { getTileImage } from "./texture-cache";
import { getFillRegion } from "@/lib/terrain";
import { createTileStamp, isMultiTileStamp } from "@/lib/tile-stamp";

export type { UseSceneInteractionReturn } from "@/types/map-canvas";

function getObjectInteractionOverrides(
  object: MapObject,
  liveObjectPos: UseSceneInteractionReturn["liveObjectPos"],
  liveObjectResize: UseSceneInteractionReturn["liveObjectResize"],
) {
  const resize = liveObjectResize?.objectId === object.id ? liveObjectResize : null;
  const drag = liveObjectPos?.objectId === object.id ? liveObjectPos : null;
  return {
    x: resize?.x ?? drag?.x,
    y: resize?.y ?? drag?.y,
    width: resize?.width,
    height: resize?.height,
  };
}

function drawBlockedPreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return;

  const inset = Math.max(
    1,
    Math.min(6, Math.floor(Math.min(width, height) * 0.18)),
  );

  ctx.fillStyle = "rgba(220, 38, 38, 0.22)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(220, 38, 38, 0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(x + width - inset, y + height - inset);
  ctx.moveTo(x + width - inset, y + inset);
  ctx.lineTo(x + inset, y + height - inset);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSceneInteraction({
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
  const fillPreviewCacheRef = useRef<{
    tileKey: string | null;
    layer: TileLayer | null;
    fillMode: EditorState["fillMode"];
    selectedTile: TileRef | null;
    activeFillTerrain: EditorState["activeFillTerrain"];
    region: [number, number][];
  }>({
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

  const getGridPos = useCallback(
    (globalX: number, globalY: number) => {
      const gx = Math.floor(globalX / scaledTile);
      const gy = Math.floor(globalY / scaledTile);
      if (gx < 0 || gy < 0 || gx >= mapW || gy >= mapH) return null;
      return { x: gx, y: gy };
    },
    [scaledTile, mapW, mapH],
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
      const hx = pointerGridPos.x * scaledTile;
      const hy = pointerGridPos.y * scaledTile;

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
        const hw = Math.min(previewWidth, mapW - pointerGridPos.x) * scaledTile;
        const hh =
          Math.min(previewHeight, mapH - pointerGridPos.y) * scaledTile;

        drawBlockedPreview(ctx, hx, hy, hw, hh);
        return;
      }

      if (currentTool === "fill") {
        if (fillPreviewRegion.length === 0) return;

        ctx.fillStyle = "rgba(255, 165, 0, 0.2)";
        ctx.strokeStyle = "rgba(255, 165, 0, 0.55)";
        ctx.lineWidth = 1;
        for (const [tx, ty] of fillPreviewRegion) {
          const fillX = tx * scaledTile;
          const fillY = ty * scaledTile;
          ctx.fillRect(fillX, fillY, scaledTile, scaledTile);
          ctx.strokeRect(
            fillX + 0.5,
            fillY + 0.5,
            scaledTile - 1,
            scaledTile - 1,
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
      const hw = Math.min(previewWidth, mapW - pointerGridPos.x) * scaledTile;
      const hh = Math.min(previewHeight, mapH - pointerGridPos.y) * scaledTile;
      ctx.fillStyle = "rgba(255, 165, 0, 0.2)";
      ctx.fillRect(hx, hy, hw, hh);
      ctx.strokeStyle = "rgba(255, 165, 0, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(hx, hy, hw, hh);

      if (currentTool !== "paint" || !selectedTile || !selectedStamp) return;

      const tileImg = getTileImage(selectedTile);
      if (!tileImg) return;

      ctx.globalAlpha = 0.5;
      if (isMultiTileStamp(selectedStamp)) {
        for (const cell of selectedStamp.cells) {
          const tx = pointerGridPos.x + cell.dx;
          const ty = pointerGridPos.y + cell.dy;
          if (tx >= mapW || ty >= mapH) continue;
          ctx.drawImage(
            tileImg,
            cell.ref.sx,
            cell.ref.sy,
            cell.ref.sw,
            cell.ref.sh,
            tx * scaledTile,
            ty * scaledTile,
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
            ctx.drawImage(
              tileImg,
              ref.sx,
              ref.sy,
              ref.sw,
              ref.sh,
              tx * scaledTile,
              ty * scaledTile,
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
      fillMode,
      getGridPos,
      imageLayers,
      layers,
      mapH,
      mapW,
      objectLayers,
      overlayCanvasRef,
      scaledTile,
      selectedTile,
      selectedTileSize,
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
      const sx = sel.x * scaledTile;
      const sy = sel.y * scaledTile;
      const sw = sel.width * scaledTile;
      const sh = sel.height * scaledTile;
      return (
        globalX >= sx &&
        globalX <= sx + sw &&
        globalY >= sy &&
        globalY <= sy + sh
      );
    },
    [scaledTile],
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
        const minX = Math.min(...polygonPoints.map((p) => p.x));
        const minY = Math.min(...polygonPoints.map((p) => p.y));
        const maxX = Math.max(...polygonPoints.map((p) => p.x));
        const maxY = Math.max(...polygonPoints.map((p) => p.y));
        const relativePoints = polygonPoints.map((p) => ({
          x: p.x - minX,
          y: p.y - minY,
        }));
        onCreateObject(
          "polygon",
          minX,
          minY,
          maxX - minX,
          maxY - minY,
          relativePoints,
        );
        setIsDrawingPolygon(false);
        setPolygonPoints([]);
        setPolygonCursorPos(null);
        lastClickRef.current = null;
      }
    }

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [isDrawingPolygon, polygonPoints, onCreateObject, onCancelPendingObject]);

  // ---------------------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: { x: number; y: number; button?: number }) => {
      // Ignore middle mouse button (1) — reserved for panning
      // Ignore right mouse button (2) — reserved for the context menu
      if (e.button === 1 || e.button === 2) return;

      if (currentTool === "select") {
        // --- Object placement mode ---
        if (pendingObjectType) {
          if (pendingObjectType === "polygon") {
            const px = e.x / zoom;
            const py = e.y / zoom;

            // Detect double-click manually
            const now = Date.now();
            const last = lastClickRef.current;
            const isDoubleClick =
              last !== null &&
              now - last.time < 400 &&
              Math.hypot(e.x - last.x, e.y - last.y) < 12;
            lastClickRef.current = { time: now, x: e.x, y: e.y };

            if (!isDrawingPolygon) {
              setIsDrawingPolygon(true);
              setPolygonPoints([{ x: px, y: py }]);
              setPolygonCursorPos({ x: px, y: py });
            } else {
              const closePolygon = (pts: { x: number; y: number }[]) => {
                const minX = Math.min(...pts.map((p) => p.x));
                const minY = Math.min(...pts.map((p) => p.y));
                const maxX = Math.max(...pts.map((p) => p.x));
                const maxY = Math.max(...pts.map((p) => p.y));
                const relativePoints = pts.map((p) => ({
                  x: p.x - minX,
                  y: p.y - minY,
                }));
                onCreateObject(
                  "polygon",
                  minX,
                  minY,
                  maxX - minX,
                  maxY - minY,
                  relativePoints,
                );
                setIsDrawingPolygon(false);
                setPolygonPoints([]);
                setPolygonCursorPos(null);
                lastClickRef.current = null;
              };

              const first = polygonPoints[0];
              const distToFirst = Math.hypot(
                (px - first.x) * zoom,
                (py - first.y) * zoom,
              );
              if (polygonPoints.length >= 3 && distToFirst < 15) {
                closePolygon(polygonPoints);
              } else if (isDoubleClick && polygonPoints.length >= 3) {
                closePolygon(polygonPoints);
              } else if (isDoubleClick && polygonPoints.length === 2) {
                const pts = [...polygonPoints, { x: px, y: py }];
                closePolygon(pts);
              } else {
                setPolygonPoints((prev) => [...prev, { x: px, y: py }]);
              }
            }
            return;
          }
          if (pendingObjectType === "point") {
            const px = e.x / zoom;
            const py = e.y / zoom;
            onCreateObject("point", px, py, 0, 0, []);
            return;
          }
          // Rectangle/Ellipse: start click-drag
          objectPlaceRef.current = {
            type: pendingObjectType,
            startX: e.x,
            startY: e.y,
          };
          const px = e.x / zoom;
          const py = e.y / zoom;
          setLiveObjectPlace({
            type: pendingObjectType,
            x: px,
            y: py,
            width: 0,
            height: 0,
          });
          return;
        }

        // --- Object resize handle hit test ---
        const activeObj = objects.find((o) => o.id === activeObjectId);
        if (activeObj && isBoxObjectType(activeObj)) {
          const handles = getBoxObjectHandlePositions(
            activeObj,
            zoom,
            getObjectInteractionOverrides(
              activeObj,
              liveObjectPos,
              liveObjectResize,
            ),
          );
          const hSize = 8;
          for (const [handle, cx, cy] of handles) {
            if (Math.abs(e.x - cx) <= hSize && Math.abs(e.y - cy) <= hSize) {
              objectResizeRef.current = {
                objectId: activeObj.id,
                handle,
                startX: e.x,
                startY: e.y,
                origX: activeObj.x,
                origY: activeObj.y,
                origWidth: activeObj.width,
                origHeight: activeObj.height,
              };
              return;
            }
          }
        }

        // --- Polygon vertex drag hit test ---
        if (activeObj && activeObj.type === "polygon") {
          const aox = activeObj.x * zoom;
          const aoy = activeObj.y * zoom;
          for (let i = 0; i < activeObj.points.length; i++) {
            const vx = aox + activeObj.points[i].x * zoom;
            const vy = aoy + activeObj.points[i].y * zoom;
            if (Math.abs(e.x - vx) <= 8 && Math.abs(e.y - vy) <= 8) {
              polyVertexDragRef.current = {
                objectId: activeObj.id,
                vertexIndex: i,
                startX: e.x,
                startY: e.y,
                origPoint: { ...activeObj.points[i] },
              };
              return;
            }
          }
        }

        // --- Object body hit test ---
        const isObjLayer = objectLayers.some((l) => l.id === activeLayerId);
        if (isObjLayer) {
          const layerObjects = objects
            .filter((o) => o.layerId === activeLayerId && o.visible)
            .reverse();
          for (const obj of layerObjects) {
            if (pointHitsObjectBody(obj, e.x, e.y, zoom)) {
              const now = Date.now();
              const lastObjClick = lastObjectClickRef.current;
              const isObjDoubleClick =
                lastObjClick !== null &&
                lastObjClick.objectId === obj.id &&
                now - lastObjClick.time < 400 &&
                Math.hypot(e.x - lastObjClick.x, e.y - lastObjClick.y) < 12;
              lastObjectClickRef.current = {
                time: now,
                x: e.x,
                y: e.y,
                objectId: obj.id,
              };

              if (isObjDoubleClick) {
                onDoubleClickObject?.(obj.id);
                lastObjectClickRef.current = null;
                return;
              }

              onSelectObject(obj.id);
              if (!obj.locked) {
                objectDragRef.current = {
                  objectId: obj.id,
                  startX: e.x,
                  startY: e.y,
                  origX: obj.x,
                  origY: obj.y,
                };
                setIsMoving(true);
              }
              return;
            }
          }
          onSelectObject(null);
          return;
        }

        // --- Image layer resize handle hit test ---
        const resizeHandle = hitTestResizeHandle(e.x, e.y);
        if (resizeHandle) {
          const resizeImgLayer = imageLayers.find(
            (l) => l.id === activeLayerId,
          );
          if (resizeImgLayer) {
            imageResizeRef.current = {
              layerId: resizeImgLayer.id,
              handle: resizeHandle,
              startX: e.x,
              startY: e.y,
              origX: resizeImgLayer.x,
              origY: resizeImgLayer.y,
              origWidth: resizeImgLayer.width,
              origHeight: resizeImgLayer.height,
              rotation: resizeImgLayer.rotation ?? 0,
              flipX: resizeImgLayer.flipX ?? false,
              flipY: resizeImgLayer.flipY ?? false,
            };
            setResizingHandle(resizeHandle);
            return;
          }
        }

        // --- Image layer drag ---
        const activeImgLayer = imageLayers.find((l) => l.id === activeLayerId);
        if (activeImgLayer) {
          const interactiveLayer = getInteractiveImageLayer(activeImgLayer);
          if (
            pointInImageLayer(interactiveLayer, {
              x: e.x / zoom,
              y: e.y / zoom,
            })
          ) {
            imageDragRef.current = {
              layerId: activeImgLayer.id,
              startX: e.x,
              startY: e.y,
              origX: interactiveLayer.x,
              origY: interactiveLayer.y,
            };
            setIsMoving(true);
            return;
          }
        }

        const gx = Math.floor(e.x / scaledTile);
        const gy = Math.floor(e.y / scaledTile);

        if (
          renderedSelection &&
          isInsideSelection(e.x, e.y, renderedSelection)
        ) {
          const activeLayer = layers.find((l) => l.id === activeLayerId);
          const tileSnapshot: { dx: number; dy: number; ref: TileRef }[] = [];
          if (activeLayer) {
            for (let dy = 0; dy < renderedSelection.height; dy++) {
              for (let dx = 0; dx < renderedSelection.width; dx++) {
                const key = `${renderedSelection.x + dx},${renderedSelection.y + dy}`;
                const ref = activeLayer.tiles[key];
                if (ref) tileSnapshot.push({ dx, dy, ref });
              }
            }
          }
          selActionRef.current = {
            type: "move",
            offsetX: gx - renderedSelection.x,
            offsetY: gy - renderedSelection.y,
            orig: { ...renderedSelection },
            tiles: tileSnapshot,
          };
          setMoveTilesSnapshot(tileSnapshot);
          setIsMoving(true);
          return;
        }

        // Start drawing a new selection
        if (gx >= 0 && gy >= 0 && gx < mapW && gy < mapH) {
          selActionRef.current = { type: "draw", startX: gx, startY: gy };
          setLiveSelection({ x: gx, y: gy, width: 1, height: 1 });
        }
        return;
      }

      const pos = getGridPos(e.x, e.y);
      if (!pos) return;
      isPaintingRef.current = true;
      onPaintTile(pos.x, pos.y);
    },
    [
      getGridPos,
      onPaintTile,
      currentTool,
      scaledTile,
      mapW,
      mapH,
      renderedSelection,
      isInsideSelection,
      layers,
      activeLayerId,
      imageLayers,
      zoom,
      getInteractiveImageLayer,
      hitTestResizeHandle,
      pendingObjectType,
      objects,
      activeObjectId,
      objectLayers,
      onCreateObject,
      onSelectObject,
      onDoubleClickObject,
      isDrawingPolygon,
      polygonPoints,
      liveObjectPos,
      liveObjectResize,
    ],
  );

  const handlePointerMove = useCallback(
    (e: { x: number; y: number }) => {
      lastPointerPosRef.current = e;
      const pos = getGridPos(e.x, e.y);
      drawOverlayPreview(e, pos);

      if (isDrawingPolygon) {
        setPolygonCursorPos({ x: e.x / zoom, y: e.y / zoom });
      }

      if (currentTool === "select") {
        // Object placement rubber-banding
        const placeAction = objectPlaceRef.current;
        if (placeAction) {
          const startPx = placeAction.startX / zoom;
          const startPy = placeAction.startY / zoom;
          const curPx = e.x / zoom;
          const curPy = e.y / zoom;
          setLiveObjectPlace({
            type: placeAction.type,
            x: Math.min(startPx, curPx),
            y: Math.min(startPy, curPy),
            width: Math.abs(curPx - startPx),
            height: Math.abs(curPy - startPy),
          });
          return;
        }

        // Object resize
        const objResize = objectResizeRef.current;
        if (objResize) {
          const rdx = (e.x - objResize.startX) / zoom;
          const rdy = (e.y - objResize.startY) / zoom;
          const result = computeResize(
            objResize.handle,
            objResize.origX,
            objResize.origY,
            objResize.origWidth,
            objResize.origHeight,
            rdx,
            rdy,
            shiftKeyRef.current,
          );
          setLiveObjectResize({ objectId: objResize.objectId, ...result });
          return;
        }

        // Polygon vertex drag
        const pvDrag = polyVertexDragRef.current;
        if (pvDrag) {
          const dx = (e.x - pvDrag.startX) / zoom;
          const dy = (e.y - pvDrag.startY) / zoom;
          setLivePolyVertex({
            objectId: pvDrag.objectId,
            vertexIndex: pvDrag.vertexIndex,
            x: pvDrag.origPoint.x + dx,
            y: pvDrag.origPoint.y + dy,
          });
          return;
        }

        // Object dragging
        const objDrag = objectDragRef.current;
        if (objDrag) {
          const dx = (e.x - objDrag.startX) / zoom;
          const dy = (e.y - objDrag.startY) / zoom;
          setLiveObjectPos({
            objectId: objDrag.objectId,
            x: Math.round(objDrag.origX + dx),
            y: Math.round(objDrag.origY + dy),
          });
          return;
        }

        // Image layer resize
        const resizeAction = imageResizeRef.current;
        if (resizeAction) {
          const result = resizeImageLayerFromHandle(
            {
              x: resizeAction.origX,
              y: resizeAction.origY,
              width: resizeAction.origWidth,
              height: resizeAction.origHeight,
              rotation: resizeAction.rotation,
              flipX: resizeAction.flipX,
              flipY: resizeAction.flipY,
            },
            resizeAction.handle,
            {
              x: e.x / zoom,
              y: e.y / zoom,
            },
            shiftKeyRef.current,
          );
          setLiveImageResize({ layerId: resizeAction.layerId, ...result });
          return;
        }

        // Image layer dragging
        const imgDrag = imageDragRef.current;
        if (imgDrag) {
          const dx = (e.x - imgDrag.startX) / zoom;
          const dy = (e.y - imgDrag.startY) / zoom;
          setLiveImagePos({
            layerId: imgDrag.layerId,
            x: Math.round(imgDrag.origX + dx),
            y: Math.round(imgDrag.origY + dy),
          });
          return;
        }

        const action = selActionRef.current;
        if (!action) {
          // Hover cursor feedback for image layer resize handles
          const handle = hitTestResizeHandle(e.x, e.y);
          setHoveredHandle(handle);

          // Hover cursor feedback for object layer
          const isObjLayerActive = objectLayers.some(
            (l) => l.id === activeLayerId,
          );
          if (isObjLayerActive && !handle) {
            let objCursor: string | null = null;

            const activeObj = objects.find((o) => o.id === activeObjectId);
            if (activeObj && isBoxObjectType(activeObj)) {
              const objHandles = getBoxObjectHandlePositions(
                activeObj,
                zoom,
                getObjectInteractionOverrides(
                  activeObj,
                  liveObjectPos,
                  liveObjectResize,
                ),
              );
              const hSize = 8;
              for (const [h, cx, cy] of objHandles) {
                if (
                  Math.abs(e.x - cx) <= hSize &&
                  Math.abs(e.y - cy) <= hSize
                ) {
                  objCursor = RESIZE_CURSORS[h];
                  break;
                }
              }
            }

            if (!objCursor && activeObj && activeObj.type === "polygon") {
              const aox = activeObj.x * zoom;
              const aoy = activeObj.y * zoom;
              for (const pt of activeObj.points) {
                const vx = aox + pt.x * zoom;
                const vy = aoy + pt.y * zoom;
                if (Math.abs(e.x - vx) <= 8 && Math.abs(e.y - vy) <= 8) {
                  objCursor = "pointer";
                  break;
                }
              }
            }

            if (!objCursor) {
              const layerObjects = objects
                .filter((o) => o.layerId === activeLayerId && o.visible)
                .reverse();
              for (const obj of layerObjects) {
                if (pointHitsObjectBody(obj, e.x, e.y, zoom)) {
                  objCursor = obj.locked ? "not-allowed" : "move";
                  break;
                }
              }
            }

            setHoveredObjectCursor(objCursor);
          } else if (!isObjLayerActive) {
            setHoveredObjectCursor(null);
          }

          return;
        }

        const gx = Math.floor(e.x / scaledTile);
        const gy = Math.floor(e.y / scaledTile);

        if (action.type === "draw") {
          const x1 = Math.min(
            action.startX,
            Math.max(0, Math.min(gx, mapW - 1)),
          );
          const y1 = Math.min(
            action.startY,
            Math.max(0, Math.min(gy, mapH - 1)),
          );
          const x2 = Math.max(
            action.startX,
            Math.max(0, Math.min(gx, mapW - 1)),
          );
          const y2 = Math.max(
            action.startY,
            Math.max(0, Math.min(gy, mapH - 1)),
          );
          setLiveSelection({
            x: x1,
            y: y1,
            width: x2 - x1 + 1,
            height: y2 - y1 + 1,
          });
        } else if (action.type === "move") {
          const newX = Math.max(
            0,
            Math.min(gx - action.offsetX, mapW - action.orig.width),
          );
          const newY = Math.max(
            0,
            Math.min(gy - action.offsetY, mapH - action.orig.height),
          );
          setLiveSelection({ ...action.orig, x: newX, y: newY });
        }
        return;
      }

      if (!isPaintingRef.current) return;
      if (currentTool === "fill") return; // fill = single-click only
      if (!pos) return;
      onPaintTile(pos.x, pos.y);
    },
    [
      getGridPos,
      currentTool,
      onPaintTile,
      drawOverlayPreview,
      scaledTile,
      mapW,
      mapH,
      zoom,
      hitTestResizeHandle,
      objects,
      objectLayers,
      activeLayerId,
      activeObjectId,
      isDrawingPolygon,
      liveObjectPos,
      liveObjectResize,
    ],
  );

  const handlePointerUp = useCallback(
    (e?: { button?: number }) => {
      if (e?.button === 1) return;

      if (currentTool === "select" && objectPlaceRef.current) {
        if (
          liveObjectPlace &&
          (liveObjectPlace.width > 2 || liveObjectPlace.height > 2)
        ) {
          onCreateObject(
            liveObjectPlace.type,
            liveObjectPlace.x,
            liveObjectPlace.y,
            liveObjectPlace.width,
            liveObjectPlace.height,
            [],
          );
        }
        objectPlaceRef.current = null;
        setLiveObjectPlace(null);
        return;
      }

      if (currentTool === "select" && objectResizeRef.current) {
        if (liveObjectResize) {
          onResizeObject(
            liveObjectResize.objectId,
            liveObjectResize.x,
            liveObjectResize.y,
            liveObjectResize.width,
            liveObjectResize.height,
          );
          setLiveObjectResize(null);
        }
        objectResizeRef.current = null;
        return;
      }

      if (currentTool === "select" && polyVertexDragRef.current) {
        if (livePolyVertex) {
          const activeObj = objects.find(
            (o) => o.id === livePolyVertex.objectId,
          );
          if (activeObj) {
            const newPoints = activeObj.points.map((p, i) =>
              i === livePolyVertex.vertexIndex
                ? { x: livePolyVertex.x, y: livePolyVertex.y }
                : p,
            );
            onUpdatePolygonPoints(livePolyVertex.objectId, newPoints);
          }
          setLivePolyVertex(null);
        }
        polyVertexDragRef.current = null;
        return;
      }

      if (currentTool === "select" && objectDragRef.current) {
        if (liveObjectPos) {
          onMoveObject(
            liveObjectPos.objectId,
            liveObjectPos.x,
            liveObjectPos.y,
          );
          setLiveObjectPos(null);
        }
        objectDragRef.current = null;
        setIsMoving(false);
        return;
      }

      if (currentTool === "select" && imageResizeRef.current) {
        if (liveImageResize) {
          onResizeImageLayer(
            liveImageResize.layerId,
            liveImageResize.x,
            liveImageResize.y,
            liveImageResize.width,
            liveImageResize.height,
          );
          setLiveImageResize(null);
        }
        imageResizeRef.current = null;
        setResizingHandle(null);
        return;
      }

      if (currentTool === "select" && imageDragRef.current) {
        if (liveImagePos) {
          onMoveImageLayer(
            liveImagePos.layerId,
            liveImagePos.x,
            liveImagePos.y,
          );
          setLiveImagePos(null);
        }
        imageDragRef.current = null;
        setIsMoving(false);
        return;
      }

      if (currentTool === "select" && selActionRef.current) {
        const action = selActionRef.current;
        if (action.type === "move" && liveSelection) {
          const movedX = liveSelection.x !== action.orig.x;
          const movedY = liveSelection.y !== action.orig.y;
          if (movedX || movedY) {
            onMoveTiles(action.orig, liveSelection.x, liveSelection.y);
          }
        }
        onSelectionChange(liveSelection);
        setLiveSelection(null);
        setIsMoving(false);
        setMoveTilesSnapshot(null);
        selActionRef.current = null;
        return;
      }

      isPaintingRef.current = false;
      onPaintEnd();
    },
    [
      onPaintEnd,
      currentTool,
      liveSelection,
      onSelectionChange,
      onMoveTiles,
      liveImagePos,
      onMoveImageLayer,
      liveImageResize,
      onResizeImageLayer,
      liveObjectPlace,
      onCreateObject,
      liveObjectResize,
      onResizeObject,
      liveObjectPos,
      onMoveObject,
      livePolyVertex,
      objects,
      onUpdatePolygonPoints,
    ],
  );

  const handlePointerLeave = useCallback(() => {
    lastPointerPosRef.current = null;
    fillPreviewCacheRef.current.tileKey = null;
    fillPreviewCacheRef.current.region = [];
    clearOverlay();

    if (currentTool === "select" && objectPlaceRef.current) {
      objectPlaceRef.current = null;
      setLiveObjectPlace(null);
      return;
    }
    if (currentTool === "select" && objectResizeRef.current) {
      if (liveObjectResize) {
        onResizeObject(
          liveObjectResize.objectId,
          liveObjectResize.x,
          liveObjectResize.y,
          liveObjectResize.width,
          liveObjectResize.height,
        );
        setLiveObjectResize(null);
      }
      objectResizeRef.current = null;
      return;
    }
    if (currentTool === "select" && polyVertexDragRef.current) {
      if (livePolyVertex) {
        const activeObj = objects.find((o) => o.id === livePolyVertex.objectId);
        if (activeObj) {
          const newPoints = activeObj.points.map((p, i) =>
            i === livePolyVertex.vertexIndex
              ? { x: livePolyVertex.x, y: livePolyVertex.y }
              : p,
          );
          onUpdatePolygonPoints(livePolyVertex.objectId, newPoints);
        }
        setLivePolyVertex(null);
      }
      polyVertexDragRef.current = null;
      return;
    }
    if (currentTool === "select" && objectDragRef.current) {
      if (liveObjectPos) {
        onMoveObject(liveObjectPos.objectId, liveObjectPos.x, liveObjectPos.y);
        setLiveObjectPos(null);
      }
      objectDragRef.current = null;
      setIsMoving(false);
      return;
    }
    if (currentTool === "select" && imageResizeRef.current) {
      if (liveImageResize) {
        onResizeImageLayer(
          liveImageResize.layerId,
          liveImageResize.x,
          liveImageResize.y,
          liveImageResize.width,
          liveImageResize.height,
        );
        setLiveImageResize(null);
      }
      imageResizeRef.current = null;
      setResizingHandle(null);
      return;
    }
    if (currentTool === "select" && imageDragRef.current) {
      if (liveImagePos) {
        onMoveImageLayer(liveImagePos.layerId, liveImagePos.x, liveImagePos.y);
        setLiveImagePos(null);
      }
      imageDragRef.current = null;
      setIsMoving(false);
      return;
    }
    if (currentTool === "select" && selActionRef.current) {
      const action = selActionRef.current;
      if (action.type === "move" && liveSelection) {
        const movedX = liveSelection.x !== action.orig.x;
        const movedY = liveSelection.y !== action.orig.y;
        if (movedX || movedY) {
          onMoveTiles(action.orig, liveSelection.x, liveSelection.y);
        }
      }
      onSelectionChange(liveSelection);
      setLiveSelection(null);
      setIsMoving(false);
      setMoveTilesSnapshot(null);
      selActionRef.current = null;
      return;
    }
    if (isPaintingRef.current) {
      isPaintingRef.current = false;
      onPaintEnd();
    }
  }, [
    onPaintEnd,
    currentTool,
    liveSelection,
    onSelectionChange,
    onMoveTiles,
    liveImagePos,
    onMoveImageLayer,
    liveImageResize,
    onResizeImageLayer,
    liveObjectPos,
    onMoveObject,
    liveObjectResize,
    onResizeObject,
    livePolyVertex,
    objects,
    onUpdatePolygonPoints,
    clearOverlay,
  ]);

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
