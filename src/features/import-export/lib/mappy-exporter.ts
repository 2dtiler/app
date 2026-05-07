import { drawTileWithOrientation } from "@/features/map-editor/components/MapCanvas/texture-cache";
import type { LoadedMappyTilesetImage } from "@/features/import-export/types";
import { getAsset } from "@/services/db";
import type {
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TileRef,
  TileSize,
  Tileset,
} from "@/types";
import { TILE_SIZES } from "@/types";

const FORM_CHUNK_ID = "FORM";
const FMAP_CHUNK_ID = "FMAP";
const MPHD_CHUNK_ID = "MPHD";
const ATHR_CHUNK_ID = "ATHR";
const CMAP_CHUNK_ID = "CMAP";
const BKDT_CHUNK_ID = "BKDT";
const BGFX_CHUNK_ID = "BGFX";
const BODY_CHUNK_ID = "BODY";
const BLOCK_STRUCTURE_SIZE = 32;
const MAX_LAYERS = 8;

function assertSupportedTileSize(
  tileSize: number,
): asserts tileSize is TileSize {
  if (!TILE_SIZES.includes(tileSize as TileSize)) {
    throw new Error(
      `Unsupported Mappy tile size: ${tileSize}. Supported sizes are ${TILE_SIZES.join(", ")}.`,
    );
  }
}

function flattenTileLayers(
  layerOrder: TileMapData["layerOrder"],
  layers: readonly TileLayer[],
  layerGroups: readonly LayerGroup[],
) {
  const layerById = new Map(layers.map((layer) => [layer.id as string, layer]));
  const groupById = new Map(
    layerGroups.map((group) => [group.id as string, group]),
  );
  const ordered: TileLayer[] = [];

  const visit = (
    order: readonly (string | TileMapData["layerOrder"][number])[],
  ) => {
    for (const id of order) {
      const group = groupById.get(id as string);
      if (group) {
        visit(group.childOrder);
        continue;
      }

      const layer = layerById.get(id as string);
      if (layer) {
        ordered.push(layer);
      }
    }
  };

  visit(layerOrder);
  return ordered;
}

async function loadTilesetImages(tilesets: readonly Tileset[]) {
  const result = new Map<string, LoadedMappyTilesetImage>();

  for (const tileset of tilesets) {
    const record = await getAsset(tileset.assetId);
    if (!record) {
      throw new Error(`Unable to resolve tileset asset for ${tileset.name}.`);
    }

    const objectUrl = URL.createObjectURL(
      new Blob([record.data], { type: record.mimeType }),
    );
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      result.set(tileset.id as string, { image, tileset });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return result;
}

function buildTileKey(ref: TileRef) {
  return [
    ref.tilesetId,
    ref.sx,
    ref.sy,
    ref.sw,
    ref.sh,
    ref.rotation ?? 0,
    ref.flipX ? 1 : 0,
    ref.flipY ? 1 : 0,
  ].join(":");
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create a 2D canvas context.");
  }

  context.imageSmoothingEnabled = false;
  return { canvas, context };
}

async function rasterizeTileRefToRaw24(
  loadedTileset: LoadedMappyTilesetImage,
  ref: TileRef,
  tileSize: number,
) {
  const { context } = createCanvas(tileSize, tileSize);
  drawTileWithOrientation(context, loadedTileset.image, ref, 0, 0, tileSize);
  const imageData = context.getImageData(0, 0, tileSize, tileSize);
  const raw = new Uint8Array(tileSize * tileSize * 3);

  for (let index = 0; index < tileSize * tileSize; index += 1) {
    const rgbaOffset = index * 4;
    const rawOffset = index * 3;
    raw[rawOffset] = imageData.data[rgbaOffset] ?? 0;
    raw[rawOffset + 1] = imageData.data[rgbaOffset + 1] ?? 0;
    raw[rawOffset + 2] = imageData.data[rgbaOffset + 2] ?? 0;
  }

  return raw;
}

function writeFourCC(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < 4; index += 1) {
    target[offset + index] = value.charCodeAt(index) ?? 0;
  }
}

function writeInt32LE(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setInt32(
    offset,
    value,
    true,
  );
}

function writeInt16LE(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setInt16(
    offset,
    value,
    true,
  );
}

function writeUint32BE(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(
    offset,
    value,
    false,
  );
}

function buildChunk(id: string, data: Uint8Array) {
  const padding = data.byteLength % 2;
  const chunk = new Uint8Array(8 + data.byteLength + padding);
  writeFourCC(chunk, 0, id);
  writeUint32BE(chunk, 4, data.byteLength);
  chunk.set(data, 8);
  return chunk;
}

function buildMapHeaderChunk(
  map: TileMapData,
  blockStructureCount: number,
  blockGraphicCount: number,
) {
  const data = new Uint8Array(24);
  data[0] = 1;
  data[1] = 0;
  data[2] = 1;
  data[3] = 0;
  writeInt16LE(data, 4, map.widthInTiles);
  writeInt16LE(data, 6, map.heightInTiles);
  writeInt16LE(data, 8, 0);
  writeInt16LE(data, 10, 0);
  writeInt16LE(data, 12, map.tileSize);
  writeInt16LE(data, 14, map.tileSize);
  writeInt16LE(data, 16, 24);
  writeInt16LE(data, 18, BLOCK_STRUCTURE_SIZE);
  writeInt16LE(data, 20, blockStructureCount);
  writeInt16LE(data, 22, blockGraphicCount);
  return buildChunk(MPHD_CHUNK_ID, data);
}

function buildAuthorChunk(map: TileMapData) {
  const properties = map.properties ?? {};
  const parts = [
    properties["mappy:author-name"]?.value ?? "",
    properties["mappy:author-info-1"]?.value ?? "",
    properties["mappy:author-info-2"]?.value ?? "",
    properties["mappy:author-info-3"]?.value ?? "",
  ];

  if (parts.every((part) => !part)) {
    return null;
  }

  const encoded = new TextEncoder().encode(`${parts.join("\u0000")}\u0000`);
  const padding = encoded.byteLength % 4;
  const data = new Uint8Array(
    encoded.byteLength + (padding === 0 ? 0 : 4 - padding),
  );
  data.set(encoded);
  return buildChunk(ATHR_CHUNK_ID, data);
}

function buildPaletteChunk() {
  return buildChunk(CMAP_CHUNK_ID, new Uint8Array(256 * 3));
}

function buildBlockStructureChunk(blockCount: number, bytesPerGraphic: number) {
  const data = new Uint8Array(blockCount * BLOCK_STRUCTURE_SIZE);
  for (let blockIndex = 1; blockIndex < blockCount; blockIndex += 1) {
    writeInt32LE(
      data,
      blockIndex * BLOCK_STRUCTURE_SIZE,
      blockIndex * bytesPerGraphic,
    );
  }
  return buildChunk(BKDT_CHUNK_ID, data);
}

function buildLayerChunk(id: string, values: Int16Array) {
  const data = new Uint8Array(values.length * 2);
  const view = new DataView(data.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setInt16(index * 2, values[index] ?? 0, true);
  }
  return buildChunk(id, data);
}

function encodeMappyFile(chunks: readonly Uint8Array[]) {
  const chunksSize = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  const bytes = new Uint8Array(12 + chunksSize);
  writeFourCC(bytes, 0, FORM_CHUNK_ID);
  writeUint32BE(bytes, 4, 4 + chunksSize);
  writeFourCC(bytes, 8, FMAP_CHUNK_ID);
  let offset = 12;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function exportMappyMap(
  map: TileMapData,
  layers: readonly TileLayer[],
  tilesets: readonly Tileset[],
  imageLayers: readonly ImageLayer[],
  layerGroups: readonly LayerGroup[],
  objectLayers: readonly ObjectLayer[],
  objects: readonly MapObject[],
) {
  if (map.orientation !== "orthogonal") {
    throw new Error("Mappy export only supports orthogonal maps.");
  }

  if (imageLayers.length > 0 || objectLayers.length > 0 || objects.length > 0) {
    throw new Error("Mappy export only supports tile layers in this build.");
  }

  assertSupportedTileSize(map.tileSize);
  const orderedLayers = flattenTileLayers(map.layerOrder, layers, layerGroups);
  if (orderedLayers.length === 0) {
    throw new Error("Mappy export requires at least one tile layer.");
  }
  if (orderedLayers.length > MAX_LAYERS) {
    throw new Error("Mappy export supports at most 8 tile layers.");
  }

  const loadedTilesets = await loadTilesetImages(tilesets);
  const uniqueTileKeys = new Map<
    string,
    { blockIndex: number; raw: Uint8Array }
  >();
  const bytesPerGraphic = map.tileSize * map.tileSize * 3;

  for (const layer of orderedLayers) {
    for (const ref of Object.values(layer.tiles)) {
      const key = buildTileKey(ref);
      if (uniqueTileKeys.has(key)) {
        continue;
      }

      const loadedTileset = loadedTilesets.get(ref.tilesetId as string);
      if (!loadedTileset) {
        throw new Error("Mappy export could not resolve a referenced tileset.");
      }

      uniqueTileKeys.set(key, {
        blockIndex: uniqueTileKeys.size + 1,
        raw: await rasterizeTileRefToRaw24(loadedTileset, ref, map.tileSize),
      });
    }
  }

  if ((uniqueTileKeys.size + 1) * BLOCK_STRUCTURE_SIZE > 0x7fff) {
    throw new Error(
      "Mappy export supports at most 1023 unique block structures.",
    );
  }

  const blockGraphics = new Uint8Array(
    (uniqueTileKeys.size + 1) * bytesPerGraphic,
  );
  for (const { blockIndex, raw } of uniqueTileKeys.values()) {
    blockGraphics.set(raw, blockIndex * bytesPerGraphic);
  }

  const layerValues = orderedLayers.map(
    () => new Int16Array(map.widthInTiles * map.heightInTiles),
  );
  for (let layerIndex = 0; layerIndex < orderedLayers.length; layerIndex += 1) {
    const layer = orderedLayers[layerIndex];
    const values = layerValues[layerIndex];
    if (!values) {
      continue;
    }

    for (const [key, ref] of Object.entries(layer.tiles)) {
      const [rawX = "0", rawY = "0"] = key.split(",");
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        continue;
      }
      if (x < 0 || y < 0 || x >= map.widthInTiles || y >= map.heightInTiles) {
        continue;
      }

      const block = uniqueTileKeys.get(buildTileKey(ref));
      if (!block) {
        continue;
      }
      values[y * map.widthInTiles + x] =
        block.blockIndex * BLOCK_STRUCTURE_SIZE;
    }
  }

  const chunks: Uint8Array[] = [];
  const authorChunk = buildAuthorChunk(map);
  if (authorChunk) {
    chunks.push(authorChunk);
  }
  chunks.push(
    buildMapHeaderChunk(map, uniqueTileKeys.size + 1, uniqueTileKeys.size + 1),
  );
  chunks.push(buildPaletteChunk());
  chunks.push(
    buildBlockStructureChunk(uniqueTileKeys.size + 1, bytesPerGraphic),
  );
  chunks.push(buildChunk(BGFX_CHUNK_ID, blockGraphics));

  for (let layerIndex = 1; layerIndex < layerValues.length; layerIndex += 1) {
    const values = layerValues[layerIndex];
    if (values) {
      chunks.push(buildLayerChunk(`LYR${layerIndex}`, values));
    }
  }
  chunks.push(
    buildLayerChunk(BODY_CHUNK_ID, layerValues[0] ?? new Int16Array()),
  );

  return encodeMappyFile(chunks);
}