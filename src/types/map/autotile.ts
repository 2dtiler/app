export const AUTOTILE_CONFIG_VERSION = 1 as const;

export type AutotileConfigVersion = typeof AUTOTILE_CONFIG_VERSION;

export type AutotileTerrainId = string & {
  readonly __brand: "AutotileTerrainId";
};

export type AutotileRuleId = string & {
  readonly __brand: "AutotileRuleId";
};

export const AUTOTILE_NEIGHBOR_POSITIONS = [
  "northWest",
  "north",
  "northEast",
  "west",
  "east",
  "southWest",
  "south",
  "southEast",
] as const;

export type AutotileNeighborPosition =
  (typeof AUTOTILE_NEIGHBOR_POSITIONS)[number];

export interface AutotileTileRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export type AutotileNeighborMatcher =
  | { kind: "any" }
  | { kind: "empty" }
  | { kind: "filled" }
  | { kind: "terrain"; terrainId: AutotileTerrainId }
  | { kind: "notTerrain"; terrainId: AutotileTerrainId };

export interface AutotileTerrain {
  id: AutotileTerrainId;
  name: string;
  paletteTile: AutotileTileRegion | null;
}

export interface AutotileRule {
  id: AutotileRuleId;
  name: string;
  centerTerrainId: AutotileTerrainId;
  neighbors: Record<AutotileNeighborPosition, AutotileNeighborMatcher>;
  output: AutotileTileRegion | null;
}

export interface AutotileConfig {
  version: AutotileConfigVersion;
  terrains: AutotileTerrain[];
  rules: AutotileRule[];
}
