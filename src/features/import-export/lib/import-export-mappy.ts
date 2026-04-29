import { drawTileWithOrientation } from "@/features/map-editor/components/MapCanvas/texture-cache";
import { getAsset, saveAsset } from "@/services/db";
import {
  generateAssetId,
  generateLayerId,
  generateMapId,
  generateTilesetId,
} from "@/utils/ids";
import { stripExtension } from "@/features/import-export/lib/tiled-xml-utils";
import type {
  ImageLayer,
  LayerGroup,
  MappyBlockStructureDocument,
  MappyChunkDocument,
  MappyGraphicDepth,
  MappyHeaderDocument,
  MappyMapDocument,
  MappyMapImportResult,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  TileRef,
  TileSize,
  Tileset,
} from "@/types";
import { TILE_SIZES } from "@/types";

export const MAPPY_MAP_IMPORT_ACCEPT = ".fmp,application/octet-stream";

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
const TRUECOLOR_TRANSPARENT_KEY = { r: 255, g: 0, b: 255 };
const IMPORT_MAP_GROUP_ID = "__mappy-import-map-group__";
const IMPORT_TILESET_GROUP_ID = "__mappy-import-tileset-group__";

interface ParsedMappyRoot {
  chunks: MappyChunkDocument[];
}

interface LoadedTilesetImage {
  image: HTMLImageElement;
  tileset: Tileset;
}

function assertSupportedTileSize(
  tileSize: number,
): asserts tileSize is TileSize {
  if (!TILE_SIZES.includes(tileSize as TileSize)) {
    throw new Error(
      `Unsupported Mappy tile size: ${tileSize}. Supported sizes are ${TILE_SIZES.join(", ")}.`,
    );
  }
}

function toSupportedTileSize(tileSize: number): TileSize {
  assertSupportedTileSize(tileSize);
  return tileSize;
}

function normalizeMapName(path: string) {
  return stripExtension(path).split("/").pop() || "mappy-map";
}

function readFourCC(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function writeFourCC(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < 4; index += 1) {
    target[offset + index] = value.charCodeAt(index) ?? 0;
  }
}

function parseMappyRoot(data: Uint8Array): ParsedMappyRoot {
  if (data.byteLength < 12 || readFourCC(data, 0) !== FORM_CHUNK_ID) {
    throw new Error("Invalid Mappy file. Expected a FORM container.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const formSize = view.getUint32(4, false);
  const formType = readFourCC(data, 8);
  if (formType !== FMAP_CHUNK_ID) {
    throw new Error(`Unsupported FORM type: ${formType}.`);
  }

  if (formSize + 8 > data.byteLength) {
    throw new Error("Invalid Mappy file. FORM size exceeds file length.");
  }

  const chunks: MappyChunkDocument[] = [];
  let offset = 12;

  while (offset + 8 <= data.byteLength) {
    const id = readFourCC(data, offset);
    const size = view.getUint32(offset + 4, false);
    offset += 8;

    if (offset + size > data.byteLength) {
      throw new Error(`Invalid Mappy chunk ${id}.`);
    }

    chunks.push({ id, data: data.slice(offset, offset + size) });
    offset += size;
    if (size % 2 === 1) {
      offset += 1;
    }
  }

  return { chunks };
}

function getRequiredChunk(chunks: readonly MappyChunkDocument[], id: string) {
  const chunk = chunks.find((entry) => entry.id === id);
  if (!chunk) {
    throw new Error(`Missing required Mappy chunk: ${id}.`);
  }
  return chunk;
}

function getOptionalChunk(chunks: readonly MappyChunkDocument[], id: string) {
  return chunks.find((entry) => entry.id === id) ?? null;
}

function parseMappyHeader(data: Uint8Array): MappyHeaderDocument {
  if (data.byteLength < 24) {
    throw new Error("Invalid Mappy MPHD chunk.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const blockDepth = view.getInt16(16, true);

  if (
    blockDepth !== 8 &&
    blockDepth !== 15 &&
    blockDepth !== 16 &&
    blockDepth !== 24 &&
    blockDepth !== 32
  ) {
    throw new Error(`Unsupported Mappy block depth: ${blockDepth}.`);
  }

  return {
    mapVersionHigh: data[0] ?? 0,
    mapVersionLow: data[1] ?? 0,
    lsb: (data[2] ?? 0) === 1,
    mapWidth: view.getInt16(4, true),
    mapHeight: view.getInt16(6, true),
    blockWidth: view.getInt16(12, true),
    blockHeight: view.getInt16(14, true),
    blockDepth,
    blockStructureSize: view.getInt16(18, true),
    blockStructureCount: view.getInt16(20, true),
    blockGraphicCount: view.getInt16(22, true),
  };
}

function parseAuthorChunk(data: Uint8Array) {
  const values = new TextDecoder("utf-8").decode(data).split("\u0000");
  const [name = "", info1 = "", info2 = "", info3 = ""] = values;
  if (!name && !info1 && !info2 && !info3) {
    return null;
  }

  return { name, info1, info2, info3 };
}

function parseBlockStructures(
  data: Uint8Array,
  count: number,
  blockStructureSize: number,
) {
  if (blockStructureSize !== BLOCK_STRUCTURE_SIZE) {
    throw new Error(
      `Unsupported Mappy block structure size: ${blockStructureSize}.`,
    );
  }

  if (data.byteLength < count * blockStructureSize) {
    throw new Error("Invalid Mappy BKDT chunk.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const blocks: MappyBlockStructureDocument[] = [];

  for (let index = 0; index < count; index += 1) {
    const offset = index * blockStructureSize;
    blocks.push({
      backgroundOffset: view.getInt32(offset, true),
      foregroundOffset: view.getInt32(offset + 4, true),
      foregroundOffset2: view.getInt32(offset + 8, true),
      foregroundOffset3: view.getInt32(offset + 12, true),
      userLong1: view.getUint32(offset + 16, true),
      userLong2: view.getUint32(offset + 20, true),
      userShort1: view.getUint16(offset + 24, true),
      userShort2: view.getUint16(offset + 26, true),
      userByte1: data[offset + 28] ?? 0,
      userByte2: data[offset + 29] ?? 0,
      userByte3: data[offset + 30] ?? 0,
      flags: data[offset + 31] ?? 0,
    });
  }

  return blocks;
}

function parseLayerCells(data: Uint8Array, width: number, height: number) {
  const expectedSize = width * height * 2;
  if (data.byteLength < expectedSize) {
    throw new Error("Invalid Mappy layer chunk.");
  }

  const layer = new Int16Array(width * height);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let index = 0; index < layer.length; index += 1) {
    layer[index] = view.getInt16(index * 2, true);
  }

  return layer;
}

function parseMappyDocument(rootData: Uint8Array): MappyMapDocument {
  const { chunks } = parseMappyRoot(rootData);
  const header = parseMappyHeader(getRequiredChunk(chunks, MPHD_CHUNK_ID).data);

  if (!header.lsb) {
    throw new Error("Big-endian Mappy payloads are not supported.");
  }

  if (header.mapWidth <= 0 || header.mapHeight <= 0) {
    throw new Error("Invalid Mappy map dimensions.");
  }

  if (header.blockWidth !== header.blockHeight) {
    throw new Error("Mappy import only supports square tiles in this build.");
  }

  assertSupportedTileSize(header.blockWidth);

  const author = parseAuthorChunk(
    getOptionalChunk(chunks, ATHR_CHUNK_ID)?.data ?? new Uint8Array(),
  );
  const palette = getOptionalChunk(chunks, CMAP_CHUNK_ID)?.data ?? null;
  const blockStructures = parseBlockStructures(
    getRequiredChunk(chunks, BKDT_CHUNK_ID).data,
    header.blockStructureCount,
    header.blockStructureSize,
  );
  const blockGraphics = getRequiredChunk(chunks, BGFX_CHUNK_ID).data;

  const layerCells: Int16Array[] = [];
  const body = getRequiredChunk(chunks, BODY_CHUNK_ID);
  layerCells.push(
    parseLayerCells(body.data, header.mapWidth, header.mapHeight),
  );

  for (let index = 1; index < MAX_LAYERS; index += 1) {
    const layerChunk = getOptionalChunk(chunks, `LYR${index}`);
    if (!layerChunk) {
      continue;
    }
    layerCells.push(
      parseLayerCells(layerChunk.data, header.mapWidth, header.mapHeight),
    );
  }

  return {
    header,
    author,
    palette,
    blockStructures,
    blockGraphics,
    layerCells,
  };
}

function getGraphicBytesPerPixel(depth: MappyGraphicDepth) {
  if (depth === 15 || depth === 16) {
    return 2;
  }
  return Math.max(1, depth / 8);
}

function decodeGraphicBlockToRgba(
  header: MappyHeaderDocument,
  palette: Uint8Array | null,
  blockGraphics: Uint8Array,
  graphicOffset: number,
  transparent: boolean,
) {
  const bytesPerPixel = getGraphicBytesPerPixel(header.blockDepth);
  const pixelCount = header.blockWidth * header.blockHeight;
  const byteLength = pixelCount * bytesPerPixel;

  if (
    graphicOffset < 0 ||
    graphicOffset + byteLength > blockGraphics.byteLength
  ) {
    throw new Error("Mappy block graphic offset is out of range.");
  }

  const raw = blockGraphics.subarray(graphicOffset, graphicOffset + byteLength);
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const sourceOffset = pixelIndex * bytesPerPixel;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 255;

    if (header.blockDepth === 8) {
      const paletteIndex = raw[sourceOffset] ?? 0;
      if (!palette || palette.byteLength < 768) {
        throw new Error("8-bit Mappy import requires a CMAP palette chunk.");
      }
      red = palette[paletteIndex * 3] ?? 0;
      green = palette[paletteIndex * 3 + 1] ?? 0;
      blue = palette[paletteIndex * 3 + 2] ?? 0;
      if (transparent && paletteIndex === 0) {
        alpha = 0;
      }
    } else if (header.blockDepth === 15) {
      const raw16 =
        ((raw[sourceOffset] ?? 0) << 8) | (raw[sourceOffset + 1] ?? 0);
      red = ((raw[sourceOffset] ?? 0) & 0xfc) << 1;
      green =
        (((((raw[sourceOffset] ?? 0) & 0x03) << 3) |
          ((raw[sourceOffset + 1] ?? 0) >> 5)) <<
          3) &
        0xff;
      blue = (((raw[sourceOffset + 1] ?? 0) & 0x1f) << 3) & 0xff;
      if (transparent && raw16 === 0x7c1f) {
        alpha = 0;
      }
    } else if (header.blockDepth === 16) {
      const raw16 =
        ((raw[sourceOffset] ?? 0) << 8) | (raw[sourceOffset + 1] ?? 0);
      red = (raw[sourceOffset] ?? 0) & 0xf8;
      green =
        (((((raw[sourceOffset] ?? 0) & 0x07) << 3) |
          ((raw[sourceOffset + 1] ?? 0) >> 5)) <<
          2) &
        0xff;
      blue = (((raw[sourceOffset + 1] ?? 0) & 0x1f) << 3) & 0xff;
      if (transparent && raw16 === 0xf81f) {
        alpha = 0;
      }
    } else if (header.blockDepth === 24) {
      red = raw[sourceOffset] ?? 0;
      green = raw[sourceOffset + 1] ?? 0;
      blue = raw[sourceOffset + 2] ?? 0;
      if (
        transparent &&
        red === TRUECOLOR_TRANSPARENT_KEY.r &&
        green === TRUECOLOR_TRANSPARENT_KEY.g &&
        blue === TRUECOLOR_TRANSPARENT_KEY.b
      ) {
        alpha = 0;
      }
    } else {
      red = raw[sourceOffset + 1] ?? 0;
      green = raw[sourceOffset + 2] ?? 0;
      blue = raw[sourceOffset + 3] ?? 0;
      if (
        transparent &&
        (raw[sourceOffset] ?? 0) === 0 &&
        red === TRUECOLOR_TRANSPARENT_KEY.r &&
        green === TRUECOLOR_TRANSPARENT_KEY.g &&
        blue === TRUECOLOR_TRANSPARENT_KEY.b
      ) {
        alpha = 0;
      }
    }

    const targetOffset = pixelIndex * 4;
    rgba[targetOffset] = red;
    rgba[targetOffset + 1] = green;
    rgba[targetOffset + 2] = blue;
    rgba[targetOffset + 3] = alpha;
  }

  return rgba;
}

function compositeBlockToRgba(
  header: MappyHeaderDocument,
  palette: Uint8Array | null,
  blockGraphics: Uint8Array,
  block: MappyBlockStructureDocument,
) {
  const pixelCount = header.blockWidth * header.blockHeight;
  const composed = new Uint8ClampedArray(pixelCount * 4);
  const background = decodeGraphicBlockToRgba(
    header,
    palette,
    blockGraphics,
    block.backgroundOffset,
    false,
  );
  composed.set(background);

  for (const offset of [
    block.foregroundOffset,
    block.foregroundOffset2,
    block.foregroundOffset3,
  ]) {
    if (offset <= 0) {
      continue;
    }

    const overlay = decodeGraphicBlockToRgba(
      header,
      palette,
      blockGraphics,
      offset,
      true,
    );
    for (let index = 0; index < pixelCount; index += 1) {
      const targetOffset = index * 4;
      if ((overlay[targetOffset + 3] ?? 0) === 0) {
        continue;
      }

      composed[targetOffset] = overlay[targetOffset] ?? 0;
      composed[targetOffset + 1] = overlay[targetOffset + 1] ?? 0;
      composed[targetOffset + 2] = overlay[targetOffset + 2] ?? 0;
      composed[targetOffset + 3] = overlay[targetOffset + 3] ?? 255;
    }
  }

  return composed;
}

function isDefaultBlankBlock(
  blockIndex: number,
  block: MappyBlockStructureDocument,
  header: MappyHeaderDocument,
  blockGraphics: Uint8Array,
) {
  if (blockIndex !== 0) {
    return false;
  }

  if (
    block.backgroundOffset !== 0 ||
    block.foregroundOffset !== 0 ||
    block.foregroundOffset2 !== 0 ||
    block.foregroundOffset3 !== 0 ||
    block.userLong1 !== 0 ||
    block.userLong2 !== 0 ||
    block.userShort1 !== 0 ||
    block.userShort2 !== 0 ||
    block.userByte1 !== 0 ||
    block.userByte2 !== 0 ||
    block.userByte3 !== 0 ||
    block.flags !== 0
  ) {
    return false;
  }

  const bytesPerPixel = getGraphicBytesPerPixel(header.blockDepth);
  const byteLength = header.blockWidth * header.blockHeight * bytesPerPixel;
  for (let index = 0; index < byteLength; index += 1) {
    if ((blockGraphics[index] ?? 0) !== 0) {
      return false;
    }
  }

  return true;
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

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Failed to encode a PNG tileset image."));
    }, "image/png");
  });
}

async function buildImportedTileset(
  fileName: string,
  header: MappyHeaderDocument,
  blockGraphics: Uint8Array,
  palette: Uint8Array | null,
  blockStructures: readonly MappyBlockStructureDocument[],
  usedBlockOffsets: readonly number[],
) {
  if (usedBlockOffsets.length === 0) {
    return {
      tileset: null,
      tileRefByOffset: new Map<number, TileRef>(),
    };
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(usedBlockOffsets.length)));
  const rows = Math.max(1, Math.ceil(usedBlockOffsets.length / columns));
  const { canvas, context } = createCanvas(
    columns * header.blockWidth,
    rows * header.blockHeight,
  );

  const tileRefByOffset = new Map<number, TileRef>();
  const tilesetId = generateTilesetId();

  for (let index = 0; index < usedBlockOffsets.length; index += 1) {
    const blockOffset = usedBlockOffsets[index] ?? 0;
    const blockIndex = blockOffset / header.blockStructureSize;
    const block = blockStructures[blockIndex];
    if (!block) {
      throw new Error("Mappy layer references an unknown block structure.");
    }

    const x = (index % columns) * header.blockWidth;
    const y = Math.floor(index / columns) * header.blockHeight;
    const imageData = context.createImageData(
      header.blockWidth,
      header.blockHeight,
    );
    imageData.data.set(
      compositeBlockToRgba(header, palette, blockGraphics, block),
    );
    context.putImageData(imageData, x, y);

    tileRefByOffset.set(blockOffset, {
      tilesetId,
      sx: x,
      sy: y,
      sw: header.blockWidth,
      sh: header.blockHeight,
    });
  }

  const assetId = generateAssetId();
  const blob = await canvasToPngBlob(canvas);
  await saveAsset(assetId, await blob.arrayBuffer(), "image/png");
  const tileSize = toSupportedTileSize(header.blockWidth);

  return {
    tileRefByOffset,
    tileset: {
      id: tilesetId,
      name: `${normalizeMapName(fileName)}-tileset`,
      groupId: IMPORT_TILESET_GROUP_ID as Tileset["groupId"],
      tileSize,
      assetId,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      createdAt: Date.now(),
    } satisfies Tileset,
  };
}

function buildMapProperties(document: MappyMapDocument) {
  const properties: Record<string, PropertyValue> = {
    "mappy:version": {
      type: "string",
      value: `${document.header.mapVersionHigh}.${document.header.mapVersionLow}`,
    },
    "mappy:block-depth": {
      type: "int",
      value: String(document.header.blockDepth),
    },
  };

  if (document.author?.name) {
    properties["mappy:author-name"] = {
      type: "string",
      value: document.author.name,
    };
  }
  if (document.author?.info1) {
    properties["mappy:author-info-1"] = {
      type: "string",
      value: document.author.info1,
    };
  }
  if (document.author?.info2) {
    properties["mappy:author-info-2"] = {
      type: "string",
      value: document.author.info2,
    };
  }
  if (document.author?.info3) {
    properties["mappy:author-info-3"] = {
      type: "string",
      value: document.author.info3,
    };
  }

  return properties;
}

export async function importMappyMap(
  fileName: string,
  rootData: Uint8Array,
): Promise<MappyMapImportResult> {
  const document = parseMappyDocument(rootData);
  const tileSize = toSupportedTileSize(document.header.blockWidth);
  const referencedOffsets = new Set<number>();

  for (const layer of document.layerCells) {
    for (const cell of layer) {
      if (cell < 0) {
        throw new Error(
          "Animated Mappy blocks are not supported in this build.",
        );
      }
      if (cell === 0) {
        continue;
      }
      if (cell % document.header.blockStructureSize !== 0) {
        throw new Error("Mappy layer references a misaligned block structure.");
      }
      referencedOffsets.add(cell);
    }
  }

  if (
    document.blockStructures[0] &&
    isDefaultBlankBlock(
      0,
      document.blockStructures[0],
      document.header,
      document.blockGraphics,
    )
  ) {
    referencedOffsets.delete(0);
  }

  const orderedOffsets = Array.from(referencedOffsets).sort(
    (left, right) => left - right,
  );
  const { tileset, tileRefByOffset } = await buildImportedTileset(
    fileName,
    document.header,
    document.blockGraphics,
    document.palette,
    document.blockStructures,
    orderedOffsets,
  );

  const mapId = generateMapId();
  const layers: TileLayer[] = [];
  const layerOrder: TileMapData["layerOrder"] = [];

  for (
    let layerIndex = 0;
    layerIndex < document.layerCells.length;
    layerIndex += 1
  ) {
    const cells = document.layerCells[layerIndex];
    const layerId = generateLayerId();
    const tiles: TileLayer["tiles"] = {};

    for (let index = 0; index < cells.length; index += 1) {
      const blockOffset = cells[index] ?? 0;
      const ref = tileRefByOffset.get(blockOffset);
      if (!ref) {
        continue;
      }
      const x = index % document.header.mapWidth;
      const y = Math.floor(index / document.header.mapWidth);
      tiles[`${x},${y}`] = ref;
    }

    const layer: TileLayer = {
      id: layerId,
      mapId,
      name: layerIndex === 0 ? "Base Layer" : `Layer ${layerIndex + 1}`,
      type: "tile",
      visible: true,
      locked: false,
      tiles,
    };

    layers.push(layer);
    layerOrder.push(layerId);
  }

  return {
    map: {
      id: mapId,
      name: normalizeMapName(fileName),
      groupId: IMPORT_MAP_GROUP_ID as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles: document.header.mapWidth,
      heightInTiles: document.header.mapHeight,
      tileSize,
      properties: buildMapProperties(document),
      layerOrder,
      createdAt: Date.now(),
    },
    layers,
    tilesets: tileset ? [tileset] : [],
    imageLayers: [],
    layerGroups: [],
    objectLayers: [],
    objects: [],
  };
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
  const result = new Map<string, LoadedTilesetImage>();

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

async function rasterizeTileRefToRaw24(
  loadedTileset: LoadedTilesetImage,
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
