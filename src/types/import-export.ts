export type ImportExportDialogMode = "import" | "export";

export type ImportExportAssetType = "project" | "map" | "tileset";

export interface ImportExportOptionAction {
  enabled: boolean;
  onSelect?: () => void;
  disabledReason?: string;
}

export interface ImportExportOptionDefinition {
  assetType: ImportExportAssetType;
  label: string;
  description: string;
  supportedNow: boolean;
}
