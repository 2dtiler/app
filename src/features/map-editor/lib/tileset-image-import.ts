import type { PendingTilesetImageImport } from "@/features/map-editor/types/tileset-import";

const RASTER_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|bmp|webp)$/i;

export function isTilesetImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    RASTER_IMAGE_EXTENSION_PATTERN.test(file.name)
  );
}

export function normalizeTilesetImageMimeType(
  file: Pick<File, "name" | "type">,
): string {
  if (file.type) return file.type;

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerName.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lowerName.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
}

export function getTilesetImportName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "") || "Imported Tileset";
}

export async function createPendingTilesetImageImport(
  file: File,
): Promise<PendingTilesetImageImport> {
  const mimeType = normalizeTilesetImageMimeType(file);
  const buffer = await file.arrayBuffer();
  const image = await loadTilesetImageFromBlob(
    new Blob([buffer], { type: mimeType }),
  );

  return {
    fileName: file.name,
    name: getTilesetImportName(file.name),
    mimeType,
    buffer,
    image,
    width: getImageWidth(image),
    height: getImageHeight(image),
  };
}

async function loadTilesetImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);

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

function getImageWidth(image: HTMLImageElement): number {
  return image.naturalWidth || image.width;
}

function getImageHeight(image: HTMLImageElement): number {
  return image.naturalHeight || image.height;
}
