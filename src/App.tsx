import {
  useEffect,
  useState,
  useCallback,
  lazy,
  Suspense,
  useRef,
} from "react";
import { TooltipProvider } from "@/components/ui/Tooltip";
import {
  initEditorStore,
  getEditorStore,
  markEditorSaved,
  hasUnsavedChanges,
} from "@/lib/store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  saveProject,
  listProjects,
  getProject,
  loadProjectPrefs,
  loadLastProjectId,
} from "@/lib/db";
import {
  exportProject,
  exportMap,
  importMap,
  exportTileset,
  importTileset,
  downloadFile,
  readFileAsUint8Array,
} from "@/lib/format";
import {
  generateMapId,
  generateLayerId,
  generateLayerGroupId,
  generateObjectId,
  generateTilesetId,
} from "@/lib/ids";
import { findLastLayerId, getAllGroupIds, getAllLayerIds } from "@/lib/layers";
import { clearTileEditorContext } from "@/lib/tile-editor-context";
import {
  hydrateZoomStoreForProject,
  saveCurrentProjectPrefs,
} from "@/lib/project-prefs";
import { getActiveTilesetTileSize } from "@/lib/project";
import { zoomStore } from "@/lib/zoom-store";
import type {
  ImageLayer,
  LayerGroup,
  TilesetGroupId,
  MapGroupId,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileRef,
  Tileset,
  TilesetId,
  LayerId,
  LayerGroupId,
  ObjectId,
  ToolName,
} from "@/types";
import type { EditorWorkspaceTab } from "@/types/editor-layout";

import { toast } from "sonner";
import { Toaster } from "@/components/ui/Sonner";
import { Toolbar } from "@/components/layout/Toolbar";
const SettingsDialog = lazy(() =>
  import("@/components/dialogs/SettingsDialog").then((m) => ({
    default: m.SettingsDialog,
  })),
);
const ProjectDialog = lazy(() =>
  import("@/components/dialogs/ProjectDialog").then((m) => ({
    default: m.ProjectDialog,
  })),
);
const AboutDialog = lazy(() =>
  import("@/components/dialogs/AboutDialog").then((m) => ({
    default: m.AboutDialog,
  })),
);
const KeyboardShortcutsDialog = lazy(() =>
  import("@/components/dialogs/KeyboardShortcutsDialog").then((m) => ({
    default: m.KeyboardShortcutsDialog,
  })),
);
const FindReplaceDialog = lazy(() =>
  import("@/components/dialogs/FindReplaceDialog").then((m) => ({
    default: m.FindReplaceDialog,
  })),
);
const BugReportDialog = lazy(() =>
  import("@/components/dialogs/BugReportDialog").then((m) => ({
    default: m.BugReportDialog,
  })),
);
const ToolDrawer = lazy(() =>
  import("@/components/tools/ToolDrawer").then((m) => ({
    default: m.ToolDrawer,
  })),
);
import { TilesetPanel } from "@/components/editor/TilesetPanel";
import { MapPanel } from "@/components/editor/MapPanel";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { ObjectsPanel } from "@/components/editor/ObjectsPanel";
import { ImageLayerPropertiesPanel } from "./components/editor/ImageLayerPropertiesPanel";
import {
  CompactEditorShell,
  DesktopEditorLayout,
  EditorWorkspaceDrawer,
} from "@/components/editor/Layout/EditorLayouts";

// Hoisted static JSX: avoids re-creation on every render (rendering-hoist-jsx)
const loadingScreen = (
  <div className="flex h-full items-center justify-center">
    <div className="text-primary text-sm tracking-widest uppercase animate-pulse">
      Initializing…
    </div>
  </div>
);

const emptyProjectMessage = (
  <main className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground text-sm">
    Open or create a project to get started
  </main>
);

const NARROW_LAYOUT_BREAKPOINT = 768;

// Init-once guard: prevents double-init in React StrictMode (advanced-init-once)
let storeInitStarted = false;

function clonePropertyValues(
  values: Record<string, PropertyValue> = {},
): Record<string, PropertyValue> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { ...value }]),
  );
}

function remapLayerTreeId(
  id: LayerId | LayerGroupId,
  layerIdMap: ReadonlyMap<string, LayerId>,
  groupIdMap: ReadonlyMap<string, LayerGroupId>,
): LayerId | LayerGroupId {
  return (layerIdMap.get(id as string) ??
    groupIdMap.get(id as string) ??
    id) as LayerId | LayerGroupId;
}

function remapTileEntries(
  tiles: TileLayer["tiles"],
  tilesetIdMap: ReadonlyMap<string, TilesetId>,
): TileLayer["tiles"] {
  return Object.fromEntries(
    Object.entries(tiles).map(([coordinate, ref]) => [
      coordinate,
      {
        ...ref,
        tilesetId: tilesetIdMap.get(ref.tilesetId as string) ?? ref.tilesetId,
      } satisfies TileRef,
    ]),
  );
}

function cloneImportedTileset(
  tileset: Tileset,
  tilesetIdMap: ReadonlyMap<string, TilesetId>,
  groupId: TilesetGroupId,
): Tileset {
  return {
    ...tileset,
    id: tilesetIdMap.get(tileset.id as string) ?? tileset.id,
    groupId,
  };
}

function App() {
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolName | null>(null);

  useEffect(() => {
    if (storeInitStarted) return;
    storeInitStarted = true;
    initEditorStore().then(async () => {
      // If the store already has a project restored from history, open it directly
      const restoredState = getEditorStore().getState();
      if (restoredState.project) {
        // History is persisted with a 500ms debounce, so active IDs (map, layer,
        // tileset) may be stale or null. Project prefs are saved synchronously
        // in beforeunload, so they always reflect the last-used selections.
        // Apply them now so the map is visible immediately on reload.
        const prefs = loadProjectPrefs(restoredState.project.id);
        if (prefs) {
          const project = restoredState.project;
          const tilesetGroupIds = new Set(
            project.tilesetGroups.map((g) => g.id as string),
          );
          const tilesetIds = new Set(
            project.tilesets.map((t) => t.id as string),
          );
          const mapGroupIds = new Set(
            project.mapGroups.map((g) => g.id as string),
          );
          const mapIds = new Set(project.maps.map((m) => m.id as string));
          const layerIds = new Set(project.layers.map((l) => l.id as string));
          getEditorStore().setState((draft) => {
            if (
              prefs.activeTilesetGroupId &&
              tilesetGroupIds.has(prefs.activeTilesetGroupId)
            ) {
              draft.activeTilesetGroupId =
                prefs.activeTilesetGroupId as typeof draft.activeTilesetGroupId;
            }
            if (
              prefs.activeTilesetId &&
              tilesetIds.has(prefs.activeTilesetId)
            ) {
              draft.activeTilesetId =
                prefs.activeTilesetId as typeof draft.activeTilesetId;
            }
            if (
              prefs.activeMapGroupId &&
              mapGroupIds.has(prefs.activeMapGroupId)
            ) {
              draft.activeMapGroupId =
                prefs.activeMapGroupId as typeof draft.activeMapGroupId;
            }
            if (prefs.activeMapId && mapIds.has(prefs.activeMapId)) {
              draft.activeMapId = prefs.activeMapId as typeof draft.activeMapId;
            }
            if (prefs.activeLayerId && layerIds.has(prefs.activeLayerId)) {
              draft.activeLayerId =
                prefs.activeLayerId as typeof draft.activeLayerId;
            }
            draft.tileSize = getActiveTilesetTileSize(
              project,
              draft.activeTilesetId,
            );
          });
          markEditorSaved();
        } else {
          // No prefs available — fall back to auto-selecting the first map/layer
          // if the history state left them unset (e.g., fresh project creation path).
          const currentState = getEditorStore().getState();
          const proj = currentState.project!;
          if (!currentState.activeMapId && proj.maps.length > 0) {
            getEditorStore().setState((draft) => {
              const firstGroup = draft.project?.mapGroups[0];
              if (firstGroup && !draft.activeMapGroupId) {
                draft.activeMapGroupId =
                  firstGroup.id as typeof draft.activeMapGroupId;
              }
              const firstMap = draft.project?.maps[0];
              if (firstMap) {
                draft.activeMapId = firstMap.id as typeof draft.activeMapId;
              }
              if (!draft.activeLayerId && draft.project?.layers.length) {
                draft.activeLayerId = draft.project.layers[
                  draft.project.layers.length - 1
                ].id as typeof draft.activeLayerId;
              }
            });
            markEditorSaved();
          }
        }
        const currentState = getEditorStore().getState();
        if (currentState.project) {
          hydrateZoomStoreForProject(
            currentState.project,
            prefs,
            currentState.activeMapId,
            currentState.activeTilesetId,
          );
        }
        setReady(true);
        return;
      }

      // No project in history — try to auto-open the last used project
      const lastId = loadLastProjectId();
      let autoOpened = false;

      if (lastId) {
        const project = await getProject(lastId);
        if (project) {
          const prefs = loadProjectPrefs(project.id);
          getEditorStore().setState((draft) => {
            draft.project = project;
            if (prefs) {
              const tilesetGroupIds = new Set(
                project.tilesetGroups.map((g) => g.id as string),
              );
              const tilesetIds = new Set(
                project.tilesets.map((t) => t.id as string),
              );
              const mapGroupIds = new Set(
                project.mapGroups.map((g) => g.id as string),
              );
              const mapIds = new Set(project.maps.map((m) => m.id as string));
              const layerIds = new Set(
                project.layers.map((l) => l.id as string),
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
                prefs.activeMapGroupId &&
                mapGroupIds.has(prefs.activeMapGroupId)
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
            draft.tileSize = getActiveTilesetTileSize(
              project,
              draft.activeTilesetId,
            );
          });
          markEditorSaved();
          const currentState = getEditorStore().getState();
          hydrateZoomStoreForProject(
            project,
            prefs,
            currentState.activeMapId,
            currentState.activeTilesetId,
          );
          autoOpened = true;
        }
      }

      // No last project found — check if any projects exist and open the most recent
      if (!autoOpened) {
        const projects = await listProjects();
        if (projects.length > 0) {
          const project = await getProject(projects[0].id);
          if (project) {
            getEditorStore().setState((draft) => {
              draft.project = project;
              draft.activeTilesetGroupId = project.tilesetGroups[0]?.id ?? null;
              draft.activeMapGroupId = project.mapGroups[0]?.id ?? null;
              draft.activeTilesetId = null;
              draft.activeMapId = null;
              draft.activeLayerId = null;
              draft.tileSize = getActiveTilesetTileSize(
                project,
                draft.activeTilesetId,
              );
            });
            markEditorSaved();
            const currentState = getEditorStore().getState();
            hydrateZoomStoreForProject(
              project,
              null,
              currentState.activeMapId,
              currentState.activeTilesetId,
            );
            autoOpened = true;
          }
        }
      }

      // No projects at all — show the project dialog
      if (!autoOpened) {
        zoomStore.reset();
        setProjectDialogOpen(true);
      }

      setReady(true);
    });
  }, [setProjectDialogOpen]);

  useAutoSave();
  useKeyboardShortcuts();

  useEffect(() => {
    const unsubscribe = zoomStore.subscribe(() => {
      try {
        saveCurrentProjectPrefs();
      } catch {
        // Store may not be initialized yet
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Save project UI preferences on page unload so they persist across refreshes.
  // Also warn the user if there are unsaved changes.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      try {
        saveCurrentProjectPrefs();
      } catch {
        // Store may not be initialized yet
      }
      if (hasUnsavedChanges()) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Listen for the Find and Replace custom event from keyboard shortcuts
  useEffect(() => {
    function handleOpenFindReplace() {
      setFindReplaceOpen(true);
    }
    window.addEventListener("open-find-replace", handleOpenFindReplace);
    return () =>
      window.removeEventListener("open-find-replace", handleOpenFindReplace);
  }, [setFindReplaceOpen]);

  // Listen for map-tile "Open in Image Editor" event dispatched by MapPanel
  useEffect(() => {
    function handleOpenImageEditor() {
      setActiveTool("image-editor");
    }
    window.addEventListener("open-image-editor", handleOpenImageEditor);
    return () =>
      window.removeEventListener("open-image-editor", handleOpenImageEditor);
  }, [setActiveTool]);

  // Show toast when project is saved
  useEffect(() => {
    function handleSaveEnd() {
      toast.success("Project saved");
    }
    window.addEventListener("project-save-end", handleSaveEnd);
    return () => window.removeEventListener("project-save-end", handleSaveEnd);
  }, []);

  if (!ready) {
    return loadingScreen;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Toaster />
      <AppShell
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        projectDialogOpen={projectDialogOpen}
        setProjectDialogOpen={setProjectDialogOpen}
        aboutOpen={aboutOpen}
        setAboutOpen={setAboutOpen}
        shortcutsOpen={shortcutsOpen}
        setShortcutsOpen={setShortcutsOpen}
        findReplaceOpen={findReplaceOpen}
        setFindReplaceOpen={setFindReplaceOpen}
        bugReportOpen={bugReportOpen}
        setBugReportOpen={setBugReportOpen}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
      />
    </TooltipProvider>
  );
}

// Separated so it can call useEditorStore after initialization
function AppShell({
  settingsOpen,
  setSettingsOpen,
  projectDialogOpen,
  setProjectDialogOpen,
  aboutOpen,
  setAboutOpen,
  shortcutsOpen,
  setShortcutsOpen,
  findReplaceOpen,
  setFindReplaceOpen,
  bugReportOpen,
  setBugReportOpen,
  activeTool,
  setActiveTool,
}: {
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  projectDialogOpen: boolean;
  setProjectDialogOpen: (v: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (v: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
  findReplaceOpen: boolean;
  setFindReplaceOpen: (v: boolean) => void;
  bugReportOpen: boolean;
  setBugReportOpen: (v: boolean) => void;
  activeTool: ToolName | null;
  setActiveTool: (v: ToolName | null) => void;
}) {
  const { state, setState } = useEditorStore();
  const hasProject = state.project !== null;
  const editorHostRef = useRef<HTMLElement>(null);
  const [editorWidth, setEditorWidth] = useState<number | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] =
    useState<EditorWorkspaceTab>("layers");

  const activeLayerKind =
    state.project !== null &&
    state.activeLayerId !== null &&
    (state.project.objectLayers ?? []).some((l) => l.id === state.activeLayerId)
      ? "object"
      : state.project !== null &&
          state.activeLayerId !== null &&
          (state.project.imageLayers ?? []).some(
            (l) => l.id === state.activeLayerId,
          )
        ? "image"
        : state.project !== null &&
            state.activeLayerId !== null &&
            state.project.layers.some((l) => l.id === state.activeLayerId)
          ? "tile"
          : null;
  const showDetailsPanel =
    activeLayerKind === "object" || activeLayerKind === "image";
  const detailsTabLabel =
    activeLayerKind === "object"
      ? "Objects"
      : activeLayerKind === "image"
        ? "Properties"
        : null;
  const detailsPanel =
    activeLayerKind === "object" ? (
      <ObjectsPanel />
    ) : activeLayerKind === "image" ? (
      <ImageLayerPropertiesPanel />
    ) : null;

  const isCompactLayout =
    hasProject &&
    editorWidth !== null &&
    editorWidth < NARROW_LAYOUT_BREAKPOINT;

  const workspaceDrawerOpen = isCompactLayout && workspaceOpen;
  const activeWorkspaceTab = showDetailsPanel ? workspaceTab : "layers";

  const setEditorHostNode = useCallback((node: HTMLElement | null) => {
    editorHostRef.current = node;
    setEditorWidth(node?.clientWidth ?? null);
  }, []);

  useEffect(() => {
    const container = editorHostRef.current;
    if (!hasProject || !container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setEditorWidth(entry.contentRect.width);
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [hasProject]);

  const handleExportProject = useCallback(async () => {
    if (!state.project) return;
    await saveProject(state.project);
    const data = await exportProject(state.project);
    downloadFile(data, `${state.project.name}.2dp`);
  }, [state.project]);

  const handleNewProject = useCallback(() => {
    setProjectDialogOpen(true);
  }, [setProjectDialogOpen]);

  // --- Map Import/Export ---

  const handleExportMap = useCallback(async () => {
    if (!state.project || !state.activeMapId) return;
    const map = state.project.maps.find((m) => m.id === state.activeMapId);
    if (!map) return;
    const projectLayerGroups = state.project.layerGroups ?? [];
    const allLayerIds = getAllLayerIds(map.layerOrder, projectLayerGroups);
    const allGroupIds = getAllGroupIds(map.layerOrder, projectLayerGroups);
    // js-set-map-lookups: O(1) membership check instead of O(n) .includes()
    const layerIdSet = new Set<string>(allLayerIds as string[]);
    const groupIdSet = new Set<string>(allGroupIds as string[]);
    const layers = state.project.layers.filter((l) =>
      layerIdSet.has(l.id as string),
    );
    const imageLayers = (state.project.imageLayers ?? []).filter((layer) =>
      layerIdSet.has(layer.id as string),
    );
    const layerGroups = projectLayerGroups.filter((group) =>
      groupIdSet.has(group.id as string),
    );
    const objectLayers = (state.project.objectLayers ?? []).filter((layer) =>
      layerIdSet.has(layer.id as string),
    );
    const data = await exportMap(
      map,
      layers,
      state.project.tilesets,
      state.project.overrideTilesets ?? [],
      imageLayers,
      layerGroups,
      objectLayers,
      state.project.objects ?? [],
    );
    downloadFile(data, `${map.name}.2dm`);
  }, [state.project, state.activeMapId]);

  const handleImportMap = useCallback(() => {
    if (!state.project) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".2dm";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const currentProject = state.project;
        if (!currentProject) return;

        const raw = await readFileAsUint8Array(file);
        const {
          map,
          layers,
          tilesets,
          overrideTilesets,
          imageLayers: importedImageLayers,
          layerGroups: importedLayerGroups,
          objectLayers: importedObjLayers,
          objects: importedObjects,
        } = await importMap(raw);

        const targetMapGroupId =
          state.activeMapGroupId ?? currentProject.mapGroups[0]?.id;
        const targetTilesetGroupId =
          state.activeTilesetGroupId ?? currentProject.tilesetGroups[0]?.id;
        if (!targetMapGroupId || !targetTilesetGroupId) return;

        const newMapId = generateMapId();
        const layerIdMap = new Map<string, LayerId>();
        const groupIdMap = new Map<string, LayerGroupId>();
        const objectIdMap = new Map<string, ObjectId>();
        const tilesetIdMap = new Map<string, TilesetId>();

        for (const layer of layers) {
          layerIdMap.set(layer.id as string, generateLayerId());
        }
        for (const layer of importedImageLayers) {
          layerIdMap.set(layer.id as string, generateLayerId());
        }
        for (const layer of importedObjLayers) {
          layerIdMap.set(layer.id as string, generateLayerId());
        }
        for (const group of importedLayerGroups) {
          groupIdMap.set(group.id as string, generateLayerGroupId());
        }
        for (const object of importedObjects) {
          objectIdMap.set(object.id as string, generateObjectId());
        }

        const reservedTilesetIds = new Set(
          [
            ...currentProject.tilesets,
            ...(currentProject.overrideTilesets ?? []),
          ].map((tileset) => tileset.id as string),
        );
        const reserveImportedTilesetId = (tilesetId: TilesetId): TilesetId => {
          const existingId = tilesetIdMap.get(tilesetId as string);
          if (existingId) return existingId;

          const nextId = reservedTilesetIds.has(tilesetId as string)
            ? generateTilesetId()
            : tilesetId;
          reservedTilesetIds.add(nextId as string);
          tilesetIdMap.set(tilesetId as string, nextId);
          return nextId;
        };

        for (const tileset of tilesets) {
          reserveImportedTilesetId(tileset.id);
        }
        for (const tileset of overrideTilesets) {
          reserveImportedTilesetId(tileset.id);
        }

        const remappedTilesets = tilesets.map((tileset) =>
          cloneImportedTileset(
            tileset,
            tilesetIdMap,
            targetTilesetGroupId as TilesetGroupId,
          ),
        );
        const remappedOverrideTilesets = overrideTilesets.map((tileset) =>
          cloneImportedTileset(
            tileset,
            tilesetIdMap,
            targetTilesetGroupId as TilesetGroupId,
          ),
        );
        const remappedLayers: TileLayer[] = layers.map((layer) => ({
          ...layer,
          id: layerIdMap.get(layer.id as string) ?? layer.id,
          mapId: newMapId,
          tiles: remapTileEntries(layer.tiles, tilesetIdMap),
        }));
        const remappedImageLayers: ImageLayer[] = importedImageLayers.map(
          (layer) => ({
            ...layer,
            id: layerIdMap.get(layer.id as string) ?? layer.id,
            mapId: newMapId,
          }),
        );
        const remappedObjectLayers: ObjectLayer[] = importedObjLayers.map(
          (layer) => ({
            ...layer,
            id: layerIdMap.get(layer.id as string) ?? layer.id,
            mapId: newMapId,
            objectOrder: layer.objectOrder.map(
              (objectId) => objectIdMap.get(objectId as string) ?? objectId,
            ),
          }),
        );
        const remappedLayerGroups: LayerGroup[] = importedLayerGroups.map(
          (group) => ({
            ...group,
            id: groupIdMap.get(group.id as string) ?? group.id,
            mapId: newMapId,
            childOrder: group.childOrder.map((id) =>
              remapLayerTreeId(id, layerIdMap, groupIdMap),
            ),
          }),
        );
        const remappedObjects: MapObject[] = importedObjects.map((object) => ({
          ...object,
          id: objectIdMap.get(object.id as string) ?? object.id,
          layerId: (layerIdMap.get(object.layerId as string) ??
            object.layerId) as LayerId,
          points: object.points.map((point) => ({ ...point })),
          properties: clonePropertyValues(object.properties),
        }));
        const remappedMap = {
          ...map,
          id: newMapId,
          groupId: targetMapGroupId as MapGroupId,
          layerOrder: map.layerOrder.map((id) =>
            remapLayerTreeId(id, layerIdMap, groupIdMap),
          ),
          properties: clonePropertyValues(map.properties),
          createdAt: Date.now(),
        };

        setState((draft) => {
          if (!draft.project) return;
          if (!draft.project.imageLayers) draft.project.imageLayers = [];
          if (!draft.project.layerGroups) draft.project.layerGroups = [];
          if (!draft.project.objectLayers) draft.project.objectLayers = [];
          if (!draft.project.objects) draft.project.objects = [];
          if (!draft.project.overrideTilesets)
            draft.project.overrideTilesets = [];

          for (const tileset of remappedTilesets) {
            draft.project.tilesets.push(tileset);
          }
          for (const tileset of remappedOverrideTilesets) {
            draft.project.overrideTilesets.push(tileset);
          }

          draft.project.maps.push(remappedMap);

          for (const layer of remappedLayers) {
            draft.project.layers.push(layer);
          }
          for (const layer of remappedImageLayers) {
            draft.project.imageLayers.push(layer);
          }
          for (const group of remappedLayerGroups) {
            draft.project.layerGroups.push(group);
          }
          for (const layer of remappedObjectLayers) {
            draft.project.objectLayers.push(layer);
          }
          for (const object of remappedObjects) {
            draft.project.objects.push(object);
          }

          draft.activeMapId = newMapId;
          draft.activeLayerId =
            findLastLayerId(
              remappedMap.layerOrder,
              remappedLayers,
              remappedLayerGroups,
              remappedImageLayers,
              remappedObjectLayers,
            ) ?? null;
          draft.activeMapGroupId = targetMapGroupId as MapGroupId;
        });
      } catch (err) {
        console.error("[Import Map] Failed:", err);
        alert("Failed to import map. The file may be corrupted.");
      }
    };
    input.click();
  }, [
    state.project,
    state.activeMapGroupId,
    state.activeTilesetGroupId,
    setState,
  ]);

  // --- Tileset Import/Export ---

  const handleExportTileset = useCallback(async () => {
    if (!state.project || !state.activeTilesetId) return;
    const tileset = state.project.tilesets.find(
      (t) => t.id === state.activeTilesetId,
    );
    if (!tileset) return;
    const data = await exportTileset(tileset);
    downloadFile(data, `${tileset.name}.2dt`);
  }, [state.project, state.activeTilesetId]);

  const handleImportTileset = useCallback(() => {
    if (!state.project) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".2dt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await readFileAsUint8Array(file);
        const tileset = await importTileset(raw, state.tileSize);

        // Assign to current or first tileset group
        const targetGroupId =
          state.activeTilesetGroupId ?? state.project!.tilesetGroups[0]?.id;
        if (!targetGroupId) return;

        // Check if tileset already exists (by ID)
        const exists = state.project!.tilesets.some((t) => t.id === tileset.id);

        setState((draft) => {
          if (!draft.project) return;
          if (!exists) {
            draft.project.tilesets.push({
              ...tileset,
              groupId: targetGroupId as TilesetGroupId,
            });
          }
          draft.activeTilesetId = tileset.id;
          draft.activeTilesetGroupId = targetGroupId as TilesetGroupId;
          draft.tileSize = getActiveTilesetTileSize(
            draft.project,
            draft.activeTilesetId,
          );
          draft.selectedTile = null;
        });
      } catch (err) {
        console.error("[Import Tileset] Failed:", err);
        alert("Failed to import tileset. The file may be corrupted.");
      }
    };
    input.click();
  }, [state.project, state.activeTilesetGroupId, state.tileSize, setState]);

  const activeWorkspaceSummary =
    activeLayerKind === "object"
      ? "Objects open alongside the map"
      : activeLayerKind === "image"
        ? "Image properties open alongside the map"
        : "Layers stay one tap away";

  const handleOpenWorkspace = useCallback(() => {
    setWorkspaceTab(showDetailsPanel ? "details" : "layers");
    setWorkspaceOpen(true);
  }, [showDetailsPanel]);

  const workspaceButtonLabel = showDetailsPanel
    ? (detailsTabLabel ?? "Details")
    : "Layers";
  const handleOpenTool = useCallback(
    (tool: ToolName) => {
      if (tool === "image-editor") {
        clearTileEditorContext();
      }

      setActiveTool(tool);
    },
    [setActiveTool],
  );

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onNewProject={handleNewProject}
        onSaveProject={() => {
          const project = state.project;
          if (project) {
            markEditorSaved();
            void saveProject({ ...project, updatedAt: Date.now() });
          }
        }}
        onImportProject={() => setProjectDialogOpen(true)}
        onImportMap={handleImportMap}
        onImportTileset={handleImportTileset}
        onExportProject={handleExportProject}
        onExportMap={handleExportMap}
        onExportTileset={handleExportTileset}
        onOpenSettings={() => setSettingsOpen(true)}
        onAbout={() => setAboutOpen(true)}
        onKeyboardShortcuts={() => setShortcutsOpen(true)}
        onSubmitBug={() => setBugReportOpen(true)}
        onFindReplace={() => setFindReplaceOpen(true)}
        onOpenTool={handleOpenTool}
      />

      {hasProject ? (
        <main ref={setEditorHostNode} className="flex-1 min-h-0">
          {isCompactLayout ? (
            <>
              <CompactEditorShell
                tilesetPanel={<TilesetPanel />}
                mapPanel={<MapPanel />}
                workspaceSummary={activeWorkspaceSummary}
                workspaceButtonLabel={workspaceButtonLabel}
                workspaceOpen={workspaceDrawerOpen}
                onOpenWorkspace={handleOpenWorkspace}
              />

              <EditorWorkspaceDrawer
                open={workspaceDrawerOpen}
                activeTab={activeWorkspaceTab}
                onOpenChange={setWorkspaceOpen}
                onTabChange={setWorkspaceTab}
                layersPanel={<LayersPanel />}
                detailsPanel={detailsPanel}
                detailsTabLabel={detailsTabLabel}
                showDetailsPanel={showDetailsPanel}
              />
            </>
          ) : (
            <DesktopEditorLayout
              tilesetPanel={<TilesetPanel />}
              mapPanel={<MapPanel />}
              layersPanel={<LayersPanel />}
              detailsPanel={detailsPanel}
              showDetailsPanel={showDetailsPanel}
            />
          )}
        </main>
      ) : (
        emptyProjectMessage
      )}

      {settingsOpen && (
        <Suspense>
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </Suspense>
      )}
      {projectDialogOpen && (
        <Suspense>
          <ProjectDialog
            open={projectDialogOpen}
            onOpenChange={setProjectDialogOpen}
            onProjectLoaded={() => setProjectDialogOpen(false)}
          />
        </Suspense>
      )}
      {aboutOpen && (
        <Suspense>
          <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
        </Suspense>
      )}
      {shortcutsOpen && (
        <Suspense>
          <KeyboardShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />
        </Suspense>
      )}
      {findReplaceOpen && (
        <Suspense>
          <FindReplaceDialog
            open={findReplaceOpen}
            onOpenChange={setFindReplaceOpen}
          />
        </Suspense>
      )}
      {bugReportOpen && (
        <Suspense>
          <BugReportDialog
            open={bugReportOpen}
            onOpenChange={setBugReportOpen}
          />
        </Suspense>
      )}
      <Suspense>
        <ToolDrawer
          activeTool={activeTool}
          onClose={() => setActiveTool(null)}
        />
      </Suspense>
    </div>
  );
}

export default App;
