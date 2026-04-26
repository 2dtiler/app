import type {
  LinkedImportResourceKind,
  LinkedImportMissingResource,
  TiledMapImportResult,
} from "@/features/import-export/types";

export type TidePropertyType = "String" | "Int32" | "Boolean";

export interface TidePropertyDocument {
  key: string;
  type?: TidePropertyType;
  value: string;
}

export interface TideTileSheetDocument {
  id: string;
  description: string;
  imageSource: string;
  sheetWidth: number;
  sheetHeight: number;
  tileWidth: number;
  tileHeight: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
  properties: TidePropertyDocument[];
}

export interface TideTileSheetRefCellDocument {
  kind: "tilesheet";
  ref: string;
}

export interface TideNullCellDocument {
  kind: "null";
  count: number;
}

export interface TideStaticCellDocument {
  kind: "static";
  index: number;
}

export interface TideAnimatedCellDocument {
  kind: "animated";
  interval: number;
  frames: (TideTileSheetRefCellDocument | TideStaticCellDocument)[];
}

export type TideLayerCellDocument =
  | TideTileSheetRefCellDocument
  | TideNullCellDocument
  | TideStaticCellDocument
  | TideAnimatedCellDocument;

export interface TideLayerDocument {
  id: string;
  visible: boolean;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  rows: TideLayerCellDocument[][];
  properties: TidePropertyDocument[];
}

export interface TideMapDocument {
  properties: TidePropertyDocument[];
  tileSheets: TideTileSheetDocument[];
  layers: TideLayerDocument[];
}

export type TideImportMissingResourceKind = Extract<
  LinkedImportResourceKind,
  "image"
>;

export interface TideImportMissingResource extends LinkedImportMissingResource {
  kind: TideImportMissingResourceKind;
}

export interface TideMissingResourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: TideImportMissingResource[];
  selectedFileNames: Record<string, string>;
  isSubmitting: boolean;
  onSelectFile: (resource: TideImportMissingResource) => void | Promise<void>;
  onImport: () => void | Promise<void>;
}

export type TideMapImportResult = TiledMapImportResult;

export interface TideMapImportPendingResult {
  status: "missing-resources";
  rootPath: string;
  missingResources: TideImportMissingResource[];
}

export interface PendingTideMapImportState {
  rootPath: string;
  rootData: Uint8Array;
  missingResources: TideImportMissingResource[];
  resourceFilesByPath: Record<string, File>;
}

export interface TideMapImportReadyResult {
  status: "ready";
  result: TideMapImportResult;
}

export type TideMapImportPreparationResult =
  | TideMapImportPendingResult
  | TideMapImportReadyResult;
