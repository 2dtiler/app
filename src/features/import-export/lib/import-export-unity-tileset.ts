import { getAsset } from "@/services/db";
import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  buildUnityTilesetTextureMetaFile,
  encodeUnityTextFile,
  generateUnityGuid,
} from "@/features/import-export/lib/unity-bundle-utils";
import { getFileExtensionFromMimeType } from "@/features/import-export/lib/tiled-xml-utils";
import type { ImportExportArchiveEntry, Tileset } from "@/types";

export async function exportUnityTilesetBundle(
  tileset: Tileset,
): Promise<ImportExportArchiveEntry[]> {
  const assetRecord = await getAsset(tileset.assetId);
  if (!assetRecord) {
    throw new Error(`Missing image asset for Unity tileset export: ${tileset.name}.`);
  }

  const usedPaths = new Set<string>();
  const imagePath = createRelativeAssetPath(
    "images/tilesets",
    tileset.name,
    getFileExtensionFromMimeType(assetRecord.mimeType),
    usedPaths,
  );
  const imageGuid = generateUnityGuid();

  return [
    {
      path: imagePath,
      data: new Uint8Array(assetRecord.data),
    },
    {
      path: `${imagePath}.meta`,
      data: encodeUnityTextFile(
        buildUnityTilesetTextureMetaFile(imageGuid, tileset.tileSize),
      ),
    },
  ];
}