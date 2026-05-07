import type { AssetId, TileSize, Tileset } from "@/types";

export type TilesetImageImportMode = "idle" | "choice" | "placement";

export interface TilesetImageImportPosition {
  x: number;
  y: number;
}

export interface PendingTilesetImageImport {
  fileName: string;
  name: string;
  mimeType: string;
  buffer: ArrayBuffer;
  image: HTMLImageElement;
  width: number;
  height: number;
}

export interface TilesetPlacementCanvasSize {
  width: number;
  height: number;
}

export interface TilesetPlacementPreview {
  image: HTMLImageElement;
  position: TilesetImageImportPosition;
  width: number;
  height: number;
}

export interface TilesetImageMergeRequest {
  targetTileset: Tileset;
  sourceImage: HTMLImageElement;
  sourceWidth: number;
  sourceHeight: number;
  position: TilesetImageImportPosition;
}

export interface TilesetImageMergeResult {
  assetId: AssetId;
  width: number;
  height: number;
  mimeType: string;
}

export interface QueueTilesetImageFileOptions {
  showChoiceDialog?: boolean;
}

export interface UseTilesetImageImportResult {
  pendingImport: PendingTilesetImageImport | null;
  mode: TilesetImageImportMode;
  placementPosition: TilesetImageImportPosition;
  isLoading: boolean;
  isCommitting: boolean;
  error: string | null;
  queueImageFile: (
    file: File,
    options?: QueueTilesetImageFileOptions,
  ) => Promise<PendingTilesetImageImport | null>;
  beginPlacement: () => void;
  updatePlacementPosition: (position: TilesetImageImportPosition) => void;
  setCommitting: (isCommitting: boolean) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

export interface TilesetImportChoiceDialogProps {
  pendingImport: PendingTilesetImageImport;
  activeTileset: Tileset | null;
  isBusy: boolean;
  error: string | null;
  onCreateNew: () => void;
  onAddToExisting: () => void;
  onCancel: () => void;
}

export interface TilesetPlacementControlsProps {
  pendingImport: PendingTilesetImageImport;
  position: TilesetImageImportPosition;
  tileSize: TileSize;
  canvasSize: TilesetPlacementCanvasSize;
  isBusy: boolean;
  error: string | null;
  onPositionChange: (position: TilesetImageImportPosition) => void;
  onPlace: () => void;
  onCancel: () => void;
}
