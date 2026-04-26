import type {
  ImportExportAssetType,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  ImportExportSelectableAssetId,
} from "@/features/import-export/types";
import type { NativeSaveFileHandle } from "@/features/import-export/types/file-save";
import type { Project } from "@/types/map/schema";

export type QuickExportAssetType = Extract<
  ImportExportAssetType,
  "map" | "tileset"
>;

export interface QuickExportPreferenceRecord {
  id: string;
  projectId: string;
  assetType: QuickExportAssetType;
  assetId: ImportExportSelectableAssetId;
  optionId: ImportExportOptionId;
  formatExportOptions?: ImportExportFormatExportOptions;
  updatedAt: number;
}

export interface QuickExportSaveTargetRecord {
  id: string;
  projectId: string;
  assetType: QuickExportAssetType;
  assetId: ImportExportSelectableAssetId;
  optionId: ImportExportOptionId;
  suggestedName: string;
  fileHandle?: NativeSaveFileHandle;
  updatedAt: number;
}

export interface ExportSaveStrategy {
  saveBlob: (blob: Blob, filename: string) => Promise<boolean>;
  saveByteArray: (
    data: Uint8Array,
    filename: string,
    mimeType?: string,
  ) => Promise<boolean>;
}

export interface QuickExportOptionSummary {
  id: ImportExportOptionId;
  label: string;
  description: string;
}

export interface QuickExportControlState {
  assetType: QuickExportAssetType;
  assetId: ImportExportSelectableAssetId | null;
  assetLabel: string | null;
  disabled: boolean;
  disabledReason?: string;
  isExporting: boolean;
  options: QuickExportOptionSummary[];
  selectedOptionId: ImportExportOptionId | null;
  selectedOptionLabel: string | null;
  onQuickExport: () => void;
  onSelectOption: (optionId: ImportExportOptionId) => void;
}

export interface QuickExportButtonGroupProps {
  buttonId: string;
  buttonName: string;
  dropdownButtonId: string;
  dropdownButtonName: string;
  state: QuickExportControlState;
}

export interface QuickExportSetupDialogProps {
  open: boolean;
  assetType: QuickExportAssetType;
  assetLabel: string;
  initialOptionId: ImportExportOptionId | null;
  initialFormatExportOptions?: ImportExportFormatExportOptions;
  isSubmitting: boolean;
  optionSummaries: QuickExportOptionSummary[];
  supportsRenderOrder: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    optionId: ImportExportOptionId,
    formatExportOptions?: ImportExportFormatExportOptions,
  ) => Promise<boolean>;
}

export interface QuickExportSetupState {
  assetId: ImportExportSelectableAssetId;
  assetLabel: string;
  assetType: QuickExportAssetType;
  initialOptionId: ImportExportOptionId | null;
  initialFormatExportOptions?: ImportExportFormatExportOptions;
}

export interface QuickExportSubmitHandler {
  (
    selectedIds: string[],
    optionId: ImportExportOptionId,
    formatExportOptions?: ImportExportFormatExportOptions,
    saveStrategy?: ExportSaveStrategy,
  ): Promise<boolean>;
}

export interface QuickExportControllerParams {
  activeMapId: string | null;
  activeTilesetId: string | null;
  project: Project | null;
  handleMapExportSubmit: QuickExportSubmitHandler;
  handleTilesetExportSubmit: QuickExportSubmitHandler;
}

export interface QuickExportControllerResult {
  mapQuickExport: QuickExportControlState;
  quickExportSetupDialogProps: QuickExportSetupDialogProps;
  tilesetQuickExport: QuickExportControlState;
}

export interface QuickExportSurfaceProps {
  quickExportControl: QuickExportControlState;
}
