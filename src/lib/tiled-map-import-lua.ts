import {
  collectMissingTiledJsonMapResources,
  importTiledJsonMapEntries,
} from "@/lib/tiled-map-import-json";
import { buildEntryMap } from "@/lib/tiled-map-import-shared";
import { createSyntheticTiledLuaJsonEntries } from "@/lib/tiled-lua-format";
import { normalizeBundlePath } from "@/lib/tiled-xml-utils";
import type {
  ImportExportArchiveEntry,
  TiledMapImportPreparationResult,
} from "@/types";

export async function prepareTiledLuaMapImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<TiledMapImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  const normalizedEntries = createSyntheticTiledLuaJsonEntries(
    normalizedRootPath,
    entries,
  );
  const providedEntries = buildEntryMap(normalizedEntries);
  const missingResources = collectMissingTiledJsonMapResources(
    normalizedRootPath,
    providedEntries,
    "lua",
  );

  if (missingResources.length > 0) {
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources,
    };
  }

  return {
    status: "ready",
    result: await importTiledJsonMapEntries(
      normalizedRootPath,
      providedEntries,
      "lua",
    ),
  };
}
