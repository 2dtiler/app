import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import { getUniqueArchivePath } from "@/features/import-export/lib/import-export-action-utils";
import { exportDefoldTilesourceBundle } from "@/features/import-export/lib/import-export-defold";
import type {
  ImportExportArchiveEntry,
  ImportExportOptionId,
  Project,
  TilesetId,
} from "@/types";

export function isDefoldTilesetOption(optionId: ImportExportOptionId) {
  return optionId === "tileset-defold";
}

export async function exportSelectedDefoldTilesets(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
) {
  if (!project) {
    return false;
  }

  if (!isDefoldTilesetOption(optionId)) {
    throw new Error(`Unsupported Defold tileset export option: ${optionId}.`);
  }

  const selectedIdSet = new Set(selectedIds as TilesetId[]);
  const selectedTilesets = project.tilesets.filter((tileset) =>
    selectedIdSet.has(tileset.id),
  );
  if (selectedTilesets.length === 0) {
    return false;
  }

  if (selectedTilesets.length === 1) {
    const tileset = selectedTilesets[0];
    const entries = await exportDefoldTilesourceBundle(tileset);
    return saveByteArrayFile(
      createZipArchive(entries),
      buildDownloadFilename(tileset.name, ".tilesource.zip"),
    );
  }

  const groupNames = new Map(
    project.tilesetGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const tileset of selectedTilesets) {
    const entries = await exportDefoldTilesourceBundle(tileset);
    const folderName = sanitizeDownloadSegment(
      groupNames.get(tileset.groupId) ?? "Ungrouped",
      "Ungrouped",
    );
    const tilesetFolder = sanitizeDownloadSegment(tileset.name, "Tileset");

    for (const entry of entries) {
      archiveEntries.push({
        path: getUniqueArchivePath(
          `${folderName}/${tilesetFolder}/${entry.path}`,
          usedPaths,
        ),
        data: entry.data,
      });
    }
  }

  return saveByteArrayFile(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} defold tilesets`, ".zip"),
  );
}
