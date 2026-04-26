import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { resolveExportSaveStrategy } from "@/features/import-export/lib/export-save-strategy";
import { exportUnityMapBundle } from "@/features/import-export/lib/import-export-unity";
import {
  getMapExportData,
  getUniqueArchivePath,
} from "@/features/import-export/lib/import-export-action-utils";
import type {
  ImportExportArchiveEntry,
  ImportExportOptionId,
  MapId,
  Project,
  ExportSaveStrategy,
} from "@/types";

export function isUnityMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-unity";
}

export async function exportSelectedUnityMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  saveStrategy?: ExportSaveStrategy,
) {
  if (!project) {
    return false;
  }

  if (!isUnityMapOption(optionId)) {
    throw new Error(`Unsupported Unity export option: ${optionId}.`);
  }

  const selectedIdSet = new Set(selectedIds as MapId[]);
  const selectedMaps = project.maps.filter((map) => selectedIdSet.has(map.id));
  if (selectedMaps.length === 0) {
    return false;
  }
  const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);

  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];

  if (selectedMaps.length === 1) {
    const map = selectedMaps[0];
    const mapExportData = getMapExportData(project, map);
    const entries = await exportUnityMapBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
    );

    return resolvedSaveStrategy.saveByteArray(
      createZipArchive(entries),
      buildDownloadFilename(map.name, ".prefab.zip"),
    );
  }

  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of selectedMaps) {
    const mapExportData = getMapExportData(project, map);
    const entries = await exportUnityMapBundle(
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

  return resolvedSaveStrategy.saveByteArray(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} unity maps`, ".zip"),
  );
}
