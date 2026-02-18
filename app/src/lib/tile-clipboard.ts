/**
 * Tile clipboard — module-level clipboard for copy/cut/paste tile operations.
 *
 * Using a module-level variable (not React state) so the clipboard is
 * accessible from both the global keyboard shortcut handler and individual
 * panel components without requiring a React context.
 */

import type { TileRef } from "@/types";

export interface TileClipboard {
  /** Relative tile positions and their references within the copied region */
  tiles: { dx: number; dy: number; ref: TileRef }[];
  /** Width of the copied region in tiles */
  width: number;
  /** Height of the copied region in tiles */
  height: number;
}

let _clipboard: TileClipboard | null = null;

/** Get the current tile clipboard contents. Returns null if empty. */
export function getClipboard(): TileClipboard | null {
  return _clipboard;
}

/**
 * Set the tile clipboard. Fires a `tile-clipboard-change` window event
 * so any component watching for paste availability can update.
 */
export function setClipboard(data: TileClipboard | null): void {
  _clipboard = data;
  window.dispatchEvent(new CustomEvent("tile-clipboard-change"));
}
