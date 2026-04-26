import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import { exportGameMakerMapBundle } from "@/features/import-export/lib/import-export-gamemaker";
import {
  getMapExportData,
  getUniqueArchivePath,
} from "@/features/import-export/lib/import-export-action-utils";
import type {
  GameMakerMapExportOptions,
  ImportExportArchiveEntry,
  ImportExportOptionId,
  MapId,
  Project,
} from "@/types";

export function isGameMakerMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-gamemaker";
}

function getArchiveExtension(options?: GameMakerMapExportOptions) {
  return options?.format === "gmx" ? ".room.gmx.zip" : ".yy.zip";
}

export async function exportSelectedGameMakerMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  formatExportOptions?: GameMakerMapExportOptions,
) {
  if (!project) {
    return false;
  }

  if (!isGameMakerMapOption(optionId)) {
    throw new Error(`Unsupported GameMaker export option: ${optionId}.`);
  }

  const selectedIdSet = new Set(selectedIds as MapId[]);
  const selectedMaps = project.maps.filter((map) => selectedIdSet.has(map.id));
  if (selectedMaps.length === 0) {
    return false;
  }

  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];

  if (selectedMaps.length === 1) {
    const map = selectedMaps[0];
    const mapExportData = getMapExportData(project, map);
    const entries = await exportGameMakerMapBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      formatExportOptions,
    );

    if (entries.length === 1) {
      return saveByteArrayFile(entries[0].data, entries[0].path);
    }

    return saveByteArrayFile(
      createZipArchive(entries),
      buildDownloadFilename(map.name, getArchiveExtension(formatExportOptions)),
    );
  }

  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of selectedMaps) {
    const mapExportData = getMapExportData(project, map);
    const entries = await exportGameMakerMapBundle(
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

  return saveByteArrayFile(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} gamemaker maps`, ".zip"),
  );
}
