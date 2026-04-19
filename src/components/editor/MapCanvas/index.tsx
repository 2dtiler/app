/**
 * MapCanvas — Canvas2D-based map renderer.
 *
 * Four stacked canvases:
 *   1. mainCanvas    — inactive layers below the active layer
 *   2. paintCanvas   — active layer content plus live paint/erase preview
 *   3. topCanvas     — inactive layers above the active layer plus editor UI
 *   4. overlayCanvas — imperative hover brush highlight drawn directly by
 *                      useSceneInteraction without triggering React renders
 *
 */

import { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";
import type { TilesetId, ImageLayer, TileLayer, TileRef } from "@/types";
import type {
  MapCanvasProps,
  MapResizeAction,
  MapResizeHandle,
  MapResizePreview,
} from "@/types/map-canvas";
import { RESIZE_CURSORS } from "./resize-utils";
import {
  tilesetImageCache,
  imageLayerImageCache,
  loadTilesetImage,
  loadImageLayerImage,
  evictUnusedTilesets,
  getTileImage,
  drawTileWithOrientation,
  drawImageLayerWithOrientation,
} from "./texture-cache";
import {
  getImageLayerHandlePositions,
  getImageLayerPolygon,
  getImageLayerResizeCursor,
} from "./image-layer-transform";
import { useSceneInteraction } from "./use-scene-interaction";

const MAP_RESIZE_GUTTER = 14;
const MAP_RESIZE_RAIL_SIZE = 10;
const MAP_RESIZE_BADGE_OFFSET = 6;

function clampMapDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(256, Math.max(1, Math.round(value)));
}

export const MapCanvas = memo(function MapCanvas(props: MapCanvasProps) {
  const {
    map,
    layers,
    tilesets,
    zoom,
    activeLayerId,
    currentTool,
    fillMode,
    activeFillTerrain,
    canPreviewFill,
    brushSize,
    selectedTileSize,
    selectedTile,
    onResizeMap,
    onPaintTile,
    onPaintEnd,
    paintBufferVersion,
    imperativeRef,
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
  } = props;

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const topCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  // Paint canvas: active-layer rendering plus imperative brush updates.
  // Pre-rendered inactive layers below/above active layer for fast compositing
  const lowerBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const upperBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imagesReady, setImagesReady] = useState(0);
  const mapResizeActionRef = useRef<MapResizeAction | null>(null);
  const [activeMapResizeHandle, setActiveMapResizeHandle] =
    useState<MapResizeHandle | null>(null);
  const [mapResizePreview, setMapResizePreview] =
    useState<MapResizePreview | null>(null);

  const tileSize = map.tileSize;
  const mapW = map.widthInTiles;
  const mapH = map.heightInTiles;
  const previewMapW = mapResizePreview?.width ?? mapW;
  const previewMapH = mapResizePreview?.height ?? mapH;
  const scaledTile = tileSize * zoom;
  const canvasW = previewMapW * scaledTile;
  const canvasH = previewMapH * scaledTile;

  const endMapResize = useCallback(
    (commit: boolean) => {
      const action = mapResizeActionRef.current;
      if (!action) return;

      mapResizeActionRef.current = null;
      setActiveMapResizeHandle(null);
      setMapResizePreview(null);

      if (
        commit &&
        (action.nextWidth !== action.origWidth ||
          action.nextHeight !== action.origHeight)
      ) {
        onResizeMap(action.nextWidth, action.nextHeight);
      }
    },
    [onResizeMap],
  );

  const updateMapResizePreview = useCallback(
    (clientX: number, clientY: number) => {
      const action = mapResizeActionRef.current;
      if (!action) return;

      const deltaTilesX = Math.round((clientX - action.startClientX) / scaledTile);
      const deltaTilesY = Math.round((clientY - action.startClientY) / scaledTile);
      const nextWidth = clampMapDimension(
        action.origWidth +
          (action.handle === "e" || action.handle === "se" ? deltaTilesX : 0),
        action.origWidth,
      );
      const nextHeight = clampMapDimension(
        action.origHeight +
          (action.handle === "s" || action.handle === "se" ? deltaTilesY : 0),
        action.origHeight,
      );

      action.nextWidth = nextWidth;
      action.nextHeight = nextHeight;
      setMapResizePreview({ width: nextWidth, height: nextHeight });
    },
    [scaledTile],
  );

  const beginMapResize = useCallback(
    (handle: MapResizeHandle, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();
      mapResizeActionRef.current = {
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origWidth: mapW,
        origHeight: mapH,
        nextWidth: mapW,
        nextHeight: mapH,
      };
      setActiveMapResizeHandle(handle);
      setMapResizePreview({ width: mapW, height: mapH });
    },
    [mapW, mapH],
  );

  useEffect(() => {
    if (!activeMapResizeHandle) return;

    function handleWindowPointerMove(e: PointerEvent) {
      e.preventDefault();
      updateMapResizePreview(e.clientX, e.clientY);
    }

    function handleWindowPointerUp(e: PointerEvent) {
      if (e.button !== 0) return;
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

  // ---------------------------------------------------------------------------
  // Image loading
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const neededIds = new Set<TilesetId>();
      for (const layer of layers) {
        if (!map.layerOrder.includes(layer.id)) continue;
        for (const ref of Object.values(layer.tiles)) {
          neededIds.add(ref.tilesetId);
        }
      }
      if (selectedTile) neededIds.add(selectedTile.tilesetId);

      evictUnusedTilesets(neededIds);

      let loaded = 0;
      for (const tilesetId of neededIds) {
        if (tilesetImageCache.has(tilesetId)) continue;
        const tileset = tilesets.find(
          (t: { id: TilesetId }) => t.id === tilesetId,
        );
        if (!tileset) continue;
        const result = await loadTilesetImage(tilesetId, tileset.assetId);
        if (result && !cancelled) loaded++;
      }
      for (const imgLayer of imageLayers) {
        if (imageLayerImageCache.has(imgLayer.assetId)) continue;
        const result = await loadImageLayerImage(imgLayer.assetId);
        if (result && !cancelled) loaded++;
      }
      if (loaded > 0 && !cancelled) setImagesReady((n) => n + loaded);
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [map.layerOrder, layers, tilesets, selectedTile, imageLayers]);

  // ---------------------------------------------------------------------------
  // Resize canvases when dimensions change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mainCanvasRef.current) {
      mainCanvasRef.current.width = canvasW;
      mainCanvasRef.current.height = canvasH;
    }
    if (topCanvasRef.current) {
      topCanvasRef.current.width = canvasW;
      topCanvasRef.current.height = canvasH;
    }
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = canvasW;
      overlayCanvasRef.current.height = canvasH;
    }
    if (paintCanvasRef.current) {
      paintCanvasRef.current.width = canvasW;
      paintCanvasRef.current.height = canvasH;
    }
  }, [canvasW, canvasH]);

  // ---------------------------------------------------------------------------
  // Imperative handle — lets MapPanel draw tiles directly onto the paint canvas
  // with zero React overhead during a brush stroke.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!imperativeRef) return;
    imperativeRef.current = {
      drawBufferTile(gx: number, gy: number, ref: TileRef) {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const img = getTileImage(ref);
        if (!img) return;
        ctx.imageSmoothingEnabled = false;
        // Clear that cell first so erase/repaint is correct
        ctx.clearRect(gx * scaledTile, gy * scaledTile, scaledTile, scaledTile);
        drawTileWithOrientation(
          ctx,
          img,
          ref,
          gx * scaledTile,
          gy * scaledTile,
          scaledTile,
        );
      },
      eraseBufferTile(gx: number, gy: number) {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(gx * scaledTile, gy * scaledTile, scaledTile, scaledTile);
      },
      clearPaintCanvas() {
        const canvas = paintCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
    };
  });

  // ---------------------------------------------------------------------------
  // Interaction hook
  // ---------------------------------------------------------------------------
  const {
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
  } = useSceneInteraction({
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
    selectedTile,
    overlayCanvasRef,
    scaledTile,
    mapW,
    mapH,
  });

  // Layers in render order (bottom to top)
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

  const moveTiles = useMemo(() => moveTilesSnapshot ?? [], [moveTilesSnapshot]);
  const moveDestSel = moveTilesSnapshot ? liveSelection : null;

  const getDisplayImageLayer = useCallback(
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

  const scaleImageLayer = useCallback(
    (imgLayer: ReturnType<typeof getDisplayImageLayer>) => ({
      ...imgLayer,
      x: imgLayer.x * zoom,
      y: imgLayer.y * zoom,
      width: imgLayer.width * zoom,
      height: imgLayer.height * zoom,
    }),
    [zoom],
  );

  // ---------------------------------------------------------------------------
  // Background offscreen canvases — pre-render inactive layers split around
  // the active layer so the hot paint loop only composites + redraws the
  // active layer each frame. Intentionally excludes paintBuffer from deps.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const activeIdx = orderedLayerEntries.findIndex(
      (e) => e.layer.id === activeLayerId,
    );
    const lowerEntries =
      activeIdx >= 0
        ? orderedLayerEntries.slice(0, activeIdx)
        : orderedLayerEntries;
    const upperEntries =
      activeIdx >= 0 ? orderedLayerEntries.slice(activeIdx + 1) : [];

    function renderLayersToCanvas(
      entries: typeof orderedLayerEntries,
      canvasRef: { current: HTMLCanvasElement | null },
    ) {
      const offCanvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = offCanvas;
      offCanvas.width = canvasW;
      offCanvas.height = canvasH;
      const offCtx = offCanvas.getContext("2d");
      if (!offCtx) return;
      offCtx.imageSmoothingEnabled = false;
      offCtx.clearRect(0, 0, canvasW, canvasH);
      for (const entry of entries) {
        if (entry.kind === "image") {
          const imgLayer = entry.layer as ImageLayer;
          if (!imgLayer.visible) continue;
          const img = imageLayerImageCache.get(imgLayer.assetId);
          if (!img) continue;
          const scaledImageLayer = scaleImageLayer(
            getDisplayImageLayer(imgLayer),
          );
          offCtx.globalAlpha =
            (0.7 * Math.max(0, Math.min(100, imgLayer.opacity ?? 100))) / 100;
          drawImageLayerWithOrientation(offCtx, img, scaledImageLayer);
          offCtx.globalAlpha = 1;
          continue;
        }
        const layer = entry.layer as TileLayer;
        if (!layer.visible) continue;
        offCtx.globalAlpha = 0.7;
        for (const [key, ref] of Object.entries(layer.tiles) as [
          string,
          TileRef,
        ][]) {
          const img = getTileImage(ref);
          if (!img) continue;
          const [gx, gy] = key.split(",").map(Number);
          drawTileWithOrientation(
            offCtx,
            img,
            ref,
            gx * scaledTile,
            gy * scaledTile,
            scaledTile,
          );
        }
        offCtx.globalAlpha = 1;
      }
    }

    renderLayersToCanvas(lowerEntries, lowerBgCanvasRef);
    renderLayersToCanvas(upperEntries, upperBgCanvasRef);
  }, [
    orderedLayerEntries,
    activeLayerId,
    scaledTile,
    canvasW,
    canvasH,
    imagesReady,
    zoom,
    getDisplayImageLayer,
    scaleImageLayer,
  ]);

  // ---------------------------------------------------------------------------
  // Base scene draw effect (inactive layers below active)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (lowerBgCanvasRef.current) {
      ctx.drawImage(lowerBgCanvasRef.current, 0, 0);
    }
  }, [canvasW, canvasH, orderedLayerEntries, activeLayerId, imagesReady, zoom]);

  // ---------------------------------------------------------------------------
  // Active layer draw effect (committed content + live brush mutations)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const activeEntry = orderedLayerEntries.find(
      (e) => e.layer.id === activeLayerId,
    );
    if (activeEntry) {
      if (activeEntry.kind === "image") {
        const imgLayer = activeEntry.layer as ImageLayer;
        if (imgLayer.visible) {
          const img = imageLayerImageCache.get(imgLayer.assetId);
          if (img) {
            const scaledImageLayer = scaleImageLayer(
              getDisplayImageLayer(imgLayer),
            );
            ctx.globalAlpha =
              Math.max(0, Math.min(100, imgLayer.opacity ?? 100)) / 100;
            drawImageLayerWithOrientation(ctx, img, scaledImageLayer);
            ctx.globalAlpha = 1;
          }
        }
      } else {
        const layer = activeEntry.layer as TileLayer;
        if (layer.visible) {
          for (const [key, ref] of Object.entries(layer.tiles) as [
            string,
            TileRef,
          ][]) {
            const img = getTileImage(ref);
            if (!img) continue;
            const [gx, gy] = key.split(",").map(Number);
            drawTileWithOrientation(
              ctx,
              img,
              ref,
              gx * scaledTile,
              gy * scaledTile,
              scaledTile,
            );
          }
        }
      }
    }
  }, [
    canvasW,
    canvasH,
    scaledTile,
    zoom,
    orderedLayerEntries,
    activeLayerId,
    imagesReady,
    liveImagePos,
    liveImageResize,
    paintBufferVersion,
    getDisplayImageLayer,
    scaleImageLayer,
  ]);

  // ---------------------------------------------------------------------------
  // Top scene draw effect (inactive layers above active + editor UI)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = topCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (upperBgCanvasRef.current) {
      ctx.drawImage(upperBgCanvasRef.current, 0, 0);
    }

    // ---- Grid ----
    ctx.strokeStyle = "rgba(255, 165, 0, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= canvasW; x += scaledTile) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvasH);
    }
    for (let y = 0; y <= canvasH; y += scaledTile) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvasW, y + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 165, 0, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvasW - 2, canvasH - 2);

    // ---- Selection overlay ----
    if (currentTool === "select" && renderedSelection) {
      const sx = renderedSelection.x * scaledTile;
      const sy = renderedSelection.y * scaledTile;
      const sw = renderedSelection.width * scaledTile;
      const sh = renderedSelection.height * scaledTile;
      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
      ctx.strokeStyle = "rgba(59, 130, 246, 1)";
      ctx.strokeRect(sx + 1.5, sy + 1.5, sw - 3, sh - 3);
    }

    // ---- Image layer selection border + handles ----
    if (currentTool === "select") {
      const activeImgLayer = imageLayers.find((l) => l.id === activeLayerId);
      if (activeImgLayer) {
        const scaledImageLayer = scaleImageLayer(
          getDisplayImageLayer(activeImgLayer),
        );
        const polygon = getImageLayerPolygon(scaledImageLayer);
        const handlePositions = getImageLayerHandlePositions(scaledImageLayer);

        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (const point of polygon.slice(1)) {
          ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (const point of polygon.slice(1)) {
          ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (const point of polygon.slice(1)) {
          ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(59, 130, 246, 1)";
        ctx.lineWidth = 2;
        ctx.stroke();

        const hs = 8;
        const hh = hs / 2;
        for (const [, hx, hy] of handlePositions) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(hx - hh, hy - hh, hs, hs);
          ctx.strokeStyle = "rgba(59, 130, 246, 1)";
          ctx.lineWidth = 1;
          ctx.strokeRect(hx - hh, hy - hh, hs, hs);
        }
      }
    }

    // ---- Objects ----
    for (const objLayer of objectLayers) {
      if (!objLayer.visible) continue;
      const layerObjects = objects.filter((o) => o.layerId === objLayer.id);
      for (const obj of layerObjects) {
        if (!obj.visible) continue;
        const isActive = obj.id === activeObjectId;
        const colorBase = isActive ? "rgba(0, 170, 255," : "rgba(0, 204, 170,";
        const colorAlpha = isActive ? 1 : 0.7;
        const lineWidth = isActive ? 2 : 1.5;

        const drag = liveObjectPos?.objectId === obj.id ? liveObjectPos : null;
        const resize =
          liveObjectResize?.objectId === obj.id ? liveObjectResize : null;
        const ox = (resize?.x ?? drag?.x ?? obj.x) * zoom;
        const oy = (resize?.y ?? drag?.y ?? obj.y) * zoom;
        const ow = (resize?.width ?? obj.width) * zoom;
        const oh = (resize?.height ?? obj.height) * zoom;

        ctx.strokeStyle = `${colorBase} ${colorAlpha})`;
        ctx.lineWidth = lineWidth;

        if (obj.type === "rectangle") {
          ctx.strokeRect(ox, oy, ow, oh);
          ctx.fillStyle = `${colorBase} 0.08)`;
          ctx.fillRect(ox, oy, ow, oh);
        } else if (obj.type === "ellipse") {
          ctx.beginPath();
          ctx.ellipse(
            ox + ow / 2,
            oy + oh / 2,
            ow / 2,
            oh / 2,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          ctx.fillStyle = `${colorBase} 0.08)`;
          ctx.fill();
        } else if (obj.type === "point") {
          const ps = 6 * zoom;
          ctx.beginPath();
          ctx.moveTo(ox - ps, oy);
          ctx.lineTo(ox + ps, oy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ox, oy - ps);
          ctx.lineTo(ox, oy + ps);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ox, oy - ps * 0.7);
          ctx.lineTo(ox + ps * 0.7, oy);
          ctx.lineTo(ox, oy + ps * 0.7);
          ctx.lineTo(ox - ps * 0.7, oy);
          ctx.closePath();
          ctx.fillStyle = `${colorBase} 0.3)`;
          ctx.fill();
          ctx.stroke();
        } else if (obj.type === "polygon" && obj.points.length >= 2) {
          const pts = obj.points.map((p, i) =>
            livePolyVertex &&
            livePolyVertex.objectId === obj.id &&
            livePolyVertex.vertexIndex === i
              ? livePolyVertex
              : p,
          );
          ctx.beginPath();
          ctx.moveTo(ox + pts[0].x * zoom, oy + pts[0].y * zoom);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(ox + pts[i].x * zoom, oy + pts[i].y * zoom);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = `${colorBase} 0.08)`;
          ctx.fill();
        }

        // Resize handles for active rect / ellipse
        if (isActive && (obj.type === "rectangle" || obj.type === "ellipse")) {
          const hs = 6;
          const hh = hs / 2;
          const hps: [number, number][] = [
            [ox, oy],
            [ox + ow / 2, oy],
            [ox + ow, oy],
            [ox, oy + oh / 2],
            [ox + ow, oy + oh / 2],
            [ox, oy + oh],
            [ox + ow / 2, oy + oh],
            [ox + ow, oy + oh],
          ];
          for (const [hx, hy] of hps) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(hx - hh, hy - hh, hs, hs);
            ctx.strokeStyle = `${colorBase} 1)`;
            ctx.lineWidth = 1;
            ctx.strokeRect(hx - hh, hy - hh, hs, hs);
          }
        }

        // Vertex handles for active polygon
        if (isActive && obj.type === "polygon") {
          for (let vi = 0; vi < obj.points.length; vi++) {
            const pt = obj.points[vi];
            const liveVt =
              livePolyVertex &&
              livePolyVertex.objectId === obj.id &&
              livePolyVertex.vertexIndex === vi
                ? livePolyVertex
                : null;
            const vx = ox + (liveVt ? liveVt.x : pt.x) * zoom;
            const vy = oy + (liveVt ? liveVt.y : pt.y) * zoom;
            ctx.beginPath();
            ctx.arc(vx, vy, 4, 0, Math.PI * 2);
            ctx.fillStyle = `${colorBase} 0.9)`;
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    }

    // ---- Live object placement preview ----
    if (liveObjectPlace) {
      const { type, x, y, width, height } = liveObjectPlace;
      const px = x * zoom;
      const py = y * zoom;
      const pw = width * zoom;
      const ph = height * zoom;
      ctx.strokeStyle = "rgba(0, 170, 255, 0.8)";
      ctx.lineWidth = 2;
      if (type === "rectangle") {
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = "rgba(0, 170, 255, 0.1)";
        ctx.fillRect(px, py, pw, ph);
      } else if (type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          px + pw / 2,
          py + ph / 2,
          pw / 2,
          ph / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.fillStyle = "rgba(0, 170, 255, 0.1)";
        ctx.fill();
      }
    }

    // ---- Polygon being drawn ----
    if (isDrawingPolygon && polygonPoints.length > 0) {
      if (polygonPoints.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(polygonPoints[0].x * zoom, polygonPoints[0].y * zoom);
        for (let i = 1; i < polygonPoints.length; i++) {
          ctx.lineTo(polygonPoints[i].x * zoom, polygonPoints[i].y * zoom);
        }
        if (polygonCursorPos) {
          ctx.lineTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(0, 170, 255, 0.06)";
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(0, 170, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0].x * zoom, polygonPoints[0].y * zoom);
      for (let i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i].x * zoom, polygonPoints[i].y * zoom);
      }
      ctx.stroke();

      if (polygonCursorPos && polygonPoints.length >= 1) {
        const last = polygonPoints[polygonPoints.length - 1];
        ctx.strokeStyle = "rgba(0, 170, 255, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(last.x * zoom, last.y * zoom);
        ctx.lineTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
        ctx.stroke();

        if (polygonPoints.length >= 2) {
          const first = polygonPoints[0];
          ctx.strokeStyle = "rgba(0, 170, 255, 0.3)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
          ctx.lineTo(first.x * zoom, first.y * zoom);
          ctx.stroke();
        }
      }

      for (let i = 0; i < polygonPoints.length; i++) {
        const pt = polygonPoints[i];
        const isFirst = i === 0;
        let snapHighlight = false;
        if (isFirst && polygonCursorPos && polygonPoints.length >= 3) {
          const dist = Math.hypot(
            (polygonCursorPos.x - pt.x) * zoom,
            (polygonCursorPos.y - pt.y) * zoom,
          );
          snapHighlight = dist < 15;
        }
        const radius = snapHighlight ? 7 : 4;
        ctx.beginPath();
        ctx.arc(pt.x * zoom, pt.y * zoom, radius, 0, Math.PI * 2);
        ctx.fillStyle = snapHighlight
          ? "rgba(0, 255, 136, 1)"
          : "rgba(0, 170, 255, 0.8)";
        ctx.fill();
        if (snapHighlight) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // ---- Tile move ghost overlay ----
    if (currentTool === "select" && moveDestSel && moveTiles.length > 0) {
      ctx.globalAlpha = 0.6;
      for (const { dx: tdx, dy: tdy, ref } of moveTiles) {
        const img = getTileImage(ref);
        if (!img) continue;
        const tx = moveDestSel.x + tdx;
        const ty = moveDestSel.y + tdy;
        if (tx >= mapW || ty >= mapH) continue;
        drawTileWithOrientation(
          ctx,
          img,
          ref,
          tx * scaledTile,
          ty * scaledTile,
          scaledTile,
        );
      }
      ctx.globalAlpha = 1;
    }
  }, [
    canvasW,
    canvasH,
    scaledTile,
    mapW,
    mapH,
    zoom,
    activeLayerId,
    orderedLayerEntries,
    imagesReady,
    currentTool,
    renderedSelection,
    liveImagePos,
    liveImageResize,
    imageLayers,
    objectLayers,
    objects,
    activeObjectId,
    liveObjectPos,
    liveObjectResize,
    liveObjectPlace,
    livePolyVertex,
    isDrawingPolygon,
    polygonPoints,
    polygonCursorPos,
    moveDestSel,
    moveTiles,
    getDisplayImageLayer,
    scaleImageLayer,
  ]);

  // ---------------------------------------------------------------------------
  // Pointer event translation (client → canvas-local coordinates)
  // ---------------------------------------------------------------------------
  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = mainCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button === 0) {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      }
      handlePointerDown({ ...getCanvasCoords(e), button: e.button });
    },
    [getCanvasCoords, handlePointerDown],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      handlePointerMove(getCanvasCoords(e));
    },
    [getCanvasCoords, handlePointerMove],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button === 0) {
        try {
          (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      handlePointerUp({ button: e.button });
    },
    [handlePointerUp],
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Don't fire when pointer is captured (mid-drag)
      if (
        (
          e.target as Element & { hasPointerCapture?(id: number): boolean }
        ).hasPointerCapture?.(e.pointerId)
      ) {
        return;
      }
      handlePointerLeave();
    },
    [handlePointerLeave],
  );

  // Cursor style
  const cursor =
    currentTool === "select"
      ? pendingObjectType
        ? "crosshair"
        : resizingHandle
          ? (() => {
              const activeImgLayer = imageLayers.find(
                (l) => l.id === activeLayerId,
              );
              if (!activeImgLayer) return RESIZE_CURSORS[resizingHandle];
              return getImageLayerResizeCursor(
                scaleImageLayer(getDisplayImageLayer(activeImgLayer)),
                resizingHandle,
              );
            })()
          : hoveredHandle
            ? (() => {
                const activeImgLayer = imageLayers.find(
                  (l) => l.id === activeLayerId,
                );
                if (!activeImgLayer) return RESIZE_CURSORS[hoveredHandle];
                return getImageLayerResizeCursor(
                  scaleImageLayer(getDisplayImageLayer(activeImgLayer)),
                  hoveredHandle,
                );
              })()
            : (hoveredObjectCursor ?? (isMoving ? "grabbing" : "default"))
      : "crosshair";

  const checkSize = 8 * zoom;
  const wrapperWidth = canvasW + MAP_RESIZE_GUTTER;
  const wrapperHeight = canvasH + MAP_RESIZE_GUTTER;
  const sizeLabel = `${previewMapW} × ${previewMapH}`;

  return (
    <div
      style={{
        position: "relative",
        width: wrapperWidth,
        height: wrapperHeight,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: canvasW,
          height: canvasH,
          backgroundColor: "var(--checkerboard-base)",
          backgroundImage:
            "linear-gradient(45deg, var(--checkerboard-accent) 25%, transparent 25%), " +
            "linear-gradient(-45deg, var(--checkerboard-accent) 25%, transparent 25%), " +
            "linear-gradient(45deg, transparent 75%, var(--checkerboard-accent) 75%), " +
            "linear-gradient(-45deg, transparent 75%, var(--checkerboard-accent) 75%)",
          backgroundSize: `${checkSize * 2}px ${checkSize * 2}px`,
          backgroundPosition: `0 0, 0 ${checkSize}px, ${checkSize}px -${checkSize}px, -${checkSize}px 0`,
        }}
      >
        <canvas
          ref={mainCanvasRef}
          width={canvasW}
          height={canvasH}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            imageRendering: "pixelated",
            cursor,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
        <canvas
          ref={paintCanvasRef}
          width={canvasW}
          height={canvasH}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
            imageRendering: "pixelated",
          }}
        />
        <canvas
          ref={topCanvasRef}
          width={canvasW}
          height={canvasH}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
            imageRendering: "pixelated",
          }}
        />
        <canvas
          ref={overlayCanvasRef}
          width={canvasW}
          height={canvasH}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
            imageRendering: "pixelated",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: canvasW,
          width: MAP_RESIZE_GUTTER,
          height: canvasH,
          cursor: RESIZE_CURSORS.e,
          touchAction: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => beginMapResize("e", e)}
      >
        <div
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: (MAP_RESIZE_GUTTER - MAP_RESIZE_RAIL_SIZE) / 2,
            width: MAP_RESIZE_RAIL_SIZE,
            borderRadius: 999,
            background:
              activeMapResizeHandle === "e" || activeMapResizeHandle === "se"
                ? "rgba(251, 146, 60, 0.45)"
                : "rgba(148, 163, 184, 0.28)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasH,
          left: 0,
          width: canvasW,
          height: MAP_RESIZE_GUTTER,
          cursor: RESIZE_CURSORS.s,
          touchAction: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => beginMapResize("s", e)}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: (MAP_RESIZE_GUTTER - MAP_RESIZE_RAIL_SIZE) / 2,
            height: MAP_RESIZE_RAIL_SIZE,
            borderRadius: 999,
            background:
              activeMapResizeHandle === "s" || activeMapResizeHandle === "se"
                ? "rgba(251, 146, 60, 0.45)"
                : "rgba(148, 163, 184, 0.28)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasH,
          left: canvasW,
          width: MAP_RESIZE_GUTTER,
          height: MAP_RESIZE_GUTTER,
          cursor: RESIZE_CURSORS.se,
          touchAction: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => beginMapResize("se", e)}
      >
        <div
          style={{
            position: "absolute",
            inset: 2,
            borderRadius: 4,
            background:
              activeMapResizeHandle === "se"
                ? "rgba(251, 146, 60, 0.45)"
                : "rgba(148, 163, 184, 0.28)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
          }}
        />
      </div>
      {mapResizePreview && (
        <div
          aria-live="polite"
          style={{
            position: "absolute",
            top: Math.max(0, canvasH - MAP_RESIZE_GUTTER - 24),
            left: Math.max(0, canvasW - 70 - MAP_RESIZE_BADGE_OFFSET),
            minWidth: 70,
            padding: "2px 6px",
            borderRadius: 999,
            background: "rgba(15, 23, 42, 0.88)",
            color: "rgba(248, 250, 252, 0.95)",
            border: "1px solid rgba(251, 146, 60, 0.35)",
            fontSize: 11,
            lineHeight: 1.4,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {sizeLabel}
        </div>
      )}
    </div>
  );
});
