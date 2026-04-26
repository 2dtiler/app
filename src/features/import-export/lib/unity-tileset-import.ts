import {
  buildEntryMap,
  getProvidedEntry,
  importImageAsset,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  normalizeBundlePath,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import { parseUnityTextureMetaTileSize } from "@/features/import-export/lib/unity-bundle-utils";
import { generateTilesetId } from "@/utils/ids";
import type {
  ImportExportArchiveEntry,
  Tileset,
  UnityImportMissingResource,
  UnityTilesetImportPreparationResult,
} from "@/types";
import { TILE_SIZES } from "@/types";

const IMPORT_TILESET_GROUP_ID = "__unity-import-tileset-group__";

export const UNITY_TILESET_IMPORT_ACCEPT =
  ".png,.jpg,.jpeg,.gif,.bmp,.webp,image/*";

function addUnityMissingResource(
  missingResources: Map<string, UnityImportMissingResource>,
  path: string,
  kind: UnityImportMissingResource["kind"],
  referringPath: string,
) {
  const normalizedPath = normalizeBundlePath(path);
  if (missingResources.has(normalizedPath)) {
    return;
  }

  missingResources.set(normalizedPath, {
    path: normalizedPath,
    kind,
    referringPath: normalizeBundlePath(referringPath),
    label: kind === "meta" ? "Unity .meta file" : "Unity texture image",
  });
}

function requireUnityTileSize(rootPath: string, metaData: Uint8Array) {
  const tileSize = parseUnityTextureMetaTileSize(metaData);
  if (!tileSize) {
    throw new Error(
      `Unity texture meta is missing tile slicing metadata: ${normalizeBundlePath(rootPath)}.meta`,
    );
  }

  if (!TILE_SIZES.includes(tileSize as Tileset["tileSize"])) {
    throw new Error(
      `Unsupported Unity tileset tile size: ${tileSize}. Supported sizes are ${TILE_SIZES.join(", ")}.`,
    );
  }

  return tileSize as Tileset["tileSize"];
}

export async function prepareUnityTilesetImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<UnityTilesetImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  if (normalizedRootPath.toLowerCase().endsWith(".meta")) {
    throw new Error(
      "Select the Unity texture image file, not the .meta sidecar.",
    );
  }

  const providedEntries = buildEntryMap(entries);
  const missingResources = new Map<string, UnityImportMissingResource>();
  const metaPath = `${normalizedRootPath}.meta`;

  if (!getProvidedEntry(providedEntries, metaPath)) {
    addUnityMissingResource(
      missingResources,
      metaPath,
      "meta",
      normalizedRootPath,
    );
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources: [...missingResources.values()],
    };
  }

  const tileSize = requireUnityTileSize(
    normalizedRootPath,
    requireProvidedEntry(providedEntries, metaPath),
  );
  const importedAsset = await importImageAsset(
    normalizedRootPath,
    requireProvidedEntry(providedEntries, normalizedRootPath),
  );

  return {
    status: "ready",
    result: [
      {
        id: generateTilesetId(),
        name:
          stripExtension(
            normalizedRootPath.split("/").pop() ?? normalizedRootPath,
          ) || "Unity Tileset",
        groupId: IMPORT_TILESET_GROUP_ID as Tileset["groupId"],
        tileSize,
        assetId: importedAsset.assetId,
        imageWidth: importedAsset.width,
        imageHeight: importedAsset.height,
        createdAt: Date.now(),
      },
    ],
  };
}
