import type {
  AssetId,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TileSize,
  Tileset,
  TilesetId,
} from "../map/schema";
import type {
  MapOrientation,
  MapStaggerAxis,
  MapStaggerIndex,
} from "../map/map-geometry";

export type ImportExportDialogMode = "import" | "export";

export type ImportExportAssetType = "project" | "map" | "tileset";

export type ImportExportOptionId =
  | "project-native"
  | "project-tiled"
  | "map-native"
  | "map-image"
  | "map-tiled-xml"
  | "map-tiled-json"
  | "map-tiled-js"
  | "map-tiled-lua"
  | "map-tiled-csv"
  | "map-godot"
  | "map-unity"
  | "map-gamemaker-room"
  | "map-gamemaker-studio-2"
  | "map-defold-tilemap"
  | "map-defold-collection"
  | "map-tide"
  | "map-tbin"
  | "map-mappy-fmp"
  | "tileset-native"
  | "tileset-image"
  | "tileset-tiled-xml"
  | "tileset-tiled-json"
  | "tileset-tiled-lua"
  | "tileset-unity"
  | "tileset-godot"
  | "tileset-rpg-maker";

export type ImportExportRasterFileType = "png" | "jpg" | "webp" | "bmp" | "gif";

export type TiledLayerEncoding = "csv" | "base64";

export type TiledLayerCompression = "none" | "gzip" | "zlib";

export type TiledTilesetMode = "inline" | "external";

export type TiledRenderOrder =
  | "right-down"
  | "right-up"
  | "left-down"
  | "left-up";

export type TiledMapFormat = "xml" | "json" | "js" | "lua";

export interface ImportExportRasterExportOptions {
  fileType: ImportExportRasterFileType;
  quality: number;
  transparency: boolean;
}

export interface TiledMapExportOptions {
  encoding: TiledLayerEncoding;
  compression: TiledLayerCompression;
  compressionLevel: number;
  tilesetMode: TiledTilesetMode;
  renderOrder: TiledRenderOrder;
}

export type TiledXmlExportOptions = TiledMapExportOptions;

export type ImportExportFormatExportOptions =
  | ImportExportRasterExportOptions
  | TiledMapExportOptions;

export interface RasterExportOptionsPanelProps {
  options: ImportExportRasterExportOptions;
  disabled: boolean;
  onOptionsChange: (options: ImportExportRasterExportOptions) => void;
  onExport: (options: ImportExportRasterExportOptions) => void;
}

export interface TiledMapExportOptionsPanelProps {
  options: TiledMapExportOptions;
  disabled: boolean;
  supportsRenderOrder: boolean;
  onOptionsChange: (options: TiledMapExportOptions) => void;
  onExport: (options: TiledMapExportOptions) => void;
}

export type TiledXmlExportOptionsPanelProps = TiledMapExportOptionsPanelProps;

export interface TiledMapImportResult {
  map: TileMapData;
  layers: TileLayer[];
  tilesets: Tileset[];
  overrideTilesets?: Tileset[];
  imageLayers: ImageLayer[];
  layerGroups: LayerGroup[];
  objectLayers: ObjectLayer[];
  objects: MapObject[];
}

export type TiledImportMissingResourceKind = "tsx" | "tsj" | "lua" | "image";

export interface TiledImportMissingResource {
  path: string;
  kind: TiledImportMissingResourceKind;
  referringPath: string;
  label: string;
}

export interface TiledMapImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: TiledImportMissingResource[];
}

export interface PendingTiledMapImportState {
  format: TiledMapFormat;
  rootPath: string;
  rootData: Uint8Array;
  missingResources: TiledImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface TiledMapImportReadyResult {
  status: "ready";
  result: TiledMapImportResult;
}

export type TiledMapImportPreparationResult =
  | TiledMapImportPendingResult
  | TiledMapImportReadyResult;

export interface ImportExportRasterAsset {
  assetId: AssetId;
  fileName: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface ImportExportRenderableTileLayer {
  kind: "tile";
  layer: TileLayer;
}

export interface ImportExportRenderableImageLayer {
  kind: "image";
  layer: ImageLayer;
}

export type ImportExportRenderableLayer =
  | ImportExportRenderableTileLayer
  | ImportExportRenderableImageLayer;

export type ImportExportSelectableAssetId = string;

export interface ImportExportMapThumbnailTileset {
  id: TilesetId;
  assetId: AssetId;
}

export interface ImportExportMapThumbnailLayer {
  id: string;
  visible: boolean;
  tiles: TileLayer["tiles"];
}

export interface ImportExportMapThumbnail {
  kind: "map";
  orientation: MapOrientation;
  staggerAxis?: MapStaggerAxis;
  staggerIndex?: MapStaggerIndex;
  tileSize: TileSize;
  widthInTiles: number;
  heightInTiles: number;
  layers: ImportExportMapThumbnailLayer[];
  tilesets: ImportExportMapThumbnailTileset[];
}

export interface ImportExportTilesetThumbnail {
  kind: "tileset";
  assetId: AssetId;
  tileSize: TileSize;
  imageWidth: number;
  imageHeight: number;
}

export type ImportExportAssetThumbnail =
  | ImportExportMapThumbnail
  | ImportExportTilesetThumbnail;

export interface ImportExportSelectableAsset {
  id: ImportExportSelectableAssetId;
  name: string;
  groupId: string;
  groupName: string;
  subtitle: string;
  thumbnail: ImportExportAssetThumbnail;
}

export interface ImportExportAssetGroup {
  id: string;
  name: string;
  assets: ImportExportSelectableAsset[];
}

export interface ImportExportFlatSelectableAsset extends ImportExportSelectableAsset {
  searchText: string;
}

export interface ImportExportSelectionConfig {
  groups: ImportExportAssetGroup[];
  initialSelectedIds: ImportExportSelectableAssetId[];
  emptyLabel?: string;
  helperText?: string;
  onSubmit: (
    selectedIds: ImportExportSelectableAssetId[],
    optionId: ImportExportOptionId,
    formatExportOptions?: ImportExportFormatExportOptions,
  ) => void | Promise<void>;
}

export interface ImportExportArchiveEntry {
  path: string;
  data: Uint8Array;
}

export interface TiledMapBundlePreparationResult {
  entries: ImportExportArchiveEntry[];
  exportedTilesets: Tileset[];
  groupMap: ReadonlyMap<string, LayerGroup>;
  imageLayerMap: ReadonlyMap<string, ImageLayer>;
  imagePathsByAssetId: ReadonlyMap<string, string>;
  imageSourcesByLayerId: ReadonlyMap<string, string>;
  layerMap: ReadonlyMap<string, TileLayer>;
  objectIdMap: ReadonlyMap<string, number>;
  objectLayerMap: ReadonlyMap<string, ObjectLayer>;
  objectMap: ReadonlyMap<string, MapObject>;
  tilesetFirstGids: ReadonlyMap<string, number>;
  tilesetMap: ReadonlyMap<string, Tileset>;
  usedPaths: Set<string>;
}

export interface ImportExportAssetPickerProps {
  assetType: ImportExportAssetType;
  selection: ImportExportSelectionConfig;
  selectedIds: ImportExportSelectableAssetId[];
  onToggleAsset: (assetId: ImportExportSelectableAssetId) => void;
  onSelectAssets: (assetIds: ImportExportSelectableAssetId[]) => void;
  onDeselectAssets: (assetIds: ImportExportSelectableAssetId[]) => void;
}

export interface ImportExportAssetCardProps {
  asset: ImportExportSelectableAsset;
  selected: boolean;
  onToggle: (assetId: ImportExportSelectableAssetId) => void;
}

export interface ImportExportMapThumbnailProps {
  thumbnail: ImportExportMapThumbnail;
  alt: string;
}

export interface ImportExportTilesetThumbnailProps {
  thumbnail: ImportExportTilesetThumbnail;
  alt: string;
}

export interface ImportExportOptionAction {
  enabled: boolean;
  onSelect?: (
    optionId: ImportExportOptionId,
    formatExportOptions?: ImportExportFormatExportOptions,
  ) => void | Promise<void>;
  disabledReason?: string;
  exportSelection?: ImportExportSelectionConfig;
}

export interface ImportExportOptionDefinition {
  id: ImportExportOptionId;
  assetType: ImportExportAssetType;
  label: string;
  description: string;
  supportedNow: boolean;
  supportedModes?: readonly ImportExportDialogMode[];
}