import type { TilesetId, AssetId, LayerId } from "@/types";

export interface TileEditorContext {
  tilesetId: TilesetId;
  assetId: AssetId;
  /** X offset of the tile within the tileset image */
  sx: number;
  /** Y offset of the tile within the tileset image */
  sy: number;
  /** Tile width in pixels */
  sw: number;
  /** Tile height in pixels */
  sh: number;
  /** The layer this tile belongs to on the map */
  layerId: LayerId;
  /** Tile grid X position on the map */
  tileX: number;
  /** Tile grid Y position on the map */
  tileY: number;
}

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
