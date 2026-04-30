import { useCallback, useMemo } from "react";
import {
  buildDownloadFilename,
  createZipArchive,
  exportMap,
  exportProject,
  exportTileset,
  importMap,
  importProject,
  importTileset,
  readFileAsUint8Array,
  sanitizeDownloadSegment,
} from "@/utils/format";
import {
  encodeCanvasAsRaster,
  getRasterFileExtension,
  importRasterAssetFromFile,
  pickRasterImageFile,
  renderMapToCanvas,
  renderTilesetToCanvas,
} from "@/features/import-export/lib/import-export-raster";
import { saveByteArrayFile } from "@/services/file-system";
import { resolveExportSaveStrategy } from "@/features/import-export/lib/export-save-strategy";
import {
  buildMapExportGroups,
  buildTilesetExportGroups,
  getMapExportData,
  getUniqueArchivePath,
  pickSingleFile,
} from "@/features/import-export/lib/import-export-action-utils";
import {
  assertMapsHaveNoAnimations,
  assertTilesetsHaveNoAnimations,
} from "@/features/import-export/lib/animation-export-guards";
import { mergeImportedMapData } from "@/features/import-export/lib/imported-map-merge";
import { useGodotMapImport } from "@/features/import-export/hooks/use-godot-map-import";
import { useGodotTilesetImport } from "@/features/import-export/hooks/use-godot-tileset-import";
import { useDefoldMapImport } from "@/features/import-export/hooks/use-defold-map-import";
import { useDefoldTilesetImport } from "@/features/import-export/hooks/use-defold-tileset-import";
import { useGameMakerMapImport } from "@/features/import-export/hooks/use-gamemaker-map-import";
import { useImportExportDispatch } from "@/features/import-export/hooks/use-import-export-dispatch";
import { useMappyMapImport } from "@/features/import-export/hooks/use-mappy-map-import";
import {
  PHASER_MAP_IMPORT_CONFIG,
  useTiledMapImport,
} from "@/features/import-export/hooks/use-tiled-map-import";
import { useTideMapImport } from "@/features/import-export/hooks/use-tide-map-import";
import { useTiledTilesetImport } from "@/features/import-export/hooks/use-tiled-tileset-import";
import { useUnityMapImport } from "@/features/import-export/hooks/use-unity-map-import";
import { useUnityTilesetImport } from "@/features/import-export/hooks/use-unity-tileset-import";
import { generateLayerId, generateMapId, generateTilesetId } from "@/utils/ids";
import { getActiveTilesetTileSize } from "@/features/project-management/lib/project";
import { openProjectInEditor } from "@/features/project-management/lib/project-session";
import { saveProject } from "@/services/db";
import type {
  EditorState,
  ExportSaveStrategy,
  ImageLayer,
  ImportExportArchiveEntry,
  ImportExportDialogMode,
  ImportExportOptionAction,
  ImportExportRasterExportOptions,
  MapId,
  MapGroupId,
  TileMapData,
  TiledMapImportResult,
  Tileset,
  TilesetGroupId,
  TilesetId,
} from "@/types";
import type { EditorTravels } from "@/types/store";

interface UseImportExportActionsParams {
  state: EditorState;
  setState: EditorTravels["setState"];
  importExportDialogMode: ImportExportDialogMode;
  importExportDialogOpen: boolean;
  setImportExportDialogMode: (mode: ImportExportDialogMode) => void;
  setImportExportDialogOpen: (open: boolean) => void;
}

export function useImportExportActions({
  state,
  setState,
  importExportDialogMode,
  importExportDialogOpen,
  setImportExportDialogMode,
  setImportExportDialogOpen,
}: UseImportExportActionsParams) {
  const handleExportProject = useCallback(async () => {
    if (!state.project) return false;
    await saveProject(state.project);
    const data = await exportProject(state.project);
    return saveByteArrayFile(data, `${state.project.name}.2dp`);
  }, [state.project]);

  const handleImportProject = useCallback(async () => {
    const file = await pickSingleFile(".2dp", "project-file");
    if (!file) return false;

    try {
      const raw = await readFileAsUint8Array(file);
      const project = await importProject(raw);
      await saveProject(project);
      openProjectInEditor(project);
      return true;
    } catch (error) {
      console.error("[Import Project] Failed:", error);
      alert("Failed to import project. The file may be corrupted.");
      return false;
    }
  }, []);

  const handleOpenImportDialog = useCallback(() => {
    setImportExportDialogMode("import");
    setImportExportDialogOpen(true);
  }, [setImportExportDialogMode, setImportExportDialogOpen]);
  const handleOpenExportDialog = useCallback(() => {
    setImportExportDialogMode("export");
    setImportExportDialogOpen(true);
  }, [setImportExportDialogMode, setImportExportDialogOpen]);

  const handleExportNativeMaps = useCallback(
    async (selectedMapIds: string[], saveStrategy?: ExportSaveStrategy) => {
      if (!state.project || selectedMapIds.length === 0) return false;
      const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);

      const selectedIdSet = new Set(selectedMapIds as MapId[]);
      const selectedMaps = state.project.maps.filter((map) =>
        selectedIdSet.has(map.id),
      );
      if (selectedMaps.length === 0) return false;

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
        return resolvedSaveStrategy.saveByteArray(
          data,
          buildDownloadFilename(map.name, ".2dm"),
        );
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
      return resolvedSaveStrategy.saveByteArray(
        archive,
        buildDownloadFilename(`${state.project.name} maps`, ".zip"),
      );
    },
    [state.project],
  );

  const handleExportRasterMaps = useCallback(
    async (
      selectedMapIds: string[],
      rasterExportOptions?: ImportExportRasterExportOptions,
      saveStrategy?: ExportSaveStrategy,
    ) => {
      if (
        !state.project ||
        selectedMapIds.length === 0 ||
        !rasterExportOptions
      ) {
        return false;
      }
      const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);

      const selectedIdSet = new Set(selectedMapIds as MapId[]);
      const selectedMaps = state.project.maps.filter((map) =>
        selectedIdSet.has(map.id),
      );
      if (selectedMaps.length === 0) return false;
      assertMapsHaveNoAnimations(state.project, selectedMaps, "Raster map");

      const allTilesets = [
        ...state.project.tilesets,
        ...(state.project.overrideTilesets ?? []),
      ];

      if (selectedMaps.length === 1) {
        const map = selectedMaps[0];
        const mapExportData = getMapExportData(state.project, map);
        const canvas = await renderMapToCanvas(
          map,
          mapExportData.layers,
          mapExportData.imageLayers,
          mapExportData.layerGroups,
          allTilesets,
          mapExportData.objectLayers,
          mapExportData.objects,
        );
        const blob = await encodeCanvasAsRaster(canvas, rasterExportOptions);
        return resolvedSaveStrategy.saveBlob(
          blob,
          buildDownloadFilename(
            map.name,
            getRasterFileExtension(rasterExportOptions.fileType),
          ),
        );
      }

      const groupNames = new Map(
        state.project.mapGroups.map((group) => [group.id, group.name]),
      );
      const usedPaths = new Set<string>();
      const entries: ImportExportArchiveEntry[] = [];

      for (const map of selectedMaps) {
        const mapExportData = getMapExportData(state.project, map);
        const canvas = await renderMapToCanvas(
          map,
          mapExportData.layers,
          mapExportData.imageLayers,
          mapExportData.layerGroups,
          allTilesets,
          mapExportData.objectLayers,
          mapExportData.objects,
        );
        const blob = await encodeCanvasAsRaster(canvas, rasterExportOptions);
        const folderName = sanitizeDownloadSegment(
          groupNames.get(map.groupId) ?? "Ungrouped",
          "Ungrouped",
        );
        const fileName = buildDownloadFilename(
          map.name,
          getRasterFileExtension(rasterExportOptions.fileType),
        );
        entries.push({
          path: getUniqueArchivePath(`${folderName}/${fileName}`, usedPaths),
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }

      const archive = createZipArchive(entries);
      return resolvedSaveStrategy.saveByteArray(
        archive,
        buildDownloadFilename(`${state.project.name} maps`, ".zip"),
      );
    },
    [state.project],
  );

  const handleImportedMapResolved = useCallback(
    (imported: TiledMapImportResult) => {
      mergeImportedMapData(
        imported,
        state.project,
        state.activeMapGroupId,
        state.activeTilesetGroupId,
        setState,
      );
    },
    [
      setState,
      state.activeMapGroupId,
      state.activeTilesetGroupId,
      state.project,
    ],
  );

  const {
    handleImportTiledMap,
    tiledMissingResourcesDialogProps: tiledMapMissingResourcesDialogProps,
  } = useTiledMapImport(Boolean(state.project), handleImportedMapResolved);
  const {
    handleImportTiledMap: handleImportPhaserMap,
    tiledMissingResourcesDialogProps: phaserMapMissingResourcesDialogProps,
  } = useTiledMapImport(
    Boolean(state.project),
    handleImportedMapResolved,
    PHASER_MAP_IMPORT_CONFIG,
  );
  const { handleImportGodotMap, godotMissingResourcesDialogProps } =
    useGodotMapImport(Boolean(state.project), (imported) => {
      handleImportedMapResolved(imported);
      if (imported.warnings.length > 0) {
        alert(
          `Imported with ${imported.warnings.length} Godot compatibility warning${
            imported.warnings.length === 1 ? "" : "s"
          }. See the console for details.`,
        );
        console.warn("[Import Godot Scene] Warnings:", imported.warnings);
      }
    });
  const { handleImportGameMakerMap, gameMakerMissingResourcesDialogProps } =
    useGameMakerMapImport(Boolean(state.project), handleImportedMapResolved);
  const { handleImportMappyMap } = useMappyMapImport(
    Boolean(state.project),
    handleImportedMapResolved,
  );
  const { handleImportDefoldMap, defoldMissingResourcesDialogProps } =
    useDefoldMapImport(Boolean(state.project), handleImportedMapResolved);
  const { handleImportTideMap, tideMissingResourcesDialogProps } =
    useTideMapImport(Boolean(state.project), handleImportedMapResolved);
  const handleImportedTilesetsResolved = useCallback(
    (importedTilesets: Tileset[]) => {
      if (!state.project || importedTilesets.length === 0) return;

      const targetGroupId =
        state.activeTilesetGroupId ?? state.project.tilesetGroups[0]?.id;
      if (!targetGroupId) return;

      setState((draft) => {
        if (!draft.project) return;

        const remappedTilesets = importedTilesets.map((tileset) => ({
          ...tileset,
          groupId: targetGroupId as TilesetGroupId,
        }));

        for (const tileset of remappedTilesets) {
          draft.project.tilesets.push(tileset);
        }

        draft.activeTilesetId =
          remappedTilesets[0]?.id ?? draft.activeTilesetId;
        draft.activeTilesetGroupId = targetGroupId as TilesetGroupId;
        draft.tileSize = getActiveTilesetTileSize(
          draft.project,
          draft.activeTilesetId,
        );
        draft.selectedTile = null;
      });
    },
    [setState, state.activeTilesetGroupId, state.project],
  );
  const {
    handleImportGodotTileset,
    godotMissingResourcesDialogProps: godotTilesetMissingResourcesDialogProps,
  } = useGodotTilesetImport(
    Boolean(state.project),
    handleImportedTilesetsResolved,
  );
  const {
    handleImportTiledTileset,
    tiledMissingResourcesDialogProps: tiledTilesetMissingResourcesDialogProps,
  } = useTiledTilesetImport(
    Boolean(state.project),
    handleImportedTilesetsResolved,
  );
  const { handleImportUnityMap, unityMissingResourcesDialogProps } =
    useUnityMapImport(Boolean(state.project), handleImportedMapResolved);
  const {
    handleImportUnityTileset,
    unityMissingResourcesDialogProps: unityTilesetMissingResourcesDialogProps,
  } = useUnityTilesetImport(
    Boolean(state.project),
    handleImportedTilesetsResolved,
  );
  const {
    handleImportDefoldTileset,
    defoldMissingResourcesDialogProps: defoldTilesetMissingResourcesDialogProps,
  } = useDefoldTilesetImport(
    Boolean(state.project),
    handleImportedTilesetsResolved,
  );
  const handleImportNativeMap = useCallback(async () => {
    if (!state.project) return false;

    const file = await pickSingleFile(".2dm", "native-map-file");
    if (!file) return false;

    try {
      const raw = await readFileAsUint8Array(file);
      handleImportedMapResolved(await importMap(raw));
      return true;
    } catch (error) {
      console.error("[Import Map] Failed:", error);
      alert("Failed to import map. The file may be corrupted.");
      return false;
    }
  }, [handleImportedMapResolved, state.project]);

  const handleImportRasterMap = useCallback(async () => {
    if (!state.project) return false;

    const file = await pickRasterImageFile();
    if (!file) return false;

    try {
      const importedAsset = await importRasterAssetFromFile(file);
      const targetMapGroupId =
        state.activeMapGroupId ?? state.project.mapGroups[0]?.id;
      if (!targetMapGroupId) return false;

      const mapId = generateMapId();
      const layerId = generateLayerId();
      const tileSize = state.tileSize;
      const widthInTiles = Math.max(
        1,
        Math.ceil(importedAsset.width / tileSize),
      );
      const heightInTiles = Math.max(
        1,
        Math.ceil(importedAsset.height / tileSize),
      );

      setState((draft) => {
        if (!draft.project) return;
        if (!draft.project.imageLayers) draft.project.imageLayers = [];

        const map: TileMapData = {
          id: mapId,
          name: importedAsset.name,
          groupId: targetMapGroupId as MapGroupId,
          orientation: "orthogonal",
          widthInTiles,
          heightInTiles,
          tileSize,
          properties: {},
          layerOrder: [layerId],
          createdAt: Date.now(),
        };

        const imageLayer: ImageLayer = {
          id: layerId,
          mapId,
          name: importedAsset.name,
          type: "image",
          visible: true,
          locked: false,
          assetId: importedAsset.assetId,
          x: 0,
          y: 0,
          width: importedAsset.width,
          height: importedAsset.height,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 100,
        };

        draft.project.maps.push(map);
        draft.project.imageLayers.push(imageLayer);
        draft.activeMapId = mapId;
        draft.activeMapGroupId = targetMapGroupId as MapGroupId;
        draft.activeLayerId = layerId;
        draft.currentTool = "select";
      });
      return true;
    } catch (error) {
      console.error("[Import Map Image] Failed:", error);
      alert("Failed to import the image as a map.");
      return false;
    }
  }, [setState, state.activeMapGroupId, state.project, state.tileSize]);

  const handleExportNativeTilesets = useCallback(
    async (selectedTilesetIds: string[], saveStrategy?: ExportSaveStrategy) => {
      if (!state.project || selectedTilesetIds.length === 0) return false;
      const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);

      const selectedIdSet = new Set(selectedTilesetIds as TilesetId[]);
      const selectedTilesets = state.project.tilesets.filter((tileset) =>
        selectedIdSet.has(tileset.id),
      );
      if (selectedTilesets.length === 0) return false;
      assertTilesetsHaveNoAnimations(selectedTilesets, "Raster tileset");

      if (selectedTilesets.length === 1) {
        const tileset = selectedTilesets[0];
        const data = await exportTileset(tileset);
        return resolvedSaveStrategy.saveByteArray(
          data,
          buildDownloadFilename(tileset.name, ".2dt"),
        );
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
      return resolvedSaveStrategy.saveByteArray(
        archive,
        buildDownloadFilename(`${state.project.name} tilesets`, ".zip"),
      );
    },
    [state.project],
  );

  const handleExportRasterTilesets = useCallback(
    async (
      selectedTilesetIds: string[],
      rasterExportOptions?: ImportExportRasterExportOptions,
      saveStrategy?: ExportSaveStrategy,
    ) => {
      if (
        !state.project ||
        selectedTilesetIds.length === 0 ||
        !rasterExportOptions
      ) {
        return false;
      }
      const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);

      const selectedIdSet = new Set(selectedTilesetIds as TilesetId[]);
      const selectedTilesets = state.project.tilesets.filter((tileset) =>
        selectedIdSet.has(tileset.id),
      );
      if (selectedTilesets.length === 0) return false;

      if (selectedTilesets.length === 1) {
        const tileset = selectedTilesets[0];
        const canvas = await renderTilesetToCanvas(tileset);
        const blob = await encodeCanvasAsRaster(canvas, rasterExportOptions);
        return resolvedSaveStrategy.saveBlob(
          blob,
          buildDownloadFilename(
            tileset.name,
            getRasterFileExtension(rasterExportOptions.fileType),
          ),
        );
      }

      const groupNames = new Map(
        state.project.tilesetGroups.map((group) => [group.id, group.name]),
      );
      const usedPaths = new Set<string>();
      const entries: ImportExportArchiveEntry[] = [];

      for (const tileset of selectedTilesets) {
        const canvas = await renderTilesetToCanvas(tileset);
        const blob = await encodeCanvasAsRaster(canvas, rasterExportOptions);
        const folderName = sanitizeDownloadSegment(
          groupNames.get(tileset.groupId) ?? "Ungrouped",
          "Ungrouped",
        );
        const fileName = buildDownloadFilename(
          tileset.name,
          getRasterFileExtension(rasterExportOptions.fileType),
        );
        entries.push({
          path: getUniqueArchivePath(`${folderName}/${fileName}`, usedPaths),
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }

      const archive = createZipArchive(entries);
      return resolvedSaveStrategy.saveByteArray(
        archive,
        buildDownloadFilename(`${state.project.name} tilesets`, ".zip"),
      );
    },
    [state.project],
  );

  const handleImportNativeTileset = useCallback(async () => {
    if (!state.project) return false;

    const file = await pickSingleFile(".2dt", "native-tileset-file");
    if (!file) return false;

    try {
      const project = state.project;
      const raw = await readFileAsUint8Array(file);
      const tileset = await importTileset(raw, state.tileSize);
      const targetGroupId =
        state.activeTilesetGroupId ?? project.tilesetGroups[0]?.id;
      if (!targetGroupId) return false;

      const exists = project.tilesets.some((entry) => entry.id === tileset.id);

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
      return true;
    } catch (error) {
      console.error("[Import Tileset] Failed:", error);
      alert("Failed to import tileset. The file may be corrupted.");
      return false;
    }
  }, [setState, state.activeTilesetGroupId, state.project, state.tileSize]);

  const handleImportRasterTileset = useCallback(async () => {
    if (!state.project) return false;

    const file = await pickRasterImageFile();
    if (!file) return false;

    try {
      const importedAsset = await importRasterAssetFromFile(file);
      const targetGroupId =
        state.activeTilesetGroupId ?? state.project.tilesetGroups[0]?.id;
      if (!targetGroupId) return false;

      const tilesetId = generateTilesetId();

      setState((draft) => {
        if (!draft.project) return;

        draft.project.tilesets.push({
          id: tilesetId,
          name: importedAsset.name,
          groupId: targetGroupId as TilesetGroupId,
          tileSize: draft.tileSize,
          assetId: importedAsset.assetId,
          imageWidth: importedAsset.width,
          imageHeight: importedAsset.height,
          createdAt: Date.now(),
        });

        draft.activeTilesetId = tilesetId;
        draft.activeTilesetGroupId = targetGroupId as TilesetGroupId;
        draft.tileSize = getActiveTilesetTileSize(draft.project, tilesetId);
        draft.selectedTile = null;
      });
      return true;
    } catch (error) {
      console.error("[Import Tileset Image] Failed:", error);
      alert("Failed to import the image as a tileset.");
      return false;
    }
  }, [setState, state.activeTilesetGroupId, state.project]);

  const {
    handleMapActionSelect,
    handleTilesetActionSelect,
    handleMapExportSubmit,
    handleTilesetExportSubmit,
  } = useImportExportDispatch({
    project: state.project,
    handleExportNativeMaps,
    handleExportNativeTilesets,
    handleExportRasterMaps,
    handleExportRasterTilesets,
    handleImportDefoldMap,
    handleImportDefoldTileset,
    handleImportGameMakerMap,
    handleImportGodotMap,
    handleImportGodotTileset,
    handleImportMappyMap,
    handleImportNativeMap,
    handleImportNativeTileset,
    handleImportPhaserMap,
    handleImportRasterMap,
    handleImportRasterTileset,
    handleImportTideMap,
    handleImportTiledMap,
    handleImportTiledTileset,
    handleImportUnityMap,
    handleImportUnityTileset,
  });

  const mergedTiledMissingResourcesDialogProps =
    phaserMapMissingResourcesDialogProps.open
      ? phaserMapMissingResourcesDialogProps
      : tiledTilesetMissingResourcesDialogProps.open
        ? tiledTilesetMissingResourcesDialogProps
        : tiledMapMissingResourcesDialogProps;

  const mergedGodotMissingResourcesDialogProps =
    godotTilesetMissingResourcesDialogProps.open
      ? godotTilesetMissingResourcesDialogProps
      : godotMissingResourcesDialogProps;

  const mergedUnityMissingResourcesDialogProps =
    unityTilesetMissingResourcesDialogProps.open
      ? unityTilesetMissingResourcesDialogProps
      : unityMissingResourcesDialogProps;

  const mergedDefoldMissingResourcesDialogProps =
    defoldTilesetMissingResourcesDialogProps.open
      ? defoldTilesetMissingResourcesDialogProps
      : defoldMissingResourcesDialogProps;

  const mapExportGroups = useMemo(
    () =>
      importExportDialogOpen && state.project
        ? buildMapExportGroups(state.project)
        : [],
    [importExportDialogOpen, state.project],
  );

  const tilesetExportGroups = useMemo(
    () =>
      importExportDialogOpen && state.project
        ? buildTilesetExportGroups(state.project)
        : [],
    [importExportDialogOpen, state.project],
  );

  const projectAction: ImportExportOptionAction = useMemo(
    () => ({
      enabled:
        importExportDialogMode === "import" ? true : Boolean(state.project),
      onSelect:
        importExportDialogMode === "import"
          ? () => handleImportProject()
          : () => handleExportProject(),
      disabledReason:
        importExportDialogMode === "export" && !state.project
          ? "Open a project first"
          : undefined,
    }),
    [
      handleExportProject,
      handleImportProject,
      importExportDialogMode,
      state.project,
    ],
  );

  const mapAction: ImportExportOptionAction = useMemo(
    () => ({
      enabled:
        importExportDialogMode === "import"
          ? Boolean(state.project)
          : Boolean(state.project && state.activeMapId),
      onSelect:
        importExportDialogMode === "import" ? handleMapActionSelect : undefined,
      exportSelection:
        importExportDialogMode === "export" && state.project
          ? {
              groups: mapExportGroups,
              initialSelectedIds: state.activeMapId ? [state.activeMapId] : [],
              helperText:
                "Choose one or more maps. Multiple selections are exported as a zip grouped by map group.",
              emptyLabel: "This project has no maps to export yet.",
              onSubmit: handleMapExportSubmit,
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
    }),
    [
      handleMapActionSelect,
      handleMapExportSubmit,
      importExportDialogMode,
      mapExportGroups,
      state.activeMapId,
      state.project,
    ],
  );

  const tilesetAction: ImportExportOptionAction = useMemo(
    () => ({
      enabled:
        importExportDialogMode === "import"
          ? Boolean(state.project)
          : Boolean(state.project && state.activeTilesetId),
      onSelect:
        importExportDialogMode === "import"
          ? handleTilesetActionSelect
          : undefined,
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
              onSubmit: handleTilesetExportSubmit,
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
    }),
    [
      handleTilesetActionSelect,
      handleTilesetExportSubmit,
      importExportDialogMode,
      state.activeTilesetId,
      state.project,
      tilesetExportGroups,
    ],
  );

  return {
    handleOpenImportDialog,
    handleOpenExportDialog,
    handleMapExportSubmit,
    handleTilesetExportSubmit,
    projectAction,
    mapAction,
    tilesetAction,
    defoldMissingResourcesDialogProps: mergedDefoldMissingResourcesDialogProps,
    gameMakerMissingResourcesDialogProps,
    godotMissingResourcesDialogProps: mergedGodotMissingResourcesDialogProps,
    tideMissingResourcesDialogProps,
    tiledMissingResourcesDialogProps: mergedTiledMissingResourcesDialogProps,
    unityMissingResourcesDialogProps: mergedUnityMissingResourcesDialogProps,
  };
}
