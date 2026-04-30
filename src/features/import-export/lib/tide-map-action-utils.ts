import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { resolveExportSaveStrategy } from "@/features/import-export/lib/export-save-strategy";
import {
  getMapExportData,
  getUniqueArchivePath,
} from "@/features/import-export/lib/import-export-action-utils";
import { exportTideMapBundle } from "@/features/import-export/lib/import-export-tide";
import { assertMapsHaveNoAnimations } from "@/features/import-export/lib/animation-export-guards";
import type {
  ImportExportArchiveEntry,
  ImportExportOptionId,
  MapId,
  Project,
  ExportSaveStrategy,
} from "@/types";

export function isTideMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-tide";
}

export async function exportSelectedTideMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  saveStrategy?: ExportSaveStrategy,
) {
  if (!project) {
    return false;
  }

  if (!isTideMapOption(optionId)) {
    throw new Error(`Unsupported tIDE export option: ${optionId}.`);
  }

  const selectedIdSet = new Set(selectedIds as MapId[]);
  const selectedMaps = project.maps.filter((map) => selectedIdSet.has(map.id));
  if (selectedMaps.length === 0) {
    return false;
  }
  assertMapsHaveNoAnimations(project, selectedMaps, "tIDE");

  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];
  const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);

  if (selectedMaps.length === 1) {
    const map = selectedMaps[0];
    const mapExportData = getMapExportData(project, map);
    const entries = await exportTideMapBundle(
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
      buildDownloadFilename(map.name, ".tide.zip"),
    );
  }

  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of selectedMaps) {
    const mapExportData = getMapExportData(project, map);
    const entries = await exportTideMapBundle(
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
    buildDownloadFilename(`${project.name} tide maps`, ".zip"),
  );
}
