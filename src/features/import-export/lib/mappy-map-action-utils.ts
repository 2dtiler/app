import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import {
  getMapExportData,
  getUniqueArchivePath,
} from "@/features/import-export/lib/import-export-action-utils";
import { exportMappyMap } from "@/features/import-export/lib/import-export-mappy";
import type {
  ImportExportArchiveEntry,
  ImportExportOptionId,
  MapId,
  Project,
} from "@/types";

export function isMappyMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-mappy-fmp";
}

export async function exportSelectedMappyMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
) {
  if (!project) {
    return false;
  }

  if (!isMappyMapOption(optionId)) {
    throw new Error(`Unsupported Mappy export option: ${optionId}.`);
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
    const data = await exportMappyMap(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
    );

    return saveByteArrayFile(data, buildDownloadFilename(map.name, ".fmp"));
  }

  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of selectedMaps) {
    const mapExportData = getMapExportData(project, map);
    const data = await exportMappyMap(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
    );
    const folderName = sanitizeDownloadSegment(
      groupNames.get(map.groupId) ?? "Ungrouped",
      "Ungrouped",
    );
    const fileName = buildDownloadFilename(map.name, ".fmp");
    archiveEntries.push({
      path: getUniqueArchivePath(`${folderName}/${fileName}`, usedPaths),
      data,
    });
  }

  return saveByteArrayFile(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} mappy maps`, ".zip"),
  );
}
