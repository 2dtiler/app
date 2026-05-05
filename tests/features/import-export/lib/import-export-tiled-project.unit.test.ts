import { afterEach, expect, test, vi } from "vitest";
import {
  exportTiledProjectEntries,
  importTiledProjectFromZip,
  prepareTiledProjectImport,
} from "@/features/import-export/lib/import-export-tiled-project";
import type {
  ImportExportArchiveEntry,
  Project,
  TiledImportMissingResource,
  TiledMapImportResult,
} from "@/types";

const projectMocks = vi.hoisted(() => ({
  encodeJsonDocument: vi.fn((value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)),
  ),
  exportTiledMapBundle: vi.fn(),
  exportTiledMapJsBundle: vi.fn(),
  exportTiledMapJsonBundle: vi.fn(),
  exportTiledMapLuaBundle: vi.fn(),
  getMapExportData: vi.fn(() => ({
    imageLayers: [],
    layerGroups: [],
    layers: [],
    objectLayers: [],
    objects: [],
  })),
  getUniqueArchivePath: vi.fn((path: string, seenPaths: Set<string>) => {
    if (!seenPaths.has(path)) {
      seenPaths.add(path);
      return path;
    }

    const match = /^(.*?)(\.[^./]+)?$/.exec(path);
    const stem = match?.[1] ?? path;
    const extension = match?.[2] ?? "";
    let suffix = 2;
    let candidate = `${stem}-${suffix}${extension}`;

    while (seenPaths.has(candidate)) {
      suffix += 1;
      candidate = `${stem}-${suffix}${extension}`;
    }

    seenPaths.add(candidate);
    return candidate;
  }),
  prepareTiledMapImport: vi.fn(),
  sanitizeDownloadSegment: vi.fn(
    (value: string, fallback: string) => value || fallback,
  ),
  unzipSync: vi.fn(),
}));

vi.mock("fflate", () => ({
  unzipSync: projectMocks.unzipSync,
}));

vi.mock("@/utils/format", () => ({
  sanitizeDownloadSegment: projectMocks.sanitizeDownloadSegment,
}));

vi.mock("@/features/import-export/lib/import-export-tiled", () => ({
  exportTiledMapBundle: projectMocks.exportTiledMapBundle,
  exportTiledMapJsBundle: projectMocks.exportTiledMapJsBundle,
  exportTiledMapJsonBundle: projectMocks.exportTiledMapJsonBundle,
  exportTiledMapLuaBundle: projectMocks.exportTiledMapLuaBundle,
}));

vi.mock("@/features/import-export/lib/import-export-tiled-shared", () => ({
  encodeJsonDocument: projectMocks.encodeJsonDocument,
}));

vi.mock("@/features/import-export/lib/import-export-action-utils", () => ({
  getMapExportData: projectMocks.getMapExportData,
  getUniqueArchivePath: projectMocks.getUniqueArchivePath,
}));

vi.mock("@/features/import-export/lib/tiled-map-import", () => ({
  prepareTiledMapImport: projectMocks.prepareTiledMapImport,
}));

function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

function createProject(mapNames = ["Level"]): Project {
  return {
    id: "project-1" as Project["id"],
    name: "Demo",
    createdAt: 0,
    updatedAt: 0,
    tileSize: 16,
    tilesetGroups: [],
    tilesets: [],
    mapGroups: [],
    maps: mapNames.map((name, index) => ({
      id: `map-${index + 1}` as Project["maps"][number]["id"],
      name,
      groupId: "group-1" as Project["maps"][number]["groupId"],
      orientation: "orthogonal",
      widthInTiles: 1,
      heightInTiles: 1,
      tileSize: 16,
      layerOrder: [],
      createdAt: index,
    })),
    layers: [],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

test("exportTiledProjectEntries selects the correct bundler and map extension for each format", async () => {
  const project = createProject();

  projectMocks.exportTiledMapBundle.mockResolvedValue([
    { path: "Level.tmx", data: encodeText("xml") },
  ]);
  projectMocks.exportTiledMapJsonBundle.mockResolvedValue([
    { path: "Level.tmj", data: encodeText("json") },
  ]);
  projectMocks.exportTiledMapJsBundle.mockResolvedValue([
    { path: "Level.js", data: encodeText("js") },
  ]);
  projectMocks.exportTiledMapLuaBundle.mockResolvedValue([
    { path: "Level.lua", data: encodeText("lua") },
  ]);

  const xmlEntries = await exportTiledProjectEntries(project, "xml");
  const jsonEntries = await exportTiledProjectEntries(project, "json");
  const jsEntries = await exportTiledProjectEntries(project, "js");
  const luaEntries = await exportTiledProjectEntries(project, "lua");

  expect(projectMocks.exportTiledMapBundle).toHaveBeenCalledWith(
    project.maps[0],
    [],
    [],
    [],
    [],
    [],
    [],
    expect.objectContaining({ tilesetMode: "external" }),
  );
  expect(projectMocks.exportTiledMapJsonBundle).toHaveBeenCalled();
  expect(projectMocks.exportTiledMapJsBundle).toHaveBeenCalled();
  expect(projectMocks.exportTiledMapLuaBundle).toHaveBeenCalled();

  expect(xmlEntries.map((entry) => entry.path)).toContain("Level.tmx");
  expect(jsonEntries.map((entry) => entry.path)).toContain("Level.tmj");
  expect(jsEntries.map((entry) => entry.path)).toContain("Level.js");
  expect(luaEntries.map((entry) => entry.path)).toContain("Level.lua");
  expect(xmlEntries.map((entry) => entry.path)).toContain("Demo.tiled-project");
});

test("exportTiledProjectEntries rewrites conflicting asset paths across maps", async () => {
  const project = createProject(["LevelA", "LevelB"]);

  projectMocks.exportTiledMapBundle
    .mockResolvedValueOnce([
      {
        path: "LevelA.tmx",
        data: encodeText('"tilesets/shared.tsx" "images/shared.png"'),
      },
      { path: "tilesets/shared.tsx", data: encodeText("tsx-a") },
      { path: "images/shared.png", data: new Uint8Array([1]) },
    ])
    .mockResolvedValueOnce([
      {
        path: "LevelB.tmx",
        data: encodeText('"tilesets/shared.tsx" "images/shared.png"'),
      },
      { path: "tilesets/shared.tsx", data: encodeText("tsx-b") },
      { path: "images/shared.png", data: new Uint8Array([2]) },
    ]);

  const entries = await exportTiledProjectEntries(project);
  const secondMapEntry = entries.find((entry) => entry.path === "LevelB.tmx");

  expect(entries.map((entry) => entry.path)).toEqual(
    expect.arrayContaining([
      "tilesets/shared.tsx",
      "images/shared.png",
      "tilesets/shared-2.tsx",
      "images/shared-2.png",
      "LevelA.tmx",
      "LevelB.tmx",
      "Demo.tiled-project",
    ]),
  );
  expect(new TextDecoder().decode(secondMapEntry?.data)).toContain(
    '"tilesets/shared-2.tsx"',
  );
  expect(new TextDecoder().decode(secondMapEntry?.data)).toContain(
    '"images/shared-2.png"',
  );
});

test("prepareTiledProjectImport filters non-map entries and deduplicates missing resources", async () => {
  const sharedMissing = {
    kind: "tsx",
    label: "Shared tileset",
    path: "tilesets/shared.tsx",
    referringPath: "maps/one.tmx",
  } satisfies TiledImportMissingResource;
  const imageMissing = {
    kind: "image",
    label: "Tileset image",
    path: "images/shared.png",
    referringPath: "maps/one.tmx",
  } satisfies TiledImportMissingResource;
  const luaMissing = {
    kind: "lua",
    label: "Script",
    path: "scripts/level.lua",
    referringPath: "maps/two.tmj",
  } satisfies TiledImportMissingResource;

  projectMocks.prepareTiledMapImport
    .mockResolvedValueOnce({
      status: "missing-resources",
      missingResources: [sharedMissing, imageMissing],
    })
    .mockResolvedValueOnce({
      status: "missing-resources",
      missingResources: [sharedMissing, luaMissing],
    })
    .mockResolvedValueOnce({
      status: "ready",
      result: { map: { tileSize: 16 } },
    } as unknown as { status: "ready"; result: TiledMapImportResult });

  const result = await prepareTiledProjectImport([
    {
      path: "demo.tiled-project",
      data: encodeText('{"extensionsPath":"extensions"}'),
    },
    { path: "extensions/ignored.tmx", data: encodeText("ignored") },
    { path: "tilesets/shared.tsx", data: encodeText("tileset") },
    { path: "images/shared.png", data: new Uint8Array([1]) },
    { path: "maps/one.tmx", data: encodeText("one") },
    { path: "maps/two.tmj", data: encodeText("two") },
    { path: "maps/three.lua", data: encodeText("three") },
  ]);

  expect(projectMocks.prepareTiledMapImport).toHaveBeenNthCalledWith(
    1,
    "maps/one.tmx",
    expect.any(Array),
    "xml",
  );
  expect(projectMocks.prepareTiledMapImport).toHaveBeenNthCalledWith(
    2,
    "maps/two.tmj",
    expect.any(Array),
    "json",
  );
  expect(projectMocks.prepareTiledMapImport).toHaveBeenNthCalledWith(
    3,
    "maps/three.lua",
    expect.any(Array),
    "lua",
  );

  expect(result).toEqual({
    status: "missing-resources",
    missingResources: [sharedMissing, imageMissing, luaMissing],
  });
});

test("prepareTiledProjectImport throws when the provided files contain no map entries", async () => {
  await expect(
    prepareTiledProjectImport([
      { path: "demo.tiled-project", data: encodeText("not json") },
      { path: "tilesets/shared.tsx", data: encodeText("tileset") },
      { path: "images/shared.png", data: new Uint8Array([1]) },
    ]),
  ).rejects.toThrow("No Tiled map files found in the provided files.");
});

test("importTiledProjectFromZip returns ready results and rejects missing-resource archives", async () => {
  projectMocks.unzipSync.mockReturnValue({
    "maps/level.tmx": encodeText("map"),
  });
  projectMocks.prepareTiledMapImport
    .mockResolvedValueOnce({
      status: "ready",
      result: { map: { tileSize: 16 } },
    } as unknown as { status: "ready"; result: TiledMapImportResult })
    .mockResolvedValueOnce({
      status: "missing-resources",
      missingResources: [
        {
          kind: "tsx",
          label: "Shared tileset",
          path: "tilesets/shared.tsx",
          referringPath: "maps/level.tmx",
        },
      ],
    });

  await expect(importTiledProjectFromZip(new Uint8Array([1]))).resolves.toEqual(
    {
      maps: [{ map: { tileSize: 16 } }],
    },
  );

  await expect(importTiledProjectFromZip(new Uint8Array([2]))).rejects.toThrow(
    "The Tiled project archive is missing linked resources.",
  );
});
