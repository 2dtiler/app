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
import { saveBlobFile, saveByteArrayFile } from "@/services/file-system";
import {
  buildMapExportGroups,
  buildTilesetExportGroups,
  getMapExportData,
  getUniqueArchivePath,
  isRasterExportOptions,
  pickSingleFile,
} from "@/features/import-export/lib/import-export-action-utils";
import {
  exportSelectedTiledMaps,
  getTiledMapImportFormat,
  isTiledMapExportOption,
} from "@/features/import-export/lib/tiled-map-action-utils";
import { useTiledMapImport } from "@/features/import-export/hooks/use-tiled-map-import";
import {
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";
import { findLastLayerId } from "@/features/map-editor/lib/layers";
import { getActiveTilesetTileSize } from "@/features/project-management/lib/project";
import { openProjectInEditor } from "@/features/project-management/lib/project-session";
import {
  cloneImportedTileset,
  remapObjectPropertyValues,
  remapLayerTreeId,
  remapTileEntries,
} from "@/features/project-management/lib/project-import";
import { saveProject } from "@/services/db";
import type { EditorTravels } from "@/store/types";
import type {
  EditorState,
  ImageLayer,
  ImportExportArchiveEntry,
  ImportExportDialogMode,
  ImportExportFormatExportOptions,
  ImportExportOptionAction,
  ImportExportOptionId,
  ImportExportRasterExportOptions,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapId,
  MapGroupId,
  MapObject,
  ObjectId,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TiledMapImportResult,
  TilesetGroupId,
  TilesetId,
} from "@/types";

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
    if (!state.project) return;
    await saveProject(state.project);
    const data = await exportProject(state.project);
    await saveByteArrayFile(data, `${state.project.name}.2dp`);
  }, [state.project]);

  const handleImportProject = useCallback(async () => {
    const file = await pickSingleFile(".2dp", "project-file");
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
        await saveByteArrayFile(data, buildDownloadFilename(map.name, ".2dm"));
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
      await saveByteArrayFile(
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
    ) => {
      if (
        !state.project ||
        selectedMapIds.length === 0 ||
        !rasterExportOptions
      ) {
        return;
      }

      const selectedIdSet = new Set(selectedMapIds as MapId[]);
      const selectedMaps = state.project.maps.filter((map) =>
        selectedIdSet.has(map.id),
      );
      if (selectedMaps.length === 0) return;

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
        await saveBlobFile(
          blob,
          buildDownloadFilename(
            map.name,
            getRasterFileExtension(rasterExportOptions.fileType),
          ),
        );
        return;
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
      await saveByteArrayFile(
        archive,
        buildDownloadFilename(`${state.project.name} maps`, ".zip"),
      );
    },
    [state.project],
  );

  const mergeImportedMapData = useCallback(
    (imported: TiledMapImportResult) => {
      if (!state.project) return;

      const currentProject = state.project;
      const {
        map,
        layers,
        tilesets,
        overrideTilesets = [],
        imageLayers: importedImageLayers,
        layerGroups: importedLayerGroups,
        objectLayers: importedObjectLayers,
        objects: importedObjects,
      } = imported;

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
        properties: remapObjectPropertyValues(object.properties, objectIdMap),
      }));
      const remappedMap = {
        ...map,
        id: newMapId,
        groupId: targetMapGroupId as MapGroupId,
        layerOrder: map.layerOrder.map((id) =>
          remapLayerTreeId(id, layerIdMap, groupIdMap),
        ),
        properties: remapObjectPropertyValues(
          map.properties ?? {},
          objectIdMap,
        ),
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
    },
    [
      setState,
      state.activeMapGroupId,
      state.activeTilesetGroupId,
      state.project,
    ],
  );

  const { handleImportTiledMap, tiledMissingResourcesDialogProps } =
    useTiledMapImport(Boolean(state.project), mergeImportedMapData);
  const handleImportNativeMap = useCallback(async () => {
    if (!state.project) return;

    const file = await pickSingleFile(".2dm", "native-map-file");
    if (!file) return;

    try {
      const raw = await readFileAsUint8Array(file);
      mergeImportedMapData(await importMap(raw));
    } catch (error) {
      console.error("[Import Map] Failed:", error);
      alert("Failed to import map. The file may be corrupted.");
    }
  }, [mergeImportedMapData, state.project]);

  const handleImportRasterMap = useCallback(async () => {
    if (!state.project) return;

    const file = await pickRasterImageFile();
    if (!file) return;

    try {
      const importedAsset = await importRasterAssetFromFile(file);
      const targetMapGroupId =
        state.activeMapGroupId ?? state.project.mapGroups[0]?.id;
      if (!targetMapGroupId) return;

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
    } catch (error) {
      console.error("[Import Map Image] Failed:", error);
      alert("Failed to import the image as a map.");
    }
  }, [setState, state.activeMapGroupId, state.project, state.tileSize]);

  const handleExportNativeTilesets = useCallback(
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
        await saveByteArrayFile(
          data,
          buildDownloadFilename(tileset.name, ".2dt"),
        );
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
      await saveByteArrayFile(
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
    ) => {
      if (
        !state.project ||
        selectedTilesetIds.length === 0 ||
        !rasterExportOptions
      ) {
        return;
      }

      const selectedIdSet = new Set(selectedTilesetIds as TilesetId[]);
      const selectedTilesets = state.project.tilesets.filter((tileset) =>
        selectedIdSet.has(tileset.id),
      );
      if (selectedTilesets.length === 0) return;

      if (selectedTilesets.length === 1) {
        const tileset = selectedTilesets[0];
        const canvas = await renderTilesetToCanvas(tileset);
        const blob = await encodeCanvasAsRaster(canvas, rasterExportOptions);
        await saveBlobFile(
          blob,
          buildDownloadFilename(
            tileset.name,
            getRasterFileExtension(rasterExportOptions.fileType),
          ),
        );
        return;
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
      await saveByteArrayFile(
        archive,
        buildDownloadFilename(`${state.project.name} tilesets`, ".zip"),
      );
    },
    [state.project],
  );

  const handleImportNativeTileset = useCallback(async () => {
    if (!state.project) return;

    const file = await pickSingleFile(".2dt", "native-tileset-file");
    if (!file) return;

    try {
      const project = state.project;
      const raw = await readFileAsUint8Array(file);
      const tileset = await importTileset(raw, state.tileSize);
      const targetGroupId =
        state.activeTilesetGroupId ?? project.tilesetGroups[0]?.id;
      if (!targetGroupId) return;

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
    } catch (error) {
      console.error("[Import Tileset] Failed:", error);
      alert("Failed to import tileset. The file may be corrupted.");
    }
  }, [setState, state.activeTilesetGroupId, state.project, state.tileSize]);

  const handleImportRasterTileset = useCallback(async () => {
    if (!state.project) return;

    const file = await pickRasterImageFile();
    if (!file) return;

    try {
      const importedAsset = await importRasterAssetFromFile(file);
      const targetGroupId =
        state.activeTilesetGroupId ?? state.project.tilesetGroups[0]?.id;
      if (!targetGroupId) return;

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
    } catch (error) {
      console.error("[Import Tileset Image] Failed:", error);
      alert("Failed to import the image as a tileset.");
    }
  }, [setState, state.activeTilesetGroupId, state.project]);

  const handleMapActionSelect = useCallback(
    async (optionId: ImportExportOptionId) => {
      if (optionId === "map-image") {
        await handleImportRasterMap();
        return;
      }

      const tiledFormat = getTiledMapImportFormat(optionId);
      if (tiledFormat) {
        await handleImportTiledMap(tiledFormat);
        return;
      }

      await handleImportNativeMap();
    },
    [handleImportNativeMap, handleImportRasterMap, handleImportTiledMap],
  );

  const handleTilesetActionSelect = useCallback(
    async (optionId: ImportExportOptionId) => {
      if (optionId === "tileset-image") {
        await handleImportRasterTileset();
        return;
      }

      await handleImportNativeTileset();
    },
    [handleImportNativeTileset, handleImportRasterTileset],
  );

  const handleMapExportSubmit = useCallback(
    async (
      selectedIds: string[],
      optionId: ImportExportOptionId,
      formatExportOptions?: ImportExportFormatExportOptions,
    ) => {
      if (optionId === "map-image") {
        await handleExportRasterMaps(
          selectedIds,
          isRasterExportOptions(formatExportOptions)
            ? formatExportOptions
            : undefined,
        );
        return;
      }

      if (isTiledMapExportOption(optionId)) {
        await exportSelectedTiledMaps(
          state.project,
          selectedIds,
          optionId,
          formatExportOptions,
        );
        return;
      }

      await handleExportNativeMaps(selectedIds);
    },
    [handleExportNativeMaps, handleExportRasterMaps, state.project],
  );

  const handleTilesetExportSubmit = useCallback(
    async (
      selectedIds: string[],
      optionId: ImportExportOptionId,
      formatExportOptions?: ImportExportFormatExportOptions,
    ) => {
      if (optionId === "tileset-image") {
        await handleExportRasterTilesets(
          selectedIds,
          isRasterExportOptions(formatExportOptions)
            ? formatExportOptions
            : undefined,
        );
        return;
      }

      await handleExportNativeTilesets(selectedIds);
    },
    [handleExportNativeTilesets, handleExportRasterTilesets],
  );

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
    projectAction,
    mapAction,
    tilesetAction,
    tiledMissingResourcesDialogProps,
  };
}
