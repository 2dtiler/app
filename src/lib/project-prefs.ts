import type { EditorState, Project } from "@/types";
import type { ZoomState } from "@/types/editor/editor-store";
import type {
  PersistedZoomMap,
  ProjectPrefs,
} from "@/types/import-export/persistence";
import { getEditorStore } from "./store";
import { saveProjectPrefs } from "./db";
import { DEFAULT_ZOOM, zoomStore } from "./zoom-store";

function pruneZoomMap(
  zoomMap: PersistedZoomMap | undefined,
  validIds: Iterable<string>,
): PersistedZoomMap {
  const validIdSet = new Set(validIds);
  const nextZooms: PersistedZoomMap = {};

  for (const [id, zoom] of Object.entries(zoomMap ?? {})) {
    if (!validIdSet.has(id)) continue;
    if (!Number.isFinite(zoom)) continue;
    if (zoom === DEFAULT_ZOOM) continue;
    nextZooms[id] = zoom;
  }

  return nextZooms;
}

function toOptionalZoomMap(
  zoomMap: PersistedZoomMap,
): PersistedZoomMap | undefined {
  return Object.keys(zoomMap).length > 0 ? zoomMap : undefined;
}

export function buildProjectPrefsFromState(
  state: EditorState,
  zoomState: ZoomState = zoomStore.getSnapshot(),
): ProjectPrefs | null {
  const project = state.project;
  if (!project) return null;

  const mapZooms = pruneZoomMap(
    zoomState.mapZooms,
    project.maps.map((map) => map.id as string),
  );
  const tilesetZooms = pruneZoomMap(
    zoomState.tilesetZooms,
    project.tilesets.map((tileset) => tileset.id as string),
  );

  return {
    activeTilesetGroupId: state.activeTilesetGroupId,
    activeTilesetId: state.activeTilesetId,
    activeMapGroupId: state.activeMapGroupId,
    activeMapId: state.activeMapId,
    activeLayerId: state.activeLayerId,
    mapZooms: toOptionalZoomMap(mapZooms),
    tilesetZooms: toOptionalZoomMap(tilesetZooms),
  };
}

export function hydrateZoomStoreForProject(
  project: Project,
  prefs: ProjectPrefs | null,
  activeMapId: string | null,
  activeTilesetId: string | null,
): void {
  zoomStore.hydrate({
    activeMapId,
    activeTilesetId,
    mapZooms: pruneZoomMap(
      prefs?.mapZooms,
      project.maps.map((map) => map.id as string),
    ),
    tilesetZooms: pruneZoomMap(
      prefs?.tilesetZooms,
      project.tilesets.map((tileset) => tileset.id as string),
    ),
  });
}

export function saveCurrentProjectPrefs(): void {
  const state = getEditorStore().getState();
  if (!state.project) return;

  const prefs = buildProjectPrefsFromState(state);
  if (!prefs) return;

  saveProjectPrefs(state.project.id, prefs);
}
