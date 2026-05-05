import { useMemo } from "react";
import { exportGodotProject } from "@/features/import-export/lib/godot-project-action-utils";
import { exportTiledProject } from "@/features/import-export/lib/tiled-project-action-utils";
import type {
  ImportExportDialogMode,
  ImportExportOptionAction,
  ImportExportOptionId,
  Project,
} from "@/types";

export function useProjectImportExportAction(
  importExportDialogMode: ImportExportDialogMode,
  project: Project | null,
  handleExportProject: () => Promise<boolean>,
  handleImportProject: () => Promise<boolean>,
  handleImportTiledProject: () => Promise<boolean>,
  handleImportGodotProject: () => Promise<boolean>,
): ImportExportOptionAction {
  return useMemo(
    () => ({
      enabled: importExportDialogMode === "import" ? true : Boolean(project),
      onSelect:
        importExportDialogMode === "import"
          ? (optionId: ImportExportOptionId) =>
              optionId === "project-tiled"
                ? handleImportTiledProject()
                : optionId === "project-godot"
                  ? handleImportGodotProject()
                  : handleImportProject()
          : (optionId: ImportExportOptionId) =>
              optionId === "project-tiled"
                ? exportTiledProject(project)
                : optionId === "project-godot"
                  ? exportGodotProject(project)
                  : handleExportProject(),
      disabledReason:
        importExportDialogMode === "export" && !project
          ? "Open a project first"
          : undefined,
    }),
    [
      handleExportProject,
      handleImportGodotProject,
      handleImportProject,
      handleImportTiledProject,
      importExportDialogMode,
      project,
    ],
  );
}
