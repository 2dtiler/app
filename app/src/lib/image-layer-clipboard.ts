/**
 * Image-layer clipboard — module-level clipboard for whole image layer
 * copy/cut/paste operations in the map editor.
 */

import type { ImageLayerClipboard } from "@/types/editor-helpers";

let imageLayerClipboard: ImageLayerClipboard | null = null;

/** Get the current image-layer clipboard contents. Returns null if empty. */
export function getImageLayerClipboard(): ImageLayerClipboard | null {
  return imageLayerClipboard;
}

/**
 * Set the image-layer clipboard. Fires an `image-layer-clipboard-change`
 * window event so paste availability can react to updates.
 */
export function setImageLayerClipboard(
  data: ImageLayerClipboard | null,
): void {
  imageLayerClipboard = data;
  window.dispatchEvent(new CustomEvent("image-layer-clipboard-change"));
}