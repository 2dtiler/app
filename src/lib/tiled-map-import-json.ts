import {
  getDefaultTextObjectProperties,
  normalizeTextObject,
} from "@/lib/text-objects";
import {
  decodeText,
  normalizeBundlePath,
  parseXmlDocument,
  resolveBundlePath,
  stripExtension,
} from "@/lib/tiled-xml-utils";
import {
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/lib/ids";
import {
  addMissingResource,
  awaitImportImage,
  buildTilesFromGids,
  createSyntheticObjectIdMap,
  decodeJsonLayerData,
  getProvidedEntry,
  IMAGE_FLIP_X_PROPERTY_KEY,
  IMAGE_FLIP_Y_PROPERTY_KEY,
  IMAGE_HEIGHT_PROPERTY_KEY,
  IMAGE_ROTATION_PROPERTY_KEY,
  IMAGE_WIDTH_PROPERTY_KEY,
  importImageAsset,
  LOCKED_PROPERTY_KEY,
  MAP_NAME_PROPERTY_KEY,
  parseJsonProperties,
  parsePropertiesWithObjectRefs,
  pullProperty,
  readBooleanProperty,
  readNumberProperty,
  requireProvidedEntry,
  validateTiledOrientation,
  EXPANDED_PROPERTY_KEY,
} from "@/lib/tiled-map-import-shared";
import type {
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TileSize,
  Tileset,
  TiledImportMissingResource,
  TiledJsonGroupLayer,
  TiledJsonImageLayer,
  TiledJsonLayer,
  TiledJsonMap,
  TiledJsonObject,
  TiledJsonObjectLayer,
  TiledJsonTileLayer,
  TiledJsonTileset,
  TiledMapFormat,
  TiledMapImportResult,
} from "@/types";

function unwrapTiledJavaScriptMap(data: Uint8Array, label: string) {
  const contents = decodeText(data);
  const trimmedContents = contents.trimStart();

  if (trimmedContents.startsWith("{")) {
    return trimmedContents;
  }

  const objectStartIndex = contents.indexOf("\n{");
  if (objectStartIndex <= 0) {
    throw new Error(`Invalid ${label} JavaScript wrapper.`);
  }

  let jsonPayload = contents.slice(objectStartIndex + 1).trim();
  if (jsonPayload.endsWith(";")) {
    jsonPayload = jsonPayload.slice(0, -1).trimEnd();
  }
  if (jsonPayload.endsWith(")")) {
    jsonPayload = jsonPayload.slice(0, -1).trimEnd();
  }

  return jsonPayload;
}

function parseTiledJsonFile<T>(
  data: Uint8Array,
  label: string,
  format: Extract<TiledMapFormat, "json" | "js" | "lua"> = "json",
) {
  try {
    const parsed = JSON.parse(
      format === "js"
        ? unwrapTiledJavaScriptMap(data, label)
        : decodeText(data),
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid JSON document.");
    }
    return parsed as T;
  } catch {
    throw new Error(`Invalid ${label} JSON document.`);
  }
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

function getJsonLikeFormatLabel(
  format: Extract<TiledMapFormat, "json" | "js" | "lua">,
) {
  if (format === "js") {
    return "Tiled JavaScript";
  }
  if (format === "lua") {
    return "Tiled Lua";
  }
  return "Tiled JSON";
}

function parseExternalXmlTilesetFile(data: Uint8Array, path: string) {
  const document = parseXmlDocument(decodeText(data));
  const tilesetElement = document.documentElement;
  if (tilesetElement.tagName !== "tileset") {
    throw new Error(`Invalid TSX tileset file: ${path}.`);
  }

  return tilesetElement;
}

function collectJsonTilesetImageDependency(
  tileset: TiledJsonTileset,
  entryPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources: Map<string, TiledImportMissingResource>,
) {
  if (!tileset.image) {
    return;
  }

  const resolvedImagePath = resolveBundlePath(entryPath, tileset.image);
  if (!getProvidedEntry(providedEntries, resolvedImagePath)) {
    addMissingResource(missingResources, resolvedImagePath, "image", entryPath);
  }
}

function collectExternalJsonTilesetDependencies(
  tilesetPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources: Map<string, TiledImportMissingResource>,
  visitedTilesets: Set<string>,
) {
  const normalizedTilesetPath = normalizeBundlePath(tilesetPath);
  if (visitedTilesets.has(normalizedTilesetPath)) {
    return;
  }
  visitedTilesets.add(normalizedTilesetPath);

  const tilesetData = getProvidedEntry(providedEntries, normalizedTilesetPath);
  if (!tilesetData) {
    addMissingResource(
      missingResources,
      normalizedTilesetPath,
      getExternalTilesetKind(normalizedTilesetPath),
      normalizedTilesetPath,
    );
    return;
  }

  if (getExternalTilesetKind(normalizedTilesetPath) === "tsx") {
    const tilesetElement = parseExternalXmlTilesetFile(
      tilesetData,
      normalizedTilesetPath,
    );
    const imageSource = tilesetElement
      .querySelector(":scope > image")
      ?.getAttribute("source");
    if (!imageSource) {
      return;
    }

    const resolvedImagePath = resolveBundlePath(
      normalizedTilesetPath,
      imageSource,
    );
    if (!getProvidedEntry(providedEntries, resolvedImagePath)) {
      addMissingResource(
        missingResources,
        resolvedImagePath,
        "image",
        normalizedTilesetPath,
      );
    }
    return;
  }

  const tileset = parseTiledJsonFile<TiledJsonTileset>(
    tilesetData,
    "Tiled JSON tileset",
  );
  collectJsonTilesetImageDependency(
    tileset,
    normalizedTilesetPath,
    providedEntries,
    missingResources,
  );
}

function collectJsonLayerDependencies(
  layers: readonly TiledJsonLayer[],
  tmjPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources: Map<string, TiledImportMissingResource>,
) {
  for (const layer of layers) {
    if (layer.type === "group") {
      collectJsonLayerDependencies(
        layer.layers ?? [],
        tmjPath,
        providedEntries,
        missingResources,
      );
      continue;
    }

    if (layer.type !== "imagelayer" || !layer.image) {
      continue;
    }

    const resolvedImagePath = resolveBundlePath(tmjPath, layer.image);
    if (!getProvidedEntry(providedEntries, resolvedImagePath)) {
      addMissingResource(missingResources, resolvedImagePath, "image", tmjPath);
    }
  }
}

export function collectMissingTiledJsonMapResources(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  format: Extract<TiledMapFormat, "json" | "js" | "lua"> = "json",
) {
  const tmjPath = normalizeBundlePath(rootPath);
  const mapDocument = parseTiledJsonFile<TiledJsonMap>(
    requireProvidedEntry(providedEntries, tmjPath),
    `${getJsonLikeFormatLabel(format)} map`,
    format,
  );

  const missingResources = new Map<string, TiledImportMissingResource>();
  const visitedTilesets = new Set<string>();

  for (const tileset of mapDocument.tilesets ?? []) {
    if (tileset.source) {
      const resolvedTilesetPath = resolveBundlePath(tmjPath, tileset.source);
      const tilesetEntry = getProvidedEntry(
        providedEntries,
        resolvedTilesetPath,
      );
      if (!tilesetEntry) {
        addMissingResource(
          missingResources,
          resolvedTilesetPath,
          getExternalTilesetKind(resolvedTilesetPath),
          tmjPath,
        );
        continue;
      }

      collectExternalJsonTilesetDependencies(
        resolvedTilesetPath,
        providedEntries,
        missingResources,
        visitedTilesets,
      );
      continue;
    }

    collectJsonTilesetImageDependency(
      tileset,
      tmjPath,
      providedEntries,
      missingResources,
    );
  }

  collectJsonLayerDependencies(
    mapDocument.layers ?? [],
    tmjPath,
    providedEntries,
    missingResources,
  );

  return [...missingResources.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

async function parseJsonTileset(
  tileset: TiledJsonTileset,
  entryPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const source = tileset.source;
  const firstGid = Number(tileset.firstgid ?? 1);
  const tilesetPath = source ? resolveBundlePath(entryPath, source) : entryPath;
  if (source && getExternalTilesetKind(tilesetPath) === "tsx") {
    const tilesetElement = parseExternalXmlTilesetFile(
      requireProvidedEntry(providedEntries, tilesetPath),
      tilesetPath,
    );
    const tileWidth = Number(tilesetElement.getAttribute("tilewidth") ?? "0");
    const tileHeight = Number(tilesetElement.getAttribute("tileheight") ?? "0");
    if (tileWidth <= 0 || tileWidth !== tileHeight) {
      throw new Error("Only square TSX tilesets are supported.");
    }

    const margin = Number(tilesetElement.getAttribute("margin") ?? "0");
    const spacing = Number(tilesetElement.getAttribute("spacing") ?? "0");
    if (margin !== 0 || spacing !== 0) {
      throw new Error("TSX tilesets with margin or spacing are not supported.");
    }

    const imageElement = tilesetElement.querySelector(":scope > image");
    if (!imageElement) {
      throw new Error("Only image-based TSX tilesets are supported.");
    }

    const imageSource = imageElement.getAttribute("source");
    if (!imageSource) {
      throw new Error("Embedded TSX image data is not supported.");
    }

    const resolvedImagePath = resolveBundlePath(tilesetPath, imageSource);
    const importedImage = await importImageAsset(
      resolvedImagePath,
      requireProvidedEntry(providedEntries, resolvedImagePath),
    );

    return {
      firstGid,
      tileset: {
        id: generateTilesetId(),
        name:
          tilesetElement.getAttribute("name") ??
          stripExtension(resolvedImagePath),
        groupId: "tmx-import" as Tileset["groupId"],
        tileSize: tileWidth as TileSize,
        assetId: importedImage.assetId,
        imageWidth:
          Number(imageElement.getAttribute("width") ?? importedImage.width) ||
          importedImage.width,
        imageHeight:
          Number(imageElement.getAttribute("height") ?? importedImage.height) ||
          importedImage.height,
        createdAt: Date.now(),
      },
    };
  }

  const tilesetEntry = source
    ? parseTiledJsonFile<TiledJsonTileset>(
        requireProvidedEntry(providedEntries, tilesetPath),
        "Tiled JSON tileset",
      )
    : tileset;

  const tileWidth = Number(tilesetEntry.tilewidth ?? 0);
  const tileHeight = Number(tilesetEntry.tileheight ?? 0);
  if (tileWidth <= 0 || tileWidth !== tileHeight) {
    throw new Error("Only square Tiled JSON tilesets are supported.");
  }

  const margin = Number(tilesetEntry.margin ?? 0);
  const spacing = Number(tilesetEntry.spacing ?? 0);
  if (margin !== 0 || spacing !== 0) {
    throw new Error(
      "Tiled JSON tilesets with margin or spacing are not supported.",
    );
  }

  const imageSource = tilesetEntry.image;
  if (!imageSource) {
    throw new Error("Only image-based Tiled JSON tilesets are supported.");
  }

  const resolvedImagePath = resolveBundlePath(tilesetPath, imageSource);
  const importedImage = await importImageAsset(
    resolvedImagePath,
    requireProvidedEntry(providedEntries, resolvedImagePath),
  );

  return {
    firstGid,
    tileset: {
      id: generateTilesetId(),
      name: tilesetEntry.name ?? stripExtension(resolvedImagePath),
      groupId: "tmx-import" as Tileset["groupId"],
      tileSize: tileWidth as TileSize,
      assetId: importedImage.assetId,
      imageWidth:
        Number(tilesetEntry.imagewidth ?? importedImage.width) ||
        importedImage.width,
      imageHeight:
        Number(tilesetEntry.imageheight ?? importedImage.height) ||
        importedImage.height,
      createdAt: Date.now(),
    },
  };
}

function getJsonObjectType(object: TiledJsonObject) {
  if (object.text) {
    return "text";
  }
  if (object.ellipse) {
    return "ellipse";
  }
  if (object.point) {
    return "point";
  }
  if (object.polygon || object.polyline) {
    return "polygon";
  }
  return "rectangle";
}

function getJsonObjectPoints(object: TiledJsonObject) {
  const sourcePoints = object.polygon ?? object.polyline ?? [];
  return sourcePoints.map((point) => ({
    x: Number(point.x ?? 0),
    y: Number(point.y ?? 0),
  }));
}

function isJsonGroupLayer(layer: TiledJsonLayer): layer is TiledJsonGroupLayer {
  return layer.type === "group";
}

function isJsonTileLayer(layer: TiledJsonLayer): layer is TiledJsonTileLayer {
  return layer.type === "tilelayer";
}

function isJsonImageLayer(layer: TiledJsonLayer): layer is TiledJsonImageLayer {
  return layer.type === "imagelayer";
}

function isJsonObjectLayer(
  layer: TiledJsonLayer,
): layer is TiledJsonObjectLayer {
  return layer.type === "objectgroup";
}

export async function importTiledJsonMapEntries(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  format: Extract<TiledMapFormat, "json" | "js" | "lua"> = "json",
): Promise<TiledMapImportResult> {
  const tmjPath = normalizeBundlePath(rootPath);
  const mapDocument = parseTiledJsonFile<TiledJsonMap>(
    requireProvidedEntry(providedEntries, tmjPath),
    `${getJsonLikeFormatLabel(format)} map`,
    format,
  );

  if (mapDocument.type && mapDocument.type !== "map") {
    throw new Error(
      `${getJsonLikeFormatLabel(format)} file does not contain a valid map object.`,
    );
  }
  if (mapDocument.infinite) {
    throw new Error(
      `Infinite ${getJsonLikeFormatLabel(format)} maps are not supported.`,
    );
  }

  const tileWidth = Number(mapDocument.tilewidth ?? 0);
  const tileHeight = Number(mapDocument.tileheight ?? 0);
  if (tileWidth <= 0 || tileWidth !== tileHeight) {
    throw new Error(
      `Only square ${getJsonLikeFormatLabel(format)} maps are supported.`,
    );
  }

  const mapWidth = Number(mapDocument.width ?? 0);
  const mapHeight = Number(mapDocument.height ?? 0);
  const orientation = validateTiledOrientation(
    mapDocument.orientation ?? "orthogonal",
    getJsonLikeFormatLabel(format),
  );

  const rawMapProperties = parseJsonProperties(mapDocument.properties);
  const mapName =
    pullProperty(rawMapProperties, MAP_NAME_PROPERTY_KEY)?.value ??
    stripExtension(tmjPath);
  const mapId = generateMapId();
  const tilesetEntries = await Promise.all(
    (mapDocument.tilesets ?? []).map((tileset) =>
      parseJsonTileset(tileset, tmjPath, providedEntries),
    ),
  );
  const orderedTilesets = [...tilesetEntries].sort(
    (left, right) => left.firstGid - right.firstGid,
  );

  const layerGroups: LayerGroup[] = [];
  const tileLayers: TileLayer[] = [];
  const imageLayers: ImageLayer[] = [];
  const objectLayers: ObjectLayer[] = [];
  const objects: MapObject[] = [];
  const objectIdBySourceId = new Map<string, string>();

  async function parseLayerChildren(layers: readonly TiledJsonLayer[]) {
    const childOrder: (LayerId | LayerGroupId)[] = [];

    for (const layer of layers) {
      if (isJsonGroupLayer(layer)) {
        const groupProperties = parseJsonProperties(layer.properties);
        const groupId = generateLayerGroupId();
        const group: LayerGroup = {
          id: groupId,
          mapId,
          name: layer.name ?? "Group",
          visible: layer.visible !== false,
          locked: readBooleanProperty(
            groupProperties,
            LOCKED_PROPERTY_KEY,
            false,
          ),
          expanded: readBooleanProperty(
            groupProperties,
            EXPANDED_PROPERTY_KEY,
            true,
          ),
          childOrder: await parseLayerChildren(layer.layers ?? []),
        };
        layerGroups.push(group);
        childOrder.push(group.id);
        continue;
      }

      if (isJsonTileLayer(layer)) {
        const layerProperties = parseJsonProperties(layer.properties);
        const layerId = generateLayerId();
        const gids = decodeJsonLayerData(
          layer.encoding,
          layer.compression,
          layer.data,
          {
            widthInTiles: mapWidth,
            heightInTiles: mapHeight,
          },
        );

        tileLayers.push({
          id: layerId,
          mapId,
          name: layer.name ?? "Layer",
          visible: layer.visible !== false,
          locked: readBooleanProperty(
            layerProperties,
            LOCKED_PROPERTY_KEY,
            false,
          ),
          tiles: buildTilesFromGids(
            gids,
            mapWidth,
            orderedTilesets,
            orientation,
          ),
        });
        childOrder.push(layerId);
        continue;
      }

      if (isJsonImageLayer(layer)) {
        const source = layer.image;
        if (!source) {
          throw new Error(
            "Tiled JSON image layer is missing its source image.",
          );
        }

        const imageProperties = parseJsonProperties(layer.properties);
        const resolvedImagePath = resolveBundlePath(tmjPath, source);
        const importedImage = await awaitImportImage(
          resolvedImagePath,
          providedEntries,
        );
        const layerId = generateLayerId();

        imageLayers.push({
          id: layerId,
          mapId,
          name: layer.name ?? "Image Layer",
          type: "image",
          visible: layer.visible !== false,
          locked: readBooleanProperty(
            imageProperties,
            LOCKED_PROPERTY_KEY,
            false,
          ),
          assetId: importedImage.assetId,
          x: Number(layer.offsetx ?? layer.x ?? 0),
          y: Number(layer.offsety ?? layer.y ?? 0),
          width: readNumberProperty(
            imageProperties,
            IMAGE_WIDTH_PROPERTY_KEY,
            importedImage.width,
          ),
          height: readNumberProperty(
            imageProperties,
            IMAGE_HEIGHT_PROPERTY_KEY,
            importedImage.height,
          ),
          rotation: readNumberProperty(
            imageProperties,
            IMAGE_ROTATION_PROPERTY_KEY,
            0,
          ) as ImageLayer["rotation"],
          flipX: readBooleanProperty(
            imageProperties,
            IMAGE_FLIP_X_PROPERTY_KEY,
            false,
          ),
          flipY: readBooleanProperty(
            imageProperties,
            IMAGE_FLIP_Y_PROPERTY_KEY,
            false,
          ),
          opacity: Math.round(Number(layer.opacity ?? 1) * 100),
        });
        childOrder.push(layerId);
        continue;
      }

      if (!isJsonObjectLayer(layer)) {
        continue;
      }

      const objectLayerProperties = parseJsonProperties(layer.properties);
      const layerId = generateLayerId();
      const objectOrder: ObjectLayer["objectOrder"] = [];

      for (const objectEntry of layer.objects ?? []) {
        const rawProperties = parseJsonProperties(objectEntry.properties);
        const objectId = generateObjectId();
        const sourceObjectId = String(objectEntry.id ?? objectId);
        objectIdBySourceId.set(sourceObjectId, objectId);
        objectOrder.push(objectId);

        if (objectEntry.gid !== undefined) {
          throw new Error("Tiled JSON tile objects are not supported.");
        }

        const objectType = getJsonObjectType(objectEntry);
        const object: MapObject = {
          id: objectId,
          layerId,
          name: objectEntry.name ?? objectType,
          type: objectType,
          x: Number(objectEntry.x ?? 0),
          y: Number(objectEntry.y ?? 0),
          width: Number(objectEntry.width ?? 0),
          height: Number(objectEntry.height ?? 0),
          rotation: Number(objectEntry.rotation ?? 0),
          points: getJsonObjectPoints(objectEntry),
          visible: objectEntry.visible !== false,
          locked: readBooleanProperty(
            rawProperties,
            LOCKED_PROPERTY_KEY,
            false,
          ),
          properties: rawProperties,
        };

        if (objectEntry.text) {
          object.properties = {
            ...object.properties,
            ...getDefaultTextObjectProperties({
              text: objectEntry.text.text ?? "",
              size: Number(objectEntry.text.pixelsize ?? 16),
              rotation: object.rotation,
              font: objectEntry.text.fontfamily ?? "sans-serif",
              wordWrap: objectEntry.text.wrap ?? true,
              color: objectEntry.text.color ?? "#000000",
            }),
          };
          normalizeTextObject(object);
        }

        objects.push(object);
      }

      objectLayers.push({
        id: layerId,
        mapId,
        name: layer.name ?? "Objects",
        type: "object",
        visible: layer.visible !== false,
        locked: readBooleanProperty(
          objectLayerProperties,
          LOCKED_PROPERTY_KEY,
          false,
        ),
        objectOrder,
      });
      childOrder.push(layerId);
    }

    return childOrder;
  }

  const layerOrder = await parseLayerChildren(mapDocument.layers ?? []);
  const resolvedObjectIdMap = createSyntheticObjectIdMap(objects);

  for (const object of objects) {
    object.properties = parsePropertiesWithObjectRefs(
      object.properties,
      objectIdBySourceId,
      resolvedObjectIdMap,
    );
  }

  const mapProperties = parsePropertiesWithObjectRefs(
    rawMapProperties,
    objectIdBySourceId,
    resolvedObjectIdMap,
  );

  return {
    map: {
      id: mapId,
      name: mapName,
      groupId: "tmx-import" as TileMapData["groupId"],
      orientation,
      staggerAxis:
        orientation === "hexagonal" || orientation === "staggered"
          ? ((mapDocument.staggeraxis ?? "x") as TileMapData["staggerAxis"])
          : undefined,
      staggerIndex:
        orientation === "hexagonal" || orientation === "staggered"
          ? ((mapDocument.staggerindex ?? "odd") as TileMapData["staggerIndex"])
          : undefined,
      widthInTiles: mapWidth,
      heightInTiles: mapHeight,
      tileSize: tileWidth as TileSize,
      properties: mapProperties,
      layerOrder,
      createdAt: Date.now(),
    },
    layers: tileLayers,
    tilesets: orderedTilesets.map((entry) => entry.tileset),
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
  };
}
