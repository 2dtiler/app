import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import { getUniqueArchivePath } from "@/features/import-export/lib/import-export-action-utils";
import { exportUnityTilesetBundle } from "@/features/import-export/lib/import-export-unity-tileset";
import type {
  ImportExportArchiveEntry,
  ImportExportOptionId,
  Project,
  TilesetId,
} from "@/types";

export function isUnityTilesetOption(optionId: ImportExportOptionId) {
  return optionId === "tileset-unity";
}

export async function exportSelectedUnityTilesets(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
) {
  if (!project) {
    return;
  }

  if (!isUnityTilesetOption(optionId)) {
    throw new Error(`Unsupported Unity tileset export option: ${optionId}.`);
  }

  const selectedIdSet = new Set(selectedIds as TilesetId[]);
  const selectedTilesets = project.tilesets.filter((tileset) =>
    selectedIdSet.has(tileset.id),
  );
  if (selectedTilesets.length === 0) {
    return;
  }

  if (selectedTilesets.length === 1) {
    const tileset = selectedTilesets[0];
    const entries = await exportUnityTilesetBundle(tileset);
    await saveByteArrayFile(
      createZipArchive(entries),
      buildDownloadFilename(tileset.name, ".unity-tileset.zip"),
    );
    return;
  }

  const groupNames = new Map(
    project.tilesetGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const tileset of selectedTilesets) {
    const entries = await exportUnityTilesetBundle(tileset);
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

  await saveByteArrayFile(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} unity tilesets`, ".zip"),
  );
}