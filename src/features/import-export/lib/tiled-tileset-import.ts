import { generateTilesetId } from "@/utils/ids";
import { normalizeTiledLuaTilesetDocument } from "@/features/import-export/lib/tiled-lua-format";
import { parseTiledLuaDocument } from "@/features/import-export/lib/tiled-lua";
import {
  addMissingResource,
  buildEntryMap,
  getProvidedEntry,
  importTiledTilesetImageAsset,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  decodeText,
  normalizeBundlePath,
  parseXmlDocument,
  resolveBundlePath,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  buildAutotileFromTiledWangSets,
  readTiledXmlWangSets,
  readJsonTilesetAnimationConfig,
  readXmlTilesetAnimationConfig,
} from "@/features/import-export/lib/tiled-animation-conversion";
import {
  buildAutotileFromTiledWangSets,
  readTiledXmlWangSets,
} from "@/features/import-export/lib/tiled-animation-conversion";
import {
  buildAutotileFromTiledWangSets,
  readTiledXmlWangSets,
} from "@/features/import-export/lib/tiled-wang";
import type {
  ImportExportArchiveEntry,
  TiledImportMissingResource,
  TiledJsonTileset,
  TiledJsonWangSet,
  TiledTilesetFormat,
  TiledTilesetImportPreparationResult,
  TileSize,
  Tileset,
} from "@/types";

interface ParsedTiledTilesetDefinition {
  path: string;
  name?: string;
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
  imageSource?: string;
  imageWidth?: number;
  imageHeight?: number;
  wangsets?: TiledJsonWangSet[];
}

function getExternalTilesetKind(
  path: string,
): TiledImportMissingResource["kind"] {
  const normalizedPath = normalizeBundlePath(path).toLowerCase();
  if (normalizedPath.endsWith(".tsx") || normalizedPath.endsWith(".xml")) {
    return "tsx";
  }
  if (normalizedPath.endsWith(".lua")) {
    return "lua";
  }
  return "tsj";
}

function detectTiledTilesetFormatFromPath(
  path: string,
): TiledTilesetFormat | null {
  const normalizedPath = normalizeBundlePath(path).toLowerCase();

  if (normalizedPath.endsWith(".tsx") || normalizedPath.endsWith(".xml")) {
    return "xml";
  }

  if (normalizedPath.endsWith(".tsj") || normalizedPath.endsWith(".json")) {
    return "json";
  }

  if (normalizedPath.endsWith(".lua")) {
    return "lua";
  }

  return null;
}

function parseTiledJsonDocument(data: Uint8Array, label: string) {
  try {
    const parsed = JSON.parse(decodeText(data)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid JSON document.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid ${label} JSON document.`);
  }
}

function assertTilesetDocument(
  document: Record<string, unknown>,
  label: string,
): TiledJsonTileset {
  if (
    document.type === "map" ||
    Array.isArray(document.layers) ||
    Array.isArray(document.tilesets) ||
    typeof document.orientation === "string"
  ) {
    throw new Error(`Selected ${label} file contains a map, not a tileset.`);
  }

  if (typeof document.type === "string" && document.type !== "tileset") {
    throw new Error(`Selected ${label} file is not a tileset.`);
  }

  return document as TiledJsonTileset;
}

function parseTiledJsonLikeTileset(
  data: Uint8Array,
  format: Extract<TiledTilesetFormat, "json" | "lua">,
) {
  if (format === "lua") {
    const parsed = parseTiledLuaDocument<Record<string, unknown>>(
      data,
      "Tiled Lua tileset",
    );
    if (
      Array.isArray(parsed.layers) ||
      Array.isArray(parsed.tilesets) ||
      typeof parsed.orientation === "string"
    ) {
      throw new Error("Selected Tiled Lua file contains a map, not a tileset.");
    }
    return normalizeTiledLuaTilesetDocument(parsed);
  }

  return assertTilesetDocument(
    parseTiledJsonDocument(data, "Tiled JSON tileset"),
    "Tiled JSON",
  );
}

function loadXmlTilesetDefinition(
  entryPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources?: Map<string, TiledImportMissingResource>,
): ParsedTiledTilesetDefinition | null {
  const normalizedPath = normalizeBundlePath(entryPath);
  const data = getProvidedEntry(providedEntries, normalizedPath);
  if (!data) {
    if (missingResources) {
      addMissingResource(
        missingResources,
        normalizedPath,
        getExternalTilesetKind(normalizedPath),
        normalizedPath,
      );
      return null;
    }

    requireProvidedEntry(providedEntries, normalizedPath);
  }

  const document = parseXmlDocument(
    decodeText(requireProvidedEntry(providedEntries, normalizedPath)),
  );
  const tilesetElement = document.documentElement;

  if (tilesetElement.tagName === "map") {
    throw new Error("Selected Tiled XML file contains a map, not a tileset.");
  }

  if (tilesetElement.tagName !== "tileset") {
    throw new Error("Tiled XML file does not contain a valid tileset element.");
  }

  const source = tilesetElement.getAttribute("source");
  if (source) {
    const resolvedPath = resolveBundlePath(normalizedPath, source);
    const resolvedFormat = detectTiledTilesetFormatFromPath(resolvedPath);
    if (!resolvedFormat) {
      throw new Error(`Unsupported linked Tiled tileset file type: ${source}.`);
    }

    return loadTilesetDefinitionByPath(
      resolvedPath,
      resolvedFormat,
      providedEntries,
      missingResources,
    );
  }

  const imageElement = tilesetElement.querySelector(":scope > image");

  return {
    path: normalizedPath,
    name: tilesetElement.getAttribute("name") ?? undefined,
    tileWidth: Number(tilesetElement.getAttribute("tilewidth") ?? "0"),
    tileHeight: Number(tilesetElement.getAttribute("tileheight") ?? "0"),
    margin: Number(tilesetElement.getAttribute("margin") ?? "0"),
    spacing: Number(tilesetElement.getAttribute("spacing") ?? "0"),
    imageSource: imageElement?.getAttribute("source") ?? undefined,
    imageWidth: imageElement
      ? Number(imageElement.getAttribute("width") ?? "0") || undefined
      : undefined,
    imageHeight: imageElement
      ? Number(imageElement.getAttribute("height") ?? "0") || undefined
      : undefined,
    wangsets: readTiledXmlWangSets(tilesetElement),
  };
}

function loadJsonLikeTilesetDefinition(
  entryPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  format: Extract<TiledTilesetFormat, "json" | "lua">,
  missingResources?: Map<string, TiledImportMissingResource>,
): ParsedTiledTilesetDefinition | null {
  const normalizedPath = normalizeBundlePath(entryPath);
  const data = getProvidedEntry(providedEntries, normalizedPath);
  if (!data) {
    if (missingResources) {
      addMissingResource(
        missingResources,
        normalizedPath,
        getExternalTilesetKind(normalizedPath),
        normalizedPath,
      );
      return null;
    }

    requireProvidedEntry(providedEntries, normalizedPath);
  }

  const tileset = parseTiledJsonLikeTileset(
    requireProvidedEntry(providedEntries, normalizedPath),
    format,
  );

  if (tileset.source) {
    const resolvedPath = resolveBundlePath(normalizedPath, tileset.source);
    const resolvedFormat = detectTiledTilesetFormatFromPath(resolvedPath);
    if (!resolvedFormat) {
      throw new Error(
        `Unsupported linked Tiled tileset file type: ${tileset.source}.`,
      );
    }

    return loadTilesetDefinitionByPath(
      resolvedPath,
      resolvedFormat,
      providedEntries,
      missingResources,
    );
  }

  return {
    path: normalizedPath,
    name: tileset.name,
    tileWidth: Number(tileset.tilewidth ?? 0),
    tileHeight: Number(tileset.tileheight ?? 0),
    margin: Number(tileset.margin ?? 0),
    spacing: Number(tileset.spacing ?? 0),
    imageSource: tileset.image,
    imageWidth: Number(tileset.imagewidth ?? 0) || undefined,
    imageHeight: Number(tileset.imageheight ?? 0) || undefined,
    wangsets: tileset.wangsets,
  };
}

function loadTilesetDefinitionByPath(
  entryPath: string,
  format: TiledTilesetFormat,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources?: Map<string, TiledImportMissingResource>,
): ParsedTiledTilesetDefinition | null {
  if (format === "xml") {
    return loadXmlTilesetDefinition(
      entryPath,
      providedEntries,
      missingResources,
    );
  }

  return loadJsonLikeTilesetDefinition(
    entryPath,
    providedEntries,
    format,
    missingResources,
  );
}

function collectMissingTiledTilesetResources(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  format: TiledTilesetFormat,
) {
  const missingResources = new Map<string, TiledImportMissingResource>();
  const definition = loadTilesetDefinitionByPath(
    rootPath,
    format,
    providedEntries,
    missingResources,
  );

  if (definition?.imageSource) {
    const resolvedImagePath = resolveBundlePath(
      definition.path,
      definition.imageSource,
    );
    if (!getProvidedEntry(providedEntries, resolvedImagePath)) {
      addMissingResource(
        missingResources,
        resolvedImagePath,
        "image",
        definition.path,
      );
    }
  }

  return [...missingResources.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

async function importTiledTilesetDefinition(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  format: TiledTilesetFormat,
): Promise<Tileset> {
  const definition = loadTilesetDefinitionByPath(
    rootPath,
    format,
    providedEntries,
  );
  if (!definition) {
    throw new Error(`Missing linked resource: ${rootPath}.`);
  }

  if (
    definition.tileWidth <= 0 ||
    definition.tileHeight <= 0 ||
    definition.tileWidth !== definition.tileHeight
  ) {
    throw new Error("Only square Tiled tilesets are supported.");
  }

  if (!definition.imageSource) {
    throw new Error("Only image-based Tiled tilesets are supported.");
  }

  const resolvedImagePath = resolveBundlePath(
    definition.path,
    definition.imageSource,
  );
  const importedImage = await importTiledTilesetImageAsset(
    resolvedImagePath,
    requireProvidedEntry(providedEntries, resolvedImagePath),
    {
      tileWidth: definition.tileWidth,
      tileHeight: definition.tileHeight,
      margin: definition.margin,
      spacing: definition.spacing,
      imageWidth: definition.imageWidth,
      imageHeight: definition.imageHeight,
    },
  );

  const tileset: Tileset = {
    id: generateTilesetId(),
    name: definition.name ?? stripExtension(resolvedImagePath),
    groupId: "tmx-import" as Tileset["groupId"],
    tileSize: definition.tileWidth as TileSize,
    assetId: importedImage.assetId,
    imageWidth: importedImage.width,
    imageHeight: importedImage.height,
    createdAt: Date.now(),
  };

  const autotile = buildAutotileFromTiledWangSets(tileset, definition.wangsets);
  if (autotile) {
    tileset.autotile = autotile;
  }

  const definitionFormat =
    detectTiledTilesetFormatFromPath(definition.path) ?? format;
  if (definitionFormat === "xml") {
    const document = parseXmlDocument(
      decodeText(requireProvidedEntry(providedEntries, definition.path)),
    );
    const animations = readXmlTilesetAnimationConfig(
      document.documentElement,
      tileset,
    );
    if (animations) {
      tileset.animations = animations;
    }
  } else {
    const jsonTileset = parseTiledJsonLikeTileset(
      requireProvidedEntry(providedEntries, definition.path),
      definitionFormat,
    );
    const animations = readJsonTilesetAnimationConfig(jsonTileset, tileset);
    if (animations) {
      tileset.animations = animations;
    }
  }

  return tileset;
}

export async function prepareTiledTilesetImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
  format: TiledTilesetFormat,
): Promise<TiledTilesetImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  const providedEntries = buildEntryMap(entries);
  const missingResources = collectMissingTiledTilesetResources(
    normalizedRootPath,
    providedEntries,
    format,
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
    result: [
      await importTiledTilesetDefinition(
        normalizedRootPath,
        providedEntries,
        format,
      ),
    ],
  };
}
