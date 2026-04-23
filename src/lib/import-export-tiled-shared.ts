import { gzipSync, zlibSync } from "fflate";
import { getAsset } from "@/lib/db";
import { sanitizeDownloadSegment } from "@/lib/format";
import {
  bytesToBase64,
  getFileExtensionFromMimeType,
  getTileColumns,
  getTileCount,
  joinBundlePath,
} from "@/lib/tiled-xml-utils";
import type {
  ImageLayer,
  ImportExportArchiveEntry,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TiledMapBundlePreparationResult,
  TiledMapExportOptions,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
} from "@/types";

export const TILED_FORMAT_VERSION = "1.10";

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;

export const MAP_NAME_PROPERTY_KEY = "2dtiler:map-name";
export const LOCKED_PROPERTY_KEY = "2dtiler:locked";
export const EXPANDED_PROPERTY_KEY = "2dtiler:expanded";
export const IMAGE_WIDTH_PROPERTY_KEY = "2dtiler:image-width";
export const IMAGE_HEIGHT_PROPERTY_KEY = "2dtiler:image-height";
export const IMAGE_ROTATION_PROPERTY_KEY = "2dtiler:image-rotation";
export const IMAGE_FLIP_X_PROPERTY_KEY = "2dtiler:image-flip-x";
export const IMAGE_FLIP_Y_PROPERTY_KEY = "2dtiler:image-flip-y";

export function encodeJsonDocument(value: unknown) {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

export function buildJsonProperties(
  properties: Record<string, PropertyValue> | undefined,
  objectIdMap?: ReadonlyMap<string, number>,
) {
  const propertyEntries = Object.entries(properties ?? {});
  if (propertyEntries.length === 0) {
    return undefined;
  }

  return propertyEntries.map(([name, property]) => ({
    name,
    ...(property.type !== "string" ? { type: property.type } : {}),
    value:
      property.type === "object" && objectIdMap
        ? Number(objectIdMap.get(property.value) ?? 0)
        : property.type === "bool"
          ? property.value === "true"
          : property.type === "int" || property.type === "float"
            ? Number(property.value)
            : property.value,
  }));
}

export function createRelativeAssetPath(
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

export function getLayerDenseGids(
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
    if (!tileset || !firstGid) {
      continue;
    }

    const columns = getTileColumns(tileset);
    const tileX = Math.floor(ref.sx / tileset.tileSize);
    const tileY = Math.floor(ref.sy / tileset.tileSize);
    const localId = tileY * columns + tileX;
    const flags = encodeTransformFlags(ref, map);
    gids[y * map.widthInTiles + x] = firstGid + localId + flags;
  }

  return gids;
}

export function getLayerDenseCsvIds(
  map: TileMapData,
  layer: TileLayer,
  tilesetMap: ReadonlyMap<string, Tileset>,
) {
  const tileIds = Array<number | null>(
    map.widthInTiles * map.heightInTiles,
  ).fill(null);

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
    if (!tileset) {
      continue;
    }

    const columns = getTileColumns(tileset);
    const tileX = Math.floor(ref.sx / tileset.tileSize);
    const tileY = Math.floor(ref.sy / tileset.tileSize);
    const localId = tileY * columns + tileX;
    const flags = encodeTransformFlags(ref, map);
    tileIds[y * map.widthInTiles + x] = (localId + flags) >>> 0;
  }

  return tileIds;
}

export function buildTiledTilesetLookups(
  layers: readonly TileLayer[],
  tilesets: readonly Tileset[],
) {
  const referencedTilesetIds = new Set<string>();
  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedTilesetIds.add(ref.tilesetId as string);
    }
  }

  const exportedTilesets = tilesets.filter((tileset) =>
    referencedTilesetIds.has(tileset.id as string),
  );
  const tilesetFirstGids = new Map<string, number>();
  let nextFirstGid = 1;

  for (const tileset of exportedTilesets) {
    tilesetFirstGids.set(tileset.id as string, nextFirstGid);
    nextFirstGid += getTileCount(tileset);
  }

  const tilesetMap = new Map(
    exportedTilesets.map((tileset) => [tileset.id as string, tileset]),
  );

  return {
    exportedTilesets,
    tilesetFirstGids,
    tilesetMap,
  };
}

export function encodeLayerData(
  gids: Uint32Array,
  options: TiledMapExportOptions,
) {
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
      if (!objectLayer) {
        continue;
      }

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

export async function prepareTiledMapBundleData(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[] = [],
  layerGroups: LayerGroup[] = [],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
): Promise<TiledMapBundlePreparationResult> {
  const { exportedTilesets, tilesetFirstGids, tilesetMap } =
    buildTiledTilesetLookups(layers, tilesets);
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

  return {
    entries,
    exportedTilesets,
    groupMap,
    imageLayerMap,
    imagePathsByAssetId,
    imageSourcesByLayerId,
    layerMap,
    objectIdMap,
    objectLayerMap,
    objectMap,
    tilesetFirstGids,
    tilesetMap,
    usedPaths,
  };
}
