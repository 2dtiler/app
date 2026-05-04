import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import { PHASER_MAP_IMPORT_CONFIG } from "@/features/import-export/hooks/use-tiled-map-import";
import { useTiledProjectImport } from "@/features/import-export/hooks/use-tiled-project-import";
import type {
  TiledImportMissingResource,
  TiledMissingResourcesDialogProps,
  TiledProjectImportResult,
} from "@/types";

const pickSingleFile = vi.fn();
const pickDirectoryFiles = vi.fn();
const readFileAsUint8Array = vi.fn();
const prepareTiledProjectImport = vi.fn();
const importTiledProjectFromZip = vi.fn();
const getLinkedImportResourceAccept = vi.fn((kind: string) => `.${kind}`);

vi.mock("@/utils/format", () => ({
  readFileAsUint8Array,
}));

vi.mock("@/features/import-export/lib/import-export-action-utils", () => ({
  pickDirectoryFiles,
  pickSingleFile,
}));

vi.mock("@/features/import-export/lib/import-export-tiled-project", () => ({
  importTiledProjectFromZip,
  prepareTiledProjectImport,
}));

vi.mock("@/features/import-export/lib/linked-resource-utils", () => ({
  getLinkedImportResourceAccept,
}));

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const { window } = parseHTML("<html><body></body></html>");

type HookRenderResult = {
  handleImportTiledProject: () => Promise<boolean>;
  tiledMissingResourcesDialogProps: TiledMissingResourcesDialogProps;
};

function installReactDomEnvironment() {
  Object.assign(globalThis, {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
}

async function renderProjectImportHook(
  onImportResolved: (
    result: TiledProjectImportResult,
    suggestedProjectName: string,
  ) => void | Promise<void>,
) {
  installReactDomEnvironment();

  let current: HookRenderResult | null = null;
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

afterEach(async () => {
  vi.clearAllMocks();

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

  pickSingleFile.mockResolvedValueOnce(zipFile);
  readFileAsUint8Array.mockResolvedValueOnce(zipData);
  importTiledProjectFromZip.mockResolvedValueOnce(importResult);

  await act(async () => {
    await expect(rendered.getCurrent().handleImportTiledProject()).resolves.toBe(
      true,
    );
  });

  expect(importTiledProjectFromZip).toHaveBeenCalledWith(zipData);
  expect(onImportResolved).toHaveBeenCalledWith(importResult, "demo");
  expect(pickDirectoryFiles).not.toHaveBeenCalled();

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

  pickSingleFile.mockResolvedValueOnce(projectFile).mockResolvedValueOnce(
    resourceFile,
  );
  pickDirectoryFiles.mockResolvedValueOnce([mapFile]);
  readFileAsUint8Array
    .mockResolvedValueOnce(projectData)
    .mockResolvedValueOnce(mapData)
    .mockResolvedValueOnce(resourceData);
  prepareTiledProjectImport
    .mockResolvedValueOnce({
      status: "missing-resources",
      missingResources: [missingResource],
    })
    .mockResolvedValueOnce({
      status: "ready",
      result: importResult,
    });

  await act(async () => {
    await expect(rendered.getCurrent().handleImportTiledProject()).resolves.toBe(
      true,
    );
  });

  expect(prepareTiledProjectImport).toHaveBeenCalledTimes(1);
  expect(
    prepareTiledProjectImport.mock.calls[0]?.[0].map(
      (entry: { path: string }) => entry.path,
    ),
  ).toEqual(["sample.tiled-project", "maps/level.tmx"]);

  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(true);
  expect(
    rendered.getCurrent().tiledMissingResourcesDialogProps.description,
  ).toContain("Tiled project");

  await act(async () => {
    await rendered.getCurrent().tiledMissingResourcesDialogProps.onImport();
  });
  expect(prepareTiledProjectImport).toHaveBeenCalledTimes(1);

  await act(async () => {
    await rendered
      .getCurrent()
      .tiledMissingResourcesDialogProps.onSelectFile(missingResource);
  });

  expect(getLinkedImportResourceAccept).toHaveBeenCalledWith("tsx");
  expect(
    rendered.getCurrent().tiledMissingResourcesDialogProps.selectedFileNames[
      missingResource.path
    ],
  ).toBe("terrain.tsx");

  await act(async () => {
    await rendered.getCurrent().tiledMissingResourcesDialogProps.onImport();
  });

  expect(prepareTiledProjectImport).toHaveBeenCalledTimes(2);
  expect(onImportResolved).toHaveBeenCalledWith(importResult, "sample");
  expect(rendered.getCurrent().tiledMissingResourcesDialogProps.open).toBe(false);

  await rendered.unmount();
});
