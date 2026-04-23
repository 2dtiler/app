import {
  drawImageLayerWithOrientation,
  drawTileWithOrientation,
} from "@/features/map-editor/components/MapCanvas/texture-cache";
import { drawMapObjects } from "@/features/map-editor/components/MapCanvas/draw-map-objects";
import { getAsset, saveAsset } from "@/services/db";
import { generateAssetId } from "@/lib/ids";
import { getMapCellOrigin, getMapPixelSize } from "@/features/map-editor/lib/map-geometry";
import type {
  AssetId,
  ImportExportRasterAsset,
  ImportExportRasterExportOptions,
  ImportExportRasterFileType,
  ImportExportRenderableLayer,
  ImageLayer,
  LayerGroup,
  LayerId,
  LayerGroupId,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
} from "@/types";

export const RASTER_IMAGE_IMPORT_ACCEPT =
  "image/png,image/jpeg,image/webp,image/bmp,image/gif";

export const DEFAULT_RASTER_EXPORT_OPTIONS: ImportExportRasterExportOptions = {
  fileType: "png",
  quality: 92,
  transparency: true,
};

const RASTER_MIME_TYPES: Record<ImportExportRasterFileType, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  gif: "image/gif",
};

const RASTER_FILE_EXTENSIONS: Record<ImportExportRasterFileType, string> = {
  png: ".png",
  jpg: ".jpg",
  webp: ".webp",
  bmp: ".bmp",
  gif: ".gif",
};

const OPAQUE_BACKGROUND = "#ffffff";

export function getRasterFileExtension(
  format: ImportExportRasterFileType,
): string {
  return RASTER_FILE_EXTENSIONS[format];
}

export function getRasterMimeType(format: ImportExportRasterFileType): string {
  return RASTER_MIME_TYPES[format];
}

export function supportsRasterQuality(
  format: ImportExportRasterFileType,
): boolean {
  return format === "jpg" || format === "webp";
}

export function supportsRasterTransparency(
  format: ImportExportRasterFileType,
): boolean {
  return format === "png" || format === "webp" || format === "gif";
}

export async function pickRasterImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = RASTER_IMAGE_IMPORT_ACCEPT;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export async function importRasterAssetFromFile(
  file: File,
): Promise<ImportExportRasterAsset> {
  const mimeType = normalizeRasterMimeType(file);
  const buffer = await file.arrayBuffer();
  const image = await loadImageFromBlob(new Blob([buffer], { type: mimeType }));
  const assetId = generateAssetId();
  await saveAsset(assetId, buffer, mimeType);

  return {
    assetId,
    fileName: file.name,
    name: file.name.replace(/\.[^/.]+$/, "") || "Imported Image",
    mimeType,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

export async function renderTilesetToCanvas(
  tileset: Tileset,
): Promise<HTMLCanvasElement> {
  const image = await loadImageFromAssetId(tileset.assetId);
  if (!image) {
    throw new Error("Unable to load tileset image asset.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create 2D canvas context.");
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  return canvas;
}

export async function renderMapToCanvas(
  map: TileMapData,
  layers: TileLayer[],
  imageLayers: ImageLayer[],
  layerGroups: LayerGroup[],
  tilesets: Tileset[],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
): Promise<HTMLCanvasElement> {
  const pixelSize = getMapPixelSize(map, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(pixelSize.width));
  canvas.height = Math.max(1, Math.ceil(pixelSize.height));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create 2D canvas context.");
  }

  context.imageSmoothingEnabled = false;

  const tilesetImageEntries = await Promise.all(
    tilesets.map(
      async (tileset) =>
        [tileset.id, await loadImageFromAssetId(tileset.assetId)] as const,
    ),
  );
  const tilesetImageMap = new Map(tilesetImageEntries);

  const imageLayerAssetIds = [
    ...new Set(imageLayers.map((layer) => layer.assetId)),
  ];
  const imageLayerEntries = await Promise.all(
    imageLayerAssetIds.map(
      async (assetId) =>
        [assetId, await loadImageFromAssetId(assetId)] as const,
    ),
  );
  const imageLayerMap = new Map(imageLayerEntries);

  const orderedLayers = flattenRenderableLayers(
    map.layerOrder,
    layers,
    imageLayers,
    layerGroups,
  );

  for (const entry of orderedLayers) {
    if (entry.kind === "image") {
      if (!entry.layer.visible) continue;
      const image = imageLayerMap.get(entry.layer.assetId);
      if (!image) continue;
      context.save();
      context.globalAlpha =
        Math.max(0, Math.min(100, entry.layer.opacity ?? 100)) / 100;
      drawImageLayerWithOrientation(context, image, entry.layer);
      context.restore();
      continue;
    }

    if (!entry.layer.visible) continue;

    for (const [position, ref] of Object.entries(entry.layer.tiles) as [
      string,
      TileRef,
    ][]) {
      const image = tilesetImageMap.get(ref.tilesetId);
      if (!image) continue;

      const [x, y] = position.split(",").map((value) => Number(value));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const origin = getMapCellOrigin(map, 1, x, y);
      drawTileWithOrientation(
        context,
        image,
        ref,
        origin.x,
        origin.y,
        map.tileSize,
      );
    }
  }

  drawMapObjects(context, objectLayers, objects, null, null, null, null, 1);

  return canvas;
}

export async function encodeCanvasAsRaster(
  canvas: HTMLCanvasElement,
  options: ImportExportRasterExportOptions,
): Promise<Blob> {
  const requiresOpaqueBackground =
    !options.transparency || !supportsRasterTransparency(options.fileType);
  const workingCanvas = requiresOpaqueBackground
    ? copyCanvasWithBackground(canvas, OPAQUE_BACKGROUND)
    : canvas;

  switch (options.fileType) {
    case "png":
      return canvasToBlob(workingCanvas, getRasterMimeType("png"));
    case "jpg":
      return canvasToBlob(
        workingCanvas,
        getRasterMimeType("jpg"),
        normalizeRasterQuality(options.quality),
      );
    case "webp":
      return canvasToBlob(
        workingCanvas,
        getRasterMimeType("webp"),
        normalizeRasterQuality(options.quality),
      );
    case "gif":
      return encodeGif(workingCanvas, options.transparency);
    case "bmp":
      return encodeBmp(workingCanvas);
    default:
      throw new Error("Unsupported raster export format.");
  }
}

function flattenRenderableLayers(
  layerOrder: readonly (LayerId | LayerGroupId)[],
  layers: readonly TileLayer[],
  imageLayers: readonly ImageLayer[],
  groups: readonly LayerGroup[],
  parentVisible = true,
  parentLocked = false,
): ImportExportRenderableLayer[] {
  const tileLayerMap = new Map(
    layers.map((layer) => [layer.id as string, layer]),
  );
  const imageLayerMap = new Map(
    imageLayers.map((layer) => [layer.id as string, layer]),
  );
  const groupMap = new Map(groups.map((group) => [group.id as string, group]));

  function visit(
    nextLayerOrder: readonly (LayerId | LayerGroupId)[],
    nextParentVisible: boolean,
    nextParentLocked: boolean,
  ): ImportExportRenderableLayer[] {
    const orderedLayers: ImportExportRenderableLayer[] = [];

    for (const id of nextLayerOrder) {
      const group = groupMap.get(id as string);
      if (group) {
        orderedLayers.push(
          ...visit(
            group.childOrder,
            nextParentVisible && group.visible,
            nextParentLocked || group.locked,
          ),
        );
        continue;
      }

      const tileLayer = tileLayerMap.get(id as string);
      if (tileLayer) {
        orderedLayers.push({
          kind: "tile",
          layer: {
            ...tileLayer,
            visible: nextParentVisible && tileLayer.visible,
            locked: nextParentLocked || tileLayer.locked,
          },
        });
        continue;
      }

      const imageLayer = imageLayerMap.get(id as string);
      if (imageLayer) {
        orderedLayers.push({
          kind: "image",
          layer: {
            ...imageLayer,
            visible: nextParentVisible && imageLayer.visible,
            locked: nextParentLocked || imageLayer.locked,
          },
        });
      }
    }

    return orderedLayers;
  }

  return visit(layerOrder, parentVisible, parentLocked);
}

async function loadImageFromAssetId(
  assetId: AssetId,
): Promise<HTMLImageElement | null> {
  const record = await getAsset(assetId);
  if (!record) return null;
  return loadImageFromBlob(new Blob([record.data], { type: record.mimeType }));
}

function normalizeRasterMimeType(file: File): string {
  if (file.type) return file.type;

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return getRasterMimeType("jpg");
  }
  if (lowerName.endsWith(".webp")) {
    return getRasterMimeType("webp");
  }
  if (lowerName.endsWith(".bmp")) {
    return getRasterMimeType("bmp");
  }
  if (lowerName.endsWith(".gif")) {
    return getRasterMimeType("gif");
  }
  return getRasterMimeType("png");
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeRasterQuality(quality: number): number {
  return Math.max(0, Math.min(100, quality)) / 100;
}

function copyCanvasWithBackground(
  canvas: HTMLCanvasElement,
  background: string,
): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d");

  if (!context) {
    throw new Error("Unable to create 2D canvas context.");
  }

  context.imageSmoothingEnabled = false;
  context.fillStyle = background;
  context.fillRect(0, 0, copy.width, copy.height);
  context.drawImage(canvas, 0, 0);
  return copy;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error(`Failed to encode canvas as ${mimeType}.`));
      },
      mimeType,
      quality,
    );
  });
}

async function encodeGif(
  canvas: HTMLCanvasElement,
  transparency: boolean,
): Promise<Blob> {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create 2D canvas context.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rgba = new Uint8Array(imageData.data);
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const palette = quantize(rgba, 256);
  const indexed = applyPalette(rgba, palette);
  const gif = GIFEncoder();
  gif.writeFrame(indexed, canvas.width, canvas.height, {
    palette,
    delay: 0,
    transparent: transparency,
  });
  gif.finish();
  return new Blob([new Uint8Array(gif.bytes())], {
    type: getRasterMimeType("gif"),
  });
}

function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create 2D canvas context.");
  }

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buffer = new ArrayBuffer(fileSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);

  const pixelData = imageData.data;
  let offset = 54;

  for (let y = height - 1; y >= 0; y -= 1) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = rowStart + x * 4;
      bytes[offset] = pixelData[sourceIndex + 2];
      bytes[offset + 1] = pixelData[sourceIndex + 1];
      bytes[offset + 2] = pixelData[sourceIndex];
      offset += 3;
    }

    while ((offset - 54) % rowSize !== 0) {
      bytes[offset] = 0;
      offset += 1;
    }
  }

  return new Blob([buffer], { type: getRasterMimeType("bmp") });
}
