/**
 * MapScene — the inner Pixi scene rendered inside a <Application> context.
 *
 * Owns all draw callbacks (checkerboard, grid, selection overlays, objects)
 * and assembles the full scene graph from tile/image/object layers.
 * Interaction state and pointer handlers are delegated to useSceneInteraction.
 */

import { memo, useCallback, useMemo, useEffect } from "react";
import { useApplication } from "@pixi/react";
import { Graphics } from "pixi.js";
import type { TileLayer, ImageLayer } from "@/types";
import type { MapCanvasProps } from "./types";
import { RESIZE_CURSORS } from "./resize-utils";
import { imageLayerTextureCache, getTileTexture } from "./texture-cache";
import { useSceneInteraction } from "./use-scene-interaction";

// ---------------------------------------------------------------------------
// MapScene component
// ---------------------------------------------------------------------------

export const MapScene = memo(function MapScene({
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

  // ---------------------------------------------------------------------------
  // Interaction hook — all pointer state and handlers
  // ---------------------------------------------------------------------------

  const {
    hoverGraphicsRef,
    hoverDrawNoop,
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
  } = useSceneInteraction({
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
  });

  // ---------------------------------------------------------------------------
  // Draw callbacks
  // ---------------------------------------------------------------------------

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

  const drawGrid = useCallback(
    (g: Graphics) => {
      g.clear();

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

      g.setStrokeStyle({ width: 2, color: 0xffa500, alpha: 0.5 });
      g.rect(1, 1, canvasW - 2, canvasH - 2);
      g.stroke();
    },
    [canvasW, canvasH, scaledTile],
  );

  const drawSelection = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!renderedSelection) return;

      const sx = renderedSelection.x * scaledTile;
      const sy = renderedSelection.y * scaledTile;
      const sw = renderedSelection.width * scaledTile;
      const sh = renderedSelection.height * scaledTile;

      g.rect(sx, sy, sw, sh);
      g.fill({ color: 0x3b82f6, alpha: 0.15 });

      g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.8 });
      g.rect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
      g.stroke();

      g.setStrokeStyle({ width: 1, color: 0x3b82f6, alpha: 1 });
      g.rect(sx + 1.5, sy + 1.5, sw - 3, sh - 3);
      g.stroke();
    },
    [renderedSelection, scaledTile],
  );

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

      g.rect(posX, posY, w, h);
      g.fill({ color: 0x3b82f6, alpha: 0.08 });

      g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.8 });
      g.rect(posX + 0.5, posY + 0.5, w - 1, h - 1);
      g.stroke();

      g.setStrokeStyle({ width: 2, color: 0x3b82f6, alpha: 1 });
      g.rect(posX - 0.5, posY - 0.5, w + 1, h + 1);
      g.stroke();

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

  const drawObjects = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const objLayer of objectLayers) {
        if (!objLayer.visible) continue;
        const layerObjects = objects.filter((o) => o.layerId === objLayer.id);
        for (const obj of layerObjects) {
          if (!obj.visible) continue;
          const isActive = obj.id === activeObjectId;
          const color = isActive ? 0x00aaff : 0x00ccaa;
          const alpha = isActive ? 1 : 0.7;
          const lineWidth = isActive ? 2 : 1.5;

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
            g.setStrokeStyle({ width: lineWidth, color, alpha });
            g.moveTo(px - ps, py);
            g.lineTo(px + ps, py);
            g.stroke();
            g.moveTo(px, py - ps);
            g.lineTo(px, py + ps);
            g.stroke();
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
              g.moveTo(dx + pts[0].x * zoom, dy + pts[0].y * zoom);
              for (let i = 1; i < pts.length; i++) {
                g.lineTo(dx + pts[i].x * zoom, dy + pts[i].y * zoom);
              }
              g.closePath();
              g.fill({ color, alpha: 0.08 });
            }
          }

          // Resize handles for selected rectangle/ellipse
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

          // Vertex handles for selected polygon
          if (isActive && obj.type === "polygon") {
            const vr = 4;
            for (let vi = 0; vi < obj.points.length; vi++) {
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

      // Live placement preview
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

      // Polygon being drawn
      if (isDrawingPolygon && polygonPoints.length > 0) {
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

        g.setStrokeStyle({ width: 2, color: 0x00aaff, alpha: 0.8 });
        g.moveTo(polygonPoints[0].x * zoom, polygonPoints[0].y * zoom);
        for (let i = 1; i < polygonPoints.length; i++) {
          g.lineTo(polygonPoints[i].x * zoom, polygonPoints[i].y * zoom);
        }
        g.stroke();

        if (polygonCursorPos && polygonPoints.length >= 1) {
          const last = polygonPoints[polygonPoints.length - 1];
          g.setStrokeStyle({ width: 1.5, color: 0x00aaff, alpha: 0.5 });
          g.moveTo(last.x * zoom, last.y * zoom);
          g.lineTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
          g.stroke();

          if (polygonPoints.length >= 2) {
            const first = polygonPoints[0];
            g.setStrokeStyle({ width: 1, color: 0x00aaff, alpha: 0.3 });
            g.moveTo(polygonCursorPos.x * zoom, polygonCursorPos.y * zoom);
            g.lineTo(first.x * zoom, first.y * zoom);
            g.stroke();
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

  // ---------------------------------------------------------------------------
  // Derived rendering data
  // ---------------------------------------------------------------------------

  const moveTiles = moveTilesSnapshot ?? [];
  const moveDestSel = moveTilesSnapshot ? liveSelection : null;

  // Layers in render order (bottom to top) — both tile and image layers
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

  // ---------------------------------------------------------------------------
  // Scene graph
  // ---------------------------------------------------------------------------

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

      {/* Hover highlight — drawn imperatively via ref, no React render needed */}
      <pixiGraphics ref={hoverGraphicsRef} draw={hoverDrawNoop} />

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
