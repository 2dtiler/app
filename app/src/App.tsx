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
  saveProjectPrefs,
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
import { generateMapId, generateLayerId, generateObjectId } from "@/lib/ids";
import { getAllLayerIds } from "@/lib/layers";
import { getActiveTilesetTileSize } from "@/lib/project";
import type {
  TilesetGroupId,
  MapGroupId,
  TileLayer,
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
            autoOpened = true;
          }
        }
      }

      // No projects at all — show the project dialog
      if (!autoOpened) {
        setProjectDialogOpen(true);
      }

      setReady(true);
    });
  }, [setProjectDialogOpen]);

  useAutoSave();
  useKeyboardShortcuts();

  // Save project UI preferences on page unload so they persist across refreshes.
  // Also warn the user if there are unsaved changes.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      try {
        const store = getEditorStore();
        const s = store.getState();
        if (s.project) {
          saveProjectPrefs(s.project.id, {
            activeTilesetGroupId: s.activeTilesetGroupId,
            activeTilesetId: s.activeTilesetId,
            activeMapGroupId: s.activeMapGroupId,
            activeMapId: s.activeMapId,
            activeLayerId: s.activeLayerId,
          });
        }
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
    const allLayerIds = getAllLayerIds(
      map.layerOrder,
      state.project.layerGroups ?? [],
    );
    // js-set-map-lookups: O(1) membership check instead of O(n) .includes()
    const layerIdSet = new Set<string>(allLayerIds as string[]);
    const layers = state.project.layers.filter((l) =>
      layerIdSet.has(l.id as string),
    );
    const data = await exportMap(
      map,
      layers,
      state.project.tilesets,
      state.project.objectLayers ?? [],
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
        const raw = await readFileAsUint8Array(file);
        const {
          map,
          layers,
          tilesets,
          objectLayers: importedObjLayers,
          objects: importedObjects,
        } = await importMap(raw);

        // Assign new IDs to avoid collisions with existing project data
        const newMapId = generateMapId();
        const layerIdMap = new Map<string, string>();
        const newLayers: TileLayer[] = layers.map((l) => {
          const newLayerId = generateLayerId();
          layerIdMap.set(l.id, newLayerId);
          return { ...l, id: newLayerId, mapId: newMapId } as TileLayer;
        });

        // Ensure the target map group exists
        const targetGroupId =
          state.activeMapGroupId ?? state.project!.mapGroups[0]?.id;
        if (!targetGroupId) return;

        // Merge tilesets that don't already exist in the project
        const existingTilesetIds = new Set(
          state.project!.tilesets.map((t) => t.id),
        );
        const newTilesets = tilesets.filter(
          (t) => !existingTilesetIds.has(t.id),
        );

        setState((draft) => {
          if (!draft.project) return;

          // Add tilesets that aren't already present
          for (const ts of newTilesets) {
            // Assign to the first tileset group
            const groupId =
              draft.project.tilesetGroups[0]?.id ??
              (null as unknown as TilesetGroupId);
            if (groupId) {
              draft.project.tilesets.push({ ...ts, groupId });
            }
          }

          // Add the map
          const newMap = {
            ...map,
            id: newMapId,
            groupId: targetGroupId as MapGroupId,
            layerOrder: map.layerOrder.map(
              (lid) => (layerIdMap.get(lid) ?? lid) as LayerId | LayerGroupId,
            ),
            createdAt: Date.now(),
          };
          draft.project.maps.push(newMap);

          // Add layers
          for (const layer of newLayers) {
            draft.project.layers.push(layer);
          }

          // Add imported object layers and objects (re-ID to avoid collisions)
          if (!draft.project.objectLayers) draft.project.objectLayers = [];
          if (!draft.project.objects) draft.project.objects = [];
          for (const ol of importedObjLayers) {
            const newOlId = generateLayerId();
            layerIdMap.set(ol.id, newOlId);
            draft.project.objectLayers.push({
              ...ol,
              id: newOlId,
              mapId: newMapId,
              objectOrder: ol.objectOrder.map((oid) => {
                // object IDs will be remapped below
                return oid;
              }),
            });
          }
          const objectIdMap = new Map<string, string>();
          for (const obj of importedObjects) {
            const newObjId = generateObjectId();
            objectIdMap.set(obj.id, newObjId);
            const newLayerId = layerIdMap.get(obj.layerId) ?? obj.layerId;
            draft.project.objects.push({
              ...obj,
              id: newObjId,
              layerId: newLayerId as LayerId,
            });
          }
          // Fix up objectOrder references
          for (const ol of draft.project.objectLayers) {
            ol.objectOrder = ol.objectOrder.map(
              (oid) => (objectIdMap.get(oid as string) ?? oid) as ObjectId,
            );
          }

          draft.activeMapId = newMapId;
          draft.activeLayerId = newLayers[newLayers.length - 1]?.id ?? null;
          draft.activeMapGroupId = targetGroupId as MapGroupId;
        });
      } catch (err) {
        console.error("[Import Map] Failed:", err);
        alert("Failed to import map. The file may be corrupted.");
      }
    };
    input.click();
  }, [state.project, state.activeMapGroupId, setState]);

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
        onOpenTool={(tool) => setActiveTool(tool)}
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
