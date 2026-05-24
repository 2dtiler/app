import type {
  AiImageDataUrlParts,
  AiImageDimensions,
  AiProviderImage,
  AiProviderImageSourceOptions,
} from "@/types/integrations/ai-assets";

function parseImageDataUrl(dataUrl: string): AiImageDataUrlParts | null {
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  return {
    mimeType: match[1] ?? "image/png",
    base64: match[2] ?? "",
  };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function arrayBufferToDataUrl(
  data: ArrayBuffer,
  mimeType: string,
): string {
  return `data:${mimeType};base64,${arrayBufferToBase64(data)}`;
}

async function decodeImageBlob(blob: Blob): Promise<HTMLImageElement> {
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

function getDecodedImageDimensions(image: HTMLImageElement): AiImageDimensions {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function getNormalizedTargetDimensions(
  dimensions: AiImageDimensions | null | undefined,
): AiImageDimensions | null {
  if (!dimensions) return null;
  const width = Math.round(dimensions.width);
  const height = Math.round(dimensions.height);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function getImageSourceOptions(
  fallbackMimeTypeOrOptions: string | AiProviderImageSourceOptions,
  targetDimensions: AiImageDimensions | null | undefined,
): AiProviderImageSourceOptions {
  if (typeof fallbackMimeTypeOrOptions === "string") {
    return {
      fallbackMimeType: fallbackMimeTypeOrOptions,
      targetDimensions,
    };
  }
  return fallbackMimeTypeOrOptions;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to scale generated image."));
        return;
      }
      resolve(blob);
    }, mimeType);
  });
}

async function scaleDecodedImageToBlob(
  image: HTMLImageElement,
  targetDimensions: AiImageDimensions,
  mimeType: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = targetDimensions.width;
  canvas.height = targetDimensions.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("No canvas context available for generated image scaling.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    0,
    0,
    targetDimensions.width,
    targetDimensions.height,
  );
  return canvasToBlob(canvas, mimeType);
}

export async function getImageDimensionsFromBlob(
  blob: Blob,
): Promise<AiImageDimensions> {
  return getDecodedImageDimensions(await decodeImageBlob(blob));
}

export async function imageSourceToProviderImage(
  source: string | Blob,
  fallbackMimeTypeOrOptions:
    | string
    | AiProviderImageSourceOptions = "image/png",
  targetDimensions?: AiImageDimensions | null,
): Promise<AiProviderImage> {
  const options = getImageSourceOptions(
    fallbackMimeTypeOrOptions,
    targetDimensions,
  );
  const fallbackMimeType = options.fallbackMimeType ?? "image/png";
  const requestedDimensions = getNormalizedTargetDimensions(
    options.targetDimensions,
  );
  let blob: Blob;

  if (source instanceof Blob) {
    blob = source;
  } else {
    const dataUrlParts = parseImageDataUrl(source);
    if (dataUrlParts) {
      blob = new Blob([base64ToArrayBuffer(dataUrlParts.base64)], {
        type: dataUrlParts.mimeType,
      });
    } else {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch generated image ${response.status}`);
      }
      blob = await response.blob();
    }
  }

  const image = await decodeImageBlob(blob);
  const dimensions = getDecodedImageDimensions(image);
  const outputBlob =
    requestedDimensions &&
    (dimensions.width !== requestedDimensions.width ||
      dimensions.height !== requestedDimensions.height)
      ? await scaleDecodedImageToBlob(
          image,
          requestedDimensions,
          blob.type || fallbackMimeType,
        )
      : blob;
  const outputDimensions = requestedDimensions ?? dimensions;

  return {
    data: await outputBlob.arrayBuffer(),
    mimeType: outputBlob.type || blob.type || fallbackMimeType,
    width: outputDimensions.width,
    height: outputDimensions.height,
  };
}
