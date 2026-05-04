import { getAsset } from "@/services/db";
import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  getFileExtensionFromMimeType,
  getTileColumns,
} from "@/features/import-export/lib/tiled-xml-utils";
import { formatGodotVector2i } from "@/features/import-export/lib/godot-scene-utils";
import { buildGodotTerrainExportLines } from "@/features/import-export/lib/godot-terrain";
import type { ImportExportArchiveEntry, Tileset } from "@/types";

function buildAtlasSourceLines(tileset: Tileset) {
  const rows = Math.max(1, Math.floor(tileset.imageHeight / tileset.tileSize));
  const columns = getTileColumns(tileset);
  const terrainLines = buildGodotTerrainExportLines(tileset);
  const lines = [
    '[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_1"]',
    'texture = ExtResource("texture_1")',
    `texture_region_size = ${formatGodotVector2i(
      tileset.tileSize,
      tileset.tileSize,
    )}`,
  ];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      lines.push(`${x}:${y}/0 = 0`);
    }
  }

  lines.push(...terrainLines.sourceLines);

  return lines;
}

export async function exportGodotTilesetBundle(
  tileset: Tileset,
): Promise<ImportExportArchiveEntry[]> {
  const assetRecord = await getAsset(tileset.assetId);
  if (!assetRecord) {
    throw new Error(
      `Missing image asset for Godot tileset export: ${tileset.name}.`,
    );
  }

  const usedPaths = new Set<string>();
  const imagePath = createRelativeAssetPath(
    "images/tilesets",
    tileset.name,
    getFileExtensionFromMimeType(assetRecord.mimeType),
    usedPaths,
  );
  const tilesetPath = createRelativeAssetPath(
    "",
    tileset.name,
    ".tres",
    usedPaths,
  );
  const terrainLines = buildGodotTerrainExportLines(tileset);
  const lines = [
    '[gd_resource type="TileSet" load_steps=3 format=3]',
    "",
    `[ext_resource type="Texture2D" path="res://${imagePath}" id="texture_1"]`,
    "",
    ...buildAtlasSourceLines(tileset),
    "",
    "[resource]",
    `tile_size = ${formatGodotVector2i(tileset.tileSize, tileset.tileSize)}`,
    ...terrainLines.resourceLines,
    'sources/1 = SubResource("TileSetAtlasSource_1")',
    "",
  ];

  return [
    {
      path: tilesetPath,
      data: new TextEncoder().encode(lines.join("\n")),
    },
    {
      path: imagePath,
      data: new Uint8Array(assetRecord.data),
    },
  ];
}
