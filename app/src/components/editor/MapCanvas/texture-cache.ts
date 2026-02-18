import { getAssetUrl } from "@/lib/db";
import type { AssetId, TilesetId, TileRef } from "@/types";

// ---------------------------------------------------------------------------
// Tileset image cache — loads and caches HTMLImageElement for tilesets
// ---------------------------------------------------------------------------

export const tilesetImageCache = new Map<TilesetId, HTMLImageElement>();
const tilesetBlobUrls = new Map<TilesetId, string>();
const loadingTilesets = new Set<TilesetId>();

export async function loadTilesetImage(
  tilesetId: TilesetId,
  assetId: AssetId,
): Promise<HTMLImageElement | null> {
  if (tilesetImageCache.has(tilesetId))
    return tilesetImageCache.get(tilesetId)!;
  if (loadingTilesets.has(tilesetId)) return null;

  loadingTilesets.add(tilesetId);
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
    loadingTilesets.delete(tilesetId);
  }
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

export function getTileImage(ref: TileRef): HTMLImageElement | null {
  return tilesetImageCache.get(ref.tilesetId) ?? null;
}

// ---------------------------------------------------------------------------
// Image layer image cache — loads image layer assets as HTMLImageElements
// ---------------------------------------------------------------------------

export const imageLayerImageCache = new Map<AssetId, HTMLImageElement>();
const imageLayerBlobUrls = new Map<AssetId, string>();
const loadingImageLayers = new Set<AssetId>();

export async function loadImageLayerImage(
  assetId: AssetId,
): Promise<HTMLImageElement | null> {
  if (imageLayerImageCache.has(assetId))
    return imageLayerImageCache.get(assetId)!;
  if (loadingImageLayers.has(assetId)) return null;

  loadingImageLayers.add(assetId);
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
    loadingImageLayers.delete(assetId);
  }
}
