import type {
  AssetId,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
  Tileset,
} from "../map/schema";

export interface AssetRecord {
  id: AssetId;
  data: ArrayBuffer;
  mimeType: string;
  createdAt: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  data: string;
  updatedAt: number;
}

export type PersistedZoomMap = Record<string, number>;

export interface ProjectPrefs {
  activeTilesetGroupId: string | null;
  activeTilesetId: string | null;
  activeMapGroupId: string | null;
  activeMapId: string | null;
  activeLayerId: string | null;
  mapZooms?: PersistedZoomMap;
  tilesetZooms?: PersistedZoomMap;
}

export interface AssetManifestEntry {
  id: AssetId;
  mimeType: string;
  byteLength: number;
}

export interface PackedProject {
  project: Project;
  manifest: AssetManifestEntry[];
  assetBlob: Uint8Array;
}

export interface PackedMap {
  map: TileMapData;
  layers: TileLayer[];
  tilesets: Tileset[];
  overrideTilesets?: Tileset[];
  imageLayers?: ImageLayer[];
  layerGroups?: LayerGroup[];
  objectLayers?: ObjectLayer[];
  objects?: MapObject[];
  manifest: AssetManifestEntry[];
  assetBlob: Uint8Array;
}

export interface PackedTileset {
  tileset: Tileset;
  manifest: AssetManifestEntry[];
  assetBlob: Uint8Array;
}