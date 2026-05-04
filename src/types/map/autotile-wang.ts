import type { AutotileTileRegion } from "./autotile";

export const AUTOTILE_WANG_ID_LENGTH = 8 as const;

export type AutotileWangSetType = "edge" | "corner" | "mixed";

export type AutotileWangSetId = string & {
  readonly __brand: "AutotileWangSetId";
};

export const AUTOTILE_WANG_POSITIONS = [
  "north",
  "northEast",
  "east",
  "southEast",
  "south",
  "southWest",
  "west",
  "northWest",
] as const;

export type AutotileWangPosition = (typeof AUTOTILE_WANG_POSITIONS)[number];

export const AUTOTILE_WANG_POSITION_INDEXES = {
  north: 0,
  northEast: 1,
  east: 2,
  southEast: 3,
  south: 4,
  southWest: 5,
  west: 6,
  northWest: 7,
} as const satisfies Record<AutotileWangPosition, number>;

export const AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE = {
  edge: ["north", "east", "south", "west"],
  corner: ["northEast", "southEast", "southWest", "northWest"],
  mixed: [...AUTOTILE_WANG_POSITIONS],
} as const satisfies Record<
  AutotileWangSetType,
  readonly AutotileWangPosition[]
>;

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
  tile: AutotileTileRegion | null;
  wangId: AutotileWangId;
  probability: number;
}

export interface AutotileWangSet {
  id: AutotileWangSetId;
  name: string;
  type: AutotileWangSetType;
  tile: AutotileTileRegion | null;
  colors: AutotileWangColor[];
  tiles: AutotileWangTile[];
}
