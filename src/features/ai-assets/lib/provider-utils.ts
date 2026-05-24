import type { AiProviderImage } from "@/types/integrations/ai-assets";

interface DataUrlParts {
  mimeType: string;
  base64: string;
}

function parseImageDataUrl(dataUrl: string): DataUrlParts | null {
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

export async function getImageDimensionsFromBlob(blob: Blob): Promise<{
  width: number;
  height: number;
}> {
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
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function imageSourceToProviderImage(
  source: string | Blob,
  fallbackMimeType = "image/png",
): Promise<AiProviderImage> {
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

  const dimensions = await getImageDimensionsFromBlob(blob);
  return {
    data: await blob.arrayBuffer(),
    mimeType: blob.type || fallbackMimeType,
    width: dimensions.width,
    height: dimensions.height,
  };
}
