import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import {
  exportTiledMapCsvBundle,
  exportTiledMapJsBundle,
  exportTiledMapBundle,
  exportTiledMapJsonBundle,
  exportTiledMapLuaBundle,
} from "@/features/import-export/lib/import-export-tiled";
import {
  getMapExportData,
  getUniqueArchivePath,
  isTiledXmlExportOptions,
} from "@/features/import-export/lib/import-export-action-utils";
import type {
  ImportExportArchiveEntry,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  MapId,
  Project,
  TiledMapFormat,
  TiledXmlExportOptions,
} from "@/types";

type TiledMapBundleExporter = (
  project: Parameters<typeof exportTiledMapBundle>[0],
  layers: Parameters<typeof exportTiledMapBundle>[1],
  tilesets: Parameters<typeof exportTiledMapBundle>[2],
  imageLayers: Parameters<typeof exportTiledMapBundle>[3],
  layerGroups: Parameters<typeof exportTiledMapBundle>[4],
  objectLayers: Parameters<typeof exportTiledMapBundle>[5],
  objects: Parameters<typeof exportTiledMapBundle>[6],
  options?: ImportExportFormatExportOptions,
) => Promise<ImportExportArchiveEntry[]>;

function requireTiledMapExportOptions(
  options?: ImportExportFormatExportOptions,
): TiledXmlExportOptions {
  if (!isTiledXmlExportOptions(options)) {
    throw new Error("Missing Tiled export options.");
  }

  return options;
}

function withTiledMapOptions(
  exporter: typeof exportTiledMapBundle,
): TiledMapBundleExporter {
  return (
    map,
    layers,
    tilesets,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
    options,
  ) =>
    exporter(
      map,
      layers,
      tilesets,
      imageLayers,
      layerGroups,
      objectLayers,
      objects,
      requireTiledMapExportOptions(options),
    );
}

function withCsvMapExport(
  exporter: typeof exportTiledMapCsvBundle,
): TiledMapBundleExporter {
  return (map, layers, tilesets) => exporter(map, layers, tilesets);
}

export function getTiledMapImportFormat(optionId: ImportExportOptionId) {
  if (optionId === "map-tiled-xml") {
    return "xml" satisfies TiledMapFormat;
  }
  if (optionId === "map-tiled-json") {
    return "json" satisfies TiledMapFormat;
  }
  if (optionId === "map-tiled-js") {
    return "js" satisfies TiledMapFormat;
  }
  if (optionId === "map-tiled-lua") {
    return "lua" satisfies TiledMapFormat;
  }
  return null;
}

export function isTiledMapExportOption(optionId: ImportExportOptionId) {
  return (
    optionId === "map-tiled-xml" ||
    optionId === "map-tiled-json" ||
    optionId === "map-tiled-js" ||
    optionId === "map-tiled-lua" ||
    optionId === "map-tiled-csv"
  );
}

function getTiledMapExporter(optionId: ImportExportOptionId) {
  if (optionId === "map-tiled-json") {
    return {
      archiveExtension: ".tmj.zip",
      archiveBaseName: "tiled json maps",
      exportBundle: withTiledMapOptions(exportTiledMapJsonBundle),
    };
  }

  if (optionId === "map-tiled-js") {
    return {
      archiveExtension: ".js.zip",
      archiveBaseName: "tiled javascript maps",
      exportBundle: withTiledMapOptions(exportTiledMapJsBundle),
    };
  }

  if (optionId === "map-tiled-lua") {
    return {
      archiveExtension: ".lua.zip",
      archiveBaseName: "tiled lua maps",
      exportBundle: withTiledMapOptions(exportTiledMapLuaBundle),
    };
  }

  if (optionId === "map-tiled-csv") {
    return {
      archiveExtension: ".csv.zip",
      archiveBaseName: "tiled csv maps",
      exportBundle: withCsvMapExport(exportTiledMapCsvBundle),
    };
  }

  return {
    archiveExtension: ".tmx.zip",
    archiveBaseName: "tiled maps",
    exportBundle: withTiledMapOptions(exportTiledMapBundle),
  };
}

export async function exportSelectedTiledMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  formatExportOptions?: ImportExportFormatExportOptions,
) {
  if (!project) {
    return;
  }

  const { archiveExtension, archiveBaseName, exportBundle } =
    getTiledMapExporter(optionId) satisfies {
      archiveExtension: string;
      archiveBaseName: string;
      exportBundle: TiledMapBundleExporter;
    };
  const selectedIdSet = new Set(selectedIds as MapId[]);
  const selectedMaps = project.maps.filter((map) => selectedIdSet.has(map.id));
  if (selectedMaps.length === 0) {
    return;
  }

  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];

  if (selectedMaps.length === 1) {
    const map = selectedMaps[0];
    const mapExportData = getMapExportData(project, map);
    const entries = await exportBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      formatExportOptions,
    );
    await saveByteArrayFile(
      createZipArchive(entries),
      buildDownloadFilename(map.name, archiveExtension),
    );
    return;
  }

  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of selectedMaps) {
    const mapExportData = getMapExportData(project, map);
    const entries = await exportBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      formatExportOptions,
    );
    const folderName = sanitizeDownloadSegment(
      groupNames.get(map.groupId) ?? "Ungrouped",
      "Ungrouped",
    );
    const mapFolder = sanitizeDownloadSegment(map.name, "Map");

    for (const entry of entries) {
      archiveEntries.push({
        path: getUniqueArchivePath(
          `${folderName}/${mapFolder}/${entry.path}`,
          usedPaths,
        ),
        data: entry.data,
      });
    }
  }

  await saveByteArrayFile(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} ${archiveBaseName}`, ".zip"),
  );
}
