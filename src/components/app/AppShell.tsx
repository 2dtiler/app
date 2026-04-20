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
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
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
  ImportExportArchiveEntry,
  ImportExportAssetGroup,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapId,
  MapGroupId,
  MapObject,
  ObjectId,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
  Tileset,
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

function getMapExportData(project: Project, map: TileMapData) {
  const projectLayerGroups = project.layerGroups ?? [];
  const allLayerIds = getAllLayerIds(map.layerOrder, projectLayerGroups);
  const allGroupIds = getAllGroupIds(map.layerOrder, projectLayerGroups);
  const layerIdSet = new Set<string>(allLayerIds as string[]);
  const groupIdSet = new Set<string>(allGroupIds as string[]);

  return {
    layers: project.layers.filter((layer) =>
      layerIdSet.has(layer.id as string),
    ),
    imageLayers: (project.imageLayers ?? []).filter((layer) =>
      layerIdSet.has(layer.id as string),
    ),
    layerGroups: projectLayerGroups.filter((group) =>
      groupIdSet.has(group.id as string),
    ),
    objectLayers: (project.objectLayers ?? []).filter((layer) =>
      layerIdSet.has(layer.id as string),
    ),
  };
}

function getReferencedThumbnailTilesets(
  projectTilesets: Tileset[],
  layers: TileLayer[],
) {
  const referencedTilesetIds = new Set<TilesetId>();

  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedTilesetIds.add(ref.tilesetId);
    }
  }

  return projectTilesets
    .filter((tileset) => referencedTilesetIds.has(tileset.id))
    .map((tileset) => ({
      id: tileset.id,
      assetId: tileset.assetId,
    }));
}

function buildMapExportGroups(project: Project): ImportExportAssetGroup[] {
  const projectTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];

  return [...project.mapGroups]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      id: group.id,
      name: group.name,
      assets: project.maps
        .filter((map) => map.groupId === group.id)
        .map((map) => {
          const mapExportData = getMapExportData(project, map);

          return {
            id: map.id,
            name: map.name,
            groupId: group.id,
            groupName: group.name,
            subtitle: `${map.widthInTiles} × ${map.heightInTiles} tiles`,
            thumbnail: {
              kind: "map" as const,
              orientation: map.orientation,
              staggerAxis: map.staggerAxis,
              staggerIndex: map.staggerIndex,
              tileSize: map.tileSize,
              widthInTiles: map.widthInTiles,
              heightInTiles: map.heightInTiles,
              layers: mapExportData.layers.map((layer) => ({
                id: layer.id,
                visible: layer.visible,
                tiles: layer.tiles,
              })),
              tilesets: getReferencedThumbnailTilesets(
                projectTilesets,
                mapExportData.layers,
              ),
            },
          };
        }),
    }))
    .filter((group) => group.assets.length > 0);
}

function buildTilesetExportGroups(project: Project): ImportExportAssetGroup[] {
  return [...project.tilesetGroups]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      id: group.id,
      name: group.name,
      assets: project.tilesets
        .filter((tileset) => tileset.groupId === group.id)
        .map((tileset) => ({
          id: tileset.id,
          name: tileset.name,
          groupId: group.id,
          groupName: group.name,
          subtitle: `${tileset.imageWidth} × ${tileset.imageHeight} px`,
          thumbnail: {
            kind: "tileset" as const,
            assetId: tileset.assetId,
            tileSize: tileset.tileSize,
            imageWidth: tileset.imageWidth,
            imageHeight: tileset.imageHeight,
          },
        })),
    }))
    .filter((group) => group.assets.length > 0);
}

function getUniqueArchivePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const extensionIndex = path.lastIndexOf(".");
  const baseName = extensionIndex >= 0 ? path.slice(0, extensionIndex) : path;
  const extension = extensionIndex >= 0 ? path.slice(extensionIndex) : "";
  let suffix = 2;

  while (usedPaths.has(`${baseName} (${suffix})${extension}`)) {
    suffix += 1;
  }

  const nextPath = `${baseName} (${suffix})${extension}`;
  usedPaths.add(nextPath);
  return nextPath;
}

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

  const handleExportMaps = useCallback(
    async (selectedMapIds: string[]) => {
      if (!state.project || selectedMapIds.length === 0) return;

      const selectedIdSet = new Set(selectedMapIds as MapId[]);
      const selectedMaps = state.project.maps.filter((map) =>
        selectedIdSet.has(map.id),
      );
      if (selectedMaps.length === 0) return;

      if (selectedMaps.length === 1) {
        const map = selectedMaps[0];
        const mapExportData = getMapExportData(state.project, map);
        const data = await exportMap(
          map,
          mapExportData.layers,
          state.project.tilesets,
          state.project.overrideTilesets ?? [],
          mapExportData.imageLayers,
          mapExportData.layerGroups,
          mapExportData.objectLayers,
          state.project.objects ?? [],
        );
        downloadFile(data, buildDownloadFilename(map.name, ".2dm"));
        return;
      }

      const groupNames = new Map(
        state.project.mapGroups.map((group) => [group.id, group.name]),
      );
      const usedPaths = new Set<string>();
      const entries: ImportExportArchiveEntry[] = [];

      for (const map of selectedMaps) {
        const mapExportData = getMapExportData(state.project, map);
        const data = await exportMap(
          map,
          mapExportData.layers,
          state.project.tilesets,
          state.project.overrideTilesets ?? [],
          mapExportData.imageLayers,
          mapExportData.layerGroups,
          mapExportData.objectLayers,
          state.project.objects ?? [],
        );
        const folderName = sanitizeDownloadSegment(
          groupNames.get(map.groupId) ?? "Ungrouped",
          "Ungrouped",
        );
        const fileName = buildDownloadFilename(map.name, ".2dm");
        entries.push({
          path: getUniqueArchivePath(`${folderName}/${fileName}`, usedPaths),
          data,
        });
      }

      const archive = createZipArchive(entries);
      downloadFile(
        archive,
        buildDownloadFilename(`${state.project.name} maps`, ".zip"),
      );
    },
    [state.project],
  );

  const handleExportMap = useCallback(async () => {
    if (!state.activeMapId) return;
    await handleExportMaps([state.activeMapId]);
  }, [handleExportMaps, state.activeMapId]);

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

  const handleExportTilesets = useCallback(
    async (selectedTilesetIds: string[]) => {
      if (!state.project || selectedTilesetIds.length === 0) return;

      const selectedIdSet = new Set(selectedTilesetIds as TilesetId[]);
      const selectedTilesets = state.project.tilesets.filter((tileset) =>
        selectedIdSet.has(tileset.id),
      );
      if (selectedTilesets.length === 0) return;

      if (selectedTilesets.length === 1) {
        const tileset = selectedTilesets[0];
        const data = await exportTileset(tileset);
        downloadFile(data, buildDownloadFilename(tileset.name, ".2dt"));
        return;
      }

      const groupNames = new Map(
        state.project.tilesetGroups.map((group) => [group.id, group.name]),
      );
      const usedPaths = new Set<string>();
      const entries: ImportExportArchiveEntry[] = [];

      for (const tileset of selectedTilesets) {
        const data = await exportTileset(tileset);
        const folderName = sanitizeDownloadSegment(
          groupNames.get(tileset.groupId) ?? "Ungrouped",
          "Ungrouped",
        );
        const fileName = buildDownloadFilename(tileset.name, ".2dt");
        entries.push({
          path: getUniqueArchivePath(`${folderName}/${fileName}`, usedPaths),
          data,
        });
      }

      const archive = createZipArchive(entries);
      downloadFile(
        archive,
        buildDownloadFilename(`${state.project.name} tilesets`, ".zip"),
      );
    },
    [state.project],
  );

  const handleExportTileset = useCallback(async () => {
    if (!state.activeTilesetId) return;
    await handleExportTilesets([state.activeTilesetId]);
  }, [handleExportTilesets, state.activeTilesetId]);

  const mapExportGroups =
    importExportDialogOpen && state.project
      ? buildMapExportGroups(state.project)
      : [];
  const tilesetExportGroups =
    importExportDialogOpen && state.project
      ? buildTilesetExportGroups(state.project)
      : [];

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
              exportSelection:
                importExportDialogMode === "export" && state.project
                  ? {
                      groups: mapExportGroups,
                      initialSelectedIds: state.activeMapId
                        ? [state.activeMapId]
                        : [],
                      helperText:
                        "Choose one or more maps. Multiple selections are exported as a zip grouped by map group.",
                      emptyLabel: "This project has no maps to export yet.",
                      onSubmit: (selectedIds) => handleExportMaps(selectedIds),
                    }
                  : undefined,
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
              exportSelection:
                importExportDialogMode === "export" && state.project
                  ? {
                      groups: tilesetExportGroups,
                      initialSelectedIds: state.activeTilesetId
                        ? [state.activeTilesetId]
                        : [],
                      helperText:
                        "Choose one or more tilesets. Multiple selections are exported as a zip grouped by tileset group.",
                      emptyLabel: "This project has no tilesets to export yet.",
                      onSubmit: (selectedIds) =>
                        handleExportTilesets(selectedIds),
                    }
                  : undefined,
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
