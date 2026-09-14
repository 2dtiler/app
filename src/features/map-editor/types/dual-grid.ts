import type {
  AutotileTerrain,
  AutotileTerrainId,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  TilesetId,
} from "@/types";

export interface DualGridPaintWrite {
  x: number;
  y: number;
  terrainId: AutotileTerrainId | null;
}

export interface ResolveDualGridWritesOptions {
  mapWidth: number;
  mapHeight: number;
  logicalTerrains: Record<string, AutotileTerrainId>;
  terrain: AutotileTerrain;
  tilesetId: TilesetId;
  writes: DualGridPaintWrite[];
}

export interface DualGridWriteResult {
  logicalTerrains: Record<string, AutotileTerrainId>;
  tiles: Map<string, TileRef | null>;
}

export type DualGridLayer = Pick<TileLayer, "tilingMode" | "logicalTerrains">;

export interface DualGridPaintLayerContext {
  brushSize: string;
  currentTool: string;
  fill: (
    logicalTerrains: Record<string, AutotileTerrainId>,
    tiles: Map<string, TileRef | null>,
  ) => void;
  gx: number;
  gy: number;
  layer: TileLayer;
  mapHeight: number;
  mapWidth: number;
  map: TileMapData;
  onMissingSetup: () => void;
  pendingLogicalWrites: Map<string, AutotileTerrainId | null>;
  preferredTilesetId?: TilesetId | null;
  selectedTerrainId: AutotileTerrainId | undefined;
  stroke: (
    writes: DualGridPaintWrite[],
    terrain: AutotileTerrain,
    tilesetId: TilesetId,
  ) => void;
  tilesets: readonly Tileset[];
}

export interface AutoEnableDualGridResult {
  enabled: boolean;
  clearedTiles: boolean;
  layerName: string | null;
}

export interface SyncActiveTilesetResult {
  autoEnabledDualGrid: boolean;
  clearedLayerTiles: boolean;
  layerName: string | null;
}
