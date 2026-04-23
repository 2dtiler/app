import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { toast } from "sonner";
import { useImportExportActions } from "@/components/app/use-import-export-actions";
import { Toolbar } from "@/components/layout/Toolbar";
import { TilesetPanel } from "@/components/editor/TilesetPanel";
import { MapPanel } from "@/components/editor/MapPanel";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { ObjectsPanel } from "@/components/editor/ObjectsPanel";
import { ImageLayerPropertiesPanel } from "@/components/editor/ImageLayerPropertiesPanel";
import {
  CompactEditorShell,
  DesktopEditorLayout,
  EditorWorkspaceDrawer,
} from "@/components/editor/Layout/EditorLayouts";
import { useEditorStore } from "@/hooks/use-editor-store";
import { saveProject } from "@/lib/db";
import { clearTileEditorContext } from "@/lib/tile-editor-context";
import type { EditorWorkspaceTab } from "@/types/editor/editor-layout";
import type { AppShellProps } from "@/types/app/app";
import type { ImportExportDialogMode } from "@/types/import-export";
import { markEditorSaved } from "@/lib/store";

const SettingsDialog = lazy(() =>
  import("@/components/dialogs/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);
const ProjectDialog = lazy(() =>
  import("@/components/dialogs/ProjectDialog").then((module) => ({
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
const ImportExportDialog = lazy(() =>
  import("@/components/dialogs/ImportExportDialog").then((module) => ({
    default: module.ImportExportDialog,
  })),
);
const TiledMissingResourcesDialog = lazy(() =>
  import("@/components/dialogs/TiledMissingResourcesDialog").then((module) => ({
    default: module.TiledMissingResourcesDialog,
  })),
);
const ToolDrawer = lazy(() =>
  import("@/components/tools/ToolDrawer").then((module) => ({
    default: module.ToolDrawer,
  })),
);

const emptyProjectMessage = (
  <main className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground text-sm">
    Open or create a project to get started
  </main>
);

const NARROW_LAYOUT_BREAKPOINT = 768;

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
  const { state, setState } = useEditorStore();
  const hasProject = state.project !== null;
  const editorHostRef = useRef<HTMLElement>(null);
  const [editorWidth, setEditorWidth] = useState<number | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] =
    useState<EditorWorkspaceTab>("layers");
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);
  const [importExportDialogMode, setImportExportDialogMode] =
    useState<ImportExportDialogMode>("import");

  const activeLayerKind =
    state.project !== null &&
    state.activeLayerId !== null &&
    (state.project.objectLayers ?? []).some(
      (layer) => layer.id === state.activeLayerId,
    )
      ? "object"
      : state.project !== null &&
          state.activeLayerId !== null &&
          (state.project.imageLayers ?? []).some(
            (layer) => layer.id === state.activeLayerId,
          )
        ? "image"
        : state.project !== null &&
            state.activeLayerId !== null &&
            state.project.layers.some(
              (layer) => layer.id === state.activeLayerId,
            )
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

  const handleNewProject = useCallback(() => {
    setProjectDialogOpen(true);
  }, [setProjectDialogOpen]);
  const {
    handleOpenImportDialog,
    handleOpenExportDialog,
    projectAction,
    mapAction,
    tilesetAction,
    tiledMissingResourcesDialogProps,
  } = useImportExportActions({
    state,
    setState,
    importExportDialogMode,
    importExportDialogOpen,
    setImportExportDialogMode,
    setImportExportDialogOpen,
  });

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
    window.addEventListener("project-save-end", handleSaveEnd);
    return () => window.removeEventListener("project-save-end", handleSaveEnd);
  }, []);

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
        onOpenImportDialog={handleOpenImportDialog}
        onOpenExportDialog={handleOpenExportDialog}
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
      {importExportDialogOpen && (
        <Suspense>
          <ImportExportDialog
            open={importExportDialogOpen}
            onOpenChange={setImportExportDialogOpen}
            mode={importExportDialogMode}
            projectAction={projectAction}
            mapAction={mapAction}
            tilesetAction={tilesetAction}
          />
        </Suspense>
      )}
      {tiledMissingResourcesDialogProps.open && (
        <Suspense>
          <TiledMissingResourcesDialog
            open={tiledMissingResourcesDialogProps.open}
            onOpenChange={tiledMissingResourcesDialogProps.onOpenChange}
            format={tiledMissingResourcesDialogProps.format}
            resources={tiledMissingResourcesDialogProps.resources}
            selectedFileNames={
              tiledMissingResourcesDialogProps.selectedFileNames
            }
            isSubmitting={tiledMissingResourcesDialogProps.isSubmitting}
            onSelectFile={tiledMissingResourcesDialogProps.onSelectFile}
            onImport={tiledMissingResourcesDialogProps.onImport}
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
