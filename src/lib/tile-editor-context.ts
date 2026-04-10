import type { TileEditorContext } from "@/types/editor-helpers";

export interface PendingTileEditorRequest {
  requestId: number;
  context: TileEditorContext;
}

let activeContext: TileEditorContext | null = null;
let activeRequestId = 0;

/** Set the tile editor context (call before opening the image editor drawer). */
export function setTileEditorContext(ctx: TileEditorContext | null): void {
  activeContext = ctx;
  if (ctx) {
    activeRequestId += 1;
  }
}

/** Get the current tile editor context. */
export function getTileEditorContext(): TileEditorContext | null {
  return activeContext;
}

/** Read the latest tile-editor request without clearing it. */
export function getPendingTileEditorRequest(): PendingTileEditorRequest | null {
  if (!activeContext) {
    return null;
  }

  return {
    requestId: activeRequestId,
    context: activeContext,
  };
}

/** Clear the tile editor context once the matching request has been handled. */
export function clearTileEditorContext(requestId?: number): void {
  if (requestId !== undefined && requestId !== activeRequestId) {
    return;
  }

  activeContext = null;
}
