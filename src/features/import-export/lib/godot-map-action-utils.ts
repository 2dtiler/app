import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import {
  getMapExportData,
  getUniqueArchivePath,
  isGodotMapExportOptions,
} from "@/features/import-export/lib/import-export-action-utils";
import { exportGodotMapBundle } from "@/features/import-export/lib/import-export-godot";
import type {
  ImportExportArchiveEntry,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  MapId,
  Project,
} from "@/types";

export function isGodotMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-godot";
}

export async function exportSelectedGodotMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  formatExportOptions?: ImportExportFormatExportOptions,
) {
  if (!project) {
    return;
  }

  if (!isGodotMapOption(optionId)) {
    throw new Error(`Unsupported Godot export option: ${optionId}.`);
  }

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
    const entries = await exportGodotMapBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      isGodotMapExportOptions(formatExportOptions)
        ? formatExportOptions
        : undefined,
    );

    if (entries.length === 1 && entries[0].path.endsWith(".tscn")) {
      await saveByteArrayFile(
        entries[0].data,
        buildDownloadFilename(map.name, ".tscn"),
      );
      return;
    }

    await saveByteArrayFile(
      createZipArchive(entries),
      buildDownloadFilename(map.name, ".tscn.zip"),
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
    const entries = await exportGodotMapBundle(
      map,
      mapExportData.layers,
      allTilesets,
      mapExportData.imageLayers,
      mapExportData.layerGroups,
      mapExportData.objectLayers,
      mapExportData.objects,
      isGodotMapExportOptions(formatExportOptions)
        ? formatExportOptions
        : undefined,
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
    buildDownloadFilename(`${project.name} godot maps`, ".zip"),
  );
}
