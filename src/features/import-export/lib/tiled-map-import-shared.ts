import { gunzipSync, unzlibSync } from "fflate";
import { saveAsset } from "@/services/db";
import { generateAssetId } from "@/utils/ids";
import {
  base64ToBytes,
  getMimeTypeFromPath,
  getTileColumns,
  normalizeBundlePath,
} from "@/features/import-export/lib/tiled-xml-utils";
import type {
  ImportExportArchiveEntry,
  PropertyValue,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  TiledImportMissingResource,
  TiledJsonProperty,
} from "@/types";

export const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
export const FLIPPED_VERTICALLY_FLAG = 0x40000000;
export const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
export const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;

export const MAP_NAME_PROPERTY_KEY = "2dtiler:map-name";
export const LOCKED_PROPERTY_KEY = "2dtiler:locked";
export const EXPANDED_PROPERTY_KEY = "2dtiler:expanded";
export const IMAGE_WIDTH_PROPERTY_KEY = "2dtiler:image-width";
export const IMAGE_HEIGHT_PROPERTY_KEY = "2dtiler:image-height";
export const IMAGE_ROTATION_PROPERTY_KEY = "2dtiler:image-rotation";
export const IMAGE_FLIP_X_PROPERTY_KEY = "2dtiler:image-flip-x";
export const IMAGE_FLIP_Y_PROPERTY_KEY = "2dtiler:image-flip-y";

function normalizePropertyType(
  type: string | undefined,
): PropertyValue["type"] {
  return type === "bool" ||
    type === "color" ||
    type === "float" ||
    type === "file" ||
    type === "int" ||
    type === "object"
    ? type
    : "string";
}

function stringifyPropertyValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function parsePropertyEntries(
  entries: readonly TiledJsonProperty[],
  objectIdMap?: ReadonlyMap<string, string>,
) {
  const properties: Record<string, PropertyValue> = {};

  for (const entry of entries) {
    const key = entry.name;
    if (!key) {
      continue;
    }

    const type = normalizePropertyType(entry.type);
    const rawValue = stringifyPropertyValue(entry.value);
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

export function parseXmlProperties(
  parent: Element,
  objectIdMap?: ReadonlyMap<string, string>,
) {
  const propertiesElement = Array.from(parent.children).find(
    (child) => child.tagName === "properties",
  );

  if (!propertiesElement) {
    return {};
  }

  const propertyEntries: TiledJsonProperty[] = Array.from(
    propertiesElement.children,
  )
    .filter((child) => child.tagName === "property")
    .map((propertyElement) => ({
      name: propertyElement.getAttribute("name") ?? undefined,
      type: propertyElement.getAttribute("type") ?? undefined,
      value:
        propertyElement.getAttribute("value") ??
        propertyElement.textContent ??
        "",
    }));

  return parsePropertyEntries(propertyEntries, objectIdMap);
}

export function parseJsonProperties(
  properties: readonly TiledJsonProperty[] | undefined,
  objectIdMap?: ReadonlyMap<string, string>,
) {
  return parsePropertyEntries(properties ?? [], objectIdMap);
}

export function pullProperty(
  properties: Record<string, PropertyValue>,
  key: string,
) {
  const value = properties[key];
  delete properties[key];
  return value;
}

export function readBooleanProperty(
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

export function readNumberProperty(
  properties: Record<string, PropertyValue>,
  key: string,
  fallback: number,
) {
  const property = pullProperty(properties, key);
  if (!property) return fallback;
  const parsed = Number(property.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function validateTiledOrientation(
  orientation: string,
  formatLabel: string,
): TileMapData["orientation"] {
  if (
    orientation !== "orthogonal" &&
    orientation !== "hexagonal" &&
    orientation !== "isometric" &&
    orientation !== "staggered"
  ) {
    throw new Error(`Unsupported ${formatLabel} orientation: ${orientation}.`);
  }

  return orientation as TileMapData["orientation"];
}

export function decodeTransform(
  gid: number,
  map: Pick<TileMapData, "orientation">,
) {
  const flipX = Boolean(gid & FLIPPED_HORIZONTALLY_FLAG);
  const flipY = Boolean(gid & FLIPPED_VERTICALLY_FLAG);
  const diagonal = Boolean(gid & FLIPPED_DIAGONALLY_FLAG);
  const rotatedHex120 = Boolean(gid & ROTATED_HEXAGONAL_120_FLAG);

  if (map.orientation === "hexagonal") {
    if (diagonal || rotatedHex120) {
      throw new Error(
        "Hexagonal Tiled import does not support 60-degree or 120-degree rotations.",
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

function decodeLayerDataPayload(
  encoding: string | null | undefined,
  compression: string | null | undefined,
  textContent: string | undefined,
  gidsData: readonly number[] | undefined,
  map: Pick<TileMapData, "widthInTiles" | "heightInTiles">,
  formatLabel: string,
) {
  const expectedLength = map.widthInTiles * map.heightInTiles;
  const ensureLengthMatches = (gids: Uint32Array, encodingLabel: string) => {
    if (gids.length !== expectedLength) {
      throw new Error(
        `${formatLabel} ${encodingLabel} layer payload length does not match map dimensions.`,
      );
    }
    return gids;
  };

  if (!encoding) {
    return ensureLengthMatches(
      Uint32Array.from((gidsData ?? [0]).map((gid) => Number(gid) || 0)),
      "unencoded",
    );
  }

  if (encoding === "csv") {
    if (gidsData) {
      return ensureLengthMatches(
        Uint32Array.from(gidsData.map((gid) => Number(gid) || 0)),
        "csv",
      );
    }

    const gids = textContent
      ?.split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value)) ?? [0];
    return ensureLengthMatches(Uint32Array.from(gids), "csv");
  }

  if (encoding !== "base64") {
    throw new Error(`Unsupported ${formatLabel} layer encoding: ${encoding}.`);
  }

  const encoded = textContent?.trim() ?? "";
  const decoded = base64ToBytes(encoded);
  const raw =
    compression === "gzip"
      ? gunzipSync(decoded)
      : compression === "zlib"
        ? unzlibSync(decoded)
        : compression === "none" || !compression
          ? decoded
          : (() => {
              throw new Error(
                `Unsupported ${formatLabel} compression: ${compression}.`,
              );
            })();

  if (raw.byteLength !== expectedLength * 4) {
    throw new Error(
      `${formatLabel} layer payload length does not match map dimensions.`,
    );
  }

  const gids = new Uint32Array(expectedLength);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  for (let index = 0; index < expectedLength; index += 1) {
    gids[index] = view.getUint32(index * 4, true);
  }

  return gids;
}

export function decodeXmlLayerData(
  dataElement: Element,
  map: Pick<TileMapData, "widthInTiles" | "heightInTiles">,
) {
  const encoding = dataElement.getAttribute("encoding");

  if (!encoding) {
    const gids = Array.from(dataElement.children)
      .filter((child) => child.tagName === "tile")
      .map((tileElement) => Number(tileElement.getAttribute("gid") ?? "0"));
    return Uint32Array.from(gids);
  }

  return decodeLayerDataPayload(
    encoding,
    dataElement.getAttribute("compression") ?? "none",
    dataElement.textContent ?? "",
    undefined,
    map,
    "TMX",
  );
}

export function decodeJsonLayerData(
  encoding: string | undefined,
  compression: string | undefined,
  data: number[] | string | undefined,
  map: Pick<TileMapData, "widthInTiles" | "heightInTiles">,
) {
  if (Array.isArray(data)) {
    return decodeLayerDataPayload(
      undefined,
      compression,
      undefined,
      data,
      map,
      "Tiled JSON",
    );
  }

  if (typeof data === "string") {
    return decodeLayerDataPayload(
      encoding,
      compression,
      data,
      undefined,
      map,
      "Tiled JSON",
    );
  }

  throw new Error("Tiled JSON tile layer is missing data.");
}

async function withLoadedImage<T>(
  data: Uint8Array,
  mimeType: string,
  run: (image: HTMLImageElement) => Promise<T>,
) {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return run(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadImageDimensions(data: Uint8Array, mimeType: string) {
  return withLoadedImage(data, mimeType, async (image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
}

async function saveImportedImageAsset(
  data: Uint8Array,
  mimeType: string,
  width: number,
  height: number,
) {
  const assetId = generateAssetId();
  await saveAsset(assetId, data.slice().buffer as ArrayBuffer, mimeType);
  return {
    assetId,
    mimeType,
    width,
    height,
  };
}

async function encodeCanvasAsPngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

  if (!blob) {
    throw new Error("Failed to encode normalized Tiled tileset image.");
  }

  return new Uint8Array(await blob.arrayBuffer());
}

function getTiledTilesetGridCount(
  imageSize: number,
  tileSize: number,
  margin: number,
  spacing: number,
  axis: "width" | "height",
) {
  const availableSize = imageSize - margin * 2 + spacing;
  const cellSize = tileSize + spacing;
  const count = Math.floor(availableSize / cellSize);

  if (count <= 0) {
    throw new Error(
      `Invalid Tiled tileset ${axis}: image size ${imageSize} does not fit tile size ${tileSize} with margin ${margin} and spacing ${spacing}.`,
    );
  }

  return count;
}

export function buildEntryMap(entries: readonly ImportExportArchiveEntry[]) {
  return new Map(
    entries.map((entry) => [normalizeBundlePath(entry.path), entry.data]),
  );
}

export function getProvidedEntry(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  return providedEntries.get(normalizeBundlePath(path));
}

export function requireProvidedEntry(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  const entry = getProvidedEntry(providedEntries, path);
  if (!entry) {
    throw new Error(`Missing linked resource: ${path}.`);
  }
  return entry;
}

export function addMissingResource(
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
    label: kind === "image" ? "Image asset" : "External tileset",
  });
}

export async function importImageAsset(path: string, data: Uint8Array) {
  const mimeType = getMimeTypeFromPath(path);
  const dimensions = await loadImageDimensions(data, mimeType);
  return saveImportedImageAsset(
    data,
    mimeType,
    dimensions.width,
    dimensions.height,
  );
}

export async function importTiledTilesetImageAsset(
  path: string,
  data: Uint8Array,
  tileset: {
    tileWidth: number;
    tileHeight: number;
    margin: number;
    spacing: number;
    imageWidth?: number;
    imageHeight?: number;
  },
) {
  if (tileset.margin === 0 && tileset.spacing === 0) {
    return importImageAsset(path, data);
  }

  const mimeType = getMimeTypeFromPath(path);

  return withLoadedImage(data, mimeType, async (image) => {
    const sourceWidth = tileset.imageWidth ?? image.naturalWidth;
    const sourceHeight = tileset.imageHeight ?? image.naturalHeight;
    const columns = getTiledTilesetGridCount(
      sourceWidth,
      tileset.tileWidth,
      tileset.margin,
      tileset.spacing,
      "width",
    );
    const rows = getTiledTilesetGridCount(
      sourceHeight,
      tileset.tileHeight,
      tileset.margin,
      tileset.spacing,
      "height",
    );

    const canvas = document.createElement("canvas");
    canvas.width = columns * tileset.tileWidth;
    canvas.height = rows * tileset.tileHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(
        "Unable to create a 2D canvas context for Tiled tileset normalization.",
      );
    }

    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
        const sourceX =
          tileset.margin + columnIndex * (tileset.tileWidth + tileset.spacing);
        const sourceY =
          tileset.margin + rowIndex * (tileset.tileHeight + tileset.spacing);

        context.drawImage(
          image,
          sourceX,
          sourceY,
          tileset.tileWidth,
          tileset.tileHeight,
          columnIndex * tileset.tileWidth,
          rowIndex * tileset.tileHeight,
          tileset.tileWidth,
          tileset.tileHeight,
        );
      }
    }

    const normalizedData = await encodeCanvasAsPngBytes(canvas);
    return saveImportedImageAsset(
      normalizedData,
      "image/png",
      canvas.width,
      canvas.height,
    );
  });
}

export function findTilesetByGid(
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

export function stripTransformFlags(rawGid: number) {
  return (
    rawGid &
    ~(
      FLIPPED_HORIZONTALLY_FLAG |
      FLIPPED_VERTICALLY_FLAG |
      FLIPPED_DIAGONALLY_FLAG |
      ROTATED_HEXAGONAL_120_FLAG
    )
  );
}

export function buildTilesFromGids(
  gids: Uint32Array,
  mapWidth: number,
  orderedTilesets: readonly {
    firstGid: number;
    tileset: Tileset;
  }[],
  orientation: TileMapData["orientation"],
) {
  const tiles: TileLayer["tiles"] = {};

  gids.forEach((rawGid, index) => {
    if (!rawGid) return;

    const gid = stripTransformFlags(rawGid);
    const tilesetEntry = findTilesetByGid(gid, orderedTilesets);
    if (!tilesetEntry) return;

    const localId = gid - tilesetEntry.firstGid;
    const columns = getTileColumns(tilesetEntry.tileset);
    const cellX = index % mapWidth;
    const cellY = Math.floor(index / mapWidth);
    const transforms = decodeTransform(rawGid, {
      orientation,
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

  return tiles;
}

export function createSyntheticObjectIdMap(objects: { id: string }[]) {
  return new Map(objects.map((object) => [object.id, object.id]));
}

export async function awaitImportImage(
  resolvedImagePath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  return importImageAsset(
    resolvedImagePath,
    requireProvidedEntry(providedEntries, resolvedImagePath),
  );
}

export function parsePropertiesWithObjectRefs(
  properties: Record<string, PropertyValue>,
  objectIdBySourceId: ReadonlyMap<string, string>,
  resolvedObjectIdMap: ReadonlyMap<string, string>,
) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      if (value.type !== "object") {
        return [key, value];
      }

      const referencedObjectId =
        resolvedObjectIdMap.get(
          objectIdBySourceId.get(value.value) ?? value.value,
        ) ??
        objectIdBySourceId.get(value.value) ??
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
