import { decodeGodotAlternativeTile } from "@/features/import-export/lib/godot-scene-utils";
import {
  getProvidedEntry,
  importImageAsset,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  normalizeBundlePath,
  resolveBundlePath,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";
import type {
  AssetId,
  GodotImportMissingResource,
  GodotImportWarning,
  GodotMapImportPreparationResult,
  GodotMapImportResult,
  ImportExportArchiveEntry,
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapObject,
  MapOrientation,
  MapStaggerAxis,
  MapStaggerIndex,
  ObjectId,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  TilesetGroupId,
  TileSize,
} from "@/types";
import {
  TEXT_OBJECT_DEFAULTS,
  TEXT_OBJECT_PROPERTY_KEYS,
  TILE_SIZES,
} from "@/types";

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

interface GodotNode {
  name: string;
  type: string;
  parent: string | null;
  path: string;
  properties: Record<string, string>;
}

interface GodotDocument {
  kind: "scene" | "resource";
  path: string;
  extResources: ReadonlyMap<string, GodotExtResource>;
  subResources: ReadonlyMap<string, GodotSection>;
  nodes: readonly GodotNode[];
  resourceSection: GodotSection | null;
}

interface ImportedImageAsset {
  assetId: AssetId;
  width: number;
  height: number;
}

interface ResolvedTilesetSource {
  sourceId: number;
  texturePath: string;
  tileSize: TileSize;
  tileset: Tileset;
}

interface ResolvedTilesetResource {
  key: string;
  tileSize: TileSize;
  orientation: MapOrientation;
  staggerAxis?: MapStaggerAxis;
  staggerIndex?: MapStaggerIndex;
  sources: ReadonlyMap<number, ResolvedTilesetSource>;
}

interface GodotImportContext {
  providedEntries: ReadonlyMap<string, Uint8Array>;
  documentCache: Map<string, GodotDocument>;
  imageCache: Map<string, Promise<ImportedImageAsset>>;
  tilesetCache: Map<string, Promise<ResolvedTilesetResource>>;
}

const GODOT_SCENE_IMPORT_ACCEPT = ".tscn,text/plain,application/octet-stream";
const IMPORT_MAP_GROUP_ID = "__godot-import-map-group__";
const IMPORT_TILESET_GROUP_ID = "__godot-import-tileset-group__";

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

function parseGodotStringLiteral(rawValue: string) {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue) as string;
  }

  return rawValue;
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

  const extResources = new Map<string, GodotExtResource>();
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

function resolveGodotResourcePath(fromPath: string, resourcePath: string) {
  if (resourcePath.startsWith("res://")) {
    return normalizeBundlePath(resourcePath.slice("res://".length));
  }

  return resolveBundlePath(fromPath, resourcePath);
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

function createImportContext(
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

function getDocument(context: GodotImportContext, path: string): GodotDocument {
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

function parseNumber(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }
  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function parseBoolean(rawValue: string | undefined, fallback: boolean) {
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

function parseColorAlpha(rawValue: string | undefined) {
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

function parsePackedByteArray(rawValue: string | undefined) {
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

function parsePackedVector2Array(rawValue: string | undefined) {
  if (!rawValue || rawValue === "PackedVector2Array()") {
    return [] as Array<{ x: number; y: number }>;
  }

  const match = rawValue.match(/^PackedVector2Array\((.*)\)$/);
  if (!match) {
    return [] as Array<{ x: number; y: number }>;
  }

  const values = match[1]
    .split(",")
    .map((part) => Number.parseFloat(part.trim()))
    .filter((value) => Number.isFinite(value));
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({
      x: values[index],
      y: values[index + 1],
    });
  }

  return points;
}

function parseMetadata(node: GodotNode) {
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

function getMetadataString(metadata: Record<string, string>, key: string) {
  const rawValue = metadata[key];
  if (!rawValue) {
    return undefined;
  }
  return parseGodotStringLiteral(rawValue);
}

function getMetadataNumber(metadata: Record<string, string>, key: string) {
  const rawValue = metadata[key];
  if (!rawValue) {
    return undefined;
  }
  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) ? value : undefined;
}

function getMetadataBoolean(metadata: Record<string, string>, key: string) {
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

function parseStoredProperties(rawValue: string | undefined) {
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

function snapQuarterRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  const snapped = (Math.round(normalized / 90) * 90) % 360;
  return snapped as 0 | 90 | 180 | 270;
}

function radiansToDegrees(rawValue: string | undefined) {
  return (parseNumber(rawValue, 0) * 180) / Math.PI;
}

function coerceTileSize(tileSize: number) {
  if (!TILE_SIZES.includes(tileSize as TileSize)) {
    throw new Error(`Unsupported tile size in Godot import: ${tileSize}.`);
  }

  return tileSize as TileSize;
}

async function getImportedImageAsset(
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

function resolveExtResource(
  document: GodotDocument,
  reference: { kind: "ExtResource" | "SubResource"; id: string },
) {
  if (reference.kind !== "ExtResource") {
    return null;
  }

  return document.extResources.get(reference.id) ?? null;
}

function getResourceOrientation(resource: GodotSection | null) {
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

async function resolveTilesetResource(
  context: GodotImportContext,
  document: GodotDocument,
  reference: { kind: "ExtResource" | "SubResource"; id: string },
) {
  const cacheKey = `${document.path}#${reference.kind}:${reference.id}`;
  const cached = context.tilesetCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<ResolvedTilesetResource> => {
    let resourceDocument = document;
    let resourceSection: GodotSection | null = null;

    if (reference.kind === "SubResource") {
      resourceSection = document.subResources.get(reference.id) ?? null;
    } else {
      const extResource = document.extResources.get(reference.id);
      if (!extResource) {
        throw new Error(`Missing Godot TileSet resource: ${reference.id}.`);
      }
      resourceDocument = getDocument(context, extResource.resolvedPath);
      resourceSection = resourceDocument.resourceSection;
    }

    if (!resourceSection) {
      throw new Error("Unsupported Godot TileSet resource.");
    }

    const orientation = getResourceOrientation(resourceSection);
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

    const sources = new Map<number, ResolvedTilesetSource>();
    const declaredTileSize = parseVector(
      resourceSection.properties.tile_size,
    )?.x;

    for (const entry of sourceEntries) {
      const sourceSection =
        resourceDocument.subResources.get(entry.sourceReference.id) ?? null;
      if (!sourceSection) {
        continue;
      }

      const textureReference = parseReference(sourceSection.properties.texture);
      if (!textureReference || textureReference.kind !== "ExtResource") {
        continue;
      }
      const textureResource = resolveExtResource(
        resourceDocument,
        textureReference,
      );
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
      const nameBase =
        textureResource.resolvedPath.split("/").pop() ??
        `Tileset ${entry.sourceId}`;
      const tileset: Tileset = {
        id: generateTilesetId(),
        name:
          sourceEntries.length > 1
            ? `${nameBase} ${entry.sourceId}`
            : nameBase.replace(/\.[^.]+$/, ""),
        groupId: IMPORT_TILESET_GROUP_ID as TilesetGroupId,
        tileSize,
        assetId: importedImage.assetId,
        imageWidth: importedImage.width,
        imageHeight: importedImage.height,
        createdAt: Date.now(),
      };

      sources.set(entry.sourceId, {
        sourceId: entry.sourceId,
        texturePath: textureResource.resolvedPath,
        tileSize,
        tileset,
      });
    }

    const fallbackTileSize =
      declaredTileSize ?? sources.values().next().value?.tileSize ?? 32;
    return {
      key: cacheKey,
      tileSize: coerceTileSize(Math.round(fallbackTileSize)),
      orientation: orientation.orientation,
      staggerAxis: orientation.staggerAxis,
      staggerIndex: orientation.staggerIndex,
      sources,
    };
  })();

  context.tilesetCache.set(cacheKey, promise);
  return promise;
}

function decodeTileMapData(rawValue: string | undefined) {
  const bytes = parsePackedByteArray(rawValue);
  if (bytes.length % 20 !== 0) {
    throw new Error("Invalid Godot TileMapLayer tile_map_data payload.");
  }

  const cells: Array<{
    x: number;
    y: number;
    sourceId: number;
    atlasX: number;
    atlasY: number;
    alternativeTile: number;
  }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = 0; offset < bytes.length; offset += 20) {
    cells.push({
      x: view.getInt32(offset, true),
      y: view.getInt32(offset + 4, true),
      sourceId: view.getInt32(offset + 8, true),
      atlasX: view.getInt16(offset + 12, true),
      atlasY: view.getInt16(offset + 14, true),
      alternativeTile: view.getInt32(offset + 16, true),
    });
  }

  return cells;
}

function appendWarning(
  warnings: GodotImportWarning[],
  warning: GodotImportWarning,
) {
  warnings.push(warning);
}

function createChildrenMap(nodes: readonly GodotNode[]) {
  const children = new Map<string, GodotNode[]>();

  for (const node of nodes) {
    const parentKey = node.parent ?? "";
    const existing = children.get(parentKey);
    if (existing) {
      existing.push(node);
      continue;
    }
    children.set(parentKey, [node]);
  }

  return children;
}

function createTextObjectProperties(text: string) {
  return {
    [TEXT_OBJECT_PROPERTY_KEYS.text]: {
      value: text,
      type: "string",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.size]: {
      value: String(TEXT_OBJECT_DEFAULTS.size),
      type: "int",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.rotation]: {
      value: String(TEXT_OBJECT_DEFAULTS.rotation),
      type: "float",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.font]: {
      value: TEXT_OBJECT_DEFAULTS.font,
      type: "string",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.wordWrap]: {
      value: TEXT_OBJECT_DEFAULTS.wordWrap ? "true" : "false",
      type: "bool",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.color]: {
      value: TEXT_OBJECT_DEFAULTS.color,
      type: "color",
    },
  } satisfies Record<string, PropertyValue>;
}

async function importGodotMap(
  rootDocument: GodotDocument,
  context: GodotImportContext,
): Promise<GodotMapImportResult> {
  if (rootDocument.kind !== "scene") {
    throw new Error("Godot map import expects a .tscn scene file.");
  }

  const rootNode = rootDocument.nodes.find((node) => node.parent === null);
  if (!rootNode) {
    throw new Error("Godot scene does not contain a root node.");
  }

  const warnings: GodotImportWarning[] = [];
  const childrenByParent = createChildrenMap(rootDocument.nodes);
  const layerGroups: LayerGroup[] = [];
  const layers: TileLayer[] = [];
  const imageLayers: ImageLayer[] = [];
  const objectLayers: ObjectLayer[] = [];
  const objects: MapObject[] = [];
  const tilesets: Tileset[] = [];
  const tilesetIdsByKey = new Map<string, string>();
  const metadata = parseMetadata(rootNode);
  let importedMapTileSize =
    getMetadataNumber(metadata, "2dtiler_tile_size") ?? 0;
  let importedOrientation = getMetadataString(
    metadata,
    "2dtiler_orientation",
  ) as MapOrientation | undefined;
  let importedStaggerAxis = getMetadataString(
    metadata,
    "2dtiler_stagger_axis",
  ) as MapStaggerAxis | undefined;
  let importedStaggerIndex = getMetadataString(
    metadata,
    "2dtiler_stagger_index",
  ) as MapStaggerIndex | undefined;
  let maxX = 0;
  let maxY = 0;

  const ensureTileset = async (
    resource: ResolvedTilesetResource,
    sourceId: number,
  ) => {
    const source = resource.sources.get(sourceId);
    if (!source) {
      return null;
    }

    const key = `${resource.key}:${sourceId}`;
    if (!tilesetIdsByKey.has(key)) {
      tilesetIdsByKey.set(key, source.tileset.id as string);
      tilesets.push(source.tileset);
    }
    if (!importedMapTileSize) {
      importedMapTileSize = source.tileSize;
    }
    if (!importedOrientation) {
      importedOrientation = resource.orientation;
      importedStaggerAxis = resource.staggerAxis;
      importedStaggerIndex = resource.staggerIndex;
    }
    return source.tileset;
  };

  const importObjectNode = (node: GodotNode, layerId: LayerId) => {
    const nodeMetadata = parseMetadata(node);
    const objectType =
      getMetadataString(nodeMetadata, "2dtiler_object_type") ??
      (node.type === "Marker2D"
        ? "point"
        : node.type === "Label"
          ? "text"
          : "polygon");
    const visible = parseBoolean(node.properties.visible, true);
    const locked = getMetadataBoolean(nodeMetadata, "2dtiler_locked") ?? false;
    const storedProperties = parseStoredProperties(
      nodeMetadata["2dtiler_properties"],
    );
    const objectId =
      (getMetadataString(nodeMetadata, "2dtiler_id") as ObjectId | undefined) ??
      generateObjectId();

    if (objectType === "point") {
      const position = parseVector(node.properties.position) ?? { x: 0, y: 0 };
      return {
        id: objectId,
        layerId,
        name: node.name,
        type: "point",
        x: position.x,
        y: position.y,
        width: 0,
        height: 0,
        rotation: 0,
        points: [],
        visible,
        locked,
        properties: storedProperties,
      } satisfies MapObject;
    }

    if (objectType === "text") {
      const left = parseNumber(node.properties.offset_left, 0);
      const top = parseNumber(node.properties.offset_top, 0);
      const right = parseNumber(
        node.properties.offset_right,
        left + TEXT_OBJECT_DEFAULTS.width,
      );
      const bottom = parseNumber(
        node.properties.offset_bottom,
        top + TEXT_OBJECT_DEFAULTS.height,
      );
      const text = parseGodotStringLiteral(node.properties.text ?? '""');
      return {
        id: objectId,
        layerId,
        name: node.name,
        type: "text",
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
        rotation: snapQuarterRotation(
          radiansToDegrees(node.properties.rotation),
        ),
        points: [],
        visible,
        locked,
        properties: {
          ...createTextObjectProperties(text),
          ...storedProperties,
        },
      } satisfies MapObject;
    }

    const position = parseVector(node.properties.position) ?? { x: 0, y: 0 };
    const polygon = parsePackedVector2Array(node.properties.polygon);
    const metadataWidth = getMetadataNumber(nodeMetadata, "2dtiler_width") ?? 0;
    const metadataHeight =
      getMetadataNumber(nodeMetadata, "2dtiler_height") ?? 0;
    const boundsWidth = Math.max(0, ...polygon.map((point) => point.x));
    const boundsHeight = Math.max(0, ...polygon.map((point) => point.y));
    return {
      id: objectId,
      layerId,
      name: node.name,
      type:
        objectType === "rectangle" ||
        objectType === "ellipse" ||
        objectType === "polygon"
          ? objectType
          : "polygon",
      x: position.x,
      y: position.y,
      width: metadataWidth || boundsWidth,
      height: metadataHeight || boundsHeight,
      rotation: snapQuarterRotation(radiansToDegrees(node.properties.rotation)),
      points: objectType === "polygon" ? polygon : [],
      visible,
      locked,
      properties: storedProperties,
    } satisfies MapObject;
  };

  const importObjectLayerNode = (node: GodotNode) => {
    const nodeMetadata = parseMetadata(node);
    const objectLayerId =
      (getMetadataString(nodeMetadata, "2dtiler_id") as LayerId | undefined) ??
      generateLayerId();
    const children = childrenByParent.get(node.path) ?? [];
    const objectOrder: ObjectId[] = [];

    for (const child of children) {
      if (!["Marker2D", "Polygon2D", "Label"].includes(child.type)) {
        appendWarning(warnings, {
          code: "unsupported-node-type",
          message: `Skipped unsupported Godot object node type: ${child.type}.`,
          nodePath: child.path,
        });
        continue;
      }

      const object = importObjectNode(child, objectLayerId);
      objectOrder.push(object.id);
      objects.push(object);
    }

    objectLayers.push({
      id: objectLayerId,
      mapId: rootNode.name as never,
      name: node.name,
      type: "object",
      visible: parseBoolean(node.properties.visible, true),
      locked: getMetadataBoolean(nodeMetadata, "2dtiler_locked") ?? false,
      objectOrder,
    });
    return objectLayerId;
  };

  const importTileLayerNode = async (node: GodotNode) => {
    const nodeMetadata = parseMetadata(node);
    const layerId =
      (getMetadataString(nodeMetadata, "2dtiler_id") as LayerId | undefined) ??
      generateLayerId();
    const layer: TileLayer = {
      id: layerId,
      mapId: rootNode.name as never,
      name: node.name,
      type: "tile",
      visible: parseBoolean(node.properties.visible, true),
      locked: getMetadataBoolean(nodeMetadata, "2dtiler_locked") ?? false,
      tiles: {},
    };
    const tileSetReference = parseReference(node.properties.tile_set);
    if (!tileSetReference) {
      appendWarning(warnings, {
        code: "unsupported-scene-tile-source",
        message: "Skipped TileMapLayer without a TileSet reference.",
        nodePath: node.path,
      });
      return null;
    }

    const tilesetResource = await resolveTilesetResource(
      context,
      rootDocument,
      tileSetReference,
    );
    const cells = decodeTileMapData(node.properties.tile_map_data);

    for (const cell of cells) {
      const tileset = await ensureTileset(tilesetResource, cell.sourceId);
      if (!tileset) {
        appendWarning(warnings, {
          code: "unsupported-scene-tile-source",
          message: `Skipped TileMapLayer cell for unsupported TileSet source ${cell.sourceId}.`,
          nodePath: node.path,
        });
        continue;
      }

      let transform: Pick<TileRef, "rotation" | "flipX" | "flipY">;
      try {
        transform = decodeGodotAlternativeTile(cell.alternativeTile);
      } catch {
        appendWarning(warnings, {
          code: "unsupported-tile-transform",
          message: "Skipped tile with unsupported Godot transform flags.",
          nodePath: node.path,
        });
        continue;
      }

      layer.tiles[`${cell.x},${cell.y}`] = {
        tilesetId: tileset.id,
        sx: cell.atlasX * tileset.tileSize,
        sy: cell.atlasY * tileset.tileSize,
        sw: tileset.tileSize,
        sh: tileset.tileSize,
        rotation: transform.rotation,
        flipX: transform.flipX,
        flipY: transform.flipY,
      };
      maxX = Math.max(maxX, cell.x + 1);
      maxY = Math.max(maxY, cell.y + 1);
    }

    layers.push(layer);
    return layerId;
  };

  const importImageLayerNode = async (node: GodotNode) => {
    const nodeMetadata = parseMetadata(node);
    const textureReference = parseReference(node.properties.texture);
    if (!textureReference || textureReference.kind !== "ExtResource") {
      appendWarning(warnings, {
        code: "unsupported-node-type",
        message: "Skipped Sprite2D without a texture reference.",
        nodePath: node.path,
      });
      return null;
    }

    const textureResource = resolveExtResource(rootDocument, textureReference);
    if (!textureResource) {
      return null;
    }

    const importedImage = await getImportedImageAsset(
      context,
      textureResource.resolvedPath,
    );
    const scale = parseVector(node.properties.scale) ?? { x: 1, y: 1 };
    const position = parseVector(node.properties.position) ?? { x: 0, y: 0 };
    const width =
      getMetadataNumber(nodeMetadata, "2dtiler_width") ??
      Math.abs(importedImage.width * scale.x);
    const height =
      getMetadataNumber(nodeMetadata, "2dtiler_height") ??
      Math.abs(importedImage.height * scale.y);
    const layerId =
      (getMetadataString(nodeMetadata, "2dtiler_id") as LayerId | undefined) ??
      generateLayerId();

    imageLayers.push({
      id: layerId,
      mapId: rootNode.name as never,
      name: node.name,
      type: "image",
      visible: parseBoolean(node.properties.visible, true),
      locked: getMetadataBoolean(nodeMetadata, "2dtiler_locked") ?? false,
      assetId: importedImage.assetId,
      x: position.x,
      y: position.y,
      width,
      height,
      rotation: snapQuarterRotation(radiansToDegrees(node.properties.rotation)),
      flipX: parseBoolean(node.properties.flip_h, false) || scale.x < 0,
      flipY: parseBoolean(node.properties.flip_v, false) || scale.y < 0,
      opacity: Math.round(parseColorAlpha(node.properties.modulate) * 100),
    });

    return layerId;
  };

  const importLayerTree = async (parentPath: string) => {
    const childIds: Array<LayerId | LayerGroupId> = [];
    const children = childrenByParent.get(parentPath) ?? [];

    for (const child of children) {
      const childMetadata = parseMetadata(child);
      const kind = getMetadataString(childMetadata, "2dtiler_kind");

      if (child.type === "TileMapLayer") {
        const layerId = await importTileLayerNode(child);
        if (layerId) {
          childIds.push(layerId);
        }
        continue;
      }

      if (child.type === "Sprite2D") {
        const layerId = await importImageLayerNode(child);
        if (layerId) {
          childIds.push(layerId);
        }
        continue;
      }

      if (child.type === "Node2D" && kind === "object-layer") {
        childIds.push(importObjectLayerNode(child));
        continue;
      }

      if (child.type === "Node2D") {
        const groupId =
          (getMetadataString(childMetadata, "2dtiler_id") as
            | LayerGroupId
            | undefined) ?? generateLayerGroupId();
        const nestedChildOrder = await importLayerTree(child.path);
        layerGroups.push({
          id: groupId,
          mapId: rootNode.name as never,
          name: child.name,
          visible: parseBoolean(child.properties.visible, true),
          locked: getMetadataBoolean(childMetadata, "2dtiler_locked") ?? false,
          expanded:
            getMetadataBoolean(childMetadata, "2dtiler_expanded") ?? true,
          childOrder: nestedChildOrder,
        });
        childIds.push(groupId);
        continue;
      }

      appendWarning(warnings, {
        code: "unsupported-node-type",
        message: `Skipped unsupported Godot node type: ${child.type}.`,
        nodePath: child.path,
      });
    }

    return childIds;
  };

  const layerOrder = await importLayerTree(rootNode.path);
  const mapId =
    (getMetadataString(metadata, "2dtiler_id") as
      | TileMapData["id"]
      | undefined) ?? generateMapId();
  const mapTileSize = coerceTileSize(Math.round(importedMapTileSize || 32));
  const widthInTiles =
    getMetadataNumber(metadata, "2dtiler_width_in_tiles") ?? Math.max(1, maxX);
  const heightInTiles =
    getMetadataNumber(metadata, "2dtiler_height_in_tiles") ?? Math.max(1, maxY);
  const map: TileMapData = {
    id: mapId,
    name: rootNode.name,
    groupId: IMPORT_MAP_GROUP_ID as never,
    orientation: importedOrientation ?? "orthogonal",
    staggerAxis: importedStaggerAxis,
    staggerIndex: importedStaggerIndex,
    widthInTiles: Math.max(1, Math.round(widthInTiles)),
    heightInTiles: Math.max(1, Math.round(heightInTiles)),
    tileSize: mapTileSize,
    properties: parseStoredProperties(metadata["2dtiler_properties"]),
    layerOrder,
    createdAt: Date.now(),
  };

  for (const layer of layers) {
    layer.mapId = map.id;
  }
  for (const layerGroup of layerGroups) {
    layerGroup.mapId = map.id;
  }
  for (const imageLayer of imageLayers) {
    imageLayer.mapId = map.id;
  }
  for (const objectLayer of objectLayers) {
    objectLayer.mapId = map.id;
  }

  return {
    map,
    layers,
    tilesets,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
    warnings,
  };
}

export async function prepareGodotMapImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<GodotMapImportPreparationResult> {
  const context = createImportContext(entries);
  const normalizedRootPath = normalizeBundlePath(rootPath);
  const rootDocument = getDocument(context, normalizedRootPath);
  if (rootDocument.kind !== "scene") {
    throw new Error("Select a Godot 4 scene file (.tscn) to import a map.");
  }

  const missingResources = new Map<string, GodotImportMissingResource>();
  collectMissingResources(rootDocument, context, missingResources, new Set());

  if (missingResources.size > 0) {
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources: [...missingResources.values()],
    };
  }

  return {
    status: "ready",
    result: await importGodotMap(rootDocument, context),
  };
}

export { GODOT_SCENE_IMPORT_ACCEPT };
