import { gzipSync, zlibSync } from "fflate";
import { getAsset } from "@/lib/db";
import {
  getTextObjectSettings,
  isReservedTextObjectPropertyKey,
} from "@/lib/text-objects";
import { buildDownloadFilename, sanitizeDownloadSegment } from "@/lib/format";
import {
  bytesToBase64,
  createXmlDocument,
  encodeXmlDocument,
  getFileExtensionFromMimeType,
  getTileColumns,
  getTileCount,
  joinBundlePath,
} from "@/lib/tiled-xml-utils";
import type {
  ImportExportArchiveEntry,
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  TiledXmlExportOptions,
} from "@/types";

const TILED_FORMAT_VERSION = "1.10";

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;

const MAP_NAME_PROPERTY_KEY = "2dtiler:map-name";
const LOCKED_PROPERTY_KEY = "2dtiler:locked";
const EXPANDED_PROPERTY_KEY = "2dtiler:expanded";
const IMAGE_WIDTH_PROPERTY_KEY = "2dtiler:image-width";
const IMAGE_HEIGHT_PROPERTY_KEY = "2dtiler:image-height";
const IMAGE_ROTATION_PROPERTY_KEY = "2dtiler:image-rotation";
const IMAGE_FLIP_X_PROPERTY_KEY = "2dtiler:image-flip-x";
const IMAGE_FLIP_Y_PROPERTY_KEY = "2dtiler:image-flip-y";

function appendProperties(
  document: XMLDocument,
  parent: Element,
  properties: Record<string, PropertyValue> | undefined,
  objectIdMap?: ReadonlyMap<string, number>,
) {
  const propertyEntries = Object.entries(properties ?? {});
  if (propertyEntries.length === 0) return;

  const propertiesElement = document.createElement("properties");

  for (const [key, property] of propertyEntries) {
    const propertyElement = document.createElement("property");
    propertyElement.setAttribute("name", key);
    if (property.type !== "string") {
      propertyElement.setAttribute("type", property.type);
    }

    const value =
      property.type === "object" && objectIdMap
        ? String(objectIdMap.get(property.value) ?? 0)
        : property.value;

    if (property.type === "string" && value.includes("\n")) {
      propertyElement.textContent = value;
    } else {
      propertyElement.setAttribute("value", value);
    }

    propertiesElement.append(propertyElement);
  }

  parent.append(propertiesElement);
}

function createRelativeAssetPath(
  folder: string,
  baseName: string,
  extension: string,
  usedPaths: Set<string>,
) {
  const sanitizedBaseName = sanitizeDownloadSegment(baseName, "asset");
  let candidate = joinBundlePath(folder, `${sanitizedBaseName}${extension}`);
  let suffix = 2;

  while (usedPaths.has(candidate)) {
    candidate = joinBundlePath(
      folder,
      `${sanitizedBaseName}-${suffix}${extension}`,
    );
    suffix += 1;
  }

  usedPaths.add(candidate);
  return candidate;
}

function getRotationMatrix(rotation: number) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  switch (normalizedRotation) {
    case 0:
      return { a: 1, b: 0, c: 0, d: 1 };
    case 90:
      return { a: 0, b: -1, c: 1, d: 0 };
    case 180:
      return { a: -1, b: 0, c: 0, d: -1 };
    case 270:
      return { a: 0, b: 1, c: -1, d: 0 };
    default:
      throw new Error(`Unsupported tile rotation: ${rotation}.`);
  }
}

function getTransformKey(rotation: number, flipX: boolean, flipY: boolean) {
  const { a, b, c, d } = getRotationMatrix(rotation);
  const scaleX = flipX ? -1 : 1;
  const scaleY = flipY ? -1 : 1;
  return `${a * scaleX},${b * scaleY},${c * scaleX},${d * scaleY}`;
}

function encodeTransformFlags(
  ref: Pick<TileRef, "rotation" | "flipX" | "flipY">,
  map: Pick<TileMapData, "orientation">,
) {
  const transformKey = getTransformKey(
    ref.rotation ?? 0,
    ref.flipX ?? false,
    ref.flipY ?? false,
  );

  if (map.orientation === "hexagonal") {
    switch (transformKey) {
      case "1,0,0,1":
        return 0;
      case "-1,0,0,1":
        return FLIPPED_HORIZONTALLY_FLAG;
      case "1,0,0,-1":
        return FLIPPED_VERTICALLY_FLAG;
      case "-1,0,0,-1":
        return FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG;
      default:
        throw new Error(
          "Hexagonal TMX export only supports flips and 180-degree rotations.",
        );
    }
  }

  switch (transformKey) {
    case "1,0,0,1":
      return 0;
    case "-1,0,0,1":
      return FLIPPED_HORIZONTALLY_FLAG;
    case "1,0,0,-1":
      return FLIPPED_VERTICALLY_FLAG;
    case "-1,0,0,-1":
      return FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG;
    case "0,1,1,0":
      return FLIPPED_DIAGONALLY_FLAG;
    case "0,-1,1,0":
      return FLIPPED_DIAGONALLY_FLAG | FLIPPED_HORIZONTALLY_FLAG;
    case "0,1,-1,0":
      return FLIPPED_DIAGONALLY_FLAG | FLIPPED_VERTICALLY_FLAG;
    case "0,-1,-1,0":
      return (
        FLIPPED_DIAGONALLY_FLAG |
        FLIPPED_HORIZONTALLY_FLAG |
        FLIPPED_VERTICALLY_FLAG
      );
    default:
      throw new Error("Unsupported tile transform for TMX export.");
  }
}

function getLayerDenseGids(
  map: TileMapData,
  layer: TileLayer,
  tilesetFirstGids: ReadonlyMap<string, number>,
  tilesetMap: ReadonlyMap<string, Tileset>,
) {
  const gids = new Uint32Array(map.widthInTiles * map.heightInTiles);

  for (const [coordinate, ref] of Object.entries(layer.tiles)) {
    const [x, y] = coordinate.split(",").map((value) => Number(value));
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      x >= map.widthInTiles ||
      y >= map.heightInTiles
    ) {
      continue;
    }

    const tileset = tilesetMap.get(ref.tilesetId as string);
    const firstGid = tilesetFirstGids.get(ref.tilesetId as string);
    if (!tileset || !firstGid) continue;

    const columns = getTileColumns(tileset);
    const tileX = Math.floor(ref.sx / tileset.tileSize);
    const tileY = Math.floor(ref.sy / tileset.tileSize);
    const localId = tileY * columns + tileX;
    const flags = encodeTransformFlags(ref, map);
    gids[y * map.widthInTiles + x] = firstGid + localId + flags;
  }

  return gids;
}

function encodeLayerData(gids: Uint32Array, options: TiledXmlExportOptions) {
  if (options.encoding === "csv") {
    return Array.from(gids).join(",");
  }

  const raw = new Uint8Array(gids.length * 4);
  const view = new DataView(raw.buffer);

  gids.forEach((gid, index) => {
    view.setUint32(index * 4, gid, true);
  });

  const compressionLevel = Math.max(
    0,
    Math.min(9, Math.round(options.compressionLevel)),
  ) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

  const compressed =
    options.compression === "gzip"
      ? gzipSync(raw, { level: compressionLevel })
      : options.compression === "zlib"
        ? zlibSync(raw, { level: compressionLevel })
        : raw;

  return bytesToBase64(compressed);
}

function buildObjectNumericIdMap(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  groupMap: ReadonlyMap<string, LayerGroup>,
  objectLayerMap: ReadonlyMap<string, ObjectLayer>,
) {
  const objectIds = new Map<string, number>();
  let nextObjectId = 1;

  function visitEntries(entries: readonly (LayerId | LayerGroupId)[]) {
    for (const entryId of entries) {
      const group = groupMap.get(entryId as string);
      if (group) {
        visitEntries(group.childOrder);
        continue;
      }

      const objectLayer = objectLayerMap.get(entryId as string);
      if (!objectLayer) continue;

      for (const objectId of objectLayer.objectOrder) {
        if (!objectIds.has(objectId as string)) {
          objectIds.set(objectId as string, nextObjectId);
          nextObjectId += 1;
        }
      }
    }
  }

  visitEntries(layerOrder);
  return objectIds;
}

function appendTileLayer(
  document: XMLDocument,
  parent: Element,
  map: TileMapData,
  layer: TileLayer,
  nextLayerId: () => number,
  tilesetFirstGids: ReadonlyMap<string, number>,
  tilesetMap: ReadonlyMap<string, Tileset>,
  options: TiledXmlExportOptions,
) {
  const layerElement = document.createElement("layer");
  layerElement.setAttribute("id", String(nextLayerId()));
  layerElement.setAttribute("name", layer.name);
  layerElement.setAttribute("width", String(map.widthInTiles));
  layerElement.setAttribute("height", String(map.heightInTiles));
  if (!layer.visible) {
    layerElement.setAttribute("visible", "0");
  }

  const layerProperties: Record<string, PropertyValue> = {};
  if (layer.locked) {
    layerProperties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  appendProperties(document, layerElement, layerProperties);

  const gids = getLayerDenseGids(map, layer, tilesetFirstGids, tilesetMap);
  const dataElement = document.createElement("data");
  dataElement.setAttribute("encoding", options.encoding);
  if (options.encoding === "base64" && options.compression !== "none") {
    dataElement.setAttribute("compression", options.compression);
  }
  dataElement.textContent = encodeLayerData(gids, options);
  layerElement.append(dataElement);
  parent.append(layerElement);
}

function appendImageLayer(
  document: XMLDocument,
  parent: Element,
  layer: ImageLayer,
  imageSource: string,
  nextLayerId: () => number,
) {
  const layerElement = document.createElement("imagelayer");
  layerElement.setAttribute("id", String(nextLayerId()));
  layerElement.setAttribute("name", layer.name);
  layerElement.setAttribute("offsetx", String(layer.x));
  layerElement.setAttribute("offsety", String(layer.y));
  layerElement.setAttribute("opacity", String((layer.opacity ?? 100) / 100));
  if (!layer.visible) {
    layerElement.setAttribute("visible", "0");
  }

  const properties: Record<string, PropertyValue> = {};
  if (layer.locked) {
    properties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  properties[IMAGE_WIDTH_PROPERTY_KEY] = {
    value: String(layer.width),
    type: "int",
  };
  properties[IMAGE_HEIGHT_PROPERTY_KEY] = {
    value: String(layer.height),
    type: "int",
  };
  properties[IMAGE_ROTATION_PROPERTY_KEY] = {
    value: String(layer.rotation ?? 0),
    type: "float",
  };
  properties[IMAGE_FLIP_X_PROPERTY_KEY] = {
    value: layer.flipX ? "true" : "false",
    type: "bool",
  };
  properties[IMAGE_FLIP_Y_PROPERTY_KEY] = {
    value: layer.flipY ? "true" : "false",
    type: "bool",
  };
  appendProperties(document, layerElement, properties);

  const imageElement = document.createElement("image");
  imageElement.setAttribute("source", imageSource);
  layerElement.append(imageElement);
  parent.append(layerElement);
}

function appendObjectLayer(
  document: XMLDocument,
  parent: Element,
  layer: ObjectLayer,
  objectMap: ReadonlyMap<string, MapObject>,
  objectIdMap: ReadonlyMap<string, number>,
  nextLayerId: () => number,
) {
  const layerElement = document.createElement("objectgroup");
  layerElement.setAttribute("id", String(nextLayerId()));
  layerElement.setAttribute("name", layer.name);
  layerElement.setAttribute("draworder", "index");
  if (!layer.visible) {
    layerElement.setAttribute("visible", "0");
  }

  const layerProperties: Record<string, PropertyValue> = {};
  if (layer.locked) {
    layerProperties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  appendProperties(document, layerElement, layerProperties);

  for (const objectId of layer.objectOrder) {
    const object = objectMap.get(objectId as string);
    const tiledObjectId = objectIdMap.get(objectId as string);
    if (!object || !tiledObjectId) continue;

    const objectElement = document.createElement("object");
    objectElement.setAttribute("id", String(tiledObjectId));
    objectElement.setAttribute("name", object.name);
    objectElement.setAttribute("x", String(object.x));
    objectElement.setAttribute("y", String(object.y));
    objectElement.setAttribute("width", String(object.width));
    objectElement.setAttribute("height", String(object.height));
    objectElement.setAttribute("rotation", String(object.rotation));
    if (!object.visible) {
      objectElement.setAttribute("visible", "0");
    }

    const objectProperties = { ...(object.properties ?? {}) };
    if (object.locked) {
      objectProperties[LOCKED_PROPERTY_KEY] = {
        value: "true",
        type: "bool",
      };
    }

    if (object.type === "ellipse") {
      objectElement.append(document.createElement("ellipse"));
    } else if (object.type === "point") {
      objectElement.append(document.createElement("point"));
    } else if (object.type === "polygon") {
      const polygonElement = document.createElement("polygon");
      polygonElement.setAttribute(
        "points",
        object.points.map((point) => `${point.x},${point.y}`).join(" "),
      );
      objectElement.append(polygonElement);
    } else if (object.type === "text") {
      const textSettings = getTextObjectSettings(object);
      const textElement = document.createElement("text");
      textElement.setAttribute("fontfamily", textSettings.font);
      textElement.setAttribute("pixelsize", String(textSettings.size));
      textElement.setAttribute("wrap", textSettings.wordWrap ? "1" : "0");
      textElement.setAttribute("color", textSettings.color);
      textElement.textContent = textSettings.text;
      objectElement.append(textElement);

      for (const key of Object.keys(objectProperties)) {
        if (isReservedTextObjectPropertyKey(key)) {
          delete objectProperties[key];
        }
      }
    }

    appendProperties(document, objectElement, objectProperties, objectIdMap);
    layerElement.append(objectElement);
  }

  parent.append(layerElement);
}

function appendGroupLayer(
  document: XMLDocument,
  parent: Element,
  group: LayerGroup,
  layerMap: ReadonlyMap<string, TileLayer>,
  imageLayerMap: ReadonlyMap<string, ImageLayer>,
  objectLayerMap: ReadonlyMap<string, ObjectLayer>,
  groupMap: ReadonlyMap<string, LayerGroup>,
  imageSources: ReadonlyMap<string, string>,
  objectMap: ReadonlyMap<string, MapObject>,
  objectIdMap: ReadonlyMap<string, number>,
  nextLayerId: () => number,
  tilesetFirstGids: ReadonlyMap<string, number>,
  tilesetMap: ReadonlyMap<string, Tileset>,
  map: TileMapData,
  options: TiledXmlExportOptions,
) {
  const groupElement = document.createElement("group");
  groupElement.setAttribute("id", String(nextLayerId()));
  groupElement.setAttribute("name", group.name);
  if (!group.visible) {
    groupElement.setAttribute("visible", "0");
  }

  const groupProperties: Record<string, PropertyValue> = {};
  if (group.locked) {
    groupProperties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  groupProperties[EXPANDED_PROPERTY_KEY] = {
    value: group.expanded ? "true" : "false",
    type: "bool",
  };
  appendProperties(document, groupElement, groupProperties);

  for (const childId of group.childOrder) {
    const childGroup = groupMap.get(childId as string);
    if (childGroup) {
      appendGroupLayer(
        document,
        groupElement,
        childGroup,
        layerMap,
        imageLayerMap,
        objectLayerMap,
        groupMap,
        imageSources,
        objectMap,
        objectIdMap,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        map,
        options,
      );
      continue;
    }

    const tileLayer = layerMap.get(childId as string);
    if (tileLayer) {
      appendTileLayer(
        document,
        groupElement,
        map,
        tileLayer,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        options,
      );
      continue;
    }

    const imageLayer = imageLayerMap.get(childId as string);
    if (imageLayer) {
      const imageSource = imageSources.get(imageLayer.id as string);
      if (imageSource) {
        appendImageLayer(
          document,
          groupElement,
          imageLayer,
          imageSource,
          nextLayerId,
        );
      }
      continue;
    }

    const objectLayer = objectLayerMap.get(childId as string);
    if (objectLayer) {
      appendObjectLayer(
        document,
        groupElement,
        objectLayer,
        objectMap,
        objectIdMap,
        nextLayerId,
      );
    }
  }

  parent.append(groupElement);
}

export async function exportTiledMapBundle(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[] = [],
  layerGroups: LayerGroup[] = [],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
  options: TiledXmlExportOptions,
): Promise<ImportExportArchiveEntry[]> {
  const referencedTilesetIds = new Set<string>();
  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedTilesetIds.add(ref.tilesetId as string);
    }
  }

  const exportedTilesets = tilesets.filter((tileset) =>
    referencedTilesetIds.has(tileset.id as string),
  );
  const layerMap = new Map(layers.map((layer) => [layer.id as string, layer]));
  const imageLayerMap = new Map(
    imageLayers.map((layer) => [layer.id as string, layer]),
  );
  const objectLayerMap = new Map(
    objectLayers.map((layer) => [layer.id as string, layer]),
  );
  const groupMap = new Map(
    layerGroups.map((group) => [group.id as string, group]),
  );
  const objectMap = new Map(
    objects.map((object) => [object.id as string, object]),
  );
  const objectIdMap = buildObjectNumericIdMap(
    map.layerOrder,
    groupMap,
    objectLayerMap,
  );

  const entries: ImportExportArchiveEntry[] = [];
  const usedPaths = new Set<string>();
  const imagePathsByAssetId = new Map<string, string>();
  const imageSourcesByLayerId = new Map<string, string>();

  for (const tileset of exportedTilesets) {
    const assetRecord = await getAsset(tileset.assetId);
    if (!assetRecord) {
      throw new Error(`Missing tileset asset for ${tileset.name}.`);
    }

    const extension = getFileExtensionFromMimeType(assetRecord.mimeType);
    const imagePath = createRelativeAssetPath(
      "images",
      tileset.name,
      extension,
      usedPaths,
    );
    imagePathsByAssetId.set(tileset.assetId as string, imagePath);
    entries.push({
      path: imagePath,
      data: new Uint8Array(assetRecord.data),
    });
  }

  for (const imageLayer of imageLayers) {
    const assetRecord = await getAsset(imageLayer.assetId);
    if (!assetRecord) {
      throw new Error(`Missing image layer asset for ${imageLayer.name}.`);
    }

    const extension = getFileExtensionFromMimeType(assetRecord.mimeType);
    const imagePath =
      imagePathsByAssetId.get(imageLayer.assetId as string) ??
      createRelativeAssetPath("images", imageLayer.name, extension, usedPaths);
    imagePathsByAssetId.set(imageLayer.assetId as string, imagePath);
    imageSourcesByLayerId.set(imageLayer.id as string, imagePath);

    if (!entries.some((entry) => entry.path === imagePath)) {
      entries.push({
        path: imagePath,
        data: new Uint8Array(assetRecord.data),
      });
    }
  }

  const tilesetFirstGids = new Map<string, number>();
  let nextFirstGid = 1;
  for (const tileset of exportedTilesets) {
    tilesetFirstGids.set(tileset.id as string, nextFirstGid);
    nextFirstGid += getTileCount(tileset);
  }

  const document = createXmlDocument("map");
  const mapElement = document.documentElement;
  mapElement.setAttribute("version", TILED_FORMAT_VERSION);
  mapElement.setAttribute("orientation", map.orientation);
  mapElement.setAttribute("width", String(map.widthInTiles));
  mapElement.setAttribute("height", String(map.heightInTiles));
  mapElement.setAttribute("tilewidth", String(map.tileSize));
  mapElement.setAttribute("tileheight", String(map.tileSize));
  mapElement.setAttribute("infinite", "0");
  mapElement.setAttribute("nextobjectid", String(objectIdMap.size + 1));

  if (options.encoding === "base64" && options.compression !== "none") {
    mapElement.setAttribute(
      "compressionlevel",
      String(options.compressionLevel),
    );
  }
  if (map.orientation === "orthogonal") {
    mapElement.setAttribute("renderorder", options.renderOrder);
  }
  if (map.orientation === "hexagonal") {
    mapElement.setAttribute(
      "hexsidelength",
      String(Math.round(map.tileSize / 2)),
    );
  }
  if (map.orientation === "hexagonal" || map.orientation === "staggered") {
    mapElement.setAttribute("staggeraxis", map.staggerAxis ?? "x");
    mapElement.setAttribute("staggerindex", map.staggerIndex ?? "odd");
  }

  const mapProperties = {
    ...(map.properties ?? {}),
    [MAP_NAME_PROPERTY_KEY]: { value: map.name, type: "string" as const },
  };
  appendProperties(document, mapElement, mapProperties, objectIdMap);

  for (const tileset of exportedTilesets) {
    const firstGid = tilesetFirstGids.get(tileset.id as string);
    const imagePath = imagePathsByAssetId.get(tileset.assetId as string);
    if (!firstGid || !imagePath) continue;

    if (options.tilesetMode === "external-tsx") {
      const tsxPath = createRelativeAssetPath(
        "tilesets",
        tileset.name,
        ".tsx",
        usedPaths,
      );
      const tilesetElement = document.createElement("tileset");
      tilesetElement.setAttribute("firstgid", String(firstGid));
      tilesetElement.setAttribute("source", tsxPath);
      mapElement.append(tilesetElement);

      const tsxDocument = createXmlDocument("tileset");
      const tsxElement = tsxDocument.documentElement;
      tsxElement.setAttribute("version", TILED_FORMAT_VERSION);
      tsxElement.setAttribute("name", tileset.name);
      tsxElement.setAttribute("tilewidth", String(tileset.tileSize));
      tsxElement.setAttribute("tileheight", String(tileset.tileSize));
      tsxElement.setAttribute("tilecount", String(getTileCount(tileset)));
      tsxElement.setAttribute("columns", String(getTileColumns(tileset)));

      const imageElement = tsxDocument.createElement("image");
      imageElement.setAttribute("source", `../${imagePath}`);
      imageElement.setAttribute("width", String(tileset.imageWidth));
      imageElement.setAttribute("height", String(tileset.imageHeight));
      tsxElement.append(imageElement);

      entries.push({
        path: tsxPath,
        data: encodeXmlDocument(tsxDocument),
      });
      continue;
    }

    const tilesetElement = document.createElement("tileset");
    tilesetElement.setAttribute("firstgid", String(firstGid));
    tilesetElement.setAttribute("name", tileset.name);
    tilesetElement.setAttribute("tilewidth", String(tileset.tileSize));
    tilesetElement.setAttribute("tileheight", String(tileset.tileSize));
    tilesetElement.setAttribute("tilecount", String(getTileCount(tileset)));
    tilesetElement.setAttribute("columns", String(getTileColumns(tileset)));
    const imageElement = document.createElement("image");
    imageElement.setAttribute("source", imagePath);
    imageElement.setAttribute("width", String(tileset.imageWidth));
    imageElement.setAttribute("height", String(tileset.imageHeight));
    tilesetElement.append(imageElement);
    mapElement.append(tilesetElement);
  }

  let nextLayerIdValue = 1;
  const nextLayerId = () => {
    const currentValue = nextLayerIdValue;
    nextLayerIdValue += 1;
    return currentValue;
  };

  mapElement.setAttribute(
    "nextlayerid",
    String(
      nextLayerIdValue +
        layers.length +
        imageLayers.length +
        objectLayers.length +
        layerGroups.length,
    ),
  );

  const tilesetMap = new Map(
    exportedTilesets.map((tileset) => [tileset.id as string, tileset]),
  );

  for (const entryId of map.layerOrder) {
    const group = groupMap.get(entryId as string);
    if (group) {
      appendGroupLayer(
        document,
        mapElement,
        group,
        layerMap,
        imageLayerMap,
        objectLayerMap,
        groupMap,
        imageSourcesByLayerId,
        objectMap,
        objectIdMap,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        map,
        options,
      );
      continue;
    }

    const tileLayer = layerMap.get(entryId as string);
    if (tileLayer) {
      appendTileLayer(
        document,
        mapElement,
        map,
        tileLayer,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        options,
      );
      continue;
    }

    const imageLayer = imageLayerMap.get(entryId as string);
    if (imageLayer) {
      const imageSource = imageSourcesByLayerId.get(imageLayer.id as string);
      if (imageSource) {
        appendImageLayer(
          document,
          mapElement,
          imageLayer,
          imageSource,
          nextLayerId,
        );
      }
      continue;
    }

    const objectLayer = objectLayerMap.get(entryId as string);
    if (objectLayer) {
      appendObjectLayer(
        document,
        mapElement,
        objectLayer,
        objectMap,
        objectIdMap,
        nextLayerId,
      );
    }
  }

  entries.push({
    path: buildDownloadFilename(map.name, ".tmx"),
    data: encodeXmlDocument(document),
  });

  return entries;
}
