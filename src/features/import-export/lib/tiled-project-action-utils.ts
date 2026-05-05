import { buildDownloadFilename, createZipArchive } from "@/utils/format";
import { resolveExportSaveStrategy } from "@/features/import-export/lib/export-save-strategy";
import { exportTiledProjectEntries } from "@/features/import-export/lib/import-export-tiled-project";
import type {
  ExportSaveStrategy,
  ImportExportOptionId,
  Project,
} from "@/types";

export function isTiledProjectOption(optionId: ImportExportOptionId) {
  return optionId === "project-tiled";
}

export async function exportTiledProject(
  project: Project | null,
  saveStrategy?: ExportSaveStrategy,
): Promise<boolean> {
  if (!project) {
    return false;
  }

  const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);
  const entries = await exportTiledProjectEntries(project);
  const archive = createZipArchive(entries);

  return resolvedSaveStrategy.saveByteArray(
    archive,
    buildDownloadFilename(project.name, ".tiled-project.zip"),
  );
}
