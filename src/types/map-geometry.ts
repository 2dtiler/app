export const MAP_ORIENTATIONS = ["orthogonal", "hexagonal"] as const;
export type MapOrientation = (typeof MAP_ORIENTATIONS)[number];

export const NEW_MAP_TYPES = [
  "orthogonal",
  "hexagonal-row",
  "hexagonal-column",
] as const;
export type NewMapType = (typeof NEW_MAP_TYPES)[number];

export const MAP_STAGGER_AXES = ["x", "y"] as const;
export type MapStaggerAxis = (typeof MAP_STAGGER_AXES)[number];

export const MAP_STAGGER_INDEXES = ["odd", "even"] as const;
export type MapStaggerIndex = (typeof MAP_STAGGER_INDEXES)[number];

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapCell {
  x: number;
  y: number;
}

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapPixelSize {
  width: number;
  height: number;
}

export interface TileMapGeometry {
  orientation: MapOrientation;
  staggerAxis?: MapStaggerAxis;
  staggerIndex?: MapStaggerIndex;
}

export const DEFAULT_MAP_GEOMETRY: TileMapGeometry = {
  orientation: "orthogonal",
};

export const DEFAULT_NEW_MAP_TYPE: NewMapType = "orthogonal";

export const DEFAULT_HEX_STAGGER_AXIS: MapStaggerAxis = "x";
export const DEFAULT_HEX_STAGGER_INDEX: MapStaggerIndex = "odd";
