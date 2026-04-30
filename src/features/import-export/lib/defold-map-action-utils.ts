import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { resolveExportSaveStrategy } from "@/features/import-export/lib/export-save-strategy";
import {
  getMapExportData,
  getUniqueArchivePath,
  isDefoldMapExportOptions,
} from "@/features/import-export/lib/import-export-action-utils";
import { exportDefoldMapBundle } from "@/features/import-export/lib/import-export-defold";
import { assertMapsHaveNoAnimations } from "@/features/import-export/lib/animation-export-guards";
import type {
  ImportExportArchiveEntry,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  MapId,
  Project,
  ExportSaveStrategy,
} from "@/types";

export function isDefoldMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-defold";
}

export async function exportSelectedDefoldMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  formatExportOptions?: ImportExportFormatExportOptions,
  saveStrategy?: ExportSaveStrategy,
) {
  if (!project) {
    return false;
  }

  if (!isDefoldMapOption(optionId)) {
    throw new Error(`Unsupported Defold export option: ${optionId}.`);
  }

  const selectedIdSet = new Set(selectedIds as MapId[]);
  const selectedMaps = project.maps.filter((map) => selectedIdSet.has(map.id));
  if (selectedMaps.length === 0) {
    return false;
  }
  assertMapsHaveNoAnimations(project, selectedMaps, "Defold");

  const allTilesets = [
    ...project.tilesets,
    ...(project.overrideTilesets ?? []),
  ];
  const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);
  const exportOptions = isDefoldMapExportOptions(formatExportOptions)
    ? formatExportOptions
    : undefined;

  if (selectedMaps.length === 1) {
    const map = selectedMaps[0];
    const mapExportData = getMapExportData(project, map);
    const entries = await exportDefoldMapBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      exportOptions,
    );

    return resolvedSaveStrategy.saveByteArray(
      createZipArchive(entries),
      buildDownloadFilename(
        map.name,
        exportOptions?.format === "tilemap"
          ? ".tilemap.zip"
          : ".collection.zip",
      ),
    );
  }

  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of selectedMaps) {
    const mapExportData = getMapExportData(project, map);
    const entries = await exportDefoldMapBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      exportOptions,
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
    buildDownloadFilename(`${project.name} defold maps`, ".zip"),
  );
}
