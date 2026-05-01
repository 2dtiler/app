import {
  buildDownloadFilename,
  createZipArchive,
  sanitizeDownloadSegment,
} from "@/utils/format";
import { resolveExportSaveStrategy } from "@/features/import-export/lib/export-save-strategy";
import { getAsset } from "@/services/db";
import {
  getUniqueArchivePath,
  isTiledTilesetExportOptions,
} from "@/features/import-export/lib/import-export-action-utils";
import {
  createRelativeAssetPath,
  encodeJsonDocument,
  TILED_FORMAT_VERSION,
} from "@/features/import-export/lib/import-export-tiled-shared";
import { buildTiledLuaTilesetDocument } from "@/features/import-export/lib/tiled-lua-format";
import { encodeTiledLuaDocument } from "@/features/import-export/lib/tiled-lua";
import {
  createXmlDocument,
  encodeXmlDocument,
  getFileExtensionFromMimeType,
  getTileColumns,
  getTileCount,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  appendTiledXmlWangSets,
  buildTiledJsonWangSets,
} from "@/features/import-export/lib/tiled-wang";
import type {
  ImportExportArchiveEntry,
  ImportExportFormatExportOptions,
  ImportExportOptionId,
  Project,
  TiledJsonTileset,
  TiledTilesetExportOptions,
  TiledTilesetFormat,
  Tileset,
  TilesetId,
  ExportSaveStrategy,
} from "@/types";

function requireTiledTilesetExportOptions(
  options?: ImportExportFormatExportOptions,
): TiledTilesetExportOptions {
  if (!isTiledTilesetExportOptions(options)) {
    throw new Error("Missing Tiled tileset export options.");
  }

  return options;
}

function buildTiledJsonTilesetDocument(
  tileset: Tileset,
  imagePath: string,
): TiledJsonTileset {
  const wangsets = buildTiledJsonWangSets(tileset);

  return {
    type: "tileset",
    version: TILED_FORMAT_VERSION,
    tiledversion: TILED_FORMAT_VERSION,
    name: tileset.name,
    tilewidth: tileset.tileSize,
    tileheight: tileset.tileSize,
    tilecount: getTileCount(tileset),
    columns: getTileColumns(tileset),
    margin: 0,
    spacing: 0,
    image: imagePath,
    imagewidth: tileset.imageWidth,
    imageheight: tileset.imageHeight,
    ...(wangsets ? { wangsets } : {}),
  };
}

async function exportTiledTilesetBundle(
  tileset: Tileset,
  format: TiledTilesetFormat,
): Promise<ImportExportArchiveEntry[]> {
  const assetRecord = await getAsset(tileset.assetId);
  if (!assetRecord) {
    throw new Error(`Missing tileset asset for ${tileset.name}.`);
  }

  const usedPaths = new Set<string>();
  const imagePath = createRelativeAssetPath(
    "images",
    tileset.name,
    getFileExtensionFromMimeType(assetRecord.mimeType),
    usedPaths,
  );
  const entries: ImportExportArchiveEntry[] = [
    {
      path: imagePath,
      data: new Uint8Array(assetRecord.data),
    },
  ];
  const jsonTileset = buildTiledJsonTilesetDocument(tileset, imagePath);

  if (format === "json") {
    entries.push({
      path: createRelativeAssetPath("", tileset.name, ".tsj", usedPaths),
      data: encodeJsonDocument(jsonTileset),
    });
    return entries;
  }

  if (format === "lua") {
    entries.push({
      path: createRelativeAssetPath("", tileset.name, ".lua", usedPaths),
      data: encodeTiledLuaDocument(buildTiledLuaTilesetDocument(jsonTileset)),
    });
    return entries;
  }

  const document = createXmlDocument("tileset");
  const tilesetElement = document.documentElement;
  tilesetElement.setAttribute("version", TILED_FORMAT_VERSION);
  tilesetElement.setAttribute("name", tileset.name);
  tilesetElement.setAttribute("tilewidth", String(tileset.tileSize));
  tilesetElement.setAttribute("tileheight", String(tileset.tileSize));
  tilesetElement.setAttribute("tilecount", String(getTileCount(tileset)));
  tilesetElement.setAttribute("columns", String(getTileColumns(tileset)));
  tilesetElement.setAttribute("margin", "0");
  tilesetElement.setAttribute("spacing", "0");

  const imageElement = document.createElement("image");
  imageElement.setAttribute("source", imagePath);
  imageElement.setAttribute("width", String(tileset.imageWidth));
  imageElement.setAttribute("height", String(tileset.imageHeight));
  tilesetElement.append(imageElement);
  appendTiledXmlWangSets(document, tilesetElement, tileset);

  entries.push({
    path: createRelativeAssetPath("", tileset.name, ".tsx", usedPaths),
    data: encodeXmlDocument(document),
  });
  return entries;
}

export function isTiledTilesetImportOption(optionId: ImportExportOptionId) {
  return optionId === "tileset-tiled-file";
}

export function isTiledTilesetExportOption(optionId: ImportExportOptionId) {
  return optionId === "tileset-tiled";
}

function getTiledTilesetArchiveExtension(format: TiledTilesetFormat) {
  if (format === "json") {
    return ".tsj.zip";
  }

  if (format === "lua") {
    return ".lua.zip";
  }

  return ".tsx.zip";
}

export async function exportSelectedTiledTilesets(
  project: Project | null,
  selectedIds: string[],
  optionId: ImportExportOptionId,
  formatExportOptions?: ImportExportFormatExportOptions,
  saveStrategy?: ExportSaveStrategy,
) {
  if (!project) {
    return false;
  }

  if (!isTiledTilesetExportOption(optionId)) {
    throw new Error(`Unsupported Tiled tileset export option: ${optionId}.`);
  }

  const format = requireTiledTilesetExportOptions(formatExportOptions).format;
  const resolvedSaveStrategy = resolveExportSaveStrategy(saveStrategy);
  const selectedIdSet = new Set(selectedIds as TilesetId[]);
  const selectedTilesets = project.tilesets.filter((tileset) =>
    selectedIdSet.has(tileset.id),
  );
  if (selectedTilesets.length === 0) {
    return false;
  }

  if (selectedTilesets.length === 1) {
    const tileset = selectedTilesets[0];
    const entries = await exportTiledTilesetBundle(tileset, format);
    return resolvedSaveStrategy.saveByteArray(
      createZipArchive(entries),
      buildDownloadFilename(
        tileset.name,
        getTiledTilesetArchiveExtension(format),
      ),
    );
  }

  const groupNames = new Map(
    project.tilesetGroups.map((group) => [group.id, group.name]),
  );
  const usedPaths = new Set<string>();
  const archiveEntries: ImportExportArchiveEntry[] = [];

  for (const tileset of selectedTilesets) {
    const entries = await exportTiledTilesetBundle(tileset, format);
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

  return resolvedSaveStrategy.saveByteArray(
    createZipArchive(archiveEntries),
    buildDownloadFilename(`${project.name} tiled tilesets`, ".zip"),
  );
}
