import { Texture, Rectangle, ImageSource } from "pixi.js";
import { getAssetUrl } from "@/lib/db";
import type { AssetId, TilesetId, TileRef } from "@/types";

// ---------------------------------------------------------------------------
// Tileset texture cache — loads and caches base textures for tilesets
// ---------------------------------------------------------------------------

export const textureCache = new Map<string, Texture>();
const textureBlobUrls = new Map<string, string>();
const loadingTextures = new Set<string>();

// Sub-texture cache — reuses the same Texture object for identical tile frames.
// Without this, getTileTexture creates a new Texture on every call, causing
// @pixi/react's reconciler to see a changed `texture` prop on every sprite every
// render, forcing all tile sprites to be re-uploaded even when nothing moved.
export const tileSubTextureCache = new Map<string, Texture>();

export async function loadTilesetTexture(
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

export const imageLayerTextureCache = new Map<string, Texture>();
const imageLayerBlobUrls = new Map<string, string>();
const loadingImageLayers = new Set<string>();

export async function loadImageLayerTexture(
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
export function evictUnusedTextures(activeIds: Set<TilesetId>): void {
  for (const [id] of textureCache) {
    if (!activeIds.has(id as TilesetId)) {
      const tex = textureCache.get(id);
      if (tex) tex.destroy(true);
      textureCache.delete(id);
      // Evict sub-texture cache entries that came from this tileset so they
      // don't hold stale references after the base texture is destroyed.
      const prefix = `${id}:`;
      for (const key of tileSubTextureCache.keys()) {
        if (key.startsWith(prefix)) tileSubTextureCache.delete(key);
      }
      const url = textureBlobUrls.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        textureBlobUrls.delete(id);
      }
    }
  }
}

export function getTileTexture(ref: TileRef): Texture | null {
  const base = textureCache.get(ref.tilesetId);
  if (!base) return null;

  // Return a cached sub-texture so that the same Texture object is reused
  // across renders. This lets @pixi/react's reconciler detect that the
  // `texture` prop is unchanged and skip updating unmodified sprites.
  const cacheKey = `${ref.tilesetId}:${ref.sx},${ref.sy},${ref.sw},${ref.sh}`;
  const cached = tileSubTextureCache.get(cacheKey);
  if (cached) return cached;

  const frame = new Rectangle(ref.sx, ref.sy, ref.sw, ref.sh);
  try {
    const tex = new Texture({ source: base.source, frame });
    tileSubTextureCache.set(cacheKey, tex);
    return tex;
  } catch {
    return null;
  }
}
