import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { saveByteArrayFile } from "@/services/file-system";
import { getUniqueArchivePath } from "@/features/import-export/lib/import-export-action-utils";
import { exportGodotTilesetBundle } from "@/features/import-export/lib/import-export-godot-tileset";
import type {
  ImportExportArchiveEntry,
  ImportExportOptionId,
  Project,
  TilesetId,
} from "@/types";

export function isGodotTilesetOption(optionId: ImportExportOptionId) {
  return optionId === "tileset-godot";
}

export async function exportSelectedGodotTilesets(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
) {
  if (!project) {
    return;
  }

  if (!isGodotTilesetOption(optionId)) {
    throw new Error(`Unsupported Godot tileset export option: ${optionId}.`);
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
    const entries = await exportGodotTilesetBundle(tileset);

    if (entries.length === 1 && entries[0].path.endsWith(".tres")) {
      await saveByteArrayFile(
        entries[0].data,
        buildDownloadFilename(tileset.name, ".tres"),
      );
      return;
    }

    await saveByteArrayFile(
      createZipArchive(entries),
      buildDownloadFilename(tileset.name, ".tres.zip"),
    );
    return;
  }

  const groupNames = new Map(
    project.tilesetGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const tileset of selectedTilesets) {
    const entries = await exportGodotTilesetBundle(tileset);
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
    buildDownloadFilename(`${project.name} godot tilesets`, ".zip"),
  );
}
