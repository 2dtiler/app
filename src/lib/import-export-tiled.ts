import { gzipSync, gunzipSync, unzipSync, unzlibSync, zlibSync } from "fflate";
import { getAsset, saveAsset } from "@/lib/db";
import {
  generateAssetId,
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/lib/ids";
import {
  getDefaultTextObjectProperties,
  getTextObjectSettings,
  isReservedTextObjectPropertyKey,
  normalizeTextObject,
} from "@/lib/text-objects";
import { buildDownloadFilename, sanitizeDownloadSegment } from "@/lib/format";
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
  TileSize,
  Tileset,
  TiledMapImportResult,
  TiledXmlExportOptions,
} from "@/types";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const TILED_FORMAT_VERSION = "1.10";

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;

const MAP_NAME_PROPERTY_KEY = "2dtiler:map-name";
const LOCKED_PROPERTY_KEY = "2dtiler:locked";
const EXPANDED_PROPERTY_KEY = "2dtiler:expanded";
const IMAGE_WIDTH_PROPERTY_KEY = "2dtiler:image-width";
const IMAGE_HEIGHT_PROPERTY_KEY = "2dtiler:image-height";
const IMAGE_ROTATION_PROPERTY_KEY = "2dtiler:image-rotation";
const IMAGE_FLIP_X_PROPERTY_KEY = "2dtiler:image-flip-x";
const IMAGE_FLIP_Y_PROPERTY_KEY = "2dtiler:image-flip-y";

const MIME_BY_EXTENSION = new Map<string, string>([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["webp", "image/webp"],
]);

const EXTENSION_BY_MIME = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/bmp", ".bmp"],
  ["image/webp", ".webp"],
]);

function normalizeBundlePath(path: string) {
  const segments = path.replace(/\\/g, "/").split("/");
  const normalizedSegments: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(segment);
  }

  return normalizedSegments.join("/");
}

function getDirname(path: string) {
  const normalized = normalizeBundlePath(path);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : "";
}

function joinBundlePath(...segments: string[]) {
  return normalizeBundlePath(segments.filter(Boolean).join("/"));
}

function resolveBundlePath(fromPath: string, relativePath: string) {
  if (relativePath.startsWith("/")) {
    return normalizeBundlePath(relativePath);
  }

  return normalizeBundlePath(
    `${getDirname(fromPath)}/${relativePath.replace(/\\/g, "/")}`,
  );
}

function stripExtension(path: string) {
  const fileName = path.split("/").pop() ?? path;
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function encodeXmlDocument(document: XMLDocument) {
  const xml = new XMLSerializer().serializeToString(document);
  return new TextEncoder().encode(`${XML_HEADER}${xml}`);
}

function decodeText(data: Uint8Array) {
  return new TextDecoder("utf-8").decode(data);
}

function parseXmlDocument(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("Invalid XML document.");
  }
  return document;
}

function createXmlDocument(rootName: string) {
  return window.document.implementation.createDocument("", rootName, null);
}

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

function parseProperties(
  parent: Element,
  objectIdMap?: ReadonlyMap<string, string>,
) {
  const propertiesElement = parent.querySelector(":scope > properties");
  const properties: Record<string, PropertyValue> = {};

  if (!propertiesElement) {
    return properties;
  }

  for (const propertyElement of Array.from(propertiesElement.children)) {
    if (propertyElement.tagName !== "property") continue;

    const key = propertyElement.getAttribute("name");
    if (!key) continue;

    const typeAttr = propertyElement.getAttribute("type");
    const type =
      typeAttr === "bool" ||
      typeAttr === "color" ||
      typeAttr === "float" ||
      typeAttr === "file" ||
      typeAttr === "int" ||
      typeAttr === "object"
        ? typeAttr
        : "string";
    const rawValue =
      propertyElement.getAttribute("value") ??
      propertyElement.textContent ??
      "";
    const value =
      type === "object" && objectIdMap
        ? (objectIdMap.get(rawValue) ?? rawValue)
        : rawValue;

    properties[key] = {
      value,
      type,
    };
  }

  return properties;
}

function pullProperty(properties: Record<string, PropertyValue>, key: string) {
  const value = properties[key];
  delete properties[key];
  return value;
}

function readBooleanProperty(
  properties: Record<string, PropertyValue>,
  key: string,
  fallback: boolean,
) {
  const property = pullProperty(properties, key);
  if (!property) return fallback;

  const normalized = property.value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readNumberProperty(
  properties: Record<string, PropertyValue>,
  key: string,
  fallback: number,
) {
  const property = pullProperty(properties, key);
  if (!property) return fallback;
  const parsed = Number(property.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTileColumns(tileset: Pick<Tileset, "imageWidth" | "tileSize">) {
  return Math.max(1, Math.floor(tileset.imageWidth / tileset.tileSize));
}

function getTileCount(
  tileset: Pick<Tileset, "imageWidth" | "imageHeight" | "tileSize">,
) {
  const columns = getTileColumns(tileset);
  const rows = Math.max(1, Math.floor(tileset.imageHeight / tileset.tileSize));
  return columns * rows;
}

function getMimeTypeFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION.get(extension) ?? "application/octet-stream";
}

function getFileExtensionFromMimeType(mimeType: string) {
  return EXTENSION_BY_MIME.get(mimeType) ?? ".bin";
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

function decodeTransform(gid: number, map: Pick<TileMapData, "orientation">) {
  const flipX = Boolean(gid & FLIPPED_HORIZONTALLY_FLAG);
  const flipY = Boolean(gid & FLIPPED_VERTICALLY_FLAG);
  const diagonal = Boolean(gid & FLIPPED_DIAGONALLY_FLAG);
  const rotatedHex120 = Boolean(gid & ROTATED_HEXAGONAL_120_FLAG);

  if (map.orientation === "hexagonal") {
    if (diagonal || rotatedHex120) {
      throw new Error(
        "Hexagonal TMX import does not support 60-degree or 120-degree rotations.",
      );
    }

    if (flipX && flipY) {
      return { rotation: 180, flipX: false, flipY: false };
    }

    return {
      rotation: 0,
      flipX,
      flipY,
    };
  }

  const transformKey = `${flipX ? 1 : 0},${flipY ? 1 : 0},${diagonal ? 1 : 0}`;

  switch (transformKey) {
    case "0,0,0":
      return { rotation: 0, flipX: false, flipY: false };
    case "1,0,0":
      return { rotation: 0, flipX: true, flipY: false };
    case "0,1,0":
      return { rotation: 0, flipX: false, flipY: true };
    case "1,1,0":
      return { rotation: 180, flipX: false, flipY: false };
    case "0,0,1":
      return { rotation: 90, flipX: false, flipY: true };
    case "1,0,1":
      return { rotation: 90, flipX: false, flipY: false };
    case "0,1,1":
      return { rotation: 270, flipX: false, flipY: false };
    case "1,1,1":
      return { rotation: 90, flipX: true, flipY: false };
    default:
      return { rotation: 0, flipX: false, flipY: false };
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

function decodeLayerData(
  dataElement: Element,
  map: Pick<TileMapData, "widthInTiles" | "heightInTiles">,
) {
  const encoding = dataElement.getAttribute("encoding");
  const compression = dataElement.getAttribute("compression") ?? "none";
  const expectedLength = map.widthInTiles * map.heightInTiles;

  if (!encoding) {
    const gids = Array.from(dataElement.children)
      .filter((child) => child.tagName === "tile")
      .map((tileElement) => Number(tileElement.getAttribute("gid") ?? "0"));
    return Uint32Array.from(gids);
  }

  if (encoding === "csv") {
    const gids = dataElement.textContent
      ?.split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value)) ?? [0];
    return Uint32Array.from(gids);
  }

  if (encoding !== "base64") {
    throw new Error(`Unsupported TMX layer encoding: ${encoding}.`);
  }

  const encoded = dataElement.textContent?.trim() ?? "";
  const decoded = base64ToBytes(encoded);
  const raw =
    compression === "gzip"
      ? gunzipSync(decoded)
      : compression === "zlib"
        ? unzlibSync(decoded)
        : compression === "none"
          ? decoded
          : (() => {
              throw new Error(`Unsupported TMX compression: ${compression}.`);
            })();

  if (raw.byteLength !== expectedLength * 4) {
    throw new Error("TMX layer payload length does not match map dimensions.");
  }

  const gids = new Uint32Array(expectedLength);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  for (let index = 0; index < expectedLength; index += 1) {
    gids[index] = view.getUint32(index * 4, true);
  }

  return gids;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function loadImageDimensions(data: Uint8Array, mimeType: string) {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
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

function findTilesetByGid(
  gid: number,
  tilesets: readonly {
    firstGid: number;
    tileset: Tileset;
  }[],
) {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    if (tilesets[index].firstGid <= gid) {
      return tilesets[index];
    }
  }
  return null;
}

async function importImageAsset(path: string, data: Uint8Array) {
  const mimeType = getMimeTypeFromPath(path);
  const assetId = generateAssetId();
  await saveAsset(assetId, data.slice().buffer as ArrayBuffer, mimeType);
  const dimensions = await loadImageDimensions(data, mimeType);
  return {
    assetId,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
  };
}

async function parseTilesetElement(
  element: Element,
  entryPath: string,
  bundleEntries: ReadonlyMap<string, Uint8Array>,
) {
  const source = element.getAttribute("source");
  const firstGid = Number(element.getAttribute("firstgid") ?? "1");
  const tilesetDocument = source
    ? parseXmlDocument(
        decodeText(
          getBundleEntry(bundleEntries, resolveBundlePath(entryPath, source)),
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
  if (margin !== 0 || spacing !== 0) {
    throw new Error("TMX tilesets with margin or spacing are not supported.");
  }

  const imageElement = tilesetElement.querySelector(":scope > image");
  if (!imageElement) {
    throw new Error("Only image-based TMX tilesets are supported.");
  }

  const imageSource = imageElement.getAttribute("source");
  if (!imageSource) {
    throw new Error("Embedded TMX image data is not supported.");
  }

  const resolvedImagePath = resolveBundlePath(tilesetPath, imageSource);
  const importedImage = await importImageAsset(
    resolvedImagePath,
    getBundleEntry(bundleEntries, resolvedImagePath),
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

function getBundleEntry(
  bundleEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  const entry = bundleEntries.get(normalizeBundlePath(path));
  if (!entry) {
    throw new Error(`Missing bundled asset: ${path}.`);
  }
  return entry;
}

function createSyntheticObjectIdMap(objects: MapObject[]) {
  return new Map(
    objects.map((object) => [object.id as string, object.id as string]),
  );
}

export async function importTiledMapBundle(
  data: Uint8Array,
): Promise<TiledMapImportResult> {
  const bundleEntries = new Map(
    Object.entries(unzipSync(data)).map(([path, entryData]) => [
      normalizeBundlePath(path),
      entryData,
    ]),
  );
  const tmxEntries = [...bundleEntries.keys()].filter((path) =>
    path.toLowerCase().endsWith(".tmx"),
  );

  if (tmxEntries.length !== 1) {
    throw new Error("Expected a zip bundle containing exactly one TMX file.");
  }

  const tmxPath = tmxEntries[0];
  const document = parseXmlDocument(
    decodeText(getBundleEntry(bundleEntries, tmxPath)),
  );
  const mapElement = document.documentElement;

  if (mapElement.tagName !== "map") {
    throw new Error("TMX bundle does not contain a valid map element.");
  }
  if (mapElement.getAttribute("infinite") === "1") {
    throw new Error("Infinite TMX maps are not supported.");
  }

  const tileWidth = Number(mapElement.getAttribute("tilewidth") ?? "0");
  const tileHeight = Number(mapElement.getAttribute("tileheight") ?? "0");
  if (tileWidth <= 0 || tileWidth !== tileHeight) {
    throw new Error("Only square TMX maps are supported.");
  }

  const orientationAttr =
    mapElement.getAttribute("orientation") ?? "orthogonal";
  if (
    orientationAttr !== "orthogonal" &&
    orientationAttr !== "hexagonal" &&
    orientationAttr !== "staggered"
  ) {
    throw new Error(`Unsupported TMX orientation: ${orientationAttr}.`);
  }

  const rawMapProperties = parseProperties(mapElement);
  const mapName =
    pullProperty(rawMapProperties, MAP_NAME_PROPERTY_KEY)?.value ??
    stripExtension(tmxPath);
  const mapId = generateMapId();
  const tilesetEntries = await Promise.all(
    Array.from(mapElement.children)
      .filter((child) => child.tagName === "tileset")
      .map((tilesetElement) =>
        parseTilesetElement(tilesetElement, tmxPath, bundleEntries),
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
        const gids = decodeLayerData(dataElement, {
          widthInTiles: Number(mapElement.getAttribute("width") ?? "0"),
          heightInTiles: Number(mapElement.getAttribute("height") ?? "0"),
        });
        const tiles: TileLayer["tiles"] = {};

        gids.forEach((rawGid, index) => {
          if (!rawGid) return;

          const gid =
            rawGid &
            ~(
              FLIPPED_HORIZONTALLY_FLAG |
              FLIPPED_VERTICALLY_FLAG |
              FLIPPED_DIAGONALLY_FLAG |
              ROTATED_HEXAGONAL_120_FLAG
            );
          const tilesetEntry = findTilesetByGid(gid, orderedTilesets);
          if (!tilesetEntry) return;

          const localId = gid - tilesetEntry.firstGid;
          const columns = getTileColumns(tilesetEntry.tileset);
          const cellX = index % Number(mapElement.getAttribute("width") ?? "0");
          const cellY = Math.floor(
            index / Number(mapElement.getAttribute("width") ?? "0"),
          );
          const transforms = decodeTransform(rawGid, {
            orientation: orientationAttr,
          } as TileMapData);

          tiles[`${cellX},${cellY}`] = {
            tilesetId: tilesetEntry.tileset.id,
            sx: (localId % columns) * tilesetEntry.tileset.tileSize,
            sy: Math.floor(localId / columns) * tilesetEntry.tileset.tileSize,
            sw: tilesetEntry.tileset.tileSize,
            sh: tilesetEntry.tileset.tileSize,
            rotation: transforms.rotation as TileRef["rotation"],
            flipX: transforms.flipX,
            flipY: transforms.flipY,
          };
        });

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
          bundleEntries,
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

async function awaitImportImage(
  resolvedImagePath: string,
  bundleEntries: ReadonlyMap<string, Uint8Array>,
) {
  return importImageAsset(
    resolvedImagePath,
    getBundleEntry(bundleEntries, resolvedImagePath),
  );
}

function parsePropertiesWithObjectRefs(
  properties: Record<string, PropertyValue>,
  objectIdByTmxId: ReadonlyMap<string, string>,
  resolvedObjectIdMap: ReadonlyMap<string, string>,
) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      if (value.type !== "object") {
        return [key, value];
      }

      const referencedObjectId =
        resolvedObjectIdMap.get(
          objectIdByTmxId.get(value.value) ?? value.value,
        ) ??
        objectIdByTmxId.get(value.value) ??
        value.value;
      return [
        key,
        {
          ...value,
          value: referencedObjectId,
        },
      ];
    }),
  );
}
