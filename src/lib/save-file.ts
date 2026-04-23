import type {
  NativeSaveFilePickerOptions,
  NativeSaveWindow,
} from "@/types/import-export/file-save";

const DEFAULT_DOWNLOAD_MIME_TYPE = "application/octet-stream";

const SAVE_FILE_DESCRIPTIONS: Record<string, string> = {
  ".2dp": "2dtiler Project",
  ".2dm": "2dtiler Map",
  ".2dt": "2dtiler Tileset",
  ".zip": "ZIP Archive",
  ".png": "PNG Image",
  ".jpg": "JPEG Image",
  ".jpeg": "JPEG Image",
  ".webp": "WebP Image",
  ".bmp": "Bitmap Image",
  ".gif": "GIF Image",
};

const SAVE_FILE_MIME_TYPES: Record<string, string> = {
  ".2dp": DEFAULT_DOWNLOAD_MIME_TYPE,
  ".2dm": DEFAULT_DOWNLOAD_MIME_TYPE,
  ".2dt": DEFAULT_DOWNLOAD_MIME_TYPE,
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
};

function downloadBlobFallback(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function getFileExtension(filename: string): string {
  const extensionIndex = filename.lastIndexOf(".");
  if (extensionIndex < 0) {
    return "";
  }

  return filename.slice(extensionIndex).toLowerCase();
}

function getSavePickerOptions(filename: string, mimeType: string) {
  const extension = getFileExtension(filename);
  if (!extension) {
    return {
      suggestedName: filename,
    } satisfies NativeSaveFilePickerOptions;
  }

  return {
    suggestedName: filename,
    types: [
      {
        description: SAVE_FILE_DESCRIPTIONS[extension] ?? "Exported File",
        accept: {
          [SAVE_FILE_MIME_TYPES[extension] ?? mimeType]: [extension],
        },
      },
    ],
  } satisfies NativeSaveFilePickerOptions;
}

function canUseNativeSavePicker(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const saveWindow = window as NativeSaveWindow;

  return (
    window.isSecureContext &&
    typeof saveWindow.showSaveFilePicker === "function"
  );
}

function isUserCanceledSave(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function saveBlobWithPicker(blob: Blob, filename: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Native save picker is unavailable.");
  }

  const saveWindow = window as NativeSaveWindow;
  const showSaveFilePicker = saveWindow.showSaveFilePicker;
  if (!showSaveFilePicker) {
    throw new Error("Native save picker is unavailable.");
  }

  const handle = await showSaveFilePicker(
    getSavePickerOptions(filename, blob.type || DEFAULT_DOWNLOAD_MIME_TYPE),
  );
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function saveBlobFile(
  blob: Blob,
  filename: string,
): Promise<void> {
  if (canUseNativeSavePicker()) {
    try {
      await saveBlobWithPicker(blob, filename);
      return;
    } catch (error) {
      if (isUserCanceledSave(error)) {
        return;
      }

      console.error(
        "[Save File] Native save failed; falling back to browser download.",
        error,
      );
    }
  }

  downloadBlobFallback(blob, filename);
}

export async function saveByteArrayFile(
  data: Uint8Array,
  filename: string,
  mimeType = DEFAULT_DOWNLOAD_MIME_TYPE,
): Promise<void> {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], {
    type: mimeType,
  });
  await saveBlobFile(blob, filename);
}
