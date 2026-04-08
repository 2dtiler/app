import type { TileEditorContext } from "@/types/editor-helpers";

export type { TileEditorContext } from "@/types/editor-helpers";

let activeContext: TileEditorContext | null = null;

/** Set the tile editor context (call before opening the image editor drawer). */
export function setTileEditorContext(ctx: TileEditorContext | null): void {
  activeContext = ctx;
}

/** Get the current tile editor context. */
export function getTileEditorContext(): TileEditorContext | null {
  return activeContext;
}

/** Consume and clear the tile editor context (call once when the editor initialises). */
export function consumeTileEditorContext(): TileEditorContext | null {
  const ctx = activeContext;
  activeContext = null;
  return ctx;
}
