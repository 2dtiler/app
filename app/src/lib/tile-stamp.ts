import type { SelectedTile, TileRef } from "@/types";

export interface TileStampCell {
  dx: number;
  dy: number;
  ref: TileRef;
}

export interface TileStamp {
  width: number;
  height: number;
  cells: TileStampCell[];
}

type TileStampSource = Pick<
  SelectedTile,
  "tilesetId" | "sx" | "sy" | "sw" | "sh"
>;

export function areTileRefsEqual(
  a: TileRef | null | undefined,
  b: TileRef | null | undefined,
): boolean {
  if (a == null || b == null) {
    return a == null && b == null;
  }

  return (
    a.tilesetId === b.tilesetId &&
    a.sx === b.sx &&
    a.sy === b.sy &&
    a.sw === b.sw &&
    a.sh === b.sh &&
    (a.rotation ?? 0) === (b.rotation ?? 0) &&
    (a.flipX ?? false) === (b.flipX ?? false) &&
    (a.flipY ?? false) === (b.flipY ?? false)
  );
}

export function createTileStamp(
  selectedTile: TileStampSource,
  tileSize: number,
): TileStamp {
  const width = Math.max(1, Math.round(selectedTile.sw / tileSize));
  const height = Math.max(1, Math.round(selectedTile.sh / tileSize));
  const cells: TileStampCell[] = [];

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({
        dx,
        dy,
        ref: {
          tilesetId: selectedTile.tilesetId,
          sx: selectedTile.sx + dx * tileSize,
          sy: selectedTile.sy + dy * tileSize,
          sw: tileSize,
          sh: tileSize,
        },
      });
    }
  }

  return { width, height, cells };
}

export function getTileStampRef(
  stamp: TileStamp,
  x: number,
  y: number,
): TileRef {
  const dx = ((x % stamp.width) + stamp.width) % stamp.width;
  const dy = ((y % stamp.height) + stamp.height) % stamp.height;
  return stamp.cells[dy * stamp.width + dx].ref;
}

export function isMultiTileStamp(stamp: TileStamp): boolean {
  return stamp.width > 1 || stamp.height > 1;
}
