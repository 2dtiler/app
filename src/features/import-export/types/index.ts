import type {
  AssetId,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TileRef,
  TileSize,
  Tileset,
  TilesetId,
} from "@/types/map/schema";
import type {
  MapOrientation,
  MapStaggerAxis,
  MapStaggerIndex,
} from "@/types/map/map-geometry";

export * from "./file-save";
export * from "./persistence";
export * from "./tiled-json";
export * from "./tiled-lua";

export type ImportExportDialogMode = "import" | "export";

export interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ImportExportDialogMode;
  projectAction: ImportExportOptionAction;
  mapAction: ImportExportOptionAction;
  tilesetAction: ImportExportOptionAction;
}

export type ImportExportAssetType = "project" | "map" | "tileset";

export type ImportExportOptionId =
  | "project-native"
  | "project-tiled"
  | "map-native"
  | "map-image"
  | "map-phaser"
  | "map-tiled"
  | "map-tiled-file"
  | "map-godot"
  | "map-unity"
  | "map-gamemaker"
  | "map-gamemaker-room"
  | "map-gamemaker-studio-2"
  | "map-defold"
  | "map-tide"
  | "map-tbin"
  | "map-mappy-fmp"
  | "tileset-native"
  | "tileset-image"
  | "tileset-tiled"
  | "tileset-tiled-file"
  | "tileset-defold"
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

export type TiledMapExportFormat = TiledMapFormat | "csv";

export type TiledTilesetFormat = "xml" | "json" | "lua";

export type GodotMapTilesetMode = "embedded" | "external";

export type GodotMapTextureMode = "copy";

export type GameMakerMapFormat = "gmx" | "yy";

export type DefoldMapFormat = "tilemap" | "collection";

export interface ImportExportRasterExportOptions {
  fileType: ImportExportRasterFileType;
  quality: number;
  transparency: boolean;
}

export interface TiledBundleExportOptions {
  encoding: TiledLayerEncoding;
  compression: TiledLayerCompression;
  compressionLevel: number;
  tilesetMode: TiledTilesetMode;
  renderOrder: TiledRenderOrder;
}

export interface TiledMapExportOptions extends TiledBundleExportOptions {
  format: TiledMapExportFormat;
}

export interface TiledTilesetExportOptions {
  format: TiledTilesetFormat;
}

export interface GodotMapExportOptions {
  sceneRootName: string;
  tilesetMode: GodotMapTilesetMode;
  textureMode: GodotMapTextureMode;
}

export interface GameMakerMapExportOptions {
  format: GameMakerMapFormat;
}

export interface DefoldMapExportOptions {
  format: DefoldMapFormat;
}

export type TiledXmlExportOptions = TiledBundleExportOptions;

export type ImportExportFormatExportOptions =
  | ImportExportRasterExportOptions
  | TiledMapExportOptions
  | TiledTilesetExportOptions
  | GodotMapExportOptions
  | GameMakerMapExportOptions
  | DefoldMapExportOptions;

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

export interface TiledTilesetExportOptionsPanelProps {
  options: TiledTilesetExportOptions;
  disabled: boolean;
  onOptionsChange: (options: TiledTilesetExportOptions) => void;
  onExport: (options: TiledTilesetExportOptions) => void;
}

export interface GodotMapExportOptionsPanelProps {
  options: GodotMapExportOptions;
  disabled: boolean;
  onOptionsChange: (options: GodotMapExportOptions) => void;
  onExport: (options: GodotMapExportOptions) => void;
}

export interface GameMakerMapExportOptionsPanelProps {
  options: GameMakerMapExportOptions;
  disabled: boolean;
  onOptionsChange: (options: GameMakerMapExportOptions) => void;
  onExport: (options: GameMakerMapExportOptions) => void;
}

export interface DefoldMapExportOptionsPanelProps {
  options: DefoldMapExportOptions;
  disabled: boolean;
  onOptionsChange: (options: DefoldMapExportOptions) => void;
  onExport: (options: DefoldMapExportOptions) => void;
}

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

export interface GodotMapImportResult extends TiledMapImportResult {
  warnings: GodotImportWarning[];
}

export type GameMakerMapImportResult = TiledMapImportResult;

export type DefoldMapImportResult = TiledMapImportResult;

export type UnityMapImportResult = TiledMapImportResult;

export interface UnityBundleManifestMap {
  name: string;
  widthInTiles: number;
  heightInTiles: number;
  tileSize: TileSize;
  orientation: MapOrientation;
}

export interface UnityBundleManifestSourceTileset {
  id: TilesetId;
  name: string;
  imagePath: string;
  mimeType: string;
  tileSize: TileSize;
  imageWidth: number;
  imageHeight: number;
  createdAt: number;
}

export interface UnityBundleManifestCell {
  coordinate: string;
  tilesetId: TilesetId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  rotation?: TileRef["rotation"];
  flipX?: boolean;
  flipY?: boolean;
}

export interface UnityBundleManifestLayer {
  exportId?: string;
  name: string;
  visible: boolean;
  locked: boolean;
  cells: UnityBundleManifestCell[];
}

export interface UnityBundleManifest {
  version: 1;
  source: "2dtiler";
  map: UnityBundleManifestMap;
  sourceTilesets: UnityBundleManifestSourceTileset[];
  layers: UnityBundleManifestLayer[];
}

export type LinkedImportResourceKind =
  | "tsx"
  | "tsj"
  | "lua"
  | "image"
  | "json"
  | "asset"
  | "meta"
  | "tilemap"
  | "tilesource"
  | "tscn"
  | "tres"
  | "res";

export interface LinkedImportMissingResource {
  path: string;
  kind: LinkedImportResourceKind;
  referringPath: string;
  label: string;
}

export type TiledImportMissingResourceKind = Extract<
  LinkedImportResourceKind,
  "tsx" | "tsj" | "lua" | "image"
>;

export interface TiledImportMissingResource extends LinkedImportMissingResource {
  kind: TiledImportMissingResourceKind;
}

export interface GodotImportMissingResource extends LinkedImportMissingResource {
  kind: Extract<LinkedImportResourceKind, "image" | "tscn" | "tres" | "res">;
}

export interface UnityImportMissingResource extends LinkedImportMissingResource {
  kind: Extract<LinkedImportResourceKind, "image" | "json" | "asset" | "meta">;
}

export interface GameMakerImportMissingResource extends LinkedImportMissingResource {
  kind: Extract<LinkedImportResourceKind, "image" | "json">;
}

export interface DefoldImportMissingResource extends LinkedImportMissingResource {
  kind: Extract<LinkedImportResourceKind, "image" | "tilemap" | "tilesource">;
}

export type GodotImportWarningCode =
  | "unsupported-tile-transform"
  | "unsupported-tile-metadata"
  | "unsupported-node-type"
  | "unsupported-scene-tile-source"
  | "unsupported-shape"
  | "unsupported-script"
  | "unsupported-material"
  | "unsupported-physics-data"
  | "unsupported-navigation-data"
  | "unsupported-occlusion-data";

export interface GodotImportWarning {
  code: GodotImportWarningCode;
  message: string;
  nodePath?: string;
}

export interface TiledMissingResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  format: TiledMapFormat;
  resources: TiledImportMissingResource[];
  selectedFileNames: Record<string, string>;
  isSubmitting: boolean;
  onSelectFile: (resource: TiledImportMissingResource) => void | Promise<void>;
  onImport: () => void | Promise<void>;
}

export interface GodotMissingResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: GodotImportMissingResource[];
  selectedFileNames: Record<string, string>;
  isSubmitting: boolean;
  onSelectFile: (resource: GodotImportMissingResource) => void | Promise<void>;
  onImport: () => void | Promise<void>;
}

export interface UnityMissingResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: UnityImportMissingResource[];
  selectedFileNames: Record<string, string>;
  isSubmitting: boolean;
  onSelectFile: (resource: UnityImportMissingResource) => void | Promise<void>;
  onImport: () => void | Promise<void>;
}

export interface GameMakerMissingResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: GameMakerImportMissingResource[];
  selectedFileNames: Record<string, string>;
  isSubmitting: boolean;
  onSelectFile: (
    resource: GameMakerImportMissingResource,
  ) => void | Promise<void>;
  onImport: () => void | Promise<void>;
}

export interface DefoldMissingResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: DefoldImportMissingResource[];
  selectedFileNames: Record<string, string>;
  isSubmitting: boolean;
  onSelectFile: (resource: DefoldImportMissingResource) => void | Promise<void>;
  onImport: () => void | Promise<void>;
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

export interface TiledTilesetImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: TiledImportMissingResource[];
}

export interface PendingTiledTilesetImportState {
  format: TiledTilesetFormat;
  rootPath: string;
  rootData: Uint8Array;
  missingResources: TiledImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface TiledMapImportReadyResult {
  status: "ready";
  result: TiledMapImportResult;
}

export interface TiledTilesetImportReadyResult {
  status: "ready";
  result: Tileset[];
}

export type TiledMapImportPreparationResult =
  | TiledMapImportPendingResult
  | TiledMapImportReadyResult;

export type TiledTilesetImportPreparationResult =
  | TiledTilesetImportPendingResult
  | TiledTilesetImportReadyResult;

export interface GodotMapImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: GodotImportMissingResource[];
}

export interface PendingGodotMapImportState {
  rootPath: string;
  rootData: Uint8Array;
  missingResources: GodotImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface GodotTilesetImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: GodotImportMissingResource[];
}

export interface PendingGodotTilesetImportState {
  rootPath: string;
  rootData: Uint8Array;
  missingResources: GodotImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface UnityMapImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: UnityImportMissingResource[];
}

export interface GameMakerMapImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  format: GameMakerMapFormat;
  missingResources: GameMakerImportMissingResource[];
}

export interface DefoldMapImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  format: DefoldMapFormat;
  missingResources: DefoldImportMissingResource[];
}

export interface PendingUnityMapImportState {
  rootPath: string;
  rootData: Uint8Array;
  missingResources: UnityImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface PendingGameMakerMapImportState {
  rootPath: string;
  rootData: Uint8Array;
  format: GameMakerMapFormat;
  missingResources: GameMakerImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface PendingDefoldMapImportState {
  rootPath: string;
  rootData: Uint8Array;
  format: DefoldMapFormat;
  missingResources: DefoldImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface DefoldTilesetImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: DefoldImportMissingResource[];
}

export interface PendingDefoldTilesetImportState {
  rootPath: string;
  rootData: Uint8Array;
  missingResources: DefoldImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface UnityTilesetImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: UnityImportMissingResource[];
}

export interface PendingUnityTilesetImportState {
  rootPath: string;
  rootData: Uint8Array;
  missingResources: UnityImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface UnityMapImportReadyResult {
  status: "ready";
  result: UnityMapImportResult;
}

export interface GameMakerMapImportReadyResult {
  status: "ready";
  result: GameMakerMapImportResult;
}

export interface DefoldMapImportReadyResult {
  status: "ready";
  result: DefoldMapImportResult;
}

export interface DefoldTilesetImportReadyResult {
  status: "ready";
  result: Tileset[];
}

export interface UnityTilesetImportReadyResult {
  status: "ready";
  result: Tileset[];
}

export type UnityMapImportPreparationResult =
  | UnityMapImportPendingResult
  | UnityMapImportReadyResult;

export type GameMakerMapImportPreparationResult =
  | GameMakerMapImportPendingResult
  | GameMakerMapImportReadyResult;

export type DefoldMapImportPreparationResult =
  | DefoldMapImportPendingResult
  | DefoldMapImportReadyResult;

export type DefoldTilesetImportPreparationResult =
  | DefoldTilesetImportPendingResult
  | DefoldTilesetImportReadyResult;

export type UnityTilesetImportPreparationResult =
  | UnityTilesetImportPendingResult
  | UnityTilesetImportReadyResult;

export interface GodotMapImportReadyResult {
  status: "ready";
  result: GodotMapImportResult;
}

export interface GodotTilesetImportReadyResult {
  status: "ready";
  result: Tileset[];
}

export type GodotMapImportPreparationResult =
  | GodotMapImportPendingResult
  | GodotMapImportReadyResult;

export type GodotTilesetImportPreparationResult =
  | GodotTilesetImportPendingResult
  | GodotTilesetImportReadyResult;

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
  ) => boolean | Promise<boolean>;
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
  ) => boolean | Promise<boolean>;
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
