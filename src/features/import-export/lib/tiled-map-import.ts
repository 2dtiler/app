import {
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";
import {
  getDefaultTextObjectProperties,
  normalizeTextObject,
} from "@/features/map-editor/lib/text-objects";
import {
  decodeText,
  normalizeBundlePath,
  parseXmlDocument,
  resolveBundlePath,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  addMissingResource,
  awaitImportImage,
  buildEntryMap,
  buildTilesFromGids,
  createSyntheticObjectIdMap,
  decodeXmlLayerData,
  EXPANDED_PROPERTY_KEY,
  getProvidedEntry,
  IMAGE_FLIP_X_PROPERTY_KEY,
  IMAGE_FLIP_Y_PROPERTY_KEY,
  IMAGE_HEIGHT_PROPERTY_KEY,
  IMAGE_ROTATION_PROPERTY_KEY,
  IMAGE_WIDTH_PROPERTY_KEY,
  importTiledTilesetImageAsset,
  LOCKED_PROPERTY_KEY,
  MAP_NAME_PROPERTY_KEY,
  parsePropertiesWithObjectRefs,
  parseXmlProperties as parseProperties,
  pullProperty,
  readBooleanProperty,
  readNumberProperty,
  requireProvidedEntry,
  validateTiledOrientation,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  buildAutotileFromTiledWangSets,
  readTiledXmlWangSets,
} from "@/features/import-export/lib/tiled-wang";
import {
  collectMissingTiledJsonMapResources,
  importTiledJsonMapEntries,
} from "@/features/import-export/lib/tiled-map-import-json";
import { prepareTiledLuaMapImport } from "@/features/import-export/lib/tiled-map-import-lua";
import { readXmlTilesetAnimationConfig } from "@/features/import-export/lib/tiled-animation-conversion";
import type {
  ImportExportArchiveEntry,
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapObject,
  ObjectLayer,
  TileLayer,
  TiledMapFormat,
  TileMapData,
  TileSize,
  Tileset,
  TiledImportMissingResource,
  TiledMapImportPreparationResult,
  TiledMapImportResult,
} from "@/types";
function collectTilesetImageDependency(
  tilesetElement: Element,
  entryPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources: Map<string, TiledImportMissingResource>,
) {
  const imageElement = tilesetElement.querySelector(":scope > image");
  const imageSource = imageElement?.getAttribute("source");
  if (!imageSource) {
    return;
  }

  const resolvedImagePath = resolveBundlePath(entryPath, imageSource);
  if (!getProvidedEntry(providedEntries, resolvedImagePath)) {
    addMissingResource(missingResources, resolvedImagePath, "image", entryPath);
  }
}

function collectExternalTilesetDependencies(
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
      "tsx",
      normalizedTilesetPath,
    );
    return;
  }

  const document = parseXmlDocument(decodeText(tilesetData));
  if (document.documentElement.tagName !== "tileset") {
    throw new Error(
      "TMX tileset source does not contain a valid tileset element.",
    );
  }

  collectTilesetImageDependency(
    document.documentElement,
    normalizedTilesetPath,
    providedEntries,
    missingResources,
  );
}

function collectLayerDependencies(
  parent: Element,
  tmxPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources: Map<string, TiledImportMissingResource>,
) {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === "group") {
      collectLayerDependencies(
        child,
        tmxPath,
        providedEntries,
        missingResources,
      );
      continue;
    }

    if (child.tagName !== "imagelayer") {
      continue;
    }

    const imageSource = child
      .querySelector(":scope > image")
      ?.getAttribute("source");
    if (!imageSource) {
      continue;
    }

    const resolvedImagePath = resolveBundlePath(tmxPath, imageSource);
    if (!getProvidedEntry(providedEntries, resolvedImagePath)) {
      addMissingResource(missingResources, resolvedImagePath, "image", tmxPath);
    }
  }
}

function collectMissingTiledMapResources(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const tmxPath = normalizeBundlePath(rootPath);
  const document = parseXmlDocument(
    decodeText(requireProvidedEntry(providedEntries, tmxPath)),
  );
  const mapElement = document.documentElement;

  if (mapElement.tagName !== "map") {
    throw new Error("TMX file does not contain a valid map element.");
  }

  const missingResources = new Map<string, TiledImportMissingResource>();
  const visitedTilesets = new Set<string>();

  for (const child of Array.from(mapElement.children)) {
    if (child.tagName !== "tileset") {
      continue;
    }

    const source = child.getAttribute("source");
    if (source) {
      const resolvedTilesetPath = resolveBundlePath(tmxPath, source);
      const tilesetEntry = getProvidedEntry(
        providedEntries,
        resolvedTilesetPath,
      );
      if (!tilesetEntry) {
        addMissingResource(
          missingResources,
          resolvedTilesetPath,
          "tsx",
          tmxPath,
        );
        continue;
      }

      collectExternalTilesetDependencies(
        resolvedTilesetPath,
        providedEntries,
        missingResources,
        visitedTilesets,
      );
      continue;
    }

    collectTilesetImageDependency(
      child,
      tmxPath,
      providedEntries,
      missingResources,
    );
  }

  collectLayerDependencies(
    mapElement,
    tmxPath,
    providedEntries,
    missingResources,
  );

  return [...missingResources.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

async function parseTilesetElement(
  element: Element,
  entryPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const source = element.getAttribute("source");
  const firstGid = Number(element.getAttribute("firstgid") ?? "1");
  const tilesetDocument = source
    ? parseXmlDocument(
        decodeText(
          requireProvidedEntry(
            providedEntries,
            resolveBundlePath(entryPath, source),
          ),
        ),
      )
    : element.ownerDocument;
  const tilesetElement = source ? tilesetDocument.documentElement : element;
  const tilesetPath = source ? resolveBundlePath(entryPath, source) : entryPath;

  const tileWidth = Number(tilesetElement.getAttribute("tilewidth") ?? "0");
  const tileHeight = Number(tilesetElement.getAttribute("tileheight") ?? "0");
  if (tileWidth <= 0 || tileWidth !== tileHeight) {
    throw new Error("Only square TMX tilesets are supported.");
  }
  const margin = Number(tilesetElement.getAttribute("margin") ?? "0");
  const spacing = Number(tilesetElement.getAttribute("spacing") ?? "0");

  const imageElement = tilesetElement.querySelector(":scope > image");
  if (!imageElement) {
    throw new Error("Only image-based TMX tilesets are supported.");
  }

  const imageSource = imageElement.getAttribute("source");
  if (!imageSource) {
    throw new Error("Embedded TMX image data is not supported.");
  }

  const resolvedImagePath = resolveBundlePath(tilesetPath, imageSource);
  const importedImage = await importTiledTilesetImageAsset(
    resolvedImagePath,
    requireProvidedEntry(providedEntries, resolvedImagePath),
    {
      tileWidth,
      tileHeight,
      margin,
      spacing,
      imageWidth:
        Number(imageElement.getAttribute("width") ?? "0") || undefined,
      imageHeight:
        Number(imageElement.getAttribute("height") ?? "0") || undefined,
    },
  );

  const tileset: Tileset = {
    id: generateTilesetId(),
    name:
      tilesetElement.getAttribute("name") ?? stripExtension(resolvedImagePath),
    groupId: "tmx-import" as Tileset["groupId"],
    tileSize: tileWidth as TileSize,
    assetId: importedImage.assetId,
    imageWidth: importedImage.width,
    imageHeight: importedImage.height,
    createdAt: Date.now(),
  };

  const autotile = buildAutotileFromTiledWangSets(
    tileset,
    readTiledXmlWangSets(tilesetElement),
  );
  if (autotile) {
    tileset.autotile = autotile;
  }

  const animations = readXmlTilesetAnimationConfig(tilesetElement, tileset);
  if (animations) {
    tileset.animations = animations;
  }

  return {
    firstGid,
    tileset,
  };
}

async function importTiledMapEntries(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
): Promise<TiledMapImportResult> {
  const tmxPath = normalizeBundlePath(rootPath);
  const document = parseXmlDocument(
    decodeText(requireProvidedEntry(providedEntries, tmxPath)),
  );
  const mapElement = document.documentElement;

  if (mapElement.tagName !== "map") {
    throw new Error("TMX file does not contain a valid map element.");
  }
  if (mapElement.getAttribute("infinite") === "1") {
    throw new Error("Infinite TMX maps are not supported.");
  }

  const tileWidth = Number(mapElement.getAttribute("tilewidth") ?? "0");
  const tileHeight = Number(mapElement.getAttribute("tileheight") ?? "0");
  if (tileWidth <= 0 || tileWidth !== tileHeight) {
    throw new Error("Only square TMX maps are supported.");
  }

  const orientationAttr = validateTiledOrientation(
    mapElement.getAttribute("orientation") ?? "orthogonal",
    "TMX",
  );

  const rawMapProperties = parseProperties(mapElement);
  const mapName =
    pullProperty(rawMapProperties, MAP_NAME_PROPERTY_KEY)?.value ??
    stripExtension(tmxPath);
  const mapId = generateMapId();
  const tilesetEntries = await Promise.all(
    Array.from(mapElement.children)
      .filter((child) => child.tagName === "tileset")
      .map((tilesetElement) =>
        parseTilesetElement(tilesetElement, tmxPath, providedEntries),
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
  const objectIdByTmxId = new Map<string, string>();

  async function parseLayerChildren(parent: Element) {
    const childOrder: (LayerId | LayerGroupId)[] = [];

    for (const child of Array.from(parent.children)) {
      if (child.tagName === "tileset" || child.tagName === "properties") {
        continue;
      }

      if (child.tagName === "group") {
        const groupProperties = parseProperties(child);
        const groupId = generateLayerGroupId();
        const group: LayerGroup = {
          id: groupId,
          mapId,
          name: child.getAttribute("name") ?? "Group",
          visible: child.getAttribute("visible") !== "0",
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
          childOrder: await parseLayerChildren(child),
        };
        layerGroups.push(group);
        childOrder.push(group.id);
        continue;
      }

      if (child.tagName === "layer") {
        const layerProperties = parseProperties(child);
        const layerId = generateLayerId();
        const dataElement = child.querySelector(":scope > data");
        if (!dataElement) {
          throw new Error("TMX tile layer is missing data.");
        }
        const gids = decodeXmlLayerData(dataElement, {
          widthInTiles: Number(mapElement.getAttribute("width") ?? "0"),
          heightInTiles: Number(mapElement.getAttribute("height") ?? "0"),
        });
        const tiles = buildTilesFromGids(
          gids,
          Number(mapElement.getAttribute("width") ?? "0"),
          orderedTilesets,
          orientationAttr,
        );

        tileLayers.push({
          id: layerId,
          mapId,
          name: child.getAttribute("name") ?? "Layer",
          visible: child.getAttribute("visible") !== "0",
          locked: readBooleanProperty(
            layerProperties,
            LOCKED_PROPERTY_KEY,
            false,
          ),
          tiles,
        });
        childOrder.push(layerId);
        continue;
      }

      if (child.tagName === "imagelayer") {
        const imageElement = child.querySelector(":scope > image");
        const source = imageElement?.getAttribute("source");
        if (!source) {
          throw new Error("TMX image layer is missing its source image.");
        }

        const imageProperties = parseProperties(child);
        const resolvedImagePath = resolveBundlePath(tmxPath, source);
        const importedImage = await awaitImportImage(
          resolvedImagePath,
          providedEntries,
        );
        const layerId = generateLayerId();

        imageLayers.push({
          id: layerId,
          mapId,
          name: child.getAttribute("name") ?? "Image Layer",
          type: "image",
          visible: child.getAttribute("visible") !== "0",
          locked: readBooleanProperty(
            imageProperties,
            LOCKED_PROPERTY_KEY,
            false,
          ),
          assetId: importedImage.assetId,
          x: Number(
            child.getAttribute("offsetx") ?? child.getAttribute("x") ?? "0",
          ),
          y: Number(
            child.getAttribute("offsety") ?? child.getAttribute("y") ?? "0",
          ),
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
          opacity: Math.round(
            Number(child.getAttribute("opacity") ?? "1") * 100,
          ),
        });
        childOrder.push(layerId);
        continue;
      }

      if (child.tagName === "objectgroup") {
        const objectLayerProperties = parseProperties(child);
        const layerId = generateLayerId();
        const objectOrder: ObjectLayer["objectOrder"] = [];

        for (const objectElement of Array.from(child.children)) {
          if (objectElement.tagName !== "object") continue;
          const rawProperties = parseProperties(objectElement);
          const objectId = generateObjectId();
          const tiledObjectId = objectElement.getAttribute("id") ?? objectId;
          objectIdByTmxId.set(tiledObjectId, objectId);
          objectOrder.push(objectId);

          const polygonElement = objectElement.querySelector(
            ":scope > polygon, :scope > polyline",
          );
          const textElement = objectElement.querySelector(":scope > text");
          const objectType = textElement
            ? "text"
            : objectElement.querySelector(":scope > ellipse")
              ? "ellipse"
              : objectElement.querySelector(":scope > point")
                ? "point"
                : polygonElement
                  ? "polygon"
                  : "rectangle";

          if (objectElement.hasAttribute("gid")) {
            throw new Error("TMX tile objects are not supported.");
          }

          const points = polygonElement
            ? (polygonElement.getAttribute("points") ?? "")
                .split(" ")
                .filter(Boolean)
                .map((pair) => {
                  const [x, y] = pair.split(",").map(Number);
                  return { x, y };
                })
            : [];

          const object: MapObject = {
            id: objectId,
            layerId,
            name: objectElement.getAttribute("name") ?? objectType,
            type: objectType,
            x: Number(objectElement.getAttribute("x") ?? "0"),
            y: Number(objectElement.getAttribute("y") ?? "0"),
            width: Number(objectElement.getAttribute("width") ?? "0"),
            height: Number(objectElement.getAttribute("height") ?? "0"),
            rotation: Number(objectElement.getAttribute("rotation") ?? "0"),
            points,
            visible: objectElement.getAttribute("visible") !== "0",
            locked: readBooleanProperty(
              rawProperties,
              LOCKED_PROPERTY_KEY,
              false,
            ),
            properties: rawProperties,
          };

          if (textElement) {
            object.properties = {
              ...object.properties,
              ...getDefaultTextObjectProperties({
                text: textElement.textContent ?? "",
                size: Number(textElement.getAttribute("pixelsize") ?? "16"),
                rotation: object.rotation,
                font: textElement.getAttribute("fontfamily") ?? "sans-serif",
                wordWrap: textElement.getAttribute("wrap") !== "0",
                color: textElement.getAttribute("color") ?? "#000000",
              }),
            };
            normalizeTextObject(object);
          }

          objects.push(object);
        }

        objectLayers.push({
          id: layerId,
          mapId,
          name: child.getAttribute("name") ?? "Objects",
          type: "object",
          visible: child.getAttribute("visible") !== "0",
          locked: readBooleanProperty(
            objectLayerProperties,
            LOCKED_PROPERTY_KEY,
            false,
          ),
          objectOrder,
        });
        childOrder.push(layerId);
      }
    }

    return childOrder;
  }

  const layerOrder = await parseLayerChildren(mapElement);
  const resolvedObjectIdMap = createSyntheticObjectIdMap(objects);

  for (const object of objects) {
    object.properties = parsePropertiesWithObjectRefs(
      object.properties,
      objectIdByTmxId,
      resolvedObjectIdMap,
    );
  }

  const mapProperties = parsePropertiesWithObjectRefs(
    rawMapProperties,
    objectIdByTmxId,
    resolvedObjectIdMap,
  );

  return {
    map: {
      id: mapId,
      name: mapName,
      groupId: "tmx-import" as TileMapData["groupId"],
      orientation: orientationAttr,
      staggerAxis:
        orientationAttr === "hexagonal" || orientationAttr === "staggered"
          ? ((mapElement.getAttribute("staggeraxis") ??
              "x") as TileMapData["staggerAxis"])
          : undefined,
      staggerIndex:
        orientationAttr === "hexagonal" || orientationAttr === "staggered"
          ? ((mapElement.getAttribute("staggerindex") ??
              "odd") as TileMapData["staggerIndex"])
          : undefined,
      widthInTiles: Number(mapElement.getAttribute("width") ?? "0"),
      heightInTiles: Number(mapElement.getAttribute("height") ?? "0"),
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

export async function prepareTiledMapImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
  format: TiledMapFormat,
): Promise<TiledMapImportPreparationResult> {
  if (format === "lua") {
    return prepareTiledLuaMapImport(rootPath, entries);
  }

  const normalizedRootPath = normalizeBundlePath(rootPath);
  const providedEntries = buildEntryMap(entries);
  const isJsonLikeFormat = format === "json" || format === "js";
  const missingResources = isJsonLikeFormat
    ? collectMissingTiledJsonMapResources(
        normalizedRootPath,
        providedEntries,
        format,
      )
    : collectMissingTiledMapResources(normalizedRootPath, providedEntries);

  if (missingResources.length > 0) {
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources,
    };
  }

  return {
    status: "ready",
    result: isJsonLikeFormat
      ? await importTiledJsonMapEntries(
          normalizedRootPath,
          providedEntries,
          format,
        )
      : await importTiledMapEntries(normalizedRootPath, providedEntries),
  };
}
