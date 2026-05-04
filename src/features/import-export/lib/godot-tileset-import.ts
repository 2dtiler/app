import {
  buildEntryMap,
  getProvidedEntry,
  importImageAsset,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  normalizeBundlePath,
  resolveBundlePath,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import { buildAutotileFromGodotTerrainProperties } from "@/features/import-export/lib/godot-terrain";
import { generateTilesetId } from "@/utils/ids";
import type {
  GodotImportMissingResource,
  GodotTilesetImportPreparationResult,
  ImportExportArchiveEntry,
  Tileset,
  TilesetGroupId,
  TileSize,
} from "@/types";
import { TILE_SIZES } from "@/types";

interface GodotSection {
  kind: string;
  attrs: Record<string, string>;
  properties: Record<string, string>;
}

interface GodotExtResource {
  id: string;
  type: string;
  path: string;
  resolvedPath: string;
}

interface GodotDocument {
  kind: "scene" | "resource";
  path: string;
  attrs: Record<string, string>;
  extResources: ReadonlyMap<string, GodotExtResource>;
  subResources: ReadonlyMap<string, GodotSection>;
  resourceSection: GodotSection | null;
}

interface ImportedImageAsset {
  assetId: Tileset["assetId"];
  width: number;
  height: number;
}

interface GodotTilesetImportContext {
  providedEntries: ReadonlyMap<string, Uint8Array>;
  documentCache: Map<string, GodotDocument>;
  imageCache: Map<string, Promise<ImportedImageAsset>>;
}

const IMPORT_TILESET_GROUP_ID = "__godot-import-tileset-group__";

export const GODOT_TILESET_IMPORT_ACCEPT =
  ".tres,text/plain,application/octet-stream";

function parseGodotStringLiteral(rawValue: string) {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue) as string;
  }

  return rawValue;
}

function parseSectionHeader(headerLine: string) {
  const header = headerLine.slice(1, -1).trim();
  const firstSpace = header.indexOf(" ");
  const kind = firstSpace === -1 ? header : header.slice(0, firstSpace);
  const attrText = firstSpace === -1 ? "" : header.slice(firstSpace + 1);
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z0-9_./:-]+)=((?:"(?:[^"\\]|\\.)*")|[^\s]+)/g;

  for (const match of attrText.matchAll(attrPattern)) {
    const [, key, rawValue] = match;
    attrs[key] = parseGodotStringLiteral(rawValue);
  }

  return {
    kind,
    attrs,
  };
}

function parseGodotDocument(path: string, data: Uint8Array): GodotDocument {
  const text = new TextDecoder().decode(data);
  if (text.includes("\u0000")) {
    throw new Error(
      `Binary Godot resources are not supported yet: ${normalizeBundlePath(path)}.`,
    );
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: GodotSection[] = [];
  let currentSection: GodotSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      if (currentSection) {
        sections.push(currentSection);
      }

      const parsedHeader = parseSectionHeader(line);
      currentSection = {
        kind: parsedHeader.kind,
        attrs: parsedHeader.attrs,
        properties: {},
      };
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    currentSection.properties[key] = value;
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    throw new Error(`Invalid Godot resource: ${normalizeBundlePath(path)}.`);
  }

  const normalizedPath = normalizeBundlePath(path);
  const kind =
    sections[0].kind === "gd_resource"
      ? "resource"
      : sections[0].kind === "gd_scene"
        ? "scene"
        : null;
  if (!kind) {
    throw new Error(`Unsupported Godot file: ${normalizedPath}.`);
  }

  const extResources = new Map<string, GodotExtResource>();
  const subResources = new Map<string, GodotSection>();
  let resourceSection: GodotSection | null = null;

  for (const section of sections) {
    if (section.kind === "ext_resource") {
      const id = section.attrs.id;
      const rawPath = section.attrs.path;
      if (!id || !rawPath) {
        continue;
      }

      extResources.set(id, {
        id,
        type: section.attrs.type ?? "Resource",
        path: rawPath,
        resolvedPath: resolveGodotResourcePath(normalizedPath, rawPath),
      });
      continue;
    }

    if (section.kind === "sub_resource") {
      const id = section.attrs.id;
      if (id) {
        subResources.set(id, section);
      }
      continue;
    }

    if (section.kind === "resource") {
      resourceSection = section;
    }
  }

  return {
    kind,
    path: normalizedPath,
    attrs: sections[0].attrs,
    extResources,
    subResources,
    resourceSection,
  };
}

function resolveGodotResourcePath(fromPath: string, resourcePath: string) {
  if (resourcePath.startsWith("res://")) {
    return normalizeBundlePath(resourcePath.slice("res://".length));
  }

  return resolveBundlePath(fromPath, resourcePath);
}

function getLinkedResourceKind(
  path: string,
): GodotImportMissingResource["kind"] {
  const normalizedPath = normalizeBundlePath(path).toLowerCase();

  if (normalizedPath.endsWith(".tscn")) {
    return "tscn";
  }
  if (normalizedPath.endsWith(".tres")) {
    return "tres";
  }
  if (normalizedPath.endsWith(".res")) {
    return "res";
  }
  return "image";
}

function getLinkedResourceLabel(kind: GodotImportMissingResource["kind"]) {
  if (kind === "image") {
    return "Image asset";
  }
  if (kind === "tscn") {
    return "Godot scene";
  }
  return "Godot resource";
}

function getDocument(
  context: GodotTilesetImportContext,
  path: string,
): GodotDocument {
  const normalizedPath = normalizeBundlePath(path);
  const cached = context.documentCache.get(normalizedPath);
  if (cached) {
    return cached;
  }

  const entry = getProvidedEntry(context.providedEntries, normalizedPath);
  if (!entry) {
    throw new Error(`Missing linked Godot resource: ${normalizedPath}.`);
  }

  const document = parseGodotDocument(normalizedPath, entry);
  context.documentCache.set(normalizedPath, document);
  return document;
}

function addMissingResource(
  missingResources: Map<string, GodotImportMissingResource>,
  path: string,
  referringPath: string,
) {
  const normalizedPath = normalizeBundlePath(path);
  if (missingResources.has(normalizedPath)) {
    return;
  }

  const kind = getLinkedResourceKind(normalizedPath);
  missingResources.set(normalizedPath, {
    path: normalizedPath,
    kind,
    referringPath: normalizeBundlePath(referringPath),
    label: getLinkedResourceLabel(kind),
  });
}

function collectMissingResources(
  document: GodotDocument,
  context: GodotTilesetImportContext,
  missingResources: Map<string, GodotImportMissingResource>,
) {
  for (const resource of document.extResources.values()) {
    if (!getProvidedEntry(context.providedEntries, resource.resolvedPath)) {
      addMissingResource(
        missingResources,
        resource.resolvedPath,
        document.path,
      );
      continue;
    }

    const resourceKind = getLinkedResourceKind(resource.resolvedPath);
    if (
      resourceKind === "tscn" ||
      resourceKind === "tres" ||
      resourceKind === "res"
    ) {
      collectMissingResources(
        getDocument(context, resource.resolvedPath),
        context,
        missingResources,
      );
    }
  }
}

function parseReference(
  rawValue: string | undefined,
): { kind: "ExtResource" | "SubResource"; id: string } | null {
  if (!rawValue) {
    return null;
  }

  const match = rawValue.match(
    /^(ExtResource|SubResource)\("((?:[^"\\]|\\.)*)"\)$/,
  );
  if (!match) {
    return null;
  }

  return {
    kind: match[1] as "ExtResource" | "SubResource",
    id: JSON.parse(`"${match[2]}"`) as string,
  };
}

function parseVector(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const match = rawValue.match(/^Vector2i?\(([^,]+),\s*([^)]+)\)$/);
  if (!match) {
    return null;
  }

  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function coerceTileSize(tileSize: number) {
  if (!TILE_SIZES.includes(tileSize as TileSize)) {
    throw new Error(`Unsupported tile size in Godot import: ${tileSize}.`);
  }

  return tileSize as TileSize;
}

async function getImportedImageAsset(
  context: GodotTilesetImportContext,
  path: string,
) {
  const normalizedPath = normalizeBundlePath(path);
  const cached = context.imageCache.get(normalizedPath);
  if (cached) {
    return cached;
  }

  const data = getProvidedEntry(context.providedEntries, normalizedPath);
  if (!data) {
    throw new Error(`Missing linked image asset: ${normalizedPath}.`);
  }

  const promise = importImageAsset(normalizedPath, data);
  context.imageCache.set(normalizedPath, promise);
  return promise;
}

async function importGodotTilesets(
  context: GodotTilesetImportContext,
  document: GodotDocument,
) {
  if (document.kind !== "resource" || document.attrs.type !== "TileSet") {
    throw new Error("Unsupported Godot TileSet resource.");
  }

  const resourceSection = document.resourceSection;
  if (!resourceSection) {
    throw new Error("Unsupported Godot TileSet resource.");
  }

  const sourceEntries = Object.entries(resourceSection.properties)
    .map(([key, value]) => {
      const match = key.match(/^sources\/(\d+)$/);
      if (!match) {
        return null;
      }

      const sourceReference = parseReference(value);
      if (!sourceReference || sourceReference.kind !== "SubResource") {
        return null;
      }

      return {
        sourceId: Number.parseInt(match[1], 10),
        sourceReference,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        sourceId: number;
        sourceReference: { kind: "SubResource"; id: string };
      } => entry !== null,
    );
  const declaredTileSize = parseVector(resourceSection.properties.tile_size)?.x;
  const importedTilesets: Tileset[] = [];
  const baseName = stripExtension(document.path).split("/").pop() ?? "Tileset";

  for (const entry of sourceEntries) {
    const sourceSection = document.subResources.get(entry.sourceReference.id);
    if (!sourceSection) {
      continue;
    }

    const textureReference = parseReference(sourceSection.properties.texture);
    if (!textureReference || textureReference.kind !== "ExtResource") {
      continue;
    }

    const textureResource = document.extResources.get(textureReference.id);
    if (!textureResource) {
      continue;
    }

    const textureRegionSize = parseVector(
      sourceSection.properties.texture_region_size,
    );
    const tileSize = coerceTileSize(
      Math.round(textureRegionSize?.x ?? declaredTileSize ?? 0),
    );
    const importedImage = await getImportedImageAsset(
      context,
      textureResource.resolvedPath,
    );
    const autotile = buildAutotileFromGodotTerrainProperties(
      {
        imageHeight: importedImage.height,
        imageWidth: importedImage.width,
        tileSize,
      },
      resourceSection.properties,
      sourceSection.properties,
    );
    importedTilesets.push({
      id: generateTilesetId(),
      name:
        sourceEntries.length === 1
          ? baseName
          : `${
              stripExtension(textureResource.resolvedPath).split("/").pop() ??
              baseName
            } ${entry.sourceId}`,
      groupId: IMPORT_TILESET_GROUP_ID as TilesetGroupId,
      tileSize,
      assetId: importedImage.assetId,
      imageWidth: importedImage.width,
      imageHeight: importedImage.height,
      ...(autotile ? { autotile } : {}),
      createdAt: Date.now(),
    });
  }

  if (importedTilesets.length === 0) {
    throw new Error(
      "No importable TileSet atlas sources were found in the Godot resource.",
    );
  }

  return importedTilesets;
}

export async function prepareGodotTilesetImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<GodotTilesetImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  const context: GodotTilesetImportContext = {
    providedEntries: buildEntryMap(entries),
    documentCache: new Map(),
    imageCache: new Map(),
  };
  const rootDocument = getDocument(context, normalizedRootPath);
  const missingResources = new Map<string, GodotImportMissingResource>();

  collectMissingResources(rootDocument, context, missingResources);
  if (missingResources.size > 0) {
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources: [...missingResources.values()],
    };
  }

  return {
    status: "ready",
    result: await importGodotTilesets(context, rootDocument),
  };
}
