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
  TileRef,
  TilesetId,
  EditorState,
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
}: MapCanvasProps & { texturesReady: number }) {
  const { app, isInitialised } = useApplication();
  const isPaintingRef = useRef(false);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(
    null,
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

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: { global: { x: number; y: number }; button?: number }) => {
      // Ignore middle mouse button (1) — reserved for panning
      if (e.button === 1) return;
      const pos = getGridPos(e.global.x, e.global.y);
      if (!pos) return;
      isPaintingRef.current = true;
      onPaintTile(pos.x, pos.y);
    },
    [getGridPos, onPaintTile],
  );

  const handlePointerMove = useCallback(
    (e: { global: { x: number; y: number } }) => {
      const pos = getGridPos(e.global.x, e.global.y);
      setHoverTile(pos);

      if (!isPaintingRef.current) return;
      if (currentTool === "fill") return; // fill = single-click only
      if (!pos) return;
      onPaintTile(pos.x, pos.y);
    },
    [getGridPos, currentTool, onPaintTile],
  );

  const handlePointerUp = useCallback(
    (e?: { button?: number }) => {
      // Ignore middle mouse button release
      if (e?.button === 1) return;
      isPaintingRef.current = false;
      onPaintEnd();
    },
    [onPaintEnd],
  );

  const handlePointerLeave = useCallback(() => {
    setHoverTile(null);
    if (isPaintingRef.current) {
      isPaintingRef.current = false;
      onPaintEnd();
    }
  }, [onPaintEnd]);

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
      if (!hoverTile) return;

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

  // Get layers in render order (bottom to top)
  const orderedLayers = useMemo(
    () =>
      map.layerOrder
        .map((lid) => layers.find((l) => l.id === lid))
        .filter((l): l is TileLayer => l !== undefined),
    [map.layerOrder, layers],
  );

  // Force reference to texturesReady / paintBufferVersion for reactivity
  void texturesReady;
  void paintBufferVersion;

  return (
    <>
      {/* Checkerboard background */}
      <pixiGraphics draw={drawCheckerboard} />

      {/* Tile layers */}
      {orderedLayers.map((layer) => {
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
        cursor="crosshair"
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
      if (loaded > 0 && !cancelled) {
        setTexturesReady((n) => n + loaded);
      }
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [map.layerOrder, props.layers, tilesets, props.selectedTile]);

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
