import { useEffect, useState, useCallback } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initEditorStore } from "@/lib/store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { saveProject } from "@/lib/db";
import {
  exportProject,
  exportMap,
  importMap,
  exportTileset,
  importTileset,
  downloadFile,
  readFileAsUint8Array,
} from "@/lib/format";
import { generateMapId, generateLayerId } from "@/lib/ids";
import { getAllLayerIds } from "@/lib/layers";
import type {
  TilesetGroupId,
  MapGroupId,
  TileLayer,
  LayerId,
  LayerGroupId,
} from "@/types";

import { Toolbar } from "@/components/layout/Toolbar";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { ProjectModal } from "@/components/dialogs/ProjectModal";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { KeyboardShortcutsDialog } from "@/components/dialogs/KeyboardShortcutsDialog";
import { FindReplaceDialog } from "@/components/dialogs/FindReplaceDialog";
import { TilesetPanel } from "@/components/editor/TilesetPanel";
import { MapPanel } from "@/components/editor/MapPanel";
import { LayersPanel } from "@/components/editor/LayersPanel";

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

  useEffect(() => {
    if (storeInitStarted) return;
    storeInitStarted = true;
    initEditorStore().then(() => setReady(true));
  }, []);

  useAutoSave();
  useKeyboardShortcuts();

  // Listen for the Find and Replace custom event from keyboard shortcuts
  useEffect(() => {
    function handleOpenFindReplace() {
      setFindReplaceOpen(true);
    }
    window.addEventListener("open-find-replace", handleOpenFindReplace);
    return () => window.removeEventListener("open-find-replace", handleOpenFindReplace);
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
}) {
  const { state, setState } = useEditorStore();
  const hasProject = state.project !== null;

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
    const data = await exportMap(map, layers, state.project.tilesets);
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
        const { map, layers, tilesets } = await importMap(raw);

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
        onImportProject={() => setProjectModalOpen(true)}
        onImportMap={handleImportMap}
        onImportTileset={handleImportTileset}
        onExportProject={handleExportProject}
        onExportMap={handleExportMap}
        onExportTileset={handleExportTileset}
        onOpenSettings={() => setSettingsOpen(true)}
        onAbout={() => setAboutOpen(true)}
        onKeyboardShortcuts={() => setShortcutsOpen(true)}
        onSubmitBug={() => window.open("https://github.com", "_blank")}
        onFindReplace={() => setFindReplaceOpen(true)}
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

                {/* Right: Layers */}
                <Panel defaultSize="25%" minSize="10%" maxSize="50%">
                  <LayersPanel />
                </Panel>
              </Group>
            </Panel>
          </Group>
        </main>
      ) : (
        emptyProjectMessage
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        onProjectLoaded={() => setProjectModalOpen(false)}
      />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <FindReplaceDialog
        open={findReplaceOpen}
        onOpenChange={setFindReplaceOpen}
      />
    </div>
  );
}

export default App;
