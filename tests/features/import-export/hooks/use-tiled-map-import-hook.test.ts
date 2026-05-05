import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import { useTiledMapImport } from "@/features/import-export/hooks/use-tiled-map-import";
import type { TiledImportMissingResource, TiledMapImportResult } from "@/types";

const hookMocks = vi.hoisted(() => ({
  getLinkedImportResourceAccept: vi.fn((kind: string) => `.${kind}`),
  pickSingleFile: vi.fn(),
  prepareTiledMapImport: vi.fn(),
  readFileAsUint8Array: vi.fn(),
}));

vi.mock("@/utils/format", () => ({
  readFileAsUint8Array: hookMocks.readFileAsUint8Array,
}));

vi.mock("@/features/import-export/lib/import-export-action-utils", () => ({
  pickSingleFile: hookMocks.pickSingleFile,
}));

vi.mock("@/features/import-export/lib/tiled-map-import", () => ({
  prepareTiledMapImport: hookMocks.prepareTiledMapImport,
}));

vi.mock("@/features/import-export/lib/linked-resource-utils", () => ({
  getLinkedImportResourceAccept: hookMocks.getLinkedImportResourceAccept,
}));

const originalAlert = globalThis.alert;
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalActEnvironment = (
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;
const { window } = parseHTML("<html><body></body></html>");

function installReactDomEnvironment() {
  Object.assign(globalThis, {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
  });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
}

async function renderTiledMapImportHook(
  enabled = true,
  onImportResolved: (
    result: TiledMapImportResult,
  ) => void | Promise<void> = vi.fn(),
) {
  installReactDomEnvironment();

  let current: ReturnType<typeof useTiledMapImport> | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    current = useTiledMapImport(enabled, onImportResolved);
    return null;
  }

  await act(async () => {
    root.render(createElement(Harness));
  });

  return {
    getCurrent() {
      if (!current) {
        throw new Error("Hook did not render.");
      }

      return current;
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();

  if (originalAlert) {
    globalThis.alert = originalAlert;
  } else {
    Reflect.deleteProperty(globalThis, "alert");
  }

  if (originalDocument) {
    Object.assign(globalThis, { document: originalDocument });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (originalWindow) {
    Object.assign(globalThis, { window: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  if (typeof originalActEnvironment === "boolean") {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});

test("useTiledMapImport returns false without opening a picker when disabled", async () => {
  const rendered = await renderTiledMapImportHook(false);

  await act(async () => {
    await expect(rendered.getCurrent().handleImportTiledMap()).resolves.toBe(
      false,
    );
  });

  expect(hookMocks.pickSingleFile).not.toHaveBeenCalled();

  await rendered.unmount();
});

test("useTiledMapImport alerts for unsupported map file types", async () => {
  const rendered = await renderTiledMapImportHook();
  const alertMock = vi.fn();
  globalThis.alert = alertMock;

  hookMocks.pickSingleFile.mockResolvedValueOnce(
    new File(["zip"], "bundle.zip", { type: "application/zip" }),
  );

  await act(async () => {
    await expect(rendered.getCurrent().handleImportTiledMap()).resolves.toBe(
      false,
    );
  });

  expect(alertMock).toHaveBeenCalledWith("Unsupported Tiled map file type.");
  expect(hookMocks.readFileAsUint8Array).not.toHaveBeenCalled();

  await rendered.unmount();
});

test("useTiledMapImport resolves a ready import immediately", async () => {
  const file = new File(["tmx"], "level.tmx", { type: "text/xml" });
  const rootData = new Uint8Array([1, 2, 3]);
  const imported = {
    map: { tileSize: 16 },
    warnings: [],
  } as unknown as TiledMapImportResult;
  const onImportResolved = vi.fn();
  const rendered = await renderTiledMapImportHook(true, onImportResolved);

  hookMocks.readFileAsUint8Array.mockResolvedValueOnce(rootData);
  hookMocks.prepareTiledMapImport.mockResolvedValueOnce({
    status: "ready",
    result: imported,
  });

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledMap(file),
    ).resolves.toBe(true);
  });

  expect(hookMocks.prepareTiledMapImport).toHaveBeenCalledWith(
    "level.tmx",
    [{ path: "level.tmx", data: rootData }],
    "xml",
  );
  expect(onImportResolved).toHaveBeenCalledWith(imported);
  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    false,
  );

  await rendered.unmount();
});

test("useTiledMapImport collects linked resources and resolves the import", async () => {
  const rootFile = new File(["{}"], "level.tmj", { type: "application/json" });
  const resourceFile = new File(["tsx"], "terrain.tsx", {
    type: "text/xml",
  });
  const rootData = new Uint8Array([1, 2, 3]);
  const resourceData = new Uint8Array([4, 5, 6]);
  const missingResource = {
    kind: "tsx",
    label: "External tileset",
    path: "tilesets/terrain.tsx",
    referringPath: "maps/level.tmj",
  } satisfies TiledImportMissingResource;
  const imported = {
    map: { tileSize: 16 },
    warnings: [],
  } as unknown as TiledMapImportResult;
  const onImportResolved = vi.fn();
  const rendered = await renderTiledMapImportHook(true, onImportResolved);

  hookMocks.readFileAsUint8Array
    .mockResolvedValueOnce(rootData)
    .mockResolvedValueOnce(resourceData);
  hookMocks.prepareTiledMapImport
    .mockResolvedValueOnce({
      status: "missing-resources",
      format: "json",
      missingResources: [missingResource],
      resourceFilesByPath: {},
      rootData,
      rootPath: "level.tmj",
    })
    .mockResolvedValueOnce({
      status: "ready",
      result: imported,
    });
  hookMocks.pickSingleFile.mockResolvedValueOnce(resourceFile);

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledMap(rootFile),
    ).resolves.toBe(true);
  });

  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    true,
  );

  await act(async () => {
    await rendered.getCurrent().tiledMissingResourcesDialogProps.onImport();
  });

  expect(hookMocks.prepareTiledMapImport).toHaveBeenCalledTimes(1);

  await act(async () => {
    await rendered
      .getCurrent()
      .tiledMissingResourcesDialogProps.onSelectFile(missingResource);
  });

  expect(hookMocks.getLinkedImportResourceAccept).toHaveBeenCalledWith("tsx");
  expect(
    rendered.getCurrent().tiledMissingResourcesDialogProps.selectedFileNames[
      missingResource.path
    ],
  ).toBe("terrain.tsx");

  await act(async () => {
    await rendered.getCurrent().tiledMissingResourcesDialogProps.onImport();
  });

  expect(hookMocks.prepareTiledMapImport).toHaveBeenCalledWith(
    "level.tmj",
    [
      { path: "level.tmj", data: rootData },
      { path: "tilesets/terrain.tsx", data: resourceData },
    ],
    "json",
  );
  expect(onImportResolved).toHaveBeenCalledWith(imported);
  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    false,
  );

  await rendered.unmount();
});

test("useTiledMapImport clears pending resources when the dialog closes", async () => {
  const rootFile = new File(["{}"], "level.tmj", { type: "application/json" });
  const rootData = new Uint8Array([1, 2, 3]);
  const missingResource = {
    kind: "tsx",
    label: "External tileset",
    path: "tilesets/terrain.tsx",
    referringPath: "maps/level.tmj",
  } satisfies TiledImportMissingResource;
  const rendered = await renderTiledMapImportHook();

  hookMocks.readFileAsUint8Array.mockResolvedValueOnce(rootData);
  hookMocks.prepareTiledMapImport.mockResolvedValueOnce({
    status: "missing-resources",
    format: "json",
    missingResources: [missingResource],
    resourceFilesByPath: {},
    rootData,
    rootPath: "level.tmj",
  });

  await act(async () => {
    await rendered.getCurrent().handleImportTiledMap(rootFile);
  });

  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    true,
  );

  await act(async () => {
    rendered.getCurrent().tiledMissingResourcesDialogProps.onOpenChange(false);
  });

  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    false,
  );
  expect(
    rendered.getCurrent().tiledMissingResourcesDialogProps.selectedFileNames,
  ).toEqual({});
  expect(
    rendered.getCurrent().tiledMissingResourcesDialogProps.isSubmitting,
  ).toBe(false);

  await rendered.unmount();
});

test("useTiledMapImport alerts when the initial import fails", async () => {
  const file = new File(["tmx"], "level.tmx", { type: "text/xml" });
  const rootData = new Uint8Array([1, 2, 3]);
  const alertMock = vi.fn();
  const consoleErrorMock = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const rendered = await renderTiledMapImportHook();

  globalThis.alert = alertMock;
  hookMocks.readFileAsUint8Array.mockResolvedValueOnce(rootData);
  hookMocks.prepareTiledMapImport.mockRejectedValueOnce(new Error("boom"));

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledMap(file),
    ).resolves.toBe(false);
  });

  expect(alertMock).toHaveBeenCalledWith("boom");
  expect(consoleErrorMock).toHaveBeenCalled();

  consoleErrorMock.mockRestore();
  await rendered.unmount();
});

test("useTiledMapImport keeps the dialog open and resets submitting when resource resolution fails", async () => {
  const rootFile = new File(["{}"], "level.tmj", { type: "application/json" });
  const resourceFile = new File(["tsx"], "terrain.tsx", {
    type: "text/xml",
  });
  const rootData = new Uint8Array([1, 2, 3]);
  const resourceData = new Uint8Array([4, 5, 6]);
  const missingResource = {
    kind: "tsx",
    label: "External tileset",
    path: "tilesets/terrain.tsx",
    referringPath: "maps/level.tmj",
  } satisfies TiledImportMissingResource;
  const alertMock = vi.fn();
  const consoleErrorMock = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const rendered = await renderTiledMapImportHook();

  globalThis.alert = alertMock;
  hookMocks.readFileAsUint8Array
    .mockResolvedValueOnce(rootData)
    .mockResolvedValueOnce(resourceData);
  hookMocks.prepareTiledMapImport
    .mockResolvedValueOnce({
      status: "missing-resources",
      format: "json",
      missingResources: [missingResource],
      resourceFilesByPath: {},
      rootData,
      rootPath: "level.tmj",
    })
    .mockRejectedValueOnce(new Error("still broken"));
  hookMocks.pickSingleFile.mockResolvedValueOnce(resourceFile);

  await act(async () => {
    await rendered.getCurrent().handleImportTiledMap(rootFile);
  });
  await act(async () => {
    await rendered
      .getCurrent()
      .tiledMissingResourcesDialogProps.onSelectFile(missingResource);
  });
  await act(async () => {
    await rendered.getCurrent().tiledMissingResourcesDialogProps.onImport();
  });

  expect(alertMock).toHaveBeenCalledWith("still broken");
  expect(consoleErrorMock).toHaveBeenCalled();
  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    true,
  );
  expect(
    rendered.getCurrent().tiledMissingResourcesDialogProps.isSubmitting,
  ).toBe(false);

  consoleErrorMock.mockRestore();
  await rendered.unmount();
});
