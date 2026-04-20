import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { toast } from "sonner";
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
import {
  exportProject,
  exportMap,
  importProject,
  importMap,
  exportTileset,
  importTileset,
  downloadFile,
  readFileAsUint8Array,
} from "@/lib/format";
import { saveProject } from "@/lib/db";
import {
  generateMapId,
  generateLayerId,
  generateLayerGroupId,
  generateObjectId,
  generateTilesetId,
} from "@/lib/ids";
import { findLastLayerId, getAllGroupIds, getAllLayerIds } from "@/lib/layers";
import { clearTileEditorContext } from "@/lib/tile-editor-context";
import { getActiveTilesetTileSize } from "@/lib/project";
import { openProjectInEditor } from "@/lib/project-session";
import {
  cloneImportedTileset,
  clonePropertyValues,
  remapLayerTreeId,
  remapTileEntries,
} from "@/lib/project-import";
import type {
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapGroupId,
  MapObject,
  ObjectId,
  ObjectLayer,
  TileLayer,
  TilesetGroupId,
  TilesetId,
} from "@/types";
import type { EditorWorkspaceTab } from "@/types/editor-layout";
import type { AppShellProps } from "@/types/app";
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

  const handleExportProject = useCallback(async () => {
    if (!state.project) return;
    await saveProject(state.project);
    const data = await exportProject(state.project);
    downloadFile(data, `${state.project.name}.2dp`);
  }, [state.project]);

  const handleImportProject = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".2dp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await readFileAsUint8Array(file);
        const project = await importProject(raw);
        await saveProject(project);
        openProjectInEditor(project);
      } catch (error) {
        console.error("[Import Project] Failed:", error);
        alert("Failed to import project. The file may be corrupted.");
      }
    };
    input.click();
  }, []);

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

  const handleExportMap = useCallback(async () => {
    if (!state.project || !state.activeMapId) return;
    const map = state.project.maps.find(
      (entry) => entry.id === state.activeMapId,
    );
    if (!map) return;
    const projectLayerGroups = state.project.layerGroups ?? [];
    const allLayerIds = getAllLayerIds(map.layerOrder, projectLayerGroups);
    const allGroupIds = getAllGroupIds(map.layerOrder, projectLayerGroups);
    const layerIdSet = new Set<string>(allLayerIds as string[]);
    const groupIdSet = new Set<string>(allGroupIds as string[]);
    const layers = state.project.layers.filter((layer) =>
      layerIdSet.has(layer.id as string),
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
          objectLayers: importedObjectLayers,
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
        for (const layer of importedObjectLayers) {
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
        const remappedObjectLayers: ObjectLayer[] = importedObjectLayers.map(
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
          if (!draft.project.overrideTilesets) {
            draft.project.overrideTilesets = [];
          }

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
      } catch (error) {
        console.error("[Import Map] Failed:", error);
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

  const handleExportTileset = useCallback(async () => {
    if (!state.project || !state.activeTilesetId) return;
    const tileset = state.project.tilesets.find(
      (entry) => entry.id === state.activeTilesetId,
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
        const project = state.project;
        if (!project) return;

        const raw = await readFileAsUint8Array(file);
        const tileset = await importTileset(raw, state.tileSize);
        const targetGroupId =
          state.activeTilesetGroupId ?? project.tilesetGroups[0]?.id;
        if (!targetGroupId) return;

        const exists = project.tilesets.some(
          (entry) => entry.id === tileset.id,
        );

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
      } catch (error) {
        console.error("[Import Tileset] Failed:", error);
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
            projectAction={{
              enabled:
                importExportDialogMode === "import"
                  ? true
                  : Boolean(state.project),
              onSelect:
                importExportDialogMode === "import"
                  ? handleImportProject
                  : () => {
                      void handleExportProject();
                    },
              disabledReason:
                importExportDialogMode === "export" && !state.project
                  ? "Open a project first"
                  : undefined,
            }}
            mapAction={{
              enabled:
                importExportDialogMode === "import"
                  ? Boolean(state.project)
                  : Boolean(state.project && state.activeMapId),
              onSelect:
                importExportDialogMode === "import"
                  ? handleImportMap
                  : () => {
                      void handleExportMap();
                    },
              disabledReason:
                importExportDialogMode === "import"
                  ? state.project
                    ? undefined
                    : "Open a project first"
                  : state.project
                    ? state.activeMapId
                      ? undefined
                      : "Open a map first"
                    : "Open a project first",
            }}
            tilesetAction={{
              enabled:
                importExportDialogMode === "import"
                  ? Boolean(state.project)
                  : Boolean(state.project && state.activeTilesetId),
              onSelect:
                importExportDialogMode === "import"
                  ? handleImportTileset
                  : () => {
                      void handleExportTileset();
                    },
              disabledReason:
                importExportDialogMode === "import"
                  ? state.project
                    ? undefined
                    : "Open a project first"
                  : state.project
                    ? state.activeTilesetId
                      ? undefined
                      : "Open a tileset first"
                    : "Open a project first",
            }}
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
