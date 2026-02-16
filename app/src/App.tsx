import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initEditorStore, getEditorStore } from "@/lib/store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { saveProject, saveProjectPrefs } from "@/lib/db";
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
import type {
  TilesetGroupId,
  MapGroupId,
  TileLayer,
  LayerId,
  LayerGroupId,
  ObjectId,
} from "@/types";

import { Toolbar, type ToolName } from "@/components/layout/Toolbar";
const SettingsDialog = lazy(() => import("@/components/dialogs/SettingsDialog").then(m => ({ default: m.SettingsDialog })));
const ProjectModal = lazy(() => import("@/components/dialogs/ProjectModal").then(m => ({ default: m.ProjectModal })));
const AboutDialog = lazy(() => import("@/components/dialogs/AboutDialog").then(m => ({ default: m.AboutDialog })));
const KeyboardShortcutsDialog = lazy(() => import("@/components/dialogs/KeyboardShortcutsDialog").then(m => ({ default: m.KeyboardShortcutsDialog })));
const FindReplaceDialog = lazy(() => import("@/components/dialogs/FindReplaceDialog").then(m => ({ default: m.FindReplaceDialog })));
const BugReportDialog = lazy(() => import("@/components/dialogs/BugReportDialog").then(m => ({ default: m.BugReportDialog })));
const ToolDrawer = lazy(() => import("@/components/dialogs/ToolDrawer").then(m => ({ default: m.ToolDrawer })));
import { TilesetPanel } from "@/components/editor/TilesetPanel";
import { MapPanel } from "@/components/editor/MapPanel";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { ObjectsPanel } from "@/components/editor/ObjectsPanel";
import { AdBanner } from "@/components/AdBanner";

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

// Init-once guard: prevents double-init in React StrictMode (advanced-init-once)
let storeInitStarted = false;

function App() {
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolName | null>(null);

  useEffect(() => {
    if (storeInitStarted) return;
    storeInitStarted = true;
    initEditorStore().then(() => setReady(true));
  }, []);

  useAutoSave();
  useKeyboardShortcuts();

  // Save project UI preferences on page unload so they persist across refreshes
  useEffect(() => {
    function handleBeforeUnload() {
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

  if (!ready) {
    return loadingScreen;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        projectModalOpen={projectModalOpen}
        setProjectModalOpen={setProjectModalOpen}
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
  projectModalOpen,
  setProjectModalOpen,
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
  projectModalOpen: boolean;
  setProjectModalOpen: (v: boolean) => void;
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

  // Determine if the active layer is an object layer
  const isObjectLayerActive =
    state.project !== null &&
    state.activeLayerId !== null &&
    (state.project.objectLayers ?? []).some(
      (l) => l.id === state.activeLayerId,
    );

  const handleExportProject = useCallback(async () => {
    if (!state.project) return;
    await saveProject(state.project);
    const data = await exportProject(state.project);
    downloadFile(data, `${state.project.name}.2dp`);
  }, [state.project]);

  const handleNewProject = useCallback(() => {
    setProjectModalOpen(true);
  }, [setProjectModalOpen]);

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
        const tileset = await importTileset(raw);

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
        });
      } catch (err) {
        console.error("[Import Tileset] Failed:", err);
        alert("Failed to import tileset. The file may be corrupted.");
      }
    };
    input.click();
  }, [state.project, state.activeTilesetGroupId, setState]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onNewProject={handleNewProject}
        onSaveProject={() => {
          const project = state.project;
          if (project) {
            void saveProject({ ...project, updatedAt: Date.now() });
          }
        }}
        onImportProject={() => setProjectModalOpen(true)}
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
        <main className="flex-1 min-h-0">
          <Group orientation="horizontal" id="main-layout">
            {/* Left: Tileset Panel */}
            <Panel defaultSize="50%" minSize="15%" maxSize="60%">
              <TilesetPanel />
            </Panel>

            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

            {/* Right: Map + Layers */}
            <Panel defaultSize="50%" minSize="25%">
              <Group orientation="horizontal" id="right-layout">
                {/* Center: Map Canvas */}
                <Panel defaultSize="75%" minSize="30%">
                  <MapPanel />
                </Panel>

                <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

                {/* Right: Layers + Objects */}
                <Panel defaultSize="25%" minSize="10%" maxSize="50%">
                  {isObjectLayerActive ? (
                    <Group orientation="vertical" id="layers-objects-layout">
                      <Panel defaultSize="50%" minSize="20%">
                        <LayersPanel />
                      </Panel>
                      <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors cursor-row-resize" />
                      <Panel defaultSize="50%" minSize="20%">
                        <ObjectsPanel />
                      </Panel>
                    </Group>
                  ) : (
                    <div className="flex flex-col h-full">
                      <div className="flex-1 min-h-0 overflow-auto">
                        <LayersPanel />
                      </div>
                      <AdBanner
                        adSlot="YOUR_AD_SLOT_ID"
                        className="shrink-0 p-1"
                      />
                    </div>
                  )}
                </Panel>
              </Group>
            </Panel>
          </Group>
        </main>
      ) : (
        emptyProjectMessage
      )}

      {settingsOpen && <Suspense><SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} /></Suspense>}
      {projectModalOpen && <Suspense><ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        onProjectLoaded={() => setProjectModalOpen(false)}
      /></Suspense>}
      {aboutOpen && <Suspense><AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} /></Suspense>}
      {shortcutsOpen && <Suspense><KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      /></Suspense>}
      {findReplaceOpen && <Suspense><FindReplaceDialog
        open={findReplaceOpen}
        onOpenChange={setFindReplaceOpen}
      /></Suspense>}
      {bugReportOpen && <Suspense><BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} /></Suspense>}
      {activeTool !== null && <Suspense><ToolDrawer activeTool={activeTool} onClose={() => setActiveTool(null)} /></Suspense>}
    </div>
  );
}

export default App;
