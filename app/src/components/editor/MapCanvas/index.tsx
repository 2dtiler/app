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

import { useRef, useEffect, useState, memo } from "react";
import { Application, extend } from "@pixi/react";
import { Container, Sprite, Graphics } from "pixi.js";
import type { TilesetId } from "@/types";
import type { MapCanvasProps } from "./types";
import {
  textureCache,
  imageLayerTextureCache,
  loadTilesetTexture,
  loadImageLayerTexture,
  evictUnusedTextures,
} from "./texture-cache";
import { MapScene } from "./MapScene";

// Register Pixi components for JSX usage
extend({ Container, Sprite, Graphics });

export type { MapCanvasProps } from "./types";

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
