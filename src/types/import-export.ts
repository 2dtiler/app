import type { AssetId, TileLayer, TileSize, TilesetId } from "./schema";
import type {
  MapOrientation,
  MapStaggerAxis,
  MapStaggerIndex,
} from "./map-geometry";

export type ImportExportDialogMode = "import" | "export";

export type ImportExportAssetType = "project" | "map" | "tileset";

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

export interface ImportExportSelectionConfig {
  groups: ImportExportAssetGroup[];
  initialSelectedIds: ImportExportSelectableAssetId[];
  emptyLabel?: string;
  helperText?: string;
  onSubmit: (
    selectedIds: ImportExportSelectableAssetId[],
  ) => void | Promise<void>;
}

export interface ImportExportArchiveEntry {
  path: string;
  data: Uint8Array;
}

export interface ImportExportAssetPickerProps {
  assetType: ImportExportAssetType;
  selection: ImportExportSelectionConfig;
  selectedIds: ImportExportSelectableAssetId[];
  onToggleAsset: (assetId: ImportExportSelectableAssetId) => void;
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
  onSelect?: () => void;
  disabledReason?: string;
  exportSelection?: ImportExportSelectionConfig;
}

export interface ImportExportOptionDefinition {
  assetType: ImportExportAssetType;
  label: string;
  description: string;
  supportedNow: boolean;
}
