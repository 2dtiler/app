import {
  buildDownloadFilename,
  createZipArchive,
  downloadFile,
  sanitizeDownloadSegment,
} from "@/lib/format";
import {
  exportTiledMapJsBundle,
  exportTiledMapBundle,
  exportTiledMapJsonBundle,
  exportTiledMapLuaBundle,
} from "@/lib/import-export-tiled";
import {
  getMapExportData,
  getUniqueArchivePath,
  isTiledXmlExportOptions,
} from "@/components/app/import-export-action-utils";
import type {
  ImportExportArchiveEntry,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  MapId,
  Project,
  TiledMapFormat,
} from "@/types";

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

function getTiledMapExporter(optionId: ImportExportOptionId) {
  if (optionId === "map-tiled-json") {
    return {
      archiveExtension: ".tmj.zip",
      archiveBaseName: "tiled json maps",
      exportBundle: exportTiledMapJsonBundle,
    };
  }

  if (optionId === "map-tiled-js") {
    return {
      archiveExtension: ".js.zip",
      archiveBaseName: "tiled javascript maps",
      exportBundle: exportTiledMapJsBundle,
    };
  }

  if (optionId === "map-tiled-lua") {
    return {
      archiveExtension: ".lua.zip",
      archiveBaseName: "tiled lua maps",
      exportBundle: exportTiledMapLuaBundle,
    };
  }

  return {
    archiveExtension: ".tmx.zip",
    archiveBaseName: "tiled maps",
    exportBundle: exportTiledMapBundle,
  };
}

export async function exportSelectedTiledMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  formatExportOptions?: ImportExportFormatExportOptions,
) {
  if (!project || !isTiledXmlExportOptions(formatExportOptions)) {
    return;
  }

  const { archiveExtension, archiveBaseName, exportBundle } =
    getTiledMapExporter(optionId);
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
    downloadFile(
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

  downloadFile(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} ${archiveBaseName}`, ".zip"),
  );
}
