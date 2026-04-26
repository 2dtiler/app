import { saveBlobFile, saveByteArrayFile } from "@/services/file-system";
import type { ExportSaveStrategy } from "@/types";

export const DEFAULT_EXPORT_SAVE_STRATEGY = {
  saveBlob: saveBlobFile,
  saveByteArray: saveByteArrayFile,
} satisfies ExportSaveStrategy;

export function resolveExportSaveStrategy(
  saveStrategy?: ExportSaveStrategy,
): ExportSaveStrategy {
  return saveStrategy ?? DEFAULT_EXPORT_SAVE_STRATEGY;
}
