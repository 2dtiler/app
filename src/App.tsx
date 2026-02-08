import { useEffect, useState, useCallback } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initEditorStore } from "@/lib/store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useEditorStore } from "@/hooks/use-editor-store";
import { saveProject } from "@/lib/db";
import { exportProject, downloadFile } from "@/lib/format";

import { Toolbar } from "@/components/layout/Toolbar";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { ProjectModal } from "@/components/dialogs/ProjectModal";
import { TilesetPanel } from "@/components/editor/TilesetPanel";
import { MapPanel } from "@/components/editor/MapPanel";
import { LayersPanel } from "@/components/editor/LayersPanel";

function App() {
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(true);

  useEffect(() => {
    initEditorStore().then(() => setReady(true));
  }, []);

  useAutoSave();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-primary text-sm tracking-widest uppercase animate-pulse">
          Initializing…
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        projectModalOpen={projectModalOpen}
        setProjectModalOpen={setProjectModalOpen}
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
}: {
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  projectModalOpen: boolean;
  setProjectModalOpen: (v: boolean) => void;
}) {
  const { state } = useEditorStore();
  const hasProject = state.project !== null;

  const handleExportProject = useCallback(async () => {
    if (!state.project) return;
    // Save first
    await saveProject(state.project);
    const data = await exportProject(state.project);
    downloadFile(data, `${state.project.name}.2dp`);
  }, [state.project]);

  const handleNewProject = useCallback(() => {
    setProjectModalOpen(true);
  }, [setProjectModalOpen]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onNewProject={handleNewProject}
        onImportProject={() => setProjectModalOpen(true)}
        onImportMap={() => {
          /* TODO Phase 4 */
        }}
        onImportTileset={() => {
          /* TODO Phase 4 */
        }}
        onExportProject={handleExportProject}
        onExportMap={() => {
          /* TODO Phase 4 */
        }}
        onExportTileset={() => {
          /* TODO Phase 4 */
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onAbout={() =>
          alert("2D Tiler v0.1.0\nA tile map editor built with React & PixiJS.")
        }
        onKeyboardShortcuts={() =>
          alert(
            "Keyboard Shortcuts:\n\n" +
              "Ctrl+Z — Undo\n" +
              "Ctrl+Shift+Z — Redo\n" +
              "B — Paint tool\n" +
              "E — Erase tool\n" +
              "G — Fill tool",
          )
        }
        onSubmitBug={() => window.open("https://github.com", "_blank")}
      />

      {hasProject ? (
        <main className="flex-1 min-h-0">
          <Group orientation="horizontal" id="main-layout">
            {/* Left: Tileset Panel */}
            <Panel defaultSize={25} minSize={15} maxSize={50}>
              <TilesetPanel />
            </Panel>

            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

            {/* Right: Map + Layers */}
            <Panel defaultSize={75} minSize={40}>
              <Group orientation="horizontal" id="right-layout">
                {/* Center: Map Canvas */}
                <Panel defaultSize={80} minSize={40}>
                  <MapPanel />
                </Panel>

                <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

                {/* Right: Layers */}
                <Panel defaultSize={20} minSize={12} maxSize={40}>
                  <LayersPanel />
                </Panel>
              </Group>
            </Panel>
          </Group>
        </main>
      ) : (
        <main className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground text-sm">
          Open or create a project to get started
        </main>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        onProjectLoaded={() => setProjectModalOpen(false)}
      />
    </div>
  );
}

export default App;
