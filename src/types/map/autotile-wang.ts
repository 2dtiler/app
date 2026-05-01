import type { AutotileTileRegion } from "./autotile";

export const AUTOTILE_WANG_ID_LENGTH = 8 as const;

export type AutotileWangSetType = "edge" | "corner" | "mixed";

export type AutotileWangPosition =
  | "north"
  | "northEast"
  | "east"
  | "southEast"
  | "south"
  | "southWest"
  | "west"
  | "northWest";

export type AutotileWangId = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface AutotileWangColor {
  index: number;
  name: string;
  color: string;
  tile: AutotileTileRegion | null;
  probability: number;
}

export interface AutotileWangTile {
  tile: AutotileTileRegion;
  wangId: AutotileWangId;
  probability: number;
}

export interface AutotileWangSet {
  id: string;
  name: string;
  type: AutotileWangSetType;
  tile: AutotileTileRegion | null;
  colors: AutotileWangColor[];
  tiles: AutotileWangTile[];
}
