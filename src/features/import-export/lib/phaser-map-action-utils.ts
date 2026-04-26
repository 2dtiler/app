import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import { exportTiledMapJsonBundle } from "@/features/import-export/lib/import-export-tiled";
import {
  getMapExportData,
  getUniqueArchivePath,
} from "@/features/import-export/lib/import-export-action-utils";
import type {
  ImportExportArchiveEntry,
  ImportExportOptionId,
  MapId,
  Project,
  TiledMapExportOptions,
} from "@/types";

export const DEFAULT_PHASER_MAP_EXPORT_OPTIONS = {
  format: "json",
  encoding: "base64",
  compression: "zlib",
  compressionLevel: 6,
  tilesetMode: "inline",
  renderOrder: "right-down",
} satisfies TiledMapExportOptions;

function toPhaserJsonPath(path: string) {
  if (!path.endsWith(".tmj")) {
    return path;
  }

  return `${path.slice(0, -4)}.json`;
}

export function normalizePhaserMapBundleEntries(
  entries: readonly ImportExportArchiveEntry[],
) {
  return entries.map((entry) => ({
    ...entry,
    path: toPhaserJsonPath(entry.path),
  }));
}

export function isPhaserMapOption(optionId: ImportExportOptionId) {
  return optionId === "map-phaser";
}

export async function exportSelectedPhaserMaps(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
) {
  if (!project) {
    return false;
  }

  if (!isPhaserMapOption(optionId)) {
    throw new Error(`Unsupported Phaser export option: ${optionId}.`);
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
    const entries = normalizePhaserMapBundleEntries(
      await exportTiledMapJsonBundle(
        map,
        mapExportData.layers,
        allTilesets,
        mapExportData.imageLayers,
        mapExportData.layerGroups,
        mapExportData.objectLayers,
        mapExportData.objects,
        DEFAULT_PHASER_MAP_EXPORT_OPTIONS,
      ),
    );

    return saveByteArrayFile(
      createZipArchive(entries),
      buildDownloadFilename(map.name, ".json.zip"),
    );
  }

  const groupNames = new Map(
    project.mapGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const map of selectedMaps) {
    const mapExportData = getMapExportData(project, map);
    const entries = normalizePhaserMapBundleEntries(
      await exportTiledMapJsonBundle(
        map,
        mapExportData.layers,
        allTilesets,
        mapExportData.imageLayers,
        mapExportData.layerGroups,
        mapExportData.objectLayers,
        mapExportData.objects,
        DEFAULT_PHASER_MAP_EXPORT_OPTIONS,
      ),
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
    buildDownloadFilename(`${project.name} phaser maps`, ".zip"),
  );
}
