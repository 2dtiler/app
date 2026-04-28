import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { toast } from "sonner";
import { useImportExportActions } from "@/features/import-export/hooks/use-import-export-actions";
import { useQuickExportController } from "@/features/import-export/hooks/use-quick-export-controller";
import { Toolbar } from "@/layouts/Toolbar";
import { TilesetPanel } from "@/features/map-editor/components/TilesetPanel";
import { MapPanel } from "@/features/map-editor/components/MapPanel";
import { LayersPanel } from "@/features/map-editor/components/LayersPanel";
import { ObjectsPanel } from "@/features/map-editor/components/ObjectsPanel";
import { ImageLayerPropertiesPanel } from "@/features/map-editor/components/ImageLayerPropertiesPanel";
import {
  CompactEditorShell,
  DesktopEditorLayout,
  EditorWorkspaceDrawer,
} from "@/features/map-editor/components/Layout/EditorLayouts";
import { useEditorStore } from "@/hooks/use-editor-store";
import { saveProject } from "@/services/db";
import { clearTileEditorContext } from "@/features/map-editor/lib/tile-editor-context";
import type { AppShellProps } from "@/features/app-shell/types";
import type { EditorWorkspaceTab } from "@/features/map-editor/types/editor-layout";
import type { ImportExportDialogMode } from "@/features/import-export/types";
import { markEditorSaved } from "@/store/editor-store";

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
const ImportExportDialog = lazy(() =>
  import("@/features/import-export/components/ImportExportDialog").then(
    (module) => ({
      default: module.ImportExportDialog,
    }),
  ),
);
const QuickExportSetupDialog = lazy(() =>
  import("@/features/import-export/components/QuickExportSetupDialog").then(
    (module) => ({
      default: module.QuickExportSetupDialog,
    }),
  ),
);
const TiledMissingResourcesDialog = lazy(() =>
  import("@/features/import-export/components/TiledMissingResourcesDialog").then(
    (module) => ({
      default: module.TiledMissingResourcesDialog,
    }),
  ),
);
const TideMissingResourcesDialog = lazy(() =>
  import("@/features/import-export/components/TideMissingResourcesDialog").then(
    (module) => ({
      default: module.TideMissingResourcesDialog,
    }),
  ),
);
const DefoldMissingResourcesDialog = lazy(() =>
  import("@/features/import-export/components/DefoldMissingResourcesDialog").then(
    (module) => ({
      default: module.DefoldMissingResourcesDialog,
    }),
  ),
);
const GodotMissingResourcesDialog = lazy(() =>
  import("@/features/import-export/components/GodotMissingResourcesDialog").then(
    (module) => ({
      default: module.GodotMissingResourcesDialog,
    }),
  ),
);
const GameMakerMissingResourcesDialog = lazy(() =>
  import("@/features/import-export/components/GameMakerMissingResourcesDialog").then(
    (module) => ({
      default: module.GameMakerMissingResourcesDialog,
    }),
  ),
);
const UnityMissingResourcesDialog = lazy(() =>
  import("@/features/import-export/components/UnityMissingResourcesDialog").then(
    (module) => ({
      default: module.UnityMissingResourcesDialog,
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
    handleMapExportSubmit,
    handleTilesetExportSubmit,
    projectAction,
    mapAction,
    tilesetAction,
    defoldMissingResourcesDialogProps,
    gameMakerMissingResourcesDialogProps,
    godotMissingResourcesDialogProps,
    tideMissingResourcesDialogProps,
    tiledMissingResourcesDialogProps,
    unityMissingResourcesDialogProps,
  } = useImportExportActions({
    state,
    setState,
    importExportDialogMode,
    importExportDialogOpen,
    setImportExportDialogMode,
    setImportExportDialogOpen,
  });
  const { mapQuickExport, quickExportSetupDialogProps, tilesetQuickExport } =
    useQuickExportController({
      activeMapId: state.activeMapId,
      activeTilesetId: state.activeTilesetId,
      project: state.project,
      handleMapExportSubmit,
      handleTilesetExportSubmit,
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

  const handleMapQuickExport = useEffectEvent(() => {
    mapQuickExport.onQuickExport();
  });

  const handleTilesetQuickExport = useEffectEvent(() => {
    tilesetQuickExport.onQuickExport();
  });

  useEffect(() => {
    window.addEventListener("quick-export-map", handleMapQuickExport);
    window.addEventListener("quick-export-tileset", handleTilesetQuickExport);

    return () => {
      window.removeEventListener("quick-export-map", handleMapQuickExport);
      window.removeEventListener(
        "quick-export-tileset",
        handleTilesetQuickExport,
      );
    };
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
                tilesetPanel={
                  <TilesetPanel quickExportControl={tilesetQuickExport} />
                }
                mapPanel={<MapPanel quickExportControl={mapQuickExport} />}
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
              tilesetPanel={
                <TilesetPanel quickExportControl={tilesetQuickExport} />
              }
              mapPanel={<MapPanel quickExportControl={mapQuickExport} />}
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
      {quickExportSetupDialogProps.open && (
        <Suspense>
          <QuickExportSetupDialog {...quickExportSetupDialogProps} />
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
      {tideMissingResourcesDialogProps.open && (
        <Suspense>
          <TideMissingResourcesDialog
            open={tideMissingResourcesDialogProps.open}
            onOpenChange={tideMissingResourcesDialogProps.onOpenChange}
            resources={tideMissingResourcesDialogProps.resources}
            selectedFileNames={
              tideMissingResourcesDialogProps.selectedFileNames
            }
            isSubmitting={tideMissingResourcesDialogProps.isSubmitting}
            onSelectFile={tideMissingResourcesDialogProps.onSelectFile}
            onImport={tideMissingResourcesDialogProps.onImport}
          />
        </Suspense>
      )}
      {defoldMissingResourcesDialogProps.open && (
        <Suspense>
          <DefoldMissingResourcesDialog
            open={defoldMissingResourcesDialogProps.open}
            onOpenChange={defoldMissingResourcesDialogProps.onOpenChange}
            resources={defoldMissingResourcesDialogProps.resources}
            selectedFileNames={
              defoldMissingResourcesDialogProps.selectedFileNames
            }
            isSubmitting={defoldMissingResourcesDialogProps.isSubmitting}
            onSelectFile={defoldMissingResourcesDialogProps.onSelectFile}
            onImport={defoldMissingResourcesDialogProps.onImport}
          />
        </Suspense>
      )}
      {godotMissingResourcesDialogProps.open && (
        <Suspense>
          <GodotMissingResourcesDialog
            open={godotMissingResourcesDialogProps.open}
            onOpenChange={godotMissingResourcesDialogProps.onOpenChange}
            resources={godotMissingResourcesDialogProps.resources}
            selectedFileNames={
              godotMissingResourcesDialogProps.selectedFileNames
            }
            isSubmitting={godotMissingResourcesDialogProps.isSubmitting}
            onSelectFile={godotMissingResourcesDialogProps.onSelectFile}
            onImport={godotMissingResourcesDialogProps.onImport}
          />
        </Suspense>
      )}
      {gameMakerMissingResourcesDialogProps.open && (
        <Suspense>
          <GameMakerMissingResourcesDialog
            open={gameMakerMissingResourcesDialogProps.open}
            onOpenChange={gameMakerMissingResourcesDialogProps.onOpenChange}
            resources={gameMakerMissingResourcesDialogProps.resources}
            selectedFileNames={
              gameMakerMissingResourcesDialogProps.selectedFileNames
            }
            isSubmitting={gameMakerMissingResourcesDialogProps.isSubmitting}
            onSelectFile={gameMakerMissingResourcesDialogProps.onSelectFile}
            onImport={gameMakerMissingResourcesDialogProps.onImport}
          />
        </Suspense>
      )}
      {unityMissingResourcesDialogProps.open && (
        <Suspense>
          <UnityMissingResourcesDialog
            open={unityMissingResourcesDialogProps.open}
            onOpenChange={unityMissingResourcesDialogProps.onOpenChange}
            resources={unityMissingResourcesDialogProps.resources}
            selectedFileNames={
              unityMissingResourcesDialogProps.selectedFileNames
            }
            isSubmitting={unityMissingResourcesDialogProps.isSubmitting}
            onSelectFile={unityMissingResourcesDialogProps.onSelectFile}
            onImport={unityMissingResourcesDialogProps.onImport}
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
