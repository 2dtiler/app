/**
 * PixiJS-powered map canvas for high-performance tile rendering.
 *
 * Replaces the previous Canvas2D renderer with a proper scene graph:
 *  - Checkerboard background (pixiGraphics)
 *  - One pixiContainer per layer (visibility toggle via container.visible)
 *  - pixiSprite per tile, using Texture sub-regions from tileset images
 *  - Grid overlay (pixiGraphics)
 *  - Hover tile preview (pixiGraphics + pixiSprite)
 *  - Event handling for painting via pointer events on a hit-area overlay
 */

import { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";
import { Application, extend, useApplication } from "@pixi/react";
import {
  Container,
  Sprite,
  Graphics,
  Texture,
  Rectangle,
  ImageSource,
} from "pixi.js";
import { getAssetUrl } from "@/lib/db";
import type {
  AssetId,
  TileMapData,
  TileLayer,
  ImageLayer,
  ObjectLayer,
  MapObject,
  ObjectType,
  TileRef,
  TilesetId,
  EditorState,
  MapSelection,
} from "@/types";

// Register Pixi components for JSX usage
extend({ Container, Sprite, Graphics });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MapCanvasProps {
  map: TileMapData;
  layers: TileLayer[];
  tilesets: EditorState["project"] extends infer P
    ? P extends { tilesets: infer T }
      ? T
      : never
    : never;
  zoom: number;
  activeLayerId: string | null;
  currentTool: EditorState["currentTool"];
  brushSize: EditorState["brushSize"];
  selectedTile: EditorState["selectedTile"];
  onPaintTile: (gx: number, gy: number) => void;
  onPaintEnd: () => void;
  /** Uncommitted tile changes for instant visual feedback during a stroke */
  paintBuffer: Map<string, TileRef | null>;
  /** Incremented to trigger re-render when buffer contents change */
  paintBufferVersion: number;
  /** Current selection rectangle (tile coords), null if none */
  mapSelection: MapSelection | null;
  /** Called when user creates/modifies the selection */
  onSelectionChange: (selection: MapSelection | null) => void;
  /** Called when user drops a moved selection — moves tiles from src to dest */
  onMoveTiles: (src: MapSelection, destX: number, destY: number) => void;
  /** Image layers to render (already flattened with visibility applied) */
  imageLayers: ImageLayer[];
  /** Called when an image layer is moved via drag */
  onMoveImageLayer: (layerId: string, x: number, y: number) => void;
  /** Called when an image layer is resized via drag handles */
  onResizeImageLayer: (
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  /** Object layers to render (already flattened with visibility applied) */
  objectLayers: ObjectLayer[];
  /** All map objects belonging to visible object layers */
  objects: MapObject[];
  /** Currently selected object ID */
  activeObjectId: string | null;
  /** Pending object type being placed (null if not placing) */
  pendingObjectType: ObjectType | null;
  /** Called when a new object is placed on the canvas */
  onCreateObject: (
    type: ObjectType,
    x: number,
    y: number,
    width: number,
    height: number,
    points: { x: number; y: number }[],
  ) => void;
  /** Called when an object is moved */
  onMoveObject: (objectId: string, x: number, y: number) => void;
  /** Called when an object is resized */
  onResizeObject: (
    objectId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  /** Called when polygon points are updated */
  onUpdatePolygonPoints: (
    objectId: string,
    points: { x: number; y: number }[],
  ) => void;
  /** Called when an object is selected/deselected on canvas */
  onSelectObject: (objectId: string | null) => void;
  /** Called when user cancels pending object placement (e.g. Escape during polygon drawing) */
  onCancelPendingObject?: () => void;
  /** Called when an object is double-clicked on canvas (to open properties) */
  onDoubleClickObject?: (objectId: string) => void;
}

// ---------------------------------------------------------------------------
// Texture cache — loads tileset images as Pixi Textures
// ---------------------------------------------------------------------------

const textureCache = new Map<string, Texture>();
const textureBlobUrls = new Map<string, string>();
const loadingTextures = new Set<string>();

async function loadTilesetTexture(
  tilesetId: TilesetId,
  assetId: AssetId,
): Promise<Texture | null> {
  if (textureCache.has(tilesetId)) return textureCache.get(tilesetId)!;
  if (loadingTextures.has(tilesetId)) return null;

  loadingTextures.add(tilesetId);
  try {
    const url = await getAssetUrl(assetId);
    if (!url) return null;
    textureBlobUrls.set(tilesetId, url);

    // Load the image natively to avoid PixiJS Assets loader not being able
    // to detect the file type from blob URLs.
    const img = new Image();
    img.src = url;
    await img.decode();

    const source = new ImageSource({ resource: img });
    const texture = new Texture({ source });
    textureCache.set(tilesetId, texture);
    return texture;
  } catch {
    return null;
  } finally {
    loadingTextures.delete(tilesetId);
  }
}

// ---------------------------------------------------------------------------
// Image layer texture cache — loads image layer assets as Pixi Textures
// ---------------------------------------------------------------------------

const imageLayerTextureCache = new Map<string, Texture>();
const imageLayerBlobUrls = new Map<string, string>();
const loadingImageLayers = new Set<string>();

async function loadImageLayerTexture(
  assetId: AssetId,
): Promise<Texture | null> {
  if (imageLayerTextureCache.has(assetId))
    return imageLayerTextureCache.get(assetId)!;
  if (loadingImageLayers.has(assetId)) return null;

  loadingImageLayers.add(assetId);
  try {
    const url = await getAssetUrl(assetId);
    if (!url) return null;
    imageLayerBlobUrls.set(assetId, url);

    const img = new Image();
    img.src = url;
    await img.decode();

    const source = new ImageSource({ resource: img });
    const texture = new Texture({ source });
    imageLayerTextureCache.set(assetId, texture);
    return texture;
  } catch {
    return null;
  } finally {
    loadingImageLayers.delete(assetId);
  }
}

/**
 * Evict cached textures for tilesets no longer referenced, freeing GPU memory
 * and revoking object URLs. Called when the set of needed tilesets changes.
 */
function evictUnusedTextures(activeIds: Set<TilesetId>): void {
  for (const [id] of textureCache) {
    if (!activeIds.has(id as TilesetId)) {
      const tex = textureCache.get(id);
      if (tex) tex.destroy(true);
      textureCache.delete(id);
      const url = textureBlobUrls.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        textureBlobUrls.delete(id);
      }
    }
  }
}

function getTileTexture(ref: TileRef): Texture | null {
  const base = textureCache.get(ref.tilesetId);
  if (!base) return null;

  // Create a sub-texture with the correct frame
  const frame = new Rectangle(ref.sx, ref.sy, ref.sw, ref.sh);
  try {
    return new Texture({ source: base.source, frame });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resize handle helpers
// ---------------------------------------------------------------------------

const RESIZE_CURSORS: Record<string, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

function computeResize(
  handle: string,
  origX: number,
  origY: number,
  origW: number,
  origH: number,
  deltaX: number,
  deltaY: number,
  shiftKey: boolean,
): { x: number; y: number; width: number; height: number } {
  let left = origX;
  let top = origY;
  let right = origX + origW;
  let bottom = origY + origH;

  const movesLeft = handle === "nw" || handle === "w" || handle === "sw";
  const movesTop = handle === "nw" || handle === "n" || handle === "ne";
  const movesRight = handle === "ne" || handle === "e" || handle === "se";
  const movesBottom = handle === "sw" || handle === "s" || handle === "se";

  if (movesLeft) left += deltaX;
  if (movesTop) top += deltaY;
  if (movesRight) right += deltaX;
  if (movesBottom) bottom += deltaY;

  let w = right - left;
  let h = bottom - top;

  const minSize = 4;
  if (w < minSize) {
    if (movesLeft) left = right - minSize;
    else right = left + minSize;
    w = right - left;
  }
  if (h < minSize) {
    if (movesTop) top = bottom - minSize;
    else bottom = top + minSize;
    h = bottom - top;
  }

  const isCorner = (movesLeft || movesRight) && (movesTop || movesBottom);
  if (shiftKey && isCorner && origW > 0 && origH > 0) {
    const aspect = origW / origH;
    if (Math.abs(w - origW) / origW >= Math.abs(h - origH) / origH) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
    if (movesLeft) left = right - w;
    else right = left + w;
    if (movesTop) top = bottom - h;
    else bottom = top + h;
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(minSize, Math.round(right - left)),
    height: Math.max(minSize, Math.round(bottom - top)),
  };
}

// ---------------------------------------------------------------------------
// Inner scene rendered inside the Pixi Application
// ---------------------------------------------------------------------------

const MapScene = memo(function MapScene({
  map,
  layers,
  zoom,
  activeLayerId,
  currentTool,
  brushSize,
  selectedTile,
  onPaintTile,
  onPaintEnd,
  paintBuffer,
  paintBufferVersion,
  texturesReady,
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
}: MapCanvasProps & { texturesReady: number }) {
  const { app, isInitialised } = useApplication();
  const isPaintingRef = useRef(false);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(
    null,
  );

  // --- Selection interaction state ---
  type SelectionAction =
    | { type: "draw"; startX: number; startY: number }
    | {
        type: "move";
        offsetX: number;
        offsetY: number;
        orig: MapSelection;
        /** Snapshot of tiles in the selection at drag-start */
        tiles: { dx: number; dy: number; ref: TileRef }[];
      };
  const selActionRef = useRef<SelectionAction | null>(null);
  // Live selection for rendering during drag (avoids store round-trips)
  const [liveSelection, setLiveSelection] = useState<MapSelection | null>(null);
  // Tile snapshot mirrored from selActionRef for safe render-time access
  const [moveTilesSnapshot, setMoveTilesSnapshot] = useState<
    { dx: number; dy: number; ref: TileRef }[] | null
  >(null);
  // Whether tiles are currently being dragged (for cursor feedback)
  const [isMoving, setIsMoving] = useState(false);
  // The rendered selection is the live one during interaction, otherwise the prop
  const renderedSelection = liveSelection ?? mapSelection;

  // --- Image layer drag state ---
  type ImageDragAction = {
    layerId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  };
  const imageDragRef = useRef<ImageDragAction | null>(null);
  const [liveImagePos, setLiveImagePos] = useState<{
    layerId: string;
    x: number;
    y: number;
  } | null>(null);

  // --- Image layer resize state ---
  type ResizeHandle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";
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
  type ObjectPlaceAction = {
    type: ObjectType;
    startX: number;
    startY: number;
  };
  const objectPlaceRef = useRef<ObjectPlaceAction | null>(null);

  // --- Manual double-click detection for polygon closure ---
  const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  // --- Manual double-click detection for objects ---
  const lastObjectClickRef = useRef<{ time: number; x: number; y: number; objectId: string } | null>(
    null,
  );
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
  const [prevPendingObjectType, setPrevPendingObjectType] = useState(pendingObjectType);

  // --- Object drag state ---
  type ObjectDragAction = {
    objectId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  };
  const objectDragRef = useRef<ObjectDragAction | null>(null);
  const [liveObjectPos, setLiveObjectPos] = useState<{
    objectId: string;
    x: number;
    y: number;
  } | null>(null);

  // --- Object resize state ---
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
  const objectResizeRef = useRef<ObjectResizeAction | null>(null);
  const [liveObjectResize, setLiveObjectResize] = useState<{
    objectId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // --- Polygon vertex drag state ---
  type PolyVertexDragAction = {
    objectId: string;
    vertexIndex: number;
    startX: number;
    startY: number;
    origPoint: { x: number; y: number };
  };
  const polyVertexDragRef = useRef<PolyVertexDragAction | null>(null);
  const [livePolyVertex, setLivePolyVertex] = useState<{
    objectId: string;
    vertexIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // --- Resize handle hit testing ---
  const handleHitSize = 12;
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

  const tileSize = map.tileSize;
  const mapW = map.widthInTiles;
  const mapH = map.heightInTiles;
  const scaledTile = tileSize * zoom;
  const canvasW = mapW * scaledTile;
  const canvasH = mapH * scaledTile;

  // Resize application when map/zoom changes
  useEffect(() => {
    if (!isInitialised || !app) return;
    app.renderer.resize(canvasW, canvasH);
  }, [app, isInitialised, canvasW, canvasH]);

  // Helper: get grid coordinates from a pointer event
  const getGridPos = useCallback(
    (globalX: number, globalY: number) => {
      const gx = Math.floor(globalX / scaledTile);
      const gy = Math.floor(globalY / scaledTile);
      if (gx < 0 || gy < 0 || gx >= mapW || gy >= mapH) return null;
      return { x: gx, y: gy };
    },
    [scaledTile, mapW, mapH],
  );

  // --- Selection hit testing (move only, no resize) ---
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

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: { global: { x: number; y: number }; button?: number }) => {
      // Ignore middle mouse button (1) — reserved for panning
      if (e.button === 1) return;

      if (currentTool === "select") {
        // --- Object placement mode ---
        if (pendingObjectType) {
          if (pendingObjectType === "polygon") {
            // Polygon: each click adds a point (Figma-like behavior)
            // - Click first point or double-click to close
            // - Enter to close, Escape to cancel (handled via useEffect)
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
              // Start a new polygon
              setIsDrawingPolygon(true);
              setPolygonPoints([{ x: px, y: py }]);
              setPolygonCursorPos({ x: px, y: py });
            } else {
              // Helper to finalize and create the polygon object
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

              // Check if clicking near the first point (snap to close)
              const first = polygonPoints[0];
              const distToFirst = Math.hypot(
                (px - first.x) * zoom,
                (py - first.y) * zoom,
              );
              if (polygonPoints.length >= 3 && distToFirst < 15) {
                // Close polygon by clicking near the first vertex
                closePolygon(polygonPoints);
              } else if (isDoubleClick && polygonPoints.length >= 3) {
                // Close polygon via double-click (don't add the double-click point)
                closePolygon(polygonPoints);
              } else if (isDoubleClick && polygonPoints.length === 2) {
                // Double-click with only 2 points — add this point then close
                const pts = [...polygonPoints, { x: px, y: py }];
                closePolygon(pts);
              } else {
                // Add a new vertex
                setPolygonPoints((prev) => [...prev, { x: px, y: py }]);
              }
            }
            return;
          }
          if (pendingObjectType === "point") {
            // Point: single click places immediately
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

        // --- Object body hit test (click on object to select/drag) ---
        // Check if the active layer is an object layer
        const isObjLayer = objectLayers.some((l) => l.id === activeLayerId);
        if (isObjLayer) {
          // Iterate objects in reverse order (topmost first)
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
              // Simple bounding box hit for polygons
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
              // Detect double-click on object to open properties
              const now = Date.now();
              const lastObjClick = lastObjectClickRef.current;
              const isObjDoubleClick =
                lastObjClick !== null &&
                lastObjClick.objectId === obj.id &&
                now - lastObjClick.time < 400 &&
                Math.hypot(e.global.x - lastObjClick.x, e.global.y - lastObjClick.y) < 12;
              lastObjectClickRef.current = { time: now, x: e.global.x, y: e.global.y, objectId: obj.id };

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
          // Clicked empty space on object layer — deselect
          onSelectObject(null);
          return;
        }

        // Check for resize handle hit first
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

        // Check if active layer is an image layer — start dragging it
        const activeImgLayer = imageLayers.find((l) => l.id === activeLayerId);
        if (activeImgLayer) {
          const imgX = activeImgLayer.x * zoom;
          const imgY = activeImgLayer.y * zoom;
          const imgW = activeImgLayer.width * zoom;
          const imgH = activeImgLayer.height * zoom;
          // Use live position if available
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
          // Snapshot tiles in the selection from the active layer
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
          const newSel = { x: gx, y: gy, width: 1, height: 1 };
          setLiveSelection(newSel);
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
      setHoverTile(pos);

      // Track cursor for polygon drawing preview
      if (isDrawingPolygon) {
        setPolygonCursorPos({ x: e.global.x / zoom, y: e.global.y / zoom });
      }

      if (currentTool === "select") {
        // Handle object placement rubber-banding
        const placeAction = objectPlaceRef.current;
        if (placeAction) {
          const startPx = placeAction.startX / zoom;
          const startPy = placeAction.startY / zoom;
          const curPx = e.global.x / zoom;
          const curPy = e.global.y / zoom;
          const x = Math.min(startPx, curPx);
          const y = Math.min(startPy, curPy);
          const w = Math.abs(curPx - startPx);
          const h = Math.abs(curPy - startPy);
          setLiveObjectPlace({
            type: placeAction.type,
            x,
            y,
            width: w,
            height: h,
          });
          return;
        }

        // Handle object resize
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

        // Handle polygon vertex drag — use local state for real-time feedback
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

        // Handle object dragging
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

        // Handle image layer resize
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

        // Handle image layer dragging
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
          // Check hover on resize handles for cursor feedback (image layers)
          const handle = hitTestResizeHandle(e.global.x, e.global.y);
          setHoveredHandle(handle);

          // Check hover over objects for cursor feedback (object layers)
          const isObjLayerActive = objectLayers.some(
            (l) => l.id === activeLayerId,
          );
          if (isObjLayerActive && !handle) {
            let objCursor: string | null = null;

            // Check resize handles of active object
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

            // Check polygon vertex handles of active polygon
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

            // Check hover over object bodies
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
          setLiveSelection({
            ...action.orig,
            x: newX,
            y: newY,
          });
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
      // Ignore middle mouse button release
      if (e?.button === 1) return;

      // Commit object placement
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

      // Commit object resize
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

      // Commit polygon vertex drag
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

      // Commit object drag
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

      // Commit image layer resize
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

      // Commit image layer drag
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
          // Actually move tiles if the position changed
          const movedX = liveSelection.x !== action.orig.x;
          const movedY = liveSelection.y !== action.orig.y;
          if (movedX || movedY) {
            onMoveTiles(action.orig, liveSelection.x, liveSelection.y);
          }
        }
        // Commit the live selection to the store
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
    // Commit object placement on leave
    if (currentTool === "select" && objectPlaceRef.current) {
      objectPlaceRef.current = null;
      setLiveObjectPlace(null);
      return;
    }
    // Commit object resize on leave
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
    // Commit polygon vertex drag on leave
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
    // Commit object drag on leave
    if (currentTool === "select" && objectDragRef.current) {
      if (liveObjectPos) {
        onMoveObject(liveObjectPos.objectId, liveObjectPos.x, liveObjectPos.y);
        setLiveObjectPos(null);
      }
      objectDragRef.current = null;
      setIsMoving(false);
      return;
    }
    // Commit image layer resize on leave
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
    // Commit image layer drag on leave
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

  // Draw checkerboard background
  const drawCheckerboard = useCallback(
    (g: Graphics) => {
      g.clear();
      const checkSize = 8 * zoom;
      for (let cy = 0; cy < canvasH; cy += checkSize) {
        for (let cx = 0; cx < canvasW; cx += checkSize) {
          const isLight =
            (Math.floor(cx / checkSize) + Math.floor(cy / checkSize)) % 2 === 0;
          g.rect(cx, cy, checkSize, checkSize);
          g.fill({ color: isLight ? 0x282828 : 0x1e1e1e });
        }
      }
    },
    [canvasW, canvasH, zoom],
  );

  // Draw grid overlay
  const drawGrid = useCallback(
    (g: Graphics) => {
      g.clear();

      // Grid lines
      g.setStrokeStyle({ width: 1, color: 0xffa500, alpha: 0.15 });
      for (let x = 0; x <= canvasW; x += scaledTile) {
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, canvasH);
      }
      for (let y = 0; y <= canvasH; y += scaledTile) {
        g.moveTo(0, y + 0.5);
        g.lineTo(canvasW, y + 0.5);
      }
      g.stroke();

      // Border
      g.setStrokeStyle({ width: 2, color: 0xffa500, alpha: 0.5 });
      g.rect(1, 1, canvasW - 2, canvasH - 2);
      g.stroke();
    },
    [canvasW, canvasH, scaledTile],
  );

  // Draw hover highlight + brush size preview
  const drawHover = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!hoverTile || currentTool === "select") return;

      const brushNum = currentTool === "fill" ? 1 : parseInt(brushSize);
      const hx = hoverTile.x * scaledTile;
      const hy = hoverTile.y * scaledTile;
      const hw = Math.min(brushNum, mapW - hoverTile.x) * scaledTile;
      const hh = Math.min(brushNum, mapH - hoverTile.y) * scaledTile;

      // Semi-transparent highlight
      g.rect(hx, hy, hw, hh);
      g.fill({ color: 0xffa500, alpha: 0.2 });

      // Border
      g.setStrokeStyle({ width: 2, color: 0xffa500, alpha: 0.8 });
      g.rect(hx, hy, hw, hh);
      g.stroke();
    },
    [hoverTile, currentTool, brushSize, scaledTile, mapW, mapH],
  );

  // Draw selection rectangle (no resize handles)
  const drawSelection = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!renderedSelection) return;

      const sx = renderedSelection.x * scaledTile;
      const sy = renderedSelection.y * scaledTile;
      const sw = renderedSelection.width * scaledTile;
      const sh = renderedSelection.height * scaledTile;

      // Selection fill
      g.rect(sx, sy, sw, sh);
      g.fill({ color: 0x3b82f6, alpha: 0.15 });

      // Dashed-style selection border (double line for visibility)
      g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.8 });
      g.rect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
      g.stroke();

      g.setStrokeStyle({ width: 1, color: 0x3b82f6, alpha: 1 });
      g.rect(sx + 1.5, sy + 1.5, sw - 3, sh - 3);
      g.stroke();
    },
    [renderedSelection, scaledTile],
  );

  // Draw selection border and resize handles around active image layer
  const drawImageLayerSelection = useCallback(
    (g: Graphics) => {
      g.clear();
      if (currentTool !== "select") return;
      const activeImgLayer = imageLayers.find((l) => l.id === activeLayerId);
      if (!activeImgLayer) return;

      const imgIsResizing = liveImageResize?.layerId === activeImgLayer.id;
      const imgIsDragging = liveImagePos?.layerId === activeImgLayer.id;
      const posX =
        (imgIsResizing
          ? liveImageResize.x
          : imgIsDragging
            ? liveImagePos.x
            : activeImgLayer.x) * zoom;
      const posY =
        (imgIsResizing
          ? liveImageResize.y
          : imgIsDragging
            ? liveImagePos.y
            : activeImgLayer.y) * zoom;
      const w =
        (imgIsResizing ? liveImageResize.width : activeImgLayer.width) * zoom;
      const h =
        (imgIsResizing ? liveImageResize.height : activeImgLayer.height) * zoom;

      // Selection fill
      g.rect(posX, posY, w, h);
      g.fill({ color: 0x3b82f6, alpha: 0.08 });

      // Dashed-style border (double line)
      g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.8 });
      g.rect(posX + 0.5, posY + 0.5, w - 1, h - 1);
      g.stroke();

      g.setStrokeStyle({ width: 2, color: 0x3b82f6, alpha: 1 });
      g.rect(posX - 0.5, posY - 0.5, w + 1, h + 1);
      g.stroke();

      // Resize handles
      const hs = 8;
      const hh = hs / 2;
      const handlePositions: [number, number][] = [
        [posX, posY],
        [posX + w / 2, posY],
        [posX + w, posY],
        [posX, posY + h / 2],
        [posX + w, posY + h / 2],
        [posX, posY + h],
        [posX + w / 2, posY + h],
        [posX + w, posY + h],
      ];
      for (const [hx, hy] of handlePositions) {
        g.rect(hx - hh, hy - hh, hs, hs);
        g.fill({ color: 0xffffff, alpha: 1 });
        g.setStrokeStyle({ width: 1, color: 0x3b82f6, alpha: 1 });
        g.rect(hx - hh, hy - hh, hs, hs);
        g.stroke();
      }
    },
    [
      currentTool,
      imageLayers,
      activeLayerId,
      zoom,
      liveImagePos,
      liveImageResize,
    ],
  );

  // Draw all map objects (dotted outlines)
  const drawObjects = useCallback(
    (g: Graphics) => {
      g.clear();
      // Draw objects per layer order
      for (const objLayer of objectLayers) {
        if (!objLayer.visible) continue;
        const layerObjects = objects.filter((o) => o.layerId === objLayer.id);
        for (const obj of layerObjects) {
          if (!obj.visible) continue;
          const isActive = obj.id === activeObjectId;
          const color = isActive ? 0x00aaff : 0x00ccaa;
          const alpha = isActive ? 1 : 0.7;
          const lineWidth = isActive ? 2 : 1.5;

          // Use live position/size if this object is being dragged/resized
          const drag =
            liveObjectPos?.objectId === obj.id ? liveObjectPos : null;
          const resize =
            liveObjectResize?.objectId === obj.id ? liveObjectResize : null;
          const dx = (resize?.x ?? drag?.x ?? obj.x) * zoom;
          const dy = (resize?.y ?? drag?.y ?? obj.y) * zoom;
          const dw = (resize?.width ?? obj.width) * zoom;
          const dh = (resize?.height ?? obj.height) * zoom;

          if (obj.type === "rectangle") {
            g.setStrokeStyle({ width: lineWidth, color, alpha });
            g.rect(dx, dy, dw, dh);
            g.stroke();
            g.rect(dx, dy, dw, dh);
            g.fill({ color, alpha: 0.08 });
          } else if (obj.type === "ellipse") {
            g.setStrokeStyle({ width: lineWidth, color, alpha });
            g.ellipse(dx + dw / 2, dy + dh / 2, dw / 2, dh / 2);
            g.stroke();
            g.ellipse(dx + dw / 2, dy + dh / 2, dw / 2, dh / 2);
            g.fill({ color, alpha: 0.08 });
          } else if (obj.type === "point") {
            const px = dx;
            const py = dy;
            const ps = 6 * zoom;
            // Crosshair
            g.setStrokeStyle({ width: lineWidth, color, alpha });
            g.moveTo(px - ps, py);
            g.lineTo(px + ps, py);
            g.stroke();
            g.moveTo(px, py - ps);
            g.lineTo(px, py + ps);
            g.stroke();
            // Diamond
            g.moveTo(px, py - ps * 0.7);
            g.lineTo(px + ps * 0.7, py);
            g.lineTo(px, py + ps * 0.7);
            g.lineTo(px - ps * 0.7, py);
            g.closePath();
            g.fill({ color, alpha: 0.3 });
            g.stroke();
          } else if (obj.type === "polygon") {
            if (obj.points.length >= 2) {
              g.setStrokeStyle({ width: lineWidth, color, alpha });
              // Use live vertex position during drag for instant feedback
              const pts = obj.points.map((p, i) =>
                livePolyVertex &&
                livePolyVertex.objectId === obj.id &&
                livePolyVertex.vertexIndex === i
                  ? livePolyVertex
                  : p,
              );
              g.moveTo(dx + pts[0].x * zoom, dy + pts[0].y * zoom);
              for (let i = 1; i < pts.length; i++) {
                g.lineTo(dx + pts[i].x * zoom, dy + pts[i].y * zoom);
              }
              g.closePath();
              g.stroke();
              // Fill
              g.moveTo(dx + pts[0].x * zoom, dy + pts[0].y * zoom);
              for (let i = 1; i < pts.length; i++) {
                g.lineTo(dx + pts[i].x * zoom, dy + pts[i].y * zoom);
              }
              g.closePath();
              g.fill({ color, alpha: 0.08 });
            }
          }

          // Draw resize handles for selected object (rectangle/ellipse)
          if (
            isActive &&
            (obj.type === "rectangle" || obj.type === "ellipse")
          ) {
            const hs = 6;
            const hh = hs / 2;
            const handlePositions: [number, number][] = [
              [dx, dy],
              [dx + dw / 2, dy],
              [dx + dw, dy],
              [dx, dy + dh / 2],
              [dx + dw, dy + dh / 2],
              [dx, dy + dh],
              [dx + dw / 2, dy + dh],
              [dx + dw, dy + dh],
            ];
            for (const [hx, hy] of handlePositions) {
              g.rect(hx - hh, hy - hh, hs, hs);
              g.fill({ color: 0xffffff, alpha: 1 });
              g.setStrokeStyle({ width: 1, color: 0x00aaff, alpha: 1 });
              g.rect(hx - hh, hy - hh, hs, hs);
              g.stroke();
            }
          }

          // Draw polygon vertex handles for selected polygon
          if (isActive && obj.type === "polygon") {
            const vr = 4;
            for (let vi = 0; vi < obj.points.length; vi++) {
              // Use live vertex position during drag
              const pt =
                livePolyVertex &&
                livePolyVertex.objectId === obj.id &&
                livePolyVertex.vertexIndex === vi
                  ? livePolyVertex
                  : obj.points[vi];
              const vx = dx + pt.x * zoom;
              const vy = dy + pt.y * zoom;
              g.circle(vx, vy, vr);
              g.fill({ color: 0xffffff, alpha: 1 });
              g.setStrokeStyle({ width: 1, color: 0x00aaff, alpha: 1 });
              g.circle(vx, vy, vr);
              g.stroke();
            }
          }
        }
      }

      // Draw live placement preview
      if (liveObjectPlace) {
        const { type, x, y, width, height } = liveObjectPlace;
        const px = x * zoom;
        const py = y * zoom;
        const pw = width * zoom;
        const ph = height * zoom;
        g.setStrokeStyle({ width: 2, color: 0x00aaff, alpha: 0.8 });
        if (type === "rectangle") {
          g.rect(px, py, pw, ph);
          g.stroke();
          g.rect(px, py, pw, ph);
          g.fill({ color: 0x00aaff, alpha: 0.1 });
        } else if (type === "ellipse") {
          g.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2);
          g.stroke();
          g.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2);
          g.fill({ color: 0x00aaff, alpha: 0.1 });
        }
      }

      // Draw polygon being drawn
      if (isDrawingPolygon && polygonPoints.length > 0) {
        // Draw filled polygon preview (semi-transparent)
        if (polygonPoints.length >= 3) {
          g.moveTo(polygonPoints[0].x * zoom, polygonPoints[0].y * zoom);
          for (let i = 1; i < polygonPoints.length; i++) {
            g.lineTo(polygonPoints[i].x * zoom, polygonPoints[i].y * zoom);
          }
          if (polygonCursorPos) {
            g.lineTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
          }
          g.closePath();
          g.fill({ color: 0x00aaff, alpha: 0.06 });
        }

        // Draw placed edges
        g.setStrokeStyle({ width: 2, color: 0x00aaff, alpha: 0.8 });
        g.moveTo(polygonPoints[0].x * zoom, polygonPoints[0].y * zoom);
        for (let i = 1; i < polygonPoints.length; i++) {
          g.lineTo(polygonPoints[i].x * zoom, polygonPoints[i].y * zoom);
        }
        g.stroke();

        // Draw preview line from last point to cursor
        if (polygonCursorPos && polygonPoints.length >= 1) {
          const last = polygonPoints[polygonPoints.length - 1];
          g.setStrokeStyle({ width: 1.5, color: 0x00aaff, alpha: 0.5 });
          g.moveTo(last.x * zoom, last.y * zoom);
          g.lineTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
          g.stroke();

          // Draw closing preview line from cursor to first point when >= 2 points
          if (polygonPoints.length >= 2) {
            const first = polygonPoints[0];
            g.setStrokeStyle({ width: 1, color: 0x00aaff, alpha: 0.3 });
            g.moveTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
            g.lineTo(first.x * zoom, first.y * zoom);
            g.stroke();
          }
        }

        // Draw vertex circles
        for (let i = 0; i < polygonPoints.length; i++) {
          const pt = polygonPoints[i];
          const isFirst = i === 0;
          // Show snap indicator on first point when cursor is near it
          let snapHighlight = false;
          if (isFirst && polygonCursorPos && polygonPoints.length >= 3) {
            const dist = Math.hypot(
              (polygonCursorPos.x - pt.x) * zoom,
              (polygonCursorPos.y - pt.y) * zoom,
            );
            snapHighlight = dist < 15;
          }
          const radius = snapHighlight ? 7 : 4;
          g.circle(pt.x * zoom, pt.y * zoom, radius);
          g.fill({
            color: snapHighlight ? 0x00ff88 : 0x00aaff,
            alpha: snapHighlight ? 1 : 0.8,
          });
          if (snapHighlight) {
            g.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 1 });
            g.circle(pt.x * zoom, pt.y * zoom, radius);
            g.stroke();
          }
        }
      }
    },
    [
      objectLayers,
      objects,
      activeObjectId,
      zoom,
      liveObjectPos,
      liveObjectResize,
      liveObjectPlace,
      livePolyVertex,
      isDrawingPolygon,
      polygonPoints,
      polygonCursorPos,
    ],
  );

  // --- Keyboard handler for polygon drawing (Escape/Enter) ---
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

  // --- Reset polygon state when pendingObjectType changes away from polygon ---
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

  // Get the tile snapshot from the current move action (for overlay rendering)
  const moveTiles = moveTilesSnapshot ?? [];
  const moveDestSel = moveTilesSnapshot ? liveSelection : null;

  // Get layers in render order (bottom to top) — both tile and image layers
  const orderedLayerEntries = useMemo(
    () =>
      map.layerOrder
        .map((lid) => {
          const tileLayer = layers.find((l) => l.id === lid);
          if (tileLayer) return { kind: "tile" as const, layer: tileLayer };
          const imgLayer = imageLayers.find((l) => l.id === lid);
          if (imgLayer) return { kind: "image" as const, layer: imgLayer };
          return null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    [map.layerOrder, layers, imageLayers],
  );

  // Force reference to texturesReady / paintBufferVersion for reactivity
  void texturesReady;
  void paintBufferVersion;

  return (
    <>
      {/* Checkerboard background */}
      <pixiGraphics draw={drawCheckerboard} />

      {/* Tile and image layers in order */}
      {orderedLayerEntries.map((entry) => {
        if (entry.kind === "image") {
          const imgLayer = entry.layer as ImageLayer;
          const tex = imageLayerTextureCache.get(imgLayer.assetId);
          if (!tex) return null;
          const imgIsResizing = liveImageResize?.layerId === imgLayer.id;
          const imgIsDragging = liveImagePos?.layerId === imgLayer.id;
          const posX =
            (imgIsResizing
              ? liveImageResize.x
              : imgIsDragging
                ? liveImagePos.x
                : imgLayer.x) * zoom;
          const posY =
            (imgIsResizing
              ? liveImageResize.y
              : imgIsDragging
                ? liveImagePos.y
                : imgLayer.y) * zoom;
          const spriteW =
            (imgIsResizing ? liveImageResize.width : imgLayer.width) * zoom;
          const spriteH =
            (imgIsResizing ? liveImageResize.height : imgLayer.height) * zoom;
          return (
            <pixiSprite
              key={imgLayer.id}
              texture={tex}
              x={posX}
              y={posY}
              width={spriteW}
              height={spriteH}
              visible={imgLayer.visible}
              alpha={imgLayer.id === activeLayerId ? 1 : 0.7}
            />
          );
        }

        const layer = entry.layer as TileLayer;
        const isActiveLayer = layer.id === activeLayerId;
        return (
          <pixiContainer
            key={layer.id}
            visible={layer.visible}
            alpha={isActiveLayer ? 1 : 0.7}
          >
            {Object.entries(layer.tiles).map(([key, ref]) => {
              // Skip tiles overridden by the paint buffer on the active layer
              if (isActiveLayer && paintBuffer.has(key)) return null;
              const tex = getTileTexture(ref);
              if (!tex) return null;
              const [gx, gy] = key.split(",").map(Number);
              return (
                <pixiSprite
                  key={key}
                  texture={tex}
                  x={gx * scaledTile}
                  y={gy * scaledTile}
                  width={scaledTile}
                  height={scaledTile}
                />
              );
            })}
            {/* Render buffered paint tiles immediately on the active layer */}
            {isActiveLayer &&
              Array.from(paintBuffer.entries()).map(([key, ref]) => {
                if (ref === null) return null;
                const tex = getTileTexture(ref);
                if (!tex) return null;
                const [gx, gy] = key.split(",").map(Number);
                return (
                  <pixiSprite
                    key={`buf-${key}`}
                    texture={tex}
                    x={gx * scaledTile}
                    y={gy * scaledTile}
                    width={scaledTile}
                    height={scaledTile}
                  />
                );
              })}
          </pixiContainer>
        );
      })}

      {/* Grid overlay */}
      <pixiGraphics draw={drawGrid} />

      {/* Hover preview: show selected tile at cursor position */}
      {hoverTile &&
        selectedTile &&
        currentTool === "paint" &&
        (() => {
          const tex = getTileTexture(selectedTile);
          if (!tex) return null;
          const brushNum = parseInt(brushSize);
          const sprites = [];
          for (let dy = 0; dy < brushNum; dy++) {
            for (let dx = 0; dx < brushNum; dx++) {
              const tx = hoverTile.x + dx;
              const ty = hoverTile.y + dy;
              if (tx >= mapW || ty >= mapH) continue;
              sprites.push(
                <pixiSprite
                  key={`preview-${dx}-${dy}`}
                  texture={tex}
                  x={tx * scaledTile}
                  y={ty * scaledTile}
                  width={scaledTile}
                  height={scaledTile}
                  alpha={0.5}
                />,
              );
            }
          }
          return <>{sprites}</>;
        })()}

      {/* Hover highlight */}
      <pixiGraphics draw={drawHover} />

      {/* Selection overlay */}
      {currentTool === "select" && <pixiGraphics draw={drawSelection} />}

      {/* Image layer selection border */}
      {currentTool === "select" && (
        <pixiGraphics draw={drawImageLayerSelection} />
      )}

      {/* Object layers rendering */}
      <pixiGraphics draw={drawObjects} />

      {/* Tile move overlay — ghost tiles at destination during drag */}
      {currentTool === "select" &&
        moveDestSel &&
        moveTiles.length > 0 &&
        moveTiles.map(({ dx, dy, ref }) => {
          const tex = getTileTexture(ref);
          if (!tex) return null;
          const tx = moveDestSel.x + dx;
          const ty = moveDestSel.y + dy;
          if (tx >= mapW || ty >= mapH) return null;
          return (
            <pixiSprite
              key={`move-${dx}-${dy}`}
              texture={tex}
              x={tx * scaledTile}
              y={ty * scaledTile}
              width={scaledTile}
              height={scaledTile}
              alpha={0.6}
            />
          );
        })}

      {/* Invisible event capture overlay */}
      <pixiGraphics
        draw={useCallback(
          (g: Graphics) => {
            g.clear();
            g.rect(0, 0, canvasW, canvasH);
            g.fill({ color: 0x000000, alpha: 0.001 });
          },
          [canvasW, canvasH],
        )}
        eventMode="static"
        cursor={
          currentTool === "select"
            ? pendingObjectType
              ? "crosshair"
              : resizingHandle
                ? RESIZE_CURSORS[resizingHandle]
                : hoveredHandle
                  ? RESIZE_CURSORS[hoveredHandle]
                  : hoveredObjectCursor
                    ? hoveredObjectCursor
                    : isMoving
                      ? "grabbing"
                      : "default"
            : "crosshair"
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />
    </>
  );
});

// ---------------------------------------------------------------------------
// Main MapCanvas component
// ---------------------------------------------------------------------------

export const MapCanvas = memo(function MapCanvas(props: MapCanvasProps) {
  const { map, tilesets, zoom } = props;
  const [texturesReady, setTexturesReady] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const tileSize = map.tileSize;
  const canvasW = map.widthInTiles * tileSize * zoom;
  const canvasH = map.heightInTiles * tileSize * zoom;

  // Load all tileset textures needed by the current map
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      // Collect all tileset IDs referenced in map layers
      const neededIds = new Set<TilesetId>();
      for (const layer of props.layers) {
        if (!map.layerOrder.includes(layer.id)) continue;
        for (const ref of Object.values(layer.tiles)) {
          neededIds.add(ref.tilesetId);
        }
      }
      // Also need the selected tile's tileset
      if (props.selectedTile) {
        neededIds.add(props.selectedTile.tilesetId);
      }

      // Evict textures no longer referenced by this map
      evictUnusedTextures(neededIds);

      let loaded = 0;
      for (const tilesetId of neededIds) {
        if (textureCache.has(tilesetId)) continue;
        const tileset = tilesets.find(
          (t: { id: TilesetId }) => t.id === tilesetId,
        );
        if (!tileset) continue;
        const result = await loadTilesetTexture(tilesetId, tileset.assetId);
        if (result && !cancelled) loaded++;
      }

      // Load image layer textures
      for (const imgLayer of props.imageLayers) {
        if (imageLayerTextureCache.has(imgLayer.assetId)) continue;
        const result = await loadImageLayerTexture(imgLayer.assetId);
        if (result && !cancelled) loaded++;
      }

      if (loaded > 0 && !cancelled) {
        setTexturesReady((n) => n + loaded);
      }
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [
    map.layerOrder,
    props.layers,
    tilesets,
    props.selectedTile,
    props.imageLayers,
  ]);

  return (
    <div
      ref={containerRef}
      style={{ width: canvasW, height: canvasH, imageRendering: "pixelated" }}
    >
      <Application
        width={canvasW}
        height={canvasH}
        backgroundColor={0x1a1a1a}
        antialias={false}
        resolution={1}
        autoDensity={false}
      >
        <MapScene {...props} texturesReady={texturesReady} />
      </Application>
    </div>
  );
});
