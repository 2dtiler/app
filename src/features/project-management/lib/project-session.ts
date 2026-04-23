import {
  loadProjectPrefs,
  saveLastProjectId,
  saveProjectPrefs,
} from "@/services/db";
import { getEditorStore, markEditorSaved } from "@/store/editor-store";
import type { Project } from "@/types";
import { getActiveTilesetTileSize } from "./project";
import {
  buildProjectPrefsFromState,
  hydrateZoomStoreForProject,
} from "./project-prefs";

export function openProjectInEditor(project: Project) {
  const store = getEditorStore();
  const currentState = store.getState();

  if (currentState.project) {
    const currentPrefs = buildProjectPrefsFromState(currentState);
    if (currentPrefs) {
      saveProjectPrefs(currentState.project.id, currentPrefs);
    }
  }

  const prefs = loadProjectPrefs(project.id);

  store.setState((draft) => {
    draft.project = project;

    if (prefs) {
      const tilesetGroupIds = new Set(
        project.tilesetGroups.map((group) => group.id as string),
      );
      const tilesetIds = new Set(
        project.tilesets.map((tileset) => tileset.id as string),
      );
      const mapGroupIds = new Set(
        project.mapGroups.map((group) => group.id as string),
      );
      const mapIds = new Set(project.maps.map((map) => map.id as string));
      const layerIds = new Set(
        project.layers.map((layer) => layer.id as string),
      );

      draft.activeTilesetGroupId =
        prefs.activeTilesetGroupId &&
        tilesetGroupIds.has(prefs.activeTilesetGroupId)
          ? (prefs.activeTilesetGroupId as typeof draft.activeTilesetGroupId)
          : (project.tilesetGroups[0]?.id ?? null);
      draft.activeTilesetId =
        prefs.activeTilesetId && tilesetIds.has(prefs.activeTilesetId)
          ? (prefs.activeTilesetId as typeof draft.activeTilesetId)
          : null;
      draft.activeMapGroupId =
        prefs.activeMapGroupId && mapGroupIds.has(prefs.activeMapGroupId)
          ? (prefs.activeMapGroupId as typeof draft.activeMapGroupId)
          : (project.mapGroups[0]?.id ?? null);
      draft.activeMapId =
        prefs.activeMapId && mapIds.has(prefs.activeMapId)
          ? (prefs.activeMapId as typeof draft.activeMapId)
          : null;
      draft.activeLayerId =
        prefs.activeLayerId && layerIds.has(prefs.activeLayerId)
          ? (prefs.activeLayerId as typeof draft.activeLayerId)
          : null;
    } else {
      draft.activeTilesetGroupId = project.tilesetGroups[0]?.id ?? null;
      draft.activeMapGroupId = project.mapGroups[0]?.id ?? null;
      draft.activeTilesetId = null;
      draft.activeMapId = null;
      draft.activeLayerId = null;
    }

    draft.tileSize = getActiveTilesetTileSize(project, draft.activeTilesetId);
  });

  markEditorSaved();

  const nextState = store.getState();
  hydrateZoomStoreForProject(
    project,
    prefs,
    nextState.activeMapId,
    nextState.activeTilesetId,
  );
  saveLastProjectId(project.id);
}
