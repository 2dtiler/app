import { buildDownloadFilename, createZipArchive } from "@/utils/format";
import { resolveExportSaveStrategy } from "@/features/import-export/lib/export-save-strategy";
import { assertMapsHaveNoAnimations } from "@/features/import-export/lib/animation-export-guards";
import { exportGodotProjectEntries } from "@/features/import-export/lib/import-export-godot-project";
import type {
  ExportSaveStrategy,
  ImportExportOptionId,
  Project,
} from "@/types";

export function isGodotProjectOption(optionId: ImportExportOptionId) {
  return optionId === "project-godot";
}

export async function exportGodotProject(
  project: Project | null,
  saveStrategy?: ExportSaveStrategy,
): Promise<boolean> {
  if (!project) {
    return false;
  }

  assertMapsHaveNoAnimations(project, project.maps, "Godot");

  const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);
  const entries = await exportGodotProjectEntries(project);
  const archive = createZipArchive(entries);

  return resolvedSaveStrategy.saveByteArray(
    archive,
    buildDownloadFilename(project.name, ".godot-project.zip"),
  );
}