/**
 * Core type definitions for the 2D Tiler application.
 *
 * All types are JSON-serializable to satisfy `travels` (mutative) constraints.
 * Binary data (images) is stored separately in IndexedDB and referenced by ID.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Branded string ID for type safety */
export type ProjectId = string & { readonly __brand: "ProjectId" };
export type TilesetId = string & { readonly __brand: "TilesetId" };
export type TilesetGroupId = string & { readonly __brand: "TilesetGroupId" };
export type MapId = string & { readonly __brand: "MapId" };
export type MapGroupId = string & { readonly __brand: "MapGroupId" };
export type LayerId = string & { readonly __brand: "LayerId" };
export type LayerGroupId = string & { readonly __brand: "LayerGroupId" };
export type AssetId = string & { readonly __brand: "AssetId" };

// ---------------------------------------------------------------------------
// Brush / Tile Size
// ---------------------------------------------------------------------------

/** Supported tile sizes in pixels */
export const TILE_SIZES = [8, 16, 32, 48, 64, 128] as const;
export type TileSize = (typeof TILE_SIZES)[number];

// ---------------------------------------------------------------------------
// Tileset
// ---------------------------------------------------------------------------

export interface Tileset {
  id: TilesetId;
  name: string;
  groupId: TilesetGroupId;
  /** Reference to the source image blob stored in IndexedDB */
  assetId: AssetId;
  /** Width of the source image in pixels */
  imageWidth: number;
  /** Height of the source image in pixels */
  imageHeight: number;
  createdAt: number;
}

export interface TilesetGroup {
  id: TilesetGroupId;
  name: string;
  order: number;
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export interface TileMapData {
  id: MapId;
  name: string;
  groupId: MapGroupId;
  /** Width of the map in tile units */
  widthInTiles: number;
  /** Height of the map in tile units */
  heightInTiles: number;
  /** The tile size used by this map (px) */
  tileSize: TileSize;
  /** Ordered layer/group IDs from bottom to top (top-level items) */
  layerOrder: (LayerId | LayerGroupId)[];
  createdAt: number;
}

export interface MapGroup {
  id: MapGroupId;
  name: string;
  order: number;
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type LayerType = "tile" | "image" | "object";

export interface TileLayer {
  id: LayerId;
  mapId: MapId;
  name: string;
  type?: LayerType;
  visible: boolean;
  locked: boolean;
  /**
   * Sparse tile data: key = "x,y", value = tile reference.
   * Using a Record instead of a 2D array for memory efficiency with sparse maps.
   */
  tiles: Record<string, TileRef>;
}

/**
 * A group of layers that can be collapsed, hidden, locked, and moved as a unit.
 * Functions like layer groups in Photoshop.
 */
export interface LayerGroup {
  id: LayerGroupId;
  mapId: MapId;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Whether the group is expanded in the layers panel UI */
  expanded: boolean;
  /** Ordered child IDs from bottom to top (can contain LayerIds or nested LayerGroupIds) */
  childOrder: (LayerId | LayerGroupId)[];
}

/**
 * A reference to a specific tile within a tileset.
 * Stores the source tileset and the pixel region to sample from.
 */
export interface TileRef {
  tilesetId: TilesetId;
  /** Source X in pixels within the tileset image */
  sx: number;
  /** Source Y in pixels within the tileset image */
  sy: number;
  /** Width of the tile in pixels */
  sw: number;
  /** Height of the tile in pixels */
  sh: number;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
  id: ProjectId;
  name: string;
  createdAt: number;
  updatedAt: number;
  tileSize: TileSize;
  tilesetGroups: TilesetGroup[];
  tilesets: Tileset[];
  mapGroups: MapGroup[];
  maps: TileMapData[];
  layers: TileLayer[];
  layerGroups: LayerGroup[];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppSettings {
  autoSaveEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSaveEnabled: true,
};

// ---------------------------------------------------------------------------
// Editor State (in-memory, used by travels for undo/redo)
// ---------------------------------------------------------------------------

/** Paint brush sizes for the paint/erase tools */
export const BRUSH_SIZES = ["1x1", "2x2", "3x3", "4x4", "5x5"] as const;
export type BrushSize = (typeof BRUSH_SIZES)[number];

export type EditorTool = "paint" | "erase" | "fill";

export interface SelectedTile {
  tilesetId: TilesetId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface EditorState {
  /** Currently loaded project (null if none open) */
  project: Project | null;

  // -- Active selections --
  activeTilesetGroupId: TilesetGroupId | null;
  activeTilesetId: TilesetId | null;
  activeMapGroupId: MapGroupId | null;
  activeMapId: MapId | null;
  activeLayerId: LayerId | null;

  // -- Tools --
  currentTool: EditorTool;
  brushSize: BrushSize;
  tileSize: TileSize;
  selectedTile: SelectedTile | null;

  // -- Viewport --
  tilesetZoom: number;
  mapZoom: number;
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  project: null,
  activeTilesetGroupId: null,
  activeTilesetId: null,
  activeMapGroupId: null,
  activeMapId: null,
  activeLayerId: null,
  currentTool: "paint",
  brushSize: "1x1",
  tileSize: 32,
  selectedTile: null,
  tilesetZoom: 1,
  mapZoom: 1,
};
