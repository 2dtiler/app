import {
  useEffect,
  useState,
} from "react";
import { TooltipProvider } from "@/components/ui/Tooltip";
import {
  initEditorStore,
  getEditorStore,
  markEditorSaved,
  hasUnsavedChanges,
} from "@/lib/store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  listProjects,
  getProject,
  loadProjectPrefs,
  loadLastProjectId,
} from "@/lib/db";
import {
} from "@/lib/db";
import {
  hydrateZoomStoreForProject,
  saveCurrentProjectPrefs,
} from "@/lib/project-prefs";
import { getActiveTilesetTileSize } from "@/lib/project";
import { zoomStore } from "@/lib/zoom-store";
import type { ToolName } from "@/types";
import { Toaster } from "@/components/ui/Sonner";
import { AppShell } from "@/components/app/AppShell";


// Hoisted static JSX: avoids re-creation on every render (rendering-hoist-jsx)
const loadingScreen = (
  <div className="flex h-full items-center justify-center">
    <div className="text-primary text-sm tracking-widest uppercase animate-pulse">
      Initializing…
    </div>
  </div>
);

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

export default App;
