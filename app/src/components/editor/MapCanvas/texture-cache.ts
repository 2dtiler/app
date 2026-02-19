import { getAssetUrl } from "@/lib/db";
import type { AssetId, TilesetId, TileRef } from "@/types";

// ---------------------------------------------------------------------------
// Tileset image cache — loads and caches HTMLImageElement for tilesets
// ---------------------------------------------------------------------------

export const tilesetImageCache = new Map<TilesetId, HTMLImageElement>();
const tilesetBlobUrls = new Map<TilesetId, string>();
// Promise deduplication: if a tileset is already being loaded, all callers
// share the same promise so none silently returns null mid-flight.
const loadingTilesetPromises = new Map<
  TilesetId,
  Promise<HTMLImageElement | null>
>();

export function loadTilesetImage(
  tilesetId: TilesetId,
  assetId: AssetId,
): Promise<HTMLImageElement | null> {
  if (tilesetImageCache.has(tilesetId))
    return Promise.resolve(tilesetImageCache.get(tilesetId)!);

  // If already in-flight, all callers share the same promise and will all
  // receive the result once it resolves — no more silent null returns.
  const inflight = loadingTilesetPromises.get(tilesetId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const url = await getAssetUrl(assetId);
      if (!url) return null;
      tilesetBlobUrls.set(tilesetId, url);
      const img = new Image();
      img.src = url;
      await img.decode();
      tilesetImageCache.set(tilesetId, img);
      return img;
    } catch {
      return null;
    } finally {
      loadingTilesetPromises.delete(tilesetId);
    }
  })();

  loadingTilesetPromises.set(tilesetId, promise);
  return promise;
}

/**
 * Evict cached images for tilesets no longer referenced, revoking object URLs.
 */
export function evictUnusedTilesets(activeIds: Set<TilesetId>): void {
  for (const [id] of tilesetImageCache) {
    if (!activeIds.has(id as TilesetId)) {
      tilesetImageCache.delete(id as TilesetId);
      const url = tilesetBlobUrls.get(id as TilesetId);
      if (url) {
        URL.revokeObjectURL(url);
        tilesetBlobUrls.delete(id as TilesetId);
      }
    }
  }
}

/**
 * Evict a single tileset from the cache (e.g. after its asset has been updated).
 * Revokes the associated object URL so the browser releases the blob memory.
 */
export function evictTileset(tilesetId: TilesetId): void {
  const url = tilesetBlobUrls.get(tilesetId);
  if (url) {
    URL.revokeObjectURL(url);
    tilesetBlobUrls.delete(tilesetId);
  }
  tilesetImageCache.delete(tilesetId);
}

export function getTileImage(ref: TileRef): HTMLImageElement | null {
  return tilesetImageCache.get(ref.tilesetId) ?? null;
}

/**
 * Draw a tile onto `ctx` at destination (dx, dy) with size scaledTile,
 * applying any orientation transforms stored in the TileRef
 * (rotation + horizontal/vertical flip).
 *
 * Transforms are applied as: rotate first, then flip (in the rotated space).
 * This gives intuitive behaviour where flip is always relative to the tile's
 * own local axes and is independent of rotation.
 */
export function drawTileWithOrientation(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  ref: TileRef,
  dx: number,
  dy: number,
  scaledTile: number,
): void {
  const rotation = ref.rotation ?? 0;
  const flipX = ref.flipX ?? false;
  const flipY = ref.flipY ?? false;

  if (rotation === 0 && !flipX && !flipY) {
    ctx.drawImage(
      img,
      ref.sx,
      ref.sy,
      ref.sw,
      ref.sh,
      dx,
      dy,
      scaledTile,
      scaledTile,
    );
    return;
  }

  const cx = dx + scaledTile / 2;
  const cy = dy + scaledTile / 2;
  const half = scaledTile / 2;

  ctx.save();
  ctx.translate(cx, cy);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (flipX || flipY) {
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }
  ctx.drawImage(
    img,
    ref.sx,
    ref.sy,
    ref.sw,
    ref.sh,
    -half,
    -half,
    scaledTile,
    scaledTile,
  );
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Image layer image cache — loads image layer assets as HTMLImageElements
// ---------------------------------------------------------------------------

export const imageLayerImageCache = new Map<AssetId, HTMLImageElement>();
const imageLayerBlobUrls = new Map<AssetId, string>();
// Same promise-deduplication pattern as tilesets.
const loadingImageLayerPromises = new Map<
  AssetId,
  Promise<HTMLImageElement | null>
>();

export function loadImageLayerImage(
  assetId: AssetId,
): Promise<HTMLImageElement | null> {
  if (imageLayerImageCache.has(assetId))
    return Promise.resolve(imageLayerImageCache.get(assetId)!);

  const inflight = loadingImageLayerPromises.get(assetId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const url = await getAssetUrl(assetId);
      if (!url) return null;
      imageLayerBlobUrls.set(assetId, url);
      const img = new Image();
      img.src = url;
      await img.decode();
      imageLayerImageCache.set(assetId, img);
      return img;
    } catch {
      return null;
    } finally {
      loadingImageLayerPromises.delete(assetId);
    }
  })();

  loadingImageLayerPromises.set(assetId, promise);
  return promise;
}
