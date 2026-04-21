import { gunzipSync, unzlibSync } from "fflate";
import { saveAsset } from "@/lib/db";
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
  normalizeTextObject,
} from "@/lib/text-objects";
import {
  base64ToBytes,
  decodeText,
  getMimeTypeFromPath,
  getTileColumns,
  normalizeBundlePath,
  parseXmlDocument,
  resolveBundlePath,
  stripExtension,
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
  TileSize,
  Tileset,
  TiledImportMissingResource,
  TiledMapImportPreparationResult,
  TiledMapImportResult,
} from "@/types";

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

function buildEntryMap(entries: readonly ImportExportArchiveEntry[]) {
  return new Map(
    entries.map((entry) => [normalizeBundlePath(entry.path), entry.data]),
  );
}

function getProvidedEntry(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  return providedEntries.get(normalizeBundlePath(path));
}

function requireProvidedEntry(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  const entry = getProvidedEntry(providedEntries, path);
  if (!entry) {
    throw new Error(`Missing linked resource: ${path}.`);
  }
  return entry;
}

function addMissingResource(
  missingResources: Map<string, TiledImportMissingResource>,
  path: string,
  kind: TiledImportMissingResource["kind"],
  referringPath: string,
) {
  const normalizedPath = normalizeBundlePath(path);
  if (missingResources.has(normalizedPath)) {
    return;
  }

  missingResources.set(normalizedPath, {
    path: normalizedPath,
    kind,
    referringPath: normalizeBundlePath(referringPath),
    label: kind === "tsx" ? "External tileset" : "Image asset",
  });
}

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

function createSyntheticObjectIdMap(objects: MapObject[]) {
  return new Map(
    objects.map((object) => [object.id as string, object.id as string]),
  );
}

async function awaitImportImage(
  resolvedImagePath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  return importImageAsset(
    resolvedImagePath,
    requireProvidedEntry(providedEntries, resolvedImagePath),
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
): Promise<TiledMapImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  const providedEntries = buildEntryMap(entries);
  const missingResources = collectMissingTiledMapResources(
    normalizedRootPath,
    providedEntries,
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
    result: await importTiledMapEntries(normalizedRootPath, providedEntries),
  };
}
