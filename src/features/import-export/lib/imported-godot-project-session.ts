import { mergeImportedMapData } from "@/features/import-export/lib/imported-map-merge";
import { createEmptyProject } from "@/features/project-management/lib/project";
import { saveProjectAndMarkClean } from "@/features/project-management/lib/project-save";
import { openProjectInEditor } from "@/features/project-management/lib/project-session";
import { saveProject } from "@/services/db";
import { getEditorStore } from "@/store/editor-store";
import { TILE_SIZES } from "@/types";
import type { GodotProjectImportResult, TileSize, TilesetId } from "@/types";
import type { EditorTravels } from "@/types/store";

function snapToValidTileSize(size: number): TileSize {
  return TILE_SIZES.reduce((closest, valid) =>
    Math.abs(valid - size) < Math.abs(closest - size) ? valid : closest,
  );
}

function deduplicateProjectTilesets(
  setState: EditorTravels["setState"],
): void {
  setState((draft) => {
    if (!draft.project) return;

    const seen = new Map<string, TilesetId>();
    const remapIds = new Map<string, TilesetId>();

    for (const tileset of draft.project.tilesets) {
      const key = `${tileset.name}__${tileset.tileSize}__${tileset.imageWidth}__${tileset.imageHeight}`;
      const canonical = seen.get(key);
      if (canonical !== undefined) {
        remapIds.set(tileset.id as string, canonical);
      } else {
        seen.set(key, tileset.id);
      }
    }

    if (remapIds.size === 0) return;

    draft.project.tilesets = draft.project.tilesets.filter(
      (tileset) => !remapIds.has(tileset.id as string),
    );

    for (const layer of draft.project.layers) {
      for (const [key, ref] of Object.entries(layer.tiles)) {
        const newId = remapIds.get(ref.tilesetId as string);
        if (newId) {
          layer.tiles[key] = { ...ref, tilesetId: newId };
        }
      }
    }
  });
}

export async function replaceWithImportedGodotProject(
  result: GodotProjectImportResult,
  suggestedProjectName: string,
  setState: EditorTravels["setState"],
): Promise<void> {
  const importedTileSize = result.maps[0]?.map.tileSize ?? 32;
  const targetTileSize = snapToValidTileSize(importedTileSize);

  const targetProject = createEmptyProject(suggestedProjectName, targetTileSize);
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

    if (result.maps.length > 1) {
      deduplicateProjectTilesets(setState);
    }
  }

  const importedProject = getEditorStore().getState().project;

  if (!importedProject) {
    throw new Error("Imported Godot project could not be opened.");
  }

  await saveProjectAndMarkClean(importedProject);
}