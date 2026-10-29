import { areTileRefsEqual } from "@/features/map-editor/lib/tile-stamp";
import type { TileRef } from "@/types";

/**
 * Merge a resolved tile write into the live paint buffer.
 * Cells that already match the committed layer stay on the canvas.
 * Callers redraw the whole active layer when this returns true.
 */
export function syncPaintBufferWithResolvedTiles(
  paintBuffer: Map<string, TileRef | null>,
  committedTiles: Record<string, TileRef>,
  resolved: ReadonlyMap<string, TileRef | null>,
): boolean {
  let mutated = false;

  for (const [key, ref] of resolved.entries()) {
    const committedRef = committedTiles[key] ?? null;

    if (ref === null) {
      if (committedRef === null) {
        mutated = paintBuffer.delete(key) || mutated;
      } else if (paintBuffer.get(key) !== null) {
        paintBuffer.set(key, null);
        mutated = true;
      }
      continue;
    }

    if (areTileRefsEqual(committedRef, ref)) {
      mutated = paintBuffer.delete(key) || mutated;
      continue;
    }

    if (!areTileRefsEqual(paintBuffer.get(key), ref)) {
      paintBuffer.set(key, ref);
      mutated = true;
    }
  }

  return mutated;
}

export function markPaintBufferErased(
  paintBuffer: Map<string, TileRef | null>,
  key: string,
  committedRef: TileRef | null,
): boolean {
  if (committedRef === null) {
    return paintBuffer.delete(key);
  }

  if (paintBuffer.get(key) === null) {
    return false;
  }

  paintBuffer.set(key, null);
  return true;
}
