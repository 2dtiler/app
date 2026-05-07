import { decodeGodotAlternativeTile } from "@/features/import-export/lib/godot-scene-utils";
import { buildAutotileFromGodotTerrainProperties } from "@/features/import-export/lib/godot-terrain";
import { normalizeBundlePath } from "@/features/import-export/lib/tiled-xml-utils";
import {
  coerceTileSize,
  collectMissingResources,
  createImportContext,
  getDocument,
  getImportedImageAsset,
  getMetadataBoolean,
  getMetadataNumber,
  getMetadataString,
  getResourceOrientation,
  parseBoolean,
  parseColorAlpha,
  parseGodotStringLiteral,
  parseMetadata,
  parseNumber,
  parsePackedByteArray,
  parsePackedVector2Array,
  parseReference,
  parseStoredProperties,
  parseVector,
  radiansToDegrees,
  resolveExtResource,
  snapQuarterRotation,
} from "@/features/import-export/lib/godot-import-helpers";
import {
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";
import type {
  GodotDocument,
  GodotImportContext,
  GodotNode,
  GodotResourceReference,
  GodotSection,
  ResolvedTilesetResource,
  ResolvedTilesetSource,
} from "@/features/import-export/types";
import type {
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
} from "@/types";
import { TEXT_OBJECT_DEFAULTS, TEXT_OBJECT_PROPERTY_KEYS } from "@/types";

const GODOT_SCENE_IMPORT_ACCEPT = ".tscn,text/plain,application/octet-stream";
const IMPORT_MAP_GROUP_ID = "__godot-import-map-group__";
const IMPORT_TILESET_GROUP_ID = "__godot-import-tileset-group__";

async function resolveTilesetResource(
  context: GodotImportContext,
  document: GodotDocument,
  reference: GodotResourceReference,
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
      const autotile = buildAutotileFromGodotTerrainProperties(
        {
          imageHeight: importedImage.height,
          imageWidth: importedImage.width,
          tileSize,
        },
        resourceSection.properties,
        sourceSection.properties,
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
        ...(autotile ? { autotile } : {}),
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
