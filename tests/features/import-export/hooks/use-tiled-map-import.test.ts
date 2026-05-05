import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import { PHASER_MAP_IMPORT_CONFIG } from "@/features/import-export/hooks/use-tiled-map-import";
import { useTiledProjectImport } from "@/features/import-export/hooks/use-tiled-project-import";
import type {
  TiledImportMissingResource,
  TiledProjectImportResult,
} from "@/types";

const hookMocks = vi.hoisted(() => ({
  pickSingleFile: vi.fn(),
  pickDirectoryFiles: vi.fn(),
  readFileAsUint8Array: vi.fn(),
  prepareTiledProjectImport: vi.fn(),
  prepareTiledProjectArchive: vi.fn(),
  getLinkedImportResourceAccept: vi.fn((kind: string) => `.${kind}`),
}));

vi.mock("@/utils/format", () => ({
  readFileAsUint8Array: hookMocks.readFileAsUint8Array,
}));

vi.mock("@/features/import-export/lib/import-export-action-utils", () => ({
  pickDirectoryFiles: hookMocks.pickDirectoryFiles,
  pickSingleFile: hookMocks.pickSingleFile,
}));

vi.mock("@/features/import-export/lib/import-export-tiled-project", () => ({
  prepareTiledProjectArchive: hookMocks.prepareTiledProjectArchive,
  prepareTiledProjectImport: hookMocks.prepareTiledProjectImport,
}));

vi.mock("@/features/import-export/lib/linked-resource-utils", () => ({
  getLinkedImportResourceAccept: hookMocks.getLinkedImportResourceAccept,
}));

const originalDocument = globalThis.document;
const originalAlert = globalThis.alert;
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

async function renderProjectImportHook(
  onImportResolved: (
    result: TiledProjectImportResult,
    suggestedProjectName: string,
  ) => void | Promise<void>,
) {
  installReactDomEnvironment();

  let current: ReturnType<typeof useTiledProjectImport> | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    current = useTiledProjectImport(onImportResolved);
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

test("PHASER_MAP_IMPORT_CONFIG only accepts JSON-style tilemaps", () => {
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.json")).toBe("json");
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmj")).toBe("json");
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.tmx")).toBeNull();
  expect(PHASER_MAP_IMPORT_CONFIG.detectFormat("level.lua")).toBeNull();
});

test("useTiledProjectImport imports zip projects and derives the project name", async () => {
  const zipFile = new File(["zip"], "demo.tiled-project.zip", {
    type: "application/zip",
  });
  const zipData = new Uint8Array([1, 2, 3]);
  const importResult = {
    maps: [{ map: { tileSize: 16 } }],
  } as unknown as TiledProjectImportResult;
  const onImportResolved = vi.fn();
  const rendered = await renderProjectImportHook(onImportResolved);

  hookMocks.pickSingleFile.mockResolvedValueOnce(zipFile);
  hookMocks.readFileAsUint8Array.mockResolvedValueOnce(zipData);
  hookMocks.prepareTiledProjectArchive.mockResolvedValueOnce({
    entries: [{ path: "demo.tiled-project", data: zipData }],
    preparation: {
      status: "ready",
      result: importResult,
    },
  });

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(true);
  });

  expect(hookMocks.prepareTiledProjectArchive).toHaveBeenCalledWith(zipData);
  expect(onImportResolved).toHaveBeenCalledWith(importResult, "demo");
  expect(hookMocks.pickDirectoryFiles).not.toHaveBeenCalled();

  await rendered.unmount();
});

test("useTiledProjectImport resolves missing linked resources for zip projects", async () => {
  const zipFile = new File(["zip"], "demo.tiled-project.zip", {
    type: "application/zip",
  });
  const resourceFile = new File(["tsx"], "terrain.tsx", {
    type: "text/xml",
  });
  const zipData = new Uint8Array([1, 2, 3]);
  const resourceData = new Uint8Array([4, 5, 6]);
  const missingResource = {
    path: "tilesets/terrain.tsx",
    kind: "tsx",
    referringPath: "maps/level.tmx",
    label: "External tileset",
  } satisfies TiledImportMissingResource;
  const importResult = {
    maps: [{ map: { tileSize: 16 } }],
  } as unknown as TiledProjectImportResult;
  const onImportResolved = vi.fn();
  const rendered = await renderProjectImportHook(onImportResolved);

  hookMocks.pickSingleFile
    .mockResolvedValueOnce(zipFile)
    .mockResolvedValueOnce(resourceFile);
  hookMocks.readFileAsUint8Array
    .mockResolvedValueOnce(zipData)
    .mockResolvedValueOnce(resourceData);
  hookMocks.prepareTiledProjectArchive.mockResolvedValueOnce({
    entries: [{ path: "maps/level.tmx", data: zipData }],
    preparation: {
      status: "missing-resources",
      missingResources: [missingResource],
    },
  });
  hookMocks.prepareTiledProjectImport.mockResolvedValueOnce({
    status: "ready",
    result: importResult,
  });

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(true);
  });

  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    true,
  );

  await act(async () => {
    await rendered
      .getCurrent()
      .tiledMissingResourcesDialogProps.onSelectFile(missingResource);
  });

  await act(async () => {
    await rendered.getCurrent().tiledMissingResourcesDialogProps.onImport();
  });

  expect(hookMocks.prepareTiledProjectImport).toHaveBeenCalledWith([
    { path: "maps/level.tmx", data: zipData },
    { path: "tilesets/terrain.tsx", data: resourceData },
  ]);
  expect(onImportResolved).toHaveBeenCalledWith(importResult, "demo");

  await rendered.unmount();
});

test("useTiledProjectImport keeps prompting for missing raw-project resources until ready", async () => {
  const projectFile = new File(["{}"], "sample.tiled-project", {
    type: "application/json",
  });
  const mapFile = new File(["tmx"], "level.tmx", { type: "text/xml" });
  const resourceFile = new File(["tsx"], "terrain.tsx", {
    type: "text/xml",
  });
  Object.defineProperty(mapFile, "webkitRelativePath", {
    configurable: true,
    value: "Sample/maps/level.tmx",
  });

  const projectData = new TextEncoder().encode("{}");
  const mapData = new Uint8Array([4, 5, 6]);
  const resourceData = new Uint8Array([7, 8, 9]);
  const missingResource = {
    path: "tilesets/terrain.tsx",
    kind: "tsx",
    referringPath: "maps/level.tmx",
    label: "External tileset",
  } satisfies TiledImportMissingResource;
  const importResult = {
    maps: [{ map: { tileSize: 16 } }],
  } as unknown as TiledProjectImportResult;
  const onImportResolved = vi.fn();
  const rendered = await renderProjectImportHook(onImportResolved);

  hookMocks.pickSingleFile
    .mockResolvedValueOnce(projectFile)
    .mockResolvedValueOnce(resourceFile);
  hookMocks.pickDirectoryFiles.mockResolvedValueOnce([mapFile]);
  hookMocks.readFileAsUint8Array
    .mockResolvedValueOnce(projectData)
    .mockResolvedValueOnce(mapData)
    .mockResolvedValueOnce(resourceData);
  hookMocks.prepareTiledProjectImport
    .mockResolvedValueOnce({
      status: "missing-resources",
      missingResources: [missingResource],
    })
    .mockResolvedValueOnce({
      status: "ready",
      result: importResult,
    });

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(true);
  });

  expect(hookMocks.pickDirectoryFiles).not.toHaveBeenCalled();
  expect(rendered.getCurrent().tiledProjectFilesDialogProps.open).toBe(true);
  expect(rendered.getCurrent().tiledProjectFilesDialogProps.projectName).toBe(
    "sample",
  );

  await act(async () => {
    await rendered.getCurrent().tiledProjectFilesDialogProps.onSelectFolder();
  });

  expect(hookMocks.prepareTiledProjectImport).toHaveBeenCalledTimes(1);
  expect(
    hookMocks.prepareTiledProjectImport.mock.calls[0]?.[0].map(
      (entry: { path: string }) => entry.path,
    ),
  ).toEqual(["sample.tiled-project", "maps/level.tmx"]);
  expect(rendered.getCurrent().tiledProjectFilesDialogProps.open).toBe(false);
  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    true,
  );
  expect(
    rendered.getCurrent().tiledMissingResourcesDialogProps.description,
  ).toContain("Tiled project");

  await act(async () => {
    await rendered.getCurrent().tiledMissingResourcesDialogProps.onImport();
  });
  expect(hookMocks.prepareTiledProjectImport).toHaveBeenCalledTimes(1);

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

  expect(hookMocks.prepareTiledProjectImport).toHaveBeenCalledTimes(2);
  expect(onImportResolved).toHaveBeenCalledWith(importResult, "sample");
  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(
    false,
  );

  await rendered.unmount();
});

test("useTiledProjectImport returns false when the picker is cancelled", async () => {
  const rendered = await renderProjectImportHook(vi.fn());

  hookMocks.pickSingleFile.mockResolvedValueOnce(null);

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(false);
  });

  expect(hookMocks.readFileAsUint8Array).not.toHaveBeenCalled();

  await rendered.unmount();
});

test("useTiledProjectImport alerts for unsupported project files and empty zip imports", async () => {
  const rendered = await renderProjectImportHook(vi.fn());
  const alertMock = vi.fn();
  globalThis.alert = alertMock;

  hookMocks.pickSingleFile.mockResolvedValueOnce(
    new File(["plain text"], "notes.txt", { type: "text/plain" }),
  );
  hookMocks.readFileAsUint8Array.mockResolvedValueOnce(
    new TextEncoder().encode("plain text"),
  );

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(false);
  });

  expect(alertMock).toHaveBeenCalledWith("Unsupported Tiled project file type.");

  hookMocks.pickSingleFile.mockResolvedValueOnce(
    new File(["zip"], "demo.zip", { type: "application/zip" }),
  );
  hookMocks.readFileAsUint8Array.mockResolvedValueOnce(new Uint8Array([1, 2]));
  hookMocks.prepareTiledProjectArchive.mockResolvedValueOnce({
    entries: [{ path: "maps/level.tmx", data: new Uint8Array([1, 2]) }],
    preparation: {
      status: "ready",
      result: { maps: [] },
    },
  });

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(false);
  });

  expect(alertMock).toHaveBeenCalledWith(
    "No importable Tiled maps found in the archive.",
  );

  await rendered.unmount();
});

test("useTiledProjectImport alerts for invalid project files and clears the project-files dialog when closed", async () => {
  const rendered = await renderProjectImportHook(vi.fn());
  const alertMock = vi.fn();
  const consoleErrorMock = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  globalThis.alert = alertMock;
  hookMocks.pickSingleFile.mockResolvedValueOnce(
    new File(["[]"], "sample.tiled-project", {
      type: "application/json",
    }),
  );
  hookMocks.readFileAsUint8Array
    .mockResolvedValueOnce(new TextEncoder().encode("[]"))
    .mockResolvedValueOnce(new TextEncoder().encode("{}"));

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(false);
  });

  expect(alertMock).toHaveBeenCalledWith("Invalid Tiled project file.");
  expect(consoleErrorMock).toHaveBeenCalled();

  hookMocks.pickSingleFile.mockResolvedValueOnce(
    new File(["{}"], "sample.tiled-project", {
      type: "application/json",
    }),
  );

  await act(async () => {
    await expect(
      rendered.getCurrent().handleImportTiledProject(),
    ).resolves.toBe(true);
  });

  expect(rendered.getCurrent().tiledProjectFilesDialogProps.open).toBe(true);

  await act(async () => {
    rendered.getCurrent().tiledProjectFilesDialogProps.onOpenChange(false);
  });

  expect(rendered.getCurrent().tiledProjectFilesDialogProps.open).toBe(false);

  consoleErrorMock.mockRestore();
  await rendered.unmount();
});
