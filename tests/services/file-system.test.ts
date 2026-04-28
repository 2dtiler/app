import { afterEach, expect, test, vi } from "vitest";
import type {
  NativeSaveFileHandle,
  NativeSaveWindow,
} from "@/features/import-export/types";
import {
  saveBlobFile,
  saveBlobFileWithResult,
  saveByteArrayFile,
} from "@/services/file-system";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const urlCtor = URL as typeof URL & {
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
};
const originalCreateObjectURL = urlCtor.createObjectURL;
const originalRevokeObjectURL = urlCtor.revokeObjectURL;

afterEach(() => {
  vi.restoreAllMocks();

  if (originalWindow) {
    Object.assign(globalThis, { window: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  if (originalDocument) {
    Object.assign(globalThis, { document: originalDocument });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (originalCreateObjectURL) {
    urlCtor.createObjectURL = originalCreateObjectURL;
  } else {
    Reflect.deleteProperty(urlCtor, "createObjectURL");
  }

  if (originalRevokeObjectURL) {
    urlCtor.revokeObjectURL = originalRevokeObjectURL;
  } else {
    Reflect.deleteProperty(urlCtor, "revokeObjectURL");
  }
});

function installWindow(windowValue: NativeSaveWindow) {
  Object.assign(globalThis, { window: windowValue });
}

function installDownloadDocument() {
  const anchor = {
    click: vi.fn(),
    download: "",
    href: "",
  } as unknown as HTMLAnchorElement;
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const createElement = vi.fn(() => anchor);

  Object.assign(globalThis, {
    document: {
      body: {
        appendChild,
        removeChild,
      },
      createElement,
    } as unknown as Document,
  });

  return {
    anchor,
    appendChild,
    createElement,
    removeChild,
  };
}

function createFileHandle(overrides: Partial<NativeSaveFileHandle> = {}) {
  const writable = {
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const fileHandle = {
    createWritable: vi.fn(async () => writable),
    ...overrides,
  } satisfies NativeSaveFileHandle;

  return {
    fileHandle,
    writable,
  };
}

test("saveBlobFileWithResult writes through an existing handle when permission is granted", async () => {
  const { fileHandle, writable } = createFileHandle({
    queryPermission: vi.fn(async () => "granted"),
  });

  const result = await saveBlobFileWithResult(
    new Blob(["tile-map"]),
    "level.tmj",
    { fileHandle },
  );

  expect(result).toEqual({
    status: "saved",
    filename: "level.tmj",
    fileHandle,
    reusedExistingHandle: true,
  });
  expect(fileHandle.queryPermission).toHaveBeenCalledWith({
    mode: "readwrite",
  });
  expect(writable.write).toHaveBeenCalledTimes(1);
  expect(writable.close).toHaveBeenCalledTimes(1);
});

test("saveBlobFileWithResult reports cancellation when an existing handle denies write access", async () => {
  const { fileHandle } = createFileHandle({
    queryPermission: vi.fn(async () => "prompt"),
    requestPermission: vi.fn(async () => "denied"),
  });

  const result = await saveBlobFileWithResult(
    new Blob(["tile-map"]),
    "level.tmj",
    { fileHandle },
  );

  expect(result).toEqual({
    status: "cancelled",
    filename: "level.tmj",
    fileHandle,
    reusedExistingHandle: true,
  });
  expect(fileHandle.requestPermission).toHaveBeenCalledWith({
    mode: "readwrite",
  });
});

test("saveBlobFileWithResult falls back from a stale handle to the native picker", async () => {
  const staleHandle = createFileHandle({
    createWritable: vi.fn(async () => {
      throw new Error("disk removed");
    }),
  }).fileHandle;
  const { fileHandle: pickerHandle, writable } = createFileHandle();
  const showSaveFilePicker = vi.fn(async (options) => {
    expect(options).toEqual({
      suggestedName: "tiles.png",
      types: [
        {
          description: "PNG Image",
          accept: {
            "image/png": [".png"],
          },
        },
      ],
    });

    return pickerHandle;
  });

  installWindow({
    isSecureContext: true,
    showSaveFilePicker,
  } as NativeSaveWindow);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  const result = await saveBlobFileWithResult(
    new Blob(["png-bytes"], { type: "image/png" }),
    "tiles.png",
    { fileHandle: staleHandle },
  );

  expect(result).toEqual({
    status: "saved",
    filename: "tiles.png",
    fileHandle: pickerHandle,
    reusedExistingHandle: false,
  });
  expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
  expect(writable.write).toHaveBeenCalledTimes(1);
  expect(console.error).toHaveBeenCalledTimes(1);
});

test("saveByteArrayFile uses the native picker without file-type metadata when the filename has no extension", async () => {
  const { fileHandle } = createFileHandle();
  const showSaveFilePicker = vi.fn(async (options) => {
    expect(options).toEqual({ suggestedName: "bundle" });
    return fileHandle;
  });

  installWindow({
    isSecureContext: true,
    showSaveFilePicker,
  } as NativeSaveWindow);

  await expect(
    saveByteArrayFile(new Uint8Array([1, 2, 3]), "bundle"),
  ).resolves.toBe(true);
  expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
});

test("saveBlobFile returns false when the user cancels the native picker", async () => {
  installWindow({
    isSecureContext: true,
    showSaveFilePicker: vi.fn(async () => {
      throw new DOMException("The user aborted save.", "AbortError");
    }),
  } as NativeSaveWindow);

  await expect(saveBlobFile(new Blob(["json"]), "level.json")).resolves.toBe(
    false,
  );
});

test("saveBlobFileWithResult falls back to a download when the native picker fails", async () => {
  const { anchor, appendChild, createElement, removeChild } =
    installDownloadDocument();
  const createObjectURL = vi.fn(() => "blob:file-system-fallback");
  const revokeObjectURL = vi.fn();
  urlCtor.createObjectURL = createObjectURL;
  urlCtor.revokeObjectURL = revokeObjectURL;
  installWindow({
    isSecureContext: true,
    showSaveFilePicker: vi.fn(async () => {
      throw new Error("picker failed");
    }),
  } as NativeSaveWindow);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  const result = await saveBlobFileWithResult(new Blob(["zip"]), "export.zip");

  expect(result).toEqual({
    status: "downloaded",
    filename: "export.zip",
    reusedExistingHandle: false,
  });
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(anchor.download).toBe("export.zip");
  expect(anchor.href).toBe("blob:file-system-fallback");
  expect(anchor.click).toHaveBeenCalledTimes(1);
  expect(createElement).toHaveBeenCalledWith("a");
  expect(appendChild).toHaveBeenCalledWith(anchor);
  expect(removeChild).toHaveBeenCalledWith(anchor);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:file-system-fallback");
  expect(console.error).toHaveBeenCalledTimes(1);
});

test("saveBlobFileWithResult downloads immediately when the native picker is unavailable", async () => {
  const { anchor } = installDownloadDocument();
  const createObjectURL = vi.fn(() => "blob:no-window");
  const revokeObjectURL = vi.fn();
  urlCtor.createObjectURL = createObjectURL;
  urlCtor.revokeObjectURL = revokeObjectURL;
  Reflect.deleteProperty(globalThis, "window");

  const result = await saveBlobFileWithResult(new Blob(["zip"]), "offline.zip");

  expect(result).toEqual({
    status: "downloaded",
    filename: "offline.zip",
    reusedExistingHandle: false,
  });
  expect(anchor.download).toBe("offline.zip");
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:no-window");
});
