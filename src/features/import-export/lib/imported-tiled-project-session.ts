import { mergeImportedMapData } from "@/features/import-export/lib/imported-map-merge";
import { createEmptyProject } from "@/features/project-management/lib/project";
import { saveProjectAndMarkClean } from "@/features/project-management/lib/project-save";
import { openProjectInEditor } from "@/features/project-management/lib/project-session";
import { saveProject } from "@/services/db";
import { getEditorStore } from "@/store/editor-store";
import type { TiledProjectImportResult } from "@/types";
import type { EditorTravels } from "@/types/store";

export async function replaceWithImportedTiledProject(
  result: TiledProjectImportResult,
  suggestedProjectName: string,
  setState: EditorTravels["setState"],
): Promise<void> {
  const targetProject = createEmptyProject(
    suggestedProjectName,
    result.maps[0]?.map.tileSize ?? 32,
  );
  const targetMapGroupId = targetProject.mapGroups[0]?.id ?? null;
  const targetTilesetGroupId = targetProject.tilesetGroups[0]?.id ?? null;

  await saveProject(targetProject);
  openProjectInEditor(targetProject);

  if (targetMapGroupId && targetTilesetGroupId) {
    for (const mapImport of result.maps) {
      mergeImportedMapData(
        mapImport,
        targetProject,
        targetMapGroupId,
        targetTilesetGroupId,
        setState,
      );
    }
  }

  const importedProject = getEditorStore().getState().project;

  if (!importedProject) {
    throw new Error("Imported Tiled project could not be opened.");
  }

  await saveProjectAndMarkClean(importedProject);
}
