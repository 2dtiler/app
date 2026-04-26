import { useCallback } from "react";
import {
  exportSelectedDefoldMaps,
  isDefoldMapOption,
} from "@/features/import-export/lib/defold-map-action-utils";
import {
  exportSelectedDefoldTilesets,
  isDefoldTilesetOption,
} from "@/features/import-export/lib/defold-tileset-action-utils";
import {
  exportSelectedGameMakerMaps,
  isGameMakerMapOption,
} from "@/features/import-export/lib/gamemaker-map-action-utils";
import {
  exportSelectedGodotMaps,
  isGodotMapOption,
} from "@/features/import-export/lib/godot-map-action-utils";
import {
  exportSelectedGodotTilesets,
  isGodotTilesetOption,
} from "@/features/import-export/lib/godot-tileset-action-utils";
import {
  isDefoldMapExportOptions,
  isGameMakerMapExportOptions,
  isRasterExportOptions,
} from "@/features/import-export/lib/import-export-action-utils";
import {
  exportSelectedPhaserMaps,
  isPhaserMapOption,
} from "@/features/import-export/lib/phaser-map-action-utils";
import {
  exportSelectedTideMaps,
  isTideMapOption,
} from "@/features/import-export/lib/tide-map-action-utils";
import {
  exportSelectedTiledMaps,
  isTiledMapExportOption,
  isTiledMapImportOption,
} from "@/features/import-export/lib/tiled-map-action-utils";
import {
  exportSelectedTiledTilesets,
  isTiledTilesetExportOption,
  isTiledTilesetImportOption,
} from "@/features/import-export/lib/tiled-tileset-action-utils";
import {
  exportSelectedUnityMaps,
  isUnityMapOption,
} from "@/features/import-export/lib/unity-map-action-utils";
import {
  exportSelectedUnityTilesets,
  isUnityTilesetOption,
} from "@/features/import-export/lib/unity-tileset-action-utils";
import type {
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  ImportExportRasterExportOptions,
  Project,
} from "@/types";

interface UseImportExportDispatchParams {
  project: Project | null;
  handleExportNativeMaps: (selectedIds: string[]) => Promise<boolean>;
  handleExportNativeTilesets: (selectedIds: string[]) => Promise<boolean>;
  handleExportRasterMaps: (
    selectedIds: string[],
    rasterExportOptions?: ImportExportRasterExportOptions,
  ) => Promise<boolean>;
  handleExportRasterTilesets: (
    selectedIds: string[],
    rasterExportOptions?: ImportExportRasterExportOptions,
  ) => Promise<boolean>;
  handleImportDefoldMap: () => Promise<boolean>;
  handleImportDefoldTileset: () => Promise<boolean>;
  handleImportGameMakerMap: () => Promise<boolean>;
  handleImportGodotMap: () => Promise<boolean>;
  handleImportGodotTileset: () => Promise<boolean>;
  handleImportNativeMap: () => Promise<boolean>;
  handleImportNativeTileset: () => Promise<boolean>;
  handleImportPhaserMap: () => Promise<boolean>;
  handleImportRasterMap: () => Promise<boolean>;
  handleImportRasterTileset: () => Promise<boolean>;
  handleImportTideMap: () => Promise<boolean>;
  handleImportTiledMap: () => Promise<boolean>;
  handleImportTiledTileset: () => Promise<boolean>;
  handleImportUnityMap: () => Promise<boolean>;
  handleImportUnityTileset: () => Promise<boolean>;
}

export function useImportExportDispatch({
  project,
  handleExportNativeMaps,
  handleExportNativeTilesets,
  handleExportRasterMaps,
  handleExportRasterTilesets,
  handleImportDefoldMap,
  handleImportDefoldTileset,
  handleImportGameMakerMap,
  handleImportGodotMap,
  handleImportGodotTileset,
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
}: UseImportExportDispatchParams) {
  const handleMapActionSelect = useCallback(
    async (optionId: ImportExportOptionId) => {
      if (optionId === "map-image") {
        return handleImportRasterMap();
      }

      if (isTiledMapImportOption(optionId)) {
        return handleImportTiledMap();
      }

      if (isPhaserMapOption(optionId)) {
        return handleImportPhaserMap();
      }

      if (isGodotMapOption(optionId)) {
        return handleImportGodotMap();
      }

      if (isGameMakerMapOption(optionId)) {
        return handleImportGameMakerMap();
      }

      if (isDefoldMapOption(optionId)) {
        return handleImportDefoldMap();
      }

      if (isTideMapOption(optionId)) {
        return handleImportTideMap();
      }

      if (isUnityMapOption(optionId)) {
        return handleImportUnityMap();
      }

      return handleImportNativeMap();
    },
    [
      handleImportDefoldMap,
      handleImportGameMakerMap,
      handleImportGodotMap,
      handleImportNativeMap,
      handleImportPhaserMap,
      handleImportRasterMap,
      handleImportTideMap,
      handleImportTiledMap,
      handleImportUnityMap,
    ],
  );

  const handleTilesetActionSelect = useCallback(
    async (optionId: ImportExportOptionId) => {
      if (optionId === "tileset-image") {
        return handleImportRasterTileset();
      }

      if (isTiledTilesetImportOption(optionId)) {
        return handleImportTiledTileset();
      }

      if (isGodotTilesetOption(optionId)) {
        return handleImportGodotTileset();
      }

      if (isDefoldTilesetOption(optionId)) {
        return handleImportDefoldTileset();
      }

      if (isUnityTilesetOption(optionId)) {
        return handleImportUnityTileset();
      }

      return handleImportNativeTileset();
    },
    [
      handleImportDefoldTileset,
      handleImportGodotTileset,
      handleImportNativeTileset,
      handleImportRasterTileset,
      handleImportTiledTileset,
      handleImportUnityTileset,
    ],
  );

  const handleMapExportSubmit = useCallback(
    async (
      selectedIds: string[],
      optionId: ImportExportOptionId,
      formatExportOptions?: ImportExportFormatExportOptions,
    ) => {
      if (optionId === "map-image") {
        return handleExportRasterMaps(
          selectedIds,
          isRasterExportOptions(formatExportOptions)
            ? formatExportOptions
            : undefined,
        );
      }

      if (isTiledMapExportOption(optionId)) {
        return exportSelectedTiledMaps(
          project,
          selectedIds,
          optionId,
          formatExportOptions,
        );
      }

      if (isPhaserMapOption(optionId)) {
        return exportSelectedPhaserMaps(project, selectedIds, optionId);
      }

      if (isGodotMapOption(optionId)) {
        return exportSelectedGodotMaps(
          project,
          selectedIds,
          optionId,
          formatExportOptions,
        );
      }

      if (isGameMakerMapOption(optionId)) {
        return exportSelectedGameMakerMaps(
          project,
          selectedIds,
          optionId,
          isGameMakerMapExportOptions(formatExportOptions)
            ? formatExportOptions
            : undefined,
        );
      }

      if (isDefoldMapOption(optionId)) {
        return exportSelectedDefoldMaps(
          project,
          selectedIds,
          optionId,
          isDefoldMapExportOptions(formatExportOptions)
            ? formatExportOptions
            : undefined,
        );
      }

      if (isTideMapOption(optionId)) {
        return exportSelectedTideMaps(project, selectedIds, optionId);
      }

      if (isUnityMapOption(optionId)) {
        return exportSelectedUnityMaps(project, selectedIds, optionId);
      }

      return handleExportNativeMaps(selectedIds);
    },
    [handleExportNativeMaps, handleExportRasterMaps, project],
  );

  const handleTilesetExportSubmit = useCallback(
    async (
      selectedIds: string[],
      optionId: ImportExportOptionId,
      formatExportOptions?: ImportExportFormatExportOptions,
    ) => {
      if (optionId === "tileset-image") {
        return handleExportRasterTilesets(
          selectedIds,
          isRasterExportOptions(formatExportOptions)
            ? formatExportOptions
            : undefined,
        );
      }

      if (isGodotTilesetOption(optionId)) {
        return exportSelectedGodotTilesets(project, selectedIds, optionId);
      }

      if (isTiledTilesetExportOption(optionId)) {
        return exportSelectedTiledTilesets(
          project,
          selectedIds,
          optionId,
          formatExportOptions,
        );
      }

      if (isUnityTilesetOption(optionId)) {
        return exportSelectedUnityTilesets(project, selectedIds, optionId);
      }

      if (isDefoldTilesetOption(optionId)) {
        return exportSelectedDefoldTilesets(project, selectedIds, optionId);
      }

      return handleExportNativeTilesets(selectedIds);
    },
    [handleExportNativeTilesets, handleExportRasterTilesets, project],
  );

  return {
    handleMapActionSelect,
    handleTilesetActionSelect,
    handleMapExportSubmit,
    handleTilesetExportSubmit,
  };
}
