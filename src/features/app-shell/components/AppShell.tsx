import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { toast } from "sonner";
import { Toolbar } from "@/layouts/Toolbar";
import { useEditorStore } from "@/hooks/use-editor-store";
import { clearTileEditorContext } from "@/features/map-editor/lib/tile-editor-context";
import type { AppShellProps } from "@/features/app-shell/types";
import type { ImportExportDialogMode } from "@/features/import-export/types";
import { saveProjectAndNotify } from "@/features/project-management/lib/project-save";

const SettingsDialog = lazy(() =>
  import("@/components/dialogs/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);
const ProjectDialog = lazy(() =>
  import("@/features/project-management").then((module) => ({
    default: module.ProjectDialog,
  })),
);
const AboutDialog = lazy(() =>
  import("@/components/dialogs/AboutDialog").then((module) => ({
    default: module.AboutDialog,
  })),
);
const KeyboardShortcutsDialog = lazy(() =>
  import("@/components/dialogs/KeyboardShortcutsDialog").then((module) => ({
    default: module.KeyboardShortcutsDialog,
  })),
);
const FindReplaceDialog = lazy(() =>
  import("@/components/dialogs/FindReplaceDialog").then((module) => ({
    default: module.FindReplaceDialog,
  })),
);
const BugReportDialog = lazy(() =>
  import("@/components/dialogs/BugReportDialog").then((module) => ({
    default: module.BugReportDialog,
  })),
);
const AppShellEditorRuntime = lazy(() =>
  import("@/features/app-shell/components/AppShellEditorRuntime").then(
    (module) => ({
      default: module.AppShellEditorRuntime,
    }),
  ),
);
const ToolDrawer = lazy(() =>
  import("@/features/app-shell/components/ToolDrawer").then((module) => ({
    default: module.ToolDrawer,
  })),
);

const emptyProjectMessage = (
  <main className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground text-sm">
    Open or create a project to get started
  </main>
);

export function AppShell({
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
}: AppShellProps) {
  const { state } = useEditorStore();
  const hasProject = state.project !== null;
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);
  const [importExportDialogMode, setImportExportDialogMode] =
    useState<ImportExportDialogMode>("import");

  const handleNewProject = useCallback(() => {
    setProjectDialogOpen(true);
  }, [setProjectDialogOpen]);
  const handleOpenImportDialog = useCallback(() => {
    setImportExportDialogMode("import");
    setImportExportDialogOpen(true);
  }, []);
  const handleOpenExportDialog = useCallback(() => {
    setImportExportDialogMode("export");
    setImportExportDialogOpen(true);
  }, []);
  const handleOpenTool = useCallback(
    (
      tool: AppShellProps["activeTool"] extends infer ActiveTool
        ? Exclude<ActiveTool, null>
        : never,
    ) => {
      if (tool === "image-editor") {
        clearTileEditorContext();
      }

      setActiveTool(tool);
    },
    [setActiveTool],
  );

  useEffect(() => {
    function handleOpenFindReplace() {
      setFindReplaceOpen(true);
    }
    window.addEventListener("open-find-replace", handleOpenFindReplace);
    return () =>
      window.removeEventListener("open-find-replace", handleOpenFindReplace);
  }, [setFindReplaceOpen]);

  useEffect(() => {
    function handleOpenImageEditor() {
      setActiveTool("image-editor");
    }
    window.addEventListener("open-image-editor", handleOpenImageEditor);
    return () =>
      window.removeEventListener("open-image-editor", handleOpenImageEditor);
  }, [setActiveTool]);

  useEffect(() => {
    function handleSaveEnd() {
      toast.success("Project saved");
    }
    window.addEventListener("project-save-success", handleSaveEnd);
    return () =>
      window.removeEventListener("project-save-success", handleSaveEnd);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onNewProject={handleNewProject}
        onSaveProject={() => {
          const project = state.project;
          if (project) {
            void saveProjectAndNotify(project);
          }
        }}
        onOpenImportDialog={handleOpenImportDialog}
        onOpenExportDialog={handleOpenExportDialog}
        onOpenSettings={() => setSettingsOpen(true)}
        onAbout={() => setAboutOpen(true)}
        onKeyboardShortcuts={() => setShortcutsOpen(true)}
        onSubmitBug={() => setBugReportOpen(true)}
        onFindReplace={() => setFindReplaceOpen(true)}
        onOpenTool={handleOpenTool}
      />

      {!hasProject && emptyProjectMessage}

      {(hasProject || importExportDialogOpen) && (
        <Suspense fallback={hasProject ? emptyProjectMessage : null}>
          <AppShellEditorRuntime
            importExportDialogOpen={importExportDialogOpen}
            setImportExportDialogOpen={setImportExportDialogOpen}
            importExportDialogMode={importExportDialogMode}
            setImportExportDialogMode={setImportExportDialogMode}
          />
        </Suspense>
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
