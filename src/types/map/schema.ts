/**
 * Core type definitions for the 2D Tiler application.
 *
 * All types are JSON-serializable to satisfy `travels` (mutative) constraints.
 * Binary data (images) is stored separately in IndexedDB and referenced by ID.
 */

import type {
  MapOrientation,
  MapStaggerAxis,
  MapStaggerIndex,
} from "./map-geometry";

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
export type TerrainId = string & { readonly __brand: "TerrainId" };
export type ObjectId = string & { readonly __brand: "ObjectId" };

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
  tileSize: TileSize;
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
  /** Grid orientation, aligned with Tiled map orientation semantics */
  orientation: MapOrientation;
  /** Axis whose rows or columns are staggered on hex maps */
  staggerAxis?: MapStaggerAxis;
  /** Whether odd or even row/column indexes are shifted on hex maps */
  staggerIndex?: MapStaggerIndex;
  /** Width of the map in tile units */
  widthInTiles: number;
  /** Height of the map in tile units */
  heightInTiles: number;
  /** The tile size used by this map (px) */
  tileSize: TileSize;
  /** Custom key-value properties (typed for future Tiled export compatibility) */
  properties?: Record<string, PropertyValue>;
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
 * An image layer displays a single image (e.g. background, parallax)
 * that is not bound to the tile grid.
 */
export interface ImageLayer {
  id: LayerId;
  mapId: MapId;
  name: string;
  type: "image";
  visible: boolean;
  locked: boolean;
  /** Reference to the image blob stored in IndexedDB */
  assetId: AssetId;
  /** X position in pixels relative to map origin */
  x: number;
  /** Y position in pixels relative to map origin */
  y: number;
  /** Display width in pixels */
  width: number;
  /** Display height in pixels */
  height: number;
  /** Clockwise rotation in degrees (0, 90, 180, 270) */
  rotation?: 0 | 90 | 180 | 270;
  /** Flip horizontally (after rotation) */
  flipX?: boolean;
  /** Flip vertically (after rotation) */
  flipY?: boolean;
  /** Layer opacity as a percentage from 0 to 100 */
  opacity: number;
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
  /** Clockwise rotation in degrees (0, 90, 180, 270) */
  rotation?: 0 | 90 | 180 | 270;
  /** Flip horizontally (after rotation) */
  flipX?: boolean;
  /** Flip vertically (after rotation) */
  flipY?: boolean;
}

// ---------------------------------------------------------------------------
// Object Layer
// ---------------------------------------------------------------------------

export type ObjectType = "rectangle" | "point" | "ellipse" | "polygon" | "text";

/** Property types for Tiled-compatible custom properties (values are always stored as strings) */
export const PROPERTY_TYPES = [
  "bool",
  "color",
  "float",
  "file",
  "int",
  "object",
  "string",
] as const;

export type PropertyType =
  | "bool"
  | "color"
  | "float"
  | "file"
  | "int"
  | "object"
  | "string";

export interface PropertyValue {
  value: string;
  type: PropertyType;
}

export interface MapObject {
  id: ObjectId;
  layerId: LayerId;
  name: string;
  type: ObjectType;
  /** X position in pixels relative to map origin */
  x: number;
  /** Y position in pixels relative to map origin */
  y: number;
  /** Width in pixels (used by rectangle/ellipse, ignored for point) */
  width: number;
  /** Height in pixels (used by rectangle/ellipse, ignored for point) */
  height: number;
  /** Rotation in degrees */
  rotation: number;
  /** Polygon vertices relative to (x, y) — only used for polygon type */
  points: { x: number; y: number }[];
  visible: boolean;
  locked: boolean;
  /** Custom key-value properties (typed for Tiled format compatibility) */
  properties: Record<string, PropertyValue>;
}

export interface ObjectLayer {
  id: LayerId;
  mapId: MapId;
  name: string;
  type: "object";
  visible: boolean;
  locked: boolean;
  /** Ordered object IDs from bottom to top */
  objectOrder: ObjectId[];
}

// ---------------------------------------------------------------------------
// Terrain  (weighted random tile sets for the Fill Terrain tool)
// ---------------------------------------------------------------------------

/**
 * A single tile entry inside a Terrain definition.
 * `probability` is a weight from 0–100. During fill, weights are normalised
 * so they don't need to sum to 100.
 */
export interface TerrainTile {
  tileRef: TileRef;
  /** Weight used for weighted-random selection (0–100) */
  probability: number;
}

/**
 * A named collection of weighted tiles that can be saved and reused.
 * All tiles in a terrain must come from the same tileset.
 */
export interface Terrain {
  id: TerrainId;
  name: string;
  tilesetId: TilesetId;
  tiles: TerrainTile[];
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
  /** Image layers (free-positioned images not bound to tile grid) */
  imageLayers: ImageLayer[];
  layerGroups: LayerGroup[];
  /** Saved terrain definitions for the Fill Terrain tool */
  terrains: Terrain[];
  /** Object layers (freeform shapes, points, polygons) */
  objectLayers: ObjectLayer[];
  /** Map objects placed on object layers */
  objects: MapObject[];
  /**
   * Single-tile tilesets created when a map tile is edited in the image editor.
   * These are NOT shown in the Tileset panel — they serve as per-tile overrides
   * so that editing a tile from the map only affects that specific tile instance.
   */
  overrideTilesets: Tileset[];
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

export type EditorTool = "select" | "paint" | "erase" | "fill";

/** Sub-modes for the fill tool */
export type FillMode = "fill" | "fillTerrain";

export interface SelectedTile {
  tilesetId: TilesetId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * A grid-snapped rectangular selection on the map canvas.
 * Coordinates are in tile units.
 */
export interface MapSelection {
  /** Starting tile column */
  x: number;
  /** Starting tile row */
  y: number;
  /** Width in tiles */
  width: number;
  /** Height in tiles */
  height: number;
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
  activeObjectId: ObjectId | null;

  /** Pending object type to place on the canvas (transient) */
  pendingObjectType: ObjectType | null;

  // -- Tools --
  currentTool: EditorTool;
  brushSize: BrushSize;
  tileSize: TileSize;
  selectedTile: SelectedTile | null;

  /** Which fill sub-mode is active: plain fill or terrain fill */
  fillMode: FillMode;
  /** Transient terrain tile config used by the current fill-terrain operation */
  activeFillTerrain: TerrainTile[] | null;

  /** Current selection rectangle on the map (tile units), null if none */
  mapSelection: MapSelection | null;
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  project: null,
  activeTilesetGroupId: null,
  activeTilesetId: null,
  activeMapGroupId: null,
  activeMapId: null,
  activeLayerId: null,
  activeObjectId: null,
  pendingObjectType: null,
  currentTool: "paint",
  brushSize: "1x1",
  tileSize: 32,
  selectedTile: null,
  fillMode: "fill",
  activeFillTerrain: null,
  mapSelection: null,
};