export const TILESET_ANIMATION_CONFIG_VERSION = 1 as const;

export type TilesetAnimationConfigVersion =
  typeof TILESET_ANIMATION_CONFIG_VERSION;

export type TilesetAnimationId = string & {
  readonly __brand: "TilesetAnimationId";
};

export interface TilesetAnimationTileRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface TilesetAnimationFrame {
  durationMs: number;
  cells: (TilesetAnimationTileRegion | null)[];
}

export interface TilesetAnimation {
  id: TilesetAnimationId;
  name: string;
  widthInTiles: number;
  heightInTiles: number;
  frames: TilesetAnimationFrame[];
  createdAt: number;
  updatedAt: number;
}

export interface TilesetAnimationConfig {
  version: TilesetAnimationConfigVersion;
  animations: TilesetAnimation[];
}
