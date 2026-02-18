/**
 * useSceneInteraction — encapsulates all pointer-driven interaction state and
 * handlers for the map canvas: painting, tile selection, image layer drag/resize,
 * object drag/resize/placement, and polygon drawing.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Graphics } from "pixi.js";
import type {
  ImageLayer,
  ObjectLayer,
  MapObject,
  ObjectType,
  TileLayer,
  TileRef,
  EditorState,
  MapSelection,
} from "@/types";
import type { MapCanvasProps, ResizeHandle } from "./types";
import { computeResize, RESIZE_CURSORS } from "./resize-utils";

// ---------------------------------------------------------------------------
// Internal action types (private to this hook)
// ---------------------------------------------------------------------------

type SelectionAction =
  | { type: "draw"; startX: number; startY: number }
  | {
      type: "move";
      offsetX: number;
      offsetY: number;
      orig: MapSelection;
      tiles: { dx: number; dy: number; ref: TileRef }[];
    };

type ImageDragAction = {
  layerId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
};

type ImageResizeAction = {
  layerId: string;
  handle: ResizeHandle;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origWidth: number;
  origHeight: number;
};

type ObjectPlaceAction = {
  type: ObjectType;
  startX: number;
  startY: number;
};

type ObjectDragAction = {
  objectId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
};

type ObjectResizeAction = {
  objectId: string;
  handle: ResizeHandle;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origWidth: number;
  origHeight: number;
};

type PolyVertexDragAction = {
  objectId: string;
  vertexIndex: number;
  startX: number;
  startY: number;
  origPoint: { x: number; y: number };
};

// ---------------------------------------------------------------------------
// Hook inputs / outputs
// ---------------------------------------------------------------------------

interface UseSceneInteractionParams {
  layers: TileLayer[];
  zoom: number;
  activeLayerId: string | null;
  currentTool: EditorState["currentTool"];
  brushSize: EditorState["brushSize"];
  onPaintTile: MapCanvasProps["onPaintTile"];
  onPaintEnd: MapCanvasProps["onPaintEnd"];
  mapSelection: MapSelection | null;
  onSelectionChange: MapCanvasProps["onSelectionChange"];
  onMoveTiles: MapCanvasProps["onMoveTiles"];
  imageLayers: ImageLayer[];
  onMoveImageLayer: MapCanvasProps["onMoveImageLayer"];
  onResizeImageLayer: MapCanvasProps["onResizeImageLayer"];
  objectLayers: ObjectLayer[];
  objects: MapObject[];
  activeObjectId: string | null;
  pendingObjectType: ObjectType | null;
  onCreateObject: MapCanvasProps["onCreateObject"];
  onMoveObject: MapCanvasProps["onMoveObject"];
  onResizeObject: MapCanvasProps["onResizeObject"];
  onUpdatePolygonPoints: MapCanvasProps["onUpdatePolygonPoints"];
  onSelectObject: MapCanvasProps["onSelectObject"];
  onCancelPendingObject?: MapCanvasProps["onCancelPendingObject"];
  onDoubleClickObject?: MapCanvasProps["onDoubleClickObject"];
  scaledTile: number;
  mapW: number;
  mapH: number;
}

export interface UseSceneInteractionReturn {
  // Imperative hover graphics ref + stable noop draw prop
  hoverGraphicsRef: React.RefObject<Graphics | null>;
  hoverDrawNoop: (_g: Graphics) => void;
  hoverTile: { x: number; y: number } | null;

  // Selection
  renderedSelection: MapSelection | null;
  liveSelection: MapSelection | null;
  moveTilesSnapshot: { dx: number; dy: number; ref: TileRef }[] | null;

  // Image layer live state
  liveImagePos: { layerId: string; x: number; y: number } | null;
  liveImageResize: {
    layerId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;

  // Object live state
  liveObjectPos: { objectId: string; x: number; y: number } | null;
  liveObjectResize: {
    objectId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  liveObjectPlace: {
    type: ObjectType;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  livePolyVertex: {
    objectId: string;
    vertexIndex: number;
    x: number;
    y: number;
  } | null;

  // Polygon drawing
  isDrawingPolygon: boolean;
  polygonPoints: { x: number; y: number }[];
  polygonCursorPos: { x: number; y: number } | null;

  // Cursor / drag feedback
  isMoving: boolean;
  resizingHandle: ResizeHandle | null;
  hoveredHandle: ResizeHandle | null;
  hoveredObjectCursor: string | null;

  // Pointer handlers
  handlePointerDown: (e: {
    global: { x: number; y: number };
    button?: number;
  }) => void;
  handlePointerMove: (e: { global: { x: number; y: number } }) => void;
  handlePointerUp: (e?: { button?: number }) => void;
  handlePointerLeave: () => void;
}

// Stable no-op so @pixi/react never overwrites imperative hover content
const HOVER_DRAW_NOOP: (g: Graphics) => void = () => {};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSceneInteraction({
  layers,
  zoom,
  activeLayerId,
  currentTool,
  brushSize,
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
  scaledTile,
  mapW,
  mapH,
}: UseSceneInteractionParams): UseSceneInteractionReturn {
  const isPaintingRef = useRef(false);
  const hoverGraphicsRef = useRef<Graphics | null>(null);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(
    null,
  );

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

  const getImageLayerHandles = useCallback(
    (imgLayer: ImageLayer): [ResizeHandle, number, number][] => {
      const resize =
        liveImageResize?.layerId === imgLayer.id ? liveImageResize : null;
      const drag = liveImagePos?.layerId === imgLayer.id ? liveImagePos : null;
      const px = (resize?.x ?? drag?.x ?? imgLayer.x) * zoom;
      const py = (resize?.y ?? drag?.y ?? imgLayer.y) * zoom;
      const pw = (resize?.width ?? imgLayer.width) * zoom;
      const ph = (resize?.height ?? imgLayer.height) * zoom;
      return [
        ["nw", px, py],
        ["n", px + pw / 2, py],
        ["ne", px + pw, py],
        ["w", px, py + ph / 2],
        ["e", px + pw, py + ph / 2],
        ["sw", px, py + ph],
        ["s", px + pw / 2, py + ph],
        ["se", px + pw, py + ph],
      ];
    },
    [zoom, liveImageResize, liveImagePos],
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
  // Clear hover box when switching tools
  // ---------------------------------------------------------------------------
  useEffect(() => {
    hoverGraphicsRef.current?.clear();
  }, [currentTool]);

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
    (e: { global: { x: number; y: number }; button?: number }) => {
      // Ignore middle mouse button (1) — reserved for panning
      // Ignore right mouse button (2) — reserved for the context menu
      if (e.button === 1 || e.button === 2) return;

      if (currentTool === "select") {
        // --- Object placement mode ---
        if (pendingObjectType) {
          if (pendingObjectType === "polygon") {
            const px = e.global.x / zoom;
            const py = e.global.y / zoom;

            // Detect double-click manually (PixiJS doesn't support dblclick)
            const now = Date.now();
            const last = lastClickRef.current;
            const isDoubleClick =
              last !== null &&
              now - last.time < 400 &&
              Math.hypot(e.global.x - last.x, e.global.y - last.y) < 12;
            lastClickRef.current = { time: now, x: e.global.x, y: e.global.y };

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
            const px = e.global.x / zoom;
            const py = e.global.y / zoom;
            onCreateObject("point", px, py, 0, 0, []);
            return;
          }
          // Rectangle/Ellipse: start click-drag
          objectPlaceRef.current = {
            type: pendingObjectType,
            startX: e.global.x,
            startY: e.global.y,
          };
          const px = e.global.x / zoom;
          const py = e.global.y / zoom;
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
        if (
          activeObj &&
          (activeObj.type === "rectangle" || activeObj.type === "ellipse")
        ) {
          const resize =
            liveObjectResize?.objectId === activeObj.id
              ? liveObjectResize
              : null;
          const drag =
            liveObjectPos?.objectId === activeObj.id ? liveObjectPos : null;
          const aox = (resize?.x ?? drag?.x ?? activeObj.x) * zoom;
          const aoy = (resize?.y ?? drag?.y ?? activeObj.y) * zoom;
          const aow = (resize?.width ?? activeObj.width) * zoom;
          const aoh = (resize?.height ?? activeObj.height) * zoom;
          const handles: [ResizeHandle, number, number][] = [
            ["nw", aox, aoy],
            ["n", aox + aow / 2, aoy],
            ["ne", aox + aow, aoy],
            ["w", aox, aoy + aoh / 2],
            ["e", aox + aow, aoy + aoh / 2],
            ["sw", aox, aoy + aoh],
            ["s", aox + aow / 2, aoy + aoh],
            ["se", aox + aow, aoy + aoh],
          ];
          const hSize = 8;
          for (const [handle, cx, cy] of handles) {
            if (
              Math.abs(e.global.x - cx) <= hSize &&
              Math.abs(e.global.y - cy) <= hSize
            ) {
              objectResizeRef.current = {
                objectId: activeObj.id,
                handle,
                startX: e.global.x,
                startY: e.global.y,
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
            if (
              Math.abs(e.global.x - vx) <= 8 &&
              Math.abs(e.global.y - vy) <= 8
            ) {
              polyVertexDragRef.current = {
                objectId: activeObj.id,
                vertexIndex: i,
                startX: e.global.x,
                startY: e.global.y,
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
            const ox = obj.x * zoom;
            const oy = obj.y * zoom;
            const ow = obj.width * zoom;
            const oh = obj.height * zoom;
            let hit = false;
            if (obj.type === "rectangle" || obj.type === "ellipse") {
              hit =
                e.global.x >= ox &&
                e.global.x <= ox + ow &&
                e.global.y >= oy &&
                e.global.y <= oy + oh;
            } else if (obj.type === "point") {
              const ps = 8 * zoom;
              hit =
                Math.abs(e.global.x - ox) <= ps &&
                Math.abs(e.global.y - oy) <= ps;
            } else if (obj.type === "polygon" && obj.points.length >= 3) {
              const pts = obj.points;
              const minX = Math.min(...pts.map((p) => p.x)) * zoom + ox;
              const maxX = Math.max(...pts.map((p) => p.x)) * zoom + ox;
              const minY = Math.min(...pts.map((p) => p.y)) * zoom + oy;
              const maxY = Math.max(...pts.map((p) => p.y)) * zoom + oy;
              hit =
                e.global.x >= minX &&
                e.global.x <= maxX &&
                e.global.y >= minY &&
                e.global.y <= maxY;
            }
            if (hit) {
              const now = Date.now();
              const lastObjClick = lastObjectClickRef.current;
              const isObjDoubleClick =
                lastObjClick !== null &&
                lastObjClick.objectId === obj.id &&
                now - lastObjClick.time < 400 &&
                Math.hypot(
                  e.global.x - lastObjClick.x,
                  e.global.y - lastObjClick.y,
                ) < 12;
              lastObjectClickRef.current = {
                time: now,
                x: e.global.x,
                y: e.global.y,
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
                  startX: e.global.x,
                  startY: e.global.y,
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
        const resizeHandle = hitTestResizeHandle(e.global.x, e.global.y);
        if (resizeHandle) {
          const resizeImgLayer = imageLayers.find(
            (l) => l.id === activeLayerId,
          );
          if (resizeImgLayer) {
            imageResizeRef.current = {
              layerId: resizeImgLayer.id,
              handle: resizeHandle,
              startX: e.global.x,
              startY: e.global.y,
              origX: resizeImgLayer.x,
              origY: resizeImgLayer.y,
              origWidth: resizeImgLayer.width,
              origHeight: resizeImgLayer.height,
            };
            setResizingHandle(resizeHandle);
            return;
          }
        }

        // --- Image layer drag ---
        const activeImgLayer = imageLayers.find((l) => l.id === activeLayerId);
        if (activeImgLayer) {
          const imgX = activeImgLayer.x * zoom;
          const imgY = activeImgLayer.y * zoom;
          const imgW = activeImgLayer.width * zoom;
          const imgH = activeImgLayer.height * zoom;
          const posX =
            liveImagePos?.layerId === activeImgLayer.id
              ? liveImagePos.x * zoom
              : imgX;
          const posY =
            liveImagePos?.layerId === activeImgLayer.id
              ? liveImagePos.y * zoom
              : imgY;
          if (
            e.global.x >= posX &&
            e.global.x <= posX + imgW &&
            e.global.y >= posY &&
            e.global.y <= posY + imgH
          ) {
            imageDragRef.current = {
              layerId: activeImgLayer.id,
              startX: e.global.x,
              startY: e.global.y,
              origX:
                liveImagePos?.layerId === activeImgLayer.id
                  ? liveImagePos.x
                  : activeImgLayer.x,
              origY:
                liveImagePos?.layerId === activeImgLayer.id
                  ? liveImagePos.y
                  : activeImgLayer.y,
            };
            setIsMoving(true);
            return;
          }
        }

        const gx = Math.floor(e.global.x / scaledTile);
        const gy = Math.floor(e.global.y / scaledTile);

        if (
          renderedSelection &&
          isInsideSelection(e.global.x, e.global.y, renderedSelection)
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

      const pos = getGridPos(e.global.x, e.global.y);
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
      liveImagePos,
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
    (e: { global: { x: number; y: number } }) => {
      const pos = getGridPos(e.global.x, e.global.y);

      // Draw the yellow hover box directly on the Pixi Graphics node — no
      // React state update, no re-render.
      const hg = hoverGraphicsRef.current;
      if (hg) {
        hg.clear();
        if (pos && currentTool !== "select") {
          const brushNum = currentTool === "fill" ? 1 : parseInt(brushSize);
          const hx = pos.x * scaledTile;
          const hy = pos.y * scaledTile;
          const hw = Math.min(brushNum, mapW - pos.x) * scaledTile;
          const hh = Math.min(brushNum, mapH - pos.y) * scaledTile;
          hg.rect(hx, hy, hw, hh);
          hg.fill({ color: 0xffa500, alpha: 0.2 });
          hg.setStrokeStyle({ width: 2, color: 0xffa500, alpha: 0.8 });
          hg.rect(hx, hy, hw, hh);
          hg.stroke();
        }
      }

      setHoverTile(pos);

      if (isDrawingPolygon) {
        setPolygonCursorPos({ x: e.global.x / zoom, y: e.global.y / zoom });
      }

      if (currentTool === "select") {
        // Object placement rubber-banding
        const placeAction = objectPlaceRef.current;
        if (placeAction) {
          const startPx = placeAction.startX / zoom;
          const startPy = placeAction.startY / zoom;
          const curPx = e.global.x / zoom;
          const curPy = e.global.y / zoom;
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
          const rdx = (e.global.x - objResize.startX) / zoom;
          const rdy = (e.global.y - objResize.startY) / zoom;
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
          const dx = (e.global.x - pvDrag.startX) / zoom;
          const dy = (e.global.y - pvDrag.startY) / zoom;
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
          const dx = (e.global.x - objDrag.startX) / zoom;
          const dy = (e.global.y - objDrag.startY) / zoom;
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
          const rdx = (e.global.x - resizeAction.startX) / zoom;
          const rdy = (e.global.y - resizeAction.startY) / zoom;
          const result = computeResize(
            resizeAction.handle,
            resizeAction.origX,
            resizeAction.origY,
            resizeAction.origWidth,
            resizeAction.origHeight,
            rdx,
            rdy,
            shiftKeyRef.current,
          );
          setLiveImageResize({ layerId: resizeAction.layerId, ...result });
          return;
        }

        // Image layer dragging
        const imgDrag = imageDragRef.current;
        if (imgDrag) {
          const dx = (e.global.x - imgDrag.startX) / zoom;
          const dy = (e.global.y - imgDrag.startY) / zoom;
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
          const handle = hitTestResizeHandle(e.global.x, e.global.y);
          setHoveredHandle(handle);

          // Hover cursor feedback for object layer
          const isObjLayerActive = objectLayers.some(
            (l) => l.id === activeLayerId,
          );
          if (isObjLayerActive && !handle) {
            let objCursor: string | null = null;

            const activeObj = objects.find((o) => o.id === activeObjectId);
            if (
              activeObj &&
              (activeObj.type === "rectangle" || activeObj.type === "ellipse")
            ) {
              const aox = activeObj.x * zoom;
              const aoy = activeObj.y * zoom;
              const aow = activeObj.width * zoom;
              const aoh = activeObj.height * zoom;
              const objHandles: [ResizeHandle, number, number][] = [
                ["nw", aox, aoy],
                ["n", aox + aow / 2, aoy],
                ["ne", aox + aow, aoy],
                ["w", aox, aoy + aoh / 2],
                ["e", aox + aow, aoy + aoh / 2],
                ["sw", aox, aoy + aoh],
                ["s", aox + aow / 2, aoy + aoh],
                ["se", aox + aow, aoy + aoh],
              ];
              const hSize = 8;
              for (const [h, cx, cy] of objHandles) {
                if (
                  Math.abs(e.global.x - cx) <= hSize &&
                  Math.abs(e.global.y - cy) <= hSize
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
                if (
                  Math.abs(e.global.x - vx) <= 8 &&
                  Math.abs(e.global.y - vy) <= 8
                ) {
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
                const ox = obj.x * zoom;
                const oy = obj.y * zoom;
                const ow = obj.width * zoom;
                const oh = obj.height * zoom;
                let hit = false;
                if (obj.type === "rectangle" || obj.type === "ellipse") {
                  hit =
                    e.global.x >= ox &&
                    e.global.x <= ox + ow &&
                    e.global.y >= oy &&
                    e.global.y <= oy + oh;
                } else if (obj.type === "point") {
                  const ps = 8 * zoom;
                  hit =
                    Math.abs(e.global.x - ox) <= ps &&
                    Math.abs(e.global.y - oy) <= ps;
                } else if (obj.type === "polygon" && obj.points.length >= 3) {
                  const pts = obj.points;
                  const minPx = Math.min(...pts.map((p) => p.x)) * zoom + ox;
                  const maxPx = Math.max(...pts.map((p) => p.x)) * zoom + ox;
                  const minPy = Math.min(...pts.map((p) => p.y)) * zoom + oy;
                  const maxPy = Math.max(...pts.map((p) => p.y)) * zoom + oy;
                  hit =
                    e.global.x >= minPx &&
                    e.global.x <= maxPx &&
                    e.global.y >= minPy &&
                    e.global.y <= maxPy;
                }
                if (hit) {
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

        const gx = Math.floor(e.global.x / scaledTile);
        const gy = Math.floor(e.global.y / scaledTile);

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
      brushSize,
      onPaintTile,
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
    setHoverTile(null);
    hoverGraphicsRef.current?.clear();

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
  ]);

  return {
    hoverGraphicsRef,
    hoverDrawNoop: HOVER_DRAW_NOOP,
    hoverTile,
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
