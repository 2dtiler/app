import type {
  NativeSaveFilePickerOptions,
  NativeSaveFileHandle,
  SaveBlobFileOptions,
  SaveBlobFileResult,
  NativeSaveWindow,
} from "@/features/import-export/types";

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

async function ensureWritePermission(
  fileHandle: NativeSaveFileHandle,
): Promise<boolean> {
  const descriptor = { mode: "readwrite" as const };

  if (fileHandle.queryPermission) {
    const currentState = await fileHandle.queryPermission(descriptor);
    if (currentState === "granted") {
      return true;
    }
  }

  if (fileHandle.requestPermission) {
    const requestedState = await fileHandle.requestPermission(descriptor);
    return requestedState === "granted";
  }

  return true;
}

async function writeBlobToHandle(
  blob: Blob,
  fileHandle: NativeSaveFileHandle,
): Promise<void> {
  const hasPermission = await ensureWritePermission(fileHandle);
  if (!hasPermission) {
    throw new DOMException("The user denied write permission.", "AbortError");
  }

  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function pickSaveFileHandle(
  filename: string,
  mimeType: string,
): Promise<NativeSaveFileHandle> {
  if (typeof window === "undefined") {
    throw new Error("Native save picker is unavailable.");
  }

  const saveWindow = window as NativeSaveWindow;
  const showSaveFilePicker = saveWindow.showSaveFilePicker;
  if (!showSaveFilePicker) {
    throw new Error("Native save picker is unavailable.");
  }

  return showSaveFilePicker(
    getSavePickerOptions(filename, mimeType || DEFAULT_DOWNLOAD_MIME_TYPE),
  );
}

export async function saveBlobFileWithResult(
  blob: Blob,
  filename: string,
  options: SaveBlobFileOptions = {},
): Promise<SaveBlobFileResult> {
  if (options.fileHandle) {
    try {
      await writeBlobToHandle(blob, options.fileHandle);
      return {
        status: "saved",
        filename,
        fileHandle: options.fileHandle,
        reusedExistingHandle: true,
      };
    } catch (error) {
      if (isUserCanceledSave(error)) {
        return {
          status: "cancelled",
          filename,
          fileHandle: options.fileHandle,
          reusedExistingHandle: true,
        };
      }

      console.error(
        "[Save File] Existing file handle save failed; trying picker or download fallback.",
        error,
      );
    }
  }

  if (canUseNativeSavePicker()) {
    try {
      const fileHandle = await pickSaveFileHandle(
        filename,
        blob.type || DEFAULT_DOWNLOAD_MIME_TYPE,
      );
      await writeBlobToHandle(blob, fileHandle);
      return {
        status: "saved",
        filename,
        fileHandle,
        reusedExistingHandle: false,
      };
    } catch (error) {
      if (isUserCanceledSave(error)) {
        return {
          status: "cancelled",
          filename,
          reusedExistingHandle: false,
        };
      }

      console.error(
        "[Save File] Native save failed; falling back to browser download.",
        error,
      );
    }
  }

  downloadBlobFallback(blob, filename);
  return {
    status: "downloaded",
    filename,
    reusedExistingHandle: false,
  };
}

export async function saveBlobFile(
  blob: Blob,
  filename: string,
): Promise<boolean> {
  const result = await saveBlobFileWithResult(blob, filename);
  return result.status !== "cancelled";
}

export async function saveByteArrayFileWithResult(
  data: Uint8Array,
  filename: string,
  mimeType = DEFAULT_DOWNLOAD_MIME_TYPE,
  options: SaveBlobFileOptions = {},
): Promise<SaveBlobFileResult> {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], {
    type: mimeType,
  });
  return saveBlobFileWithResult(blob, filename, options);
}

export async function saveByteArrayFile(
  data: Uint8Array,
  filename: string,
  mimeType = DEFAULT_DOWNLOAD_MIME_TYPE,
): Promise<boolean> {
  const result = await saveByteArrayFileWithResult(data, filename, mimeType);
  return result.status !== "cancelled";
}
