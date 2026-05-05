import { getMapCellOrigin } from "@/features/map-editor/lib/map-geometry";
import { resolveAnimatedTileRef } from "@/features/map-editor/lib/tileset-animations";
import {
  drawImageLayerWithOrientation,
  drawTileWithOrientation,
  getTileImage,
  imageLayerImageCache,
} from "./texture-cache";
import type { ImageLayer, TileLayer, TileRef } from "@/types";
import type {
  RenderActiveLayerEntryParams,
  RenderLayerEntriesParams,
} from "@/features/map-editor/types/map-canvas-rendering";

function mergePaintBufferIntoLayer(
  layer: TileLayer,
  paintBuffer: ReadonlyMap<string, TileRef | null>,
): TileLayer {
  if (paintBuffer.size === 0) {
    return layer;
  }

  const tiles = { ...layer.tiles };

  for (const [key, ref] of paintBuffer.entries()) {
    if (ref === null) {
      delete tiles[key];
      continue;
    }

    tiles[key] = ref;
  }

  return {
    ...layer,
    tiles,
  };
}

function drawTileLayer(
  context: CanvasRenderingContext2D,
  layer: TileLayer,
  params: Pick<
    RenderLayerEntriesParams,
    "animationElapsedMs" | "map" | "scaledTile" | "tilesets" | "zoom"
  >,
) {
  if (!layer.visible) return;

  for (const [key, ref] of Object.entries(layer.tiles) as [string, TileRef][]) {
    const resolvedRef = resolveAnimatedTileRef(
      ref,
      params.tilesets,
      params.animationElapsedMs,
    );
    const image = getTileImage(resolvedRef);
    if (!image) continue;

    const [gridX, gridY] = key.split(",").map(Number);
    const origin = getMapCellOrigin(params.map, params.zoom, gridX, gridY);
    drawTileWithOrientation(
      context,
      image,
      resolvedRef,
      origin.x,
      origin.y,
      params.scaledTile,
    );
  }
}

function drawImageLayer(
  context: CanvasRenderingContext2D,
  layer: ImageLayer,
  params: Pick<
    RenderLayerEntriesParams,
    "getDisplayImageLayer" | "scaleImageLayer"
  >,
) {
  if (!layer.visible) return;

  const image = imageLayerImageCache.get(layer.assetId);
  if (!image) return;

  const scaledImageLayer = params.scaleImageLayer(
    params.getDisplayImageLayer(layer),
  );
  context.globalAlpha = Math.max(0, Math.min(100, layer.opacity ?? 100)) / 100;
  drawImageLayerWithOrientation(context, image, scaledImageLayer);
  context.globalAlpha = 1;
}

export function renderLayerEntriesToCanvas({
  animationElapsedMs,
  canvas,
  entries,
  getDisplayImageLayer,
  height,
  map,
  scaleImageLayer,
  scaledTile,
  tileAlpha,
  tilesets,
  width,
  zoom,
}: RenderLayerEntriesParams) {
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);

  for (const entry of entries) {
    if (entry.kind === "image") {
      drawImageLayer(context, entry.layer, {
        getDisplayImageLayer,
        scaleImageLayer,
      });
      continue;
    }

    context.globalAlpha = tileAlpha;
    drawTileLayer(context, entry.layer, {
      animationElapsedMs,
      map,
      scaledTile,
      tilesets,
      zoom,
    });
    context.globalAlpha = 1;
  }
}

export function renderActiveLayerEntryToCanvas({
  animationElapsedMs,
  canvas,
  entry,
  getDisplayImageLayer,
  map,
  paintBuffer,
  scaleImageLayer,
  scaledTile,
  tilesets,
  zoom,
}: RenderActiveLayerEntryParams) {
  const context = canvas.getContext("2d");
  if (!context) return;

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!entry) return;

  if (entry.kind === "image") {
    drawImageLayer(context, entry.layer, {
      getDisplayImageLayer,
      scaleImageLayer,
    });
    return;
  }

  drawTileLayer(context, mergePaintBufferIntoLayer(entry.layer, paintBuffer), {
    animationElapsedMs,
    map,
    scaledTile,
    tilesets,
    zoom,
  });
}
