import {
  getProvidedEntry,
  importImageAsset,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  normalizeBundlePath,
  resolveBundlePath,
} from "@/features/import-export/lib/tiled-xml-utils";
import type {
  GodotDocument,
  GodotImportContext,
  GodotNode,
  GodotResourceReference,
  GodotSection,
  GodotVector2,
} from "@/features/import-export/types";
import type {
  GodotImportMissingResource,
  ImportExportArchiveEntry,
  MapOrientation,
  MapStaggerAxis,
  MapStaggerIndex,
  PropertyValue,
  TileSize,
} from "@/types";
import { TILE_SIZES } from "@/types";

function parseSectionHeader(headerLine: string) {
  const header = headerLine.slice(1, -1).trim();
  const firstSpace = header.indexOf(" ");
  const kind = firstSpace === -1 ? header : header.slice(0, firstSpace);
  const attrText = firstSpace === -1 ? "" : header.slice(firstSpace + 1);
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z0-9_./:-]+)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;

  for (const match of attrText.matchAll(attrPattern)) {
    const [, key, rawValue] = match;
    attrs[key] = parseGodotStringLiteral(rawValue);
  }

  return {
    kind,
    attrs,
  };
}

export function parseGodotStringLiteral(rawValue: string) {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue) as string;
  }

  return rawValue;
}

function resolveGodotNodeParent(parent: string, rootNodeName: string | null) {
  if (parent === ".") {
    return rootNodeName;
  }

  if (!rootNodeName) {
    return parent;
  }

  if (parent === rootNodeName || parent.startsWith(`${rootNodeName}/`)) {
    return parent;
  }

  return `${rootNodeName}/${parent}`;
}

export function resolveGodotResourcePath(
  fromPath: string,
  resourcePath: string,
) {
  if (resourcePath.startsWith("res://")) {
    return normalizeBundlePath(resourcePath.slice("res://".length));
  }

  return resolveBundlePath(fromPath, resourcePath);
}

export function parseGodotDocument(
  path: string,
  data: Uint8Array,
): GodotDocument {
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
    throw new Error(
      `Invalid Godot scene or resource: ${normalizeBundlePath(path)}.`,
    );
  }

  const documentKind =
    sections[0].kind === "gd_scene"
      ? "scene"
      : sections[0].kind === "gd_resource"
        ? "resource"
        : null;
  if (!documentKind) {
    throw new Error(`Unsupported Godot file: ${normalizeBundlePath(path)}.`);
  }

  const extResources = new Map<
    string,
    import("@/features/import-export/types").GodotExtResource
  >();
  const subResources = new Map<string, GodotSection>();
  const nodes: GodotNode[] = [];
  const normalizedPath = normalizeBundlePath(path);
  let rootNodeName: string | null = null;
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
      continue;
    }

    if (section.kind !== "node") {
      continue;
    }

    const name = section.attrs.name ?? "Node";
    const parent = section.attrs.parent ?? null;
    const resolvedParent =
      parent === null ? null : resolveGodotNodeParent(parent, rootNodeName);
    if (!resolvedParent) {
      rootNodeName = name;
    }
    const pathKey = resolvedParent ? `${resolvedParent}/${name}` : name;
    nodes.push({
      name,
      type: section.attrs.type ?? "Node",
      parent: resolvedParent,
      path: pathKey,
      properties: section.properties,
    });
  }

  return {
    kind: documentKind,
    path: normalizedPath,
    extResources,
    subResources,
    nodes,
    resourceSection,
  };
}

function getLinkedResourceKind(
  path: string,
): GodotImportMissingResource["kind"] {
  const normalizedPath = path.toLowerCase();
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
    return "External scene";
  }
  return "Godot resource";
}

export function createImportContext(
  entries: readonly ImportExportArchiveEntry[],
): GodotImportContext {
  return {
    providedEntries: new Map(
      entries.map((entry) => [normalizeBundlePath(entry.path), entry.data]),
    ),
    documentCache: new Map(),
    imageCache: new Map(),
    tilesetCache: new Map(),
  };
}

export function getDocument(
  context: GodotImportContext,
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

export function collectMissingResources(
  document: GodotDocument,
  context: GodotImportContext,
  missingResources: Map<string, GodotImportMissingResource>,
  visitedPaths: Set<string>,
) {
  if (visitedPaths.has(document.path)) {
    return;
  }
  visitedPaths.add(document.path);

  for (const resource of document.extResources.values()) {
    if (!getProvidedEntry(context.providedEntries, resource.resolvedPath)) {
      addMissingResource(
        missingResources,
        resource.resolvedPath,
        document.path,
      );
      continue;
    }

    if (resource.type === "TileSet" || resource.type === "PackedScene") {
      collectMissingResources(
        getDocument(context, resource.resolvedPath),
        context,
        missingResources,
        visitedPaths,
      );
      continue;
    }

    const resourceKind = getLinkedResourceKind(resource.resolvedPath);
    if (
      resourceKind === "tres" ||
      resourceKind === "res" ||
      resourceKind === "tscn"
    ) {
      collectMissingResources(
        getDocument(context, resource.resolvedPath),
        context,
        missingResources,
        visitedPaths,
      );
    }
  }
}

export function parseReference(
  rawValue: string | undefined,
): GodotResourceReference | null {
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
    kind: match[1] as GodotResourceReference["kind"],
    id: JSON.parse(`"${match[2]}"`) as string,
  };
}

export function parseNumber(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }
  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

export function parseBoolean(rawValue: string | undefined, fallback: boolean) {
  if (!rawValue) {
    return fallback;
  }
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return fallback;
}

export function parseVector(rawValue: string | undefined): GodotVector2 | null {
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

export function parseColorAlpha(rawValue: string | undefined) {
  if (!rawValue) {
    return 1;
  }

  const match = rawValue.match(
    /^Color\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/,
  );
  if (!match) {
    return 1;
  }

  const alpha = Number.parseFloat(match[4]);
  return Number.isFinite(alpha) ? alpha : 1;
}

export function parsePackedByteArray(rawValue: string | undefined) {
  if (!rawValue || rawValue === "PackedByteArray()") {
    return new Uint8Array();
  }

  const match = rawValue.match(/^PackedByteArray\((.*)\)$/);
  if (!match) {
    throw new Error("Invalid Godot PackedByteArray value.");
  }

  const values = match[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
  if (
    values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new Error("Invalid Godot PackedByteArray contents.");
  }

  return new Uint8Array(values);
}

export function parsePackedVector2Array(rawValue: string | undefined) {
  if (!rawValue || rawValue === "PackedVector2Array()") {
    return [] as GodotVector2[];
  }

  const match = rawValue.match(/^PackedVector2Array\((.*)\)$/);
  if (!match) {
    return [] as GodotVector2[];
  }

  const values = match[1]
    .split(",")
    .map((part) => Number.parseFloat(part.trim()))
    .filter((value) => Number.isFinite(value));
  const points: GodotVector2[] = [];

  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({
      x: values[index],
      y: values[index + 1],
    });
  }

  return points;
}

export function parseMetadata(node: GodotNode) {
  const metadata: Record<string, string> = {};

  for (const [key, value] of Object.entries(node.properties)) {
    if (!key.startsWith("metadata/")) {
      continue;
    }

    const metadataKey = key.slice("metadata/".length);
    metadata[metadataKey] = value;
  }

  return metadata;
}

export function getMetadataString(
  metadata: Record<string, string>,
  key: string,
) {
  const rawValue = metadata[key];
  if (!rawValue) {
    return undefined;
  }
  return parseGodotStringLiteral(rawValue);
}

export function getMetadataNumber(
  metadata: Record<string, string>,
  key: string,
) {
  const rawValue = metadata[key];
  if (!rawValue) {
    return undefined;
  }
  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) ? value : undefined;
}

export function getMetadataBoolean(
  metadata: Record<string, string>,
  key: string,
) {
  const rawValue = metadata[key];
  if (!rawValue) {
    return undefined;
  }
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return undefined;
}

export function parseStoredProperties(rawValue: string | undefined) {
  if (!rawValue) {
    return {} as Record<string, PropertyValue>;
  }

  try {
    const parsed = JSON.parse(parseGodotStringLiteral(rawValue)) as Record<
      string,
      PropertyValue
    >;
    if (!parsed || typeof parsed !== "object") {
      return {} as Record<string, PropertyValue>;
    }
    return parsed;
  } catch {
    return {} as Record<string, PropertyValue>;
  }
}

export function snapQuarterRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  const snapped = (Math.round(normalized / 90) * 90) % 360;
  return snapped as 0 | 90 | 180 | 270;
}

export function radiansToDegrees(rawValue: string | undefined) {
  return (parseNumber(rawValue, 0) * 180) / Math.PI;
}

export function coerceTileSize(tileSize: number) {
  if (!TILE_SIZES.includes(tileSize as TileSize)) {
    throw new Error(`Unsupported tile size in Godot import: ${tileSize}.`);
  }

  return tileSize as TileSize;
}

export async function getImportedImageAsset(
  context: GodotImportContext,
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

export function resolveExtResource(
  document: GodotDocument,
  reference: GodotResourceReference,
) {
  if (reference.kind !== "ExtResource") {
    return null;
  }

  return document.extResources.get(reference.id) ?? null;
}

export function getResourceOrientation(resource: GodotSection | null) {
  const tileShape = parseNumber(resource?.properties.tile_shape, 0);
  if (tileShape === 1) {
    return {
      orientation: "isometric" as MapOrientation,
    };
  }
  if (tileShape === 2 || tileShape === 3) {
    return {
      orientation: tileShape === 3 ? "hexagonal" : "staggered",
      staggerAxis:
        parseNumber(resource?.properties.tile_offset_axis, 0) === 1 ? "y" : "x",
      staggerIndex:
        parseNumber(resource?.properties.tile_layout, 0) === 1 ? "even" : "odd",
    } satisfies {
      orientation: MapOrientation;
      staggerAxis: MapStaggerAxis;
      staggerIndex: MapStaggerIndex;
    };
  }

  return {
    orientation: "orthogonal" as MapOrientation,
  };
}
