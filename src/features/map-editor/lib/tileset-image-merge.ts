import { getAsset, saveAsset } from "@/services/db";
import { generateAssetId } from "@/utils/ids";
import type {
  AssetId,
  TileSize,
} from "@/types";
import type {
  TilesetImageImportPosition,
  TilesetImageMergeRequest,
  TilesetImageMergeResult,
  TilesetPlacementCanvasSize,
} from "@/features/map-editor/types/tileset-import";

export const TILESET_MERGE_OUTPUT_MIME_TYPE = "image/png";

export function snapTilesetPlacementPosition(
  position: TilesetImageImportPosition,
  tileSize: TileSize,
): TilesetImageImportPosition {
  return {
    x: Math.max(0, Math.floor(position.x / tileSize) * tileSize),
    y: Math.max(0, Math.floor(position.y / tileSize) * tileSize),
  };
}

export function getTilesetPlacementCanvasSize(
  targetWidth: number,
  targetHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  position: TilesetImageImportPosition,
): TilesetPlacementCanvasSize {
  return {
    width: Math.max(targetWidth, position.x + sourceWidth),
    height: Math.max(targetHeight, position.y + sourceHeight),
  };
}

export async function mergeTilesetImageAtPosition({
  targetTileset,
  sourceImage,
  sourceWidth,
  sourceHeight,
  position,
}: TilesetImageMergeRequest): Promise<TilesetImageMergeResult> {
  const targetImage = await loadTilesetImageFromAsset(targetTileset.assetId);
  const canvasSize = getTilesetPlacementCanvasSize(
    targetTileset.imageWidth,
    targetTileset.imageHeight,
    sourceWidth,
    sourceHeight,
    position,
  );
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create 2D canvas context.");
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(targetImage, 0, 0);
  context.drawImage(sourceImage, position.x, position.y, sourceWidth, sourceHeight);

  const blob = await canvasToBlob(canvas, TILESET_MERGE_OUTPUT_MIME_TYPE);
  const assetId = generateAssetId();
  await saveAsset(assetId, await blob.arrayBuffer(), TILESET_MERGE_OUTPUT_MIME_TYPE);

  return {
    assetId,
    width: canvasSize.width,
    height: canvasSize.height,
    mimeType: TILESET_MERGE_OUTPUT_MIME_TYPE,
  };
}

async function loadTilesetImageFromAsset(assetId: AssetId): Promise<HTMLImageElement> {
  const record = await getAsset(assetId);
  if (!record) {
    throw new Error("Unable to load tileset image asset.");
  }

  const objectUrl = URL.createObjectURL(
    new Blob([record.data], { type: record.mimeType }),
  );

  try {
    const image = new Image();
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to decode image."));
      });
    }
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error(`Failed to encode canvas as ${mimeType}.`));
    }, mimeType);
  });
}