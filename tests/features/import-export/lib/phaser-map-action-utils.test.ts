import { beforeEach, expect, test, vi } from "vitest";
import type {
  ExportSaveStrategy,
  Project,
  TileMapData,
  Tileset,
} from "@/types";

const {
  buildDownloadFilenameMock,
  createZipArchiveMock,
  exportTiledMapJsonBundleMock,
  getMapExportDataMock,
  getUniqueArchivePathMock,
  resolveExportSaveStrategyMock,
  sanitizeDownloadSegmentMock,
} = vi.hoisted(() => ({
  buildDownloadFilenameMock: vi.fn(),
  createZipArchiveMock: vi.fn(),
  exportTiledMapJsonBundleMock: vi.fn(),
  getMapExportDataMock: vi.fn(),
  getUniqueArchivePathMock: vi.fn(),
  resolveExportSaveStrategyMock: vi.fn(),
  sanitizeDownloadSegmentMock: vi.fn(),
}));

vi.mock("@/utils/format", () => ({
  buildDownloadFilename: buildDownloadFilenameMock,
  createZipArchive: createZipArchiveMock,
  sanitizeDownloadSegment: sanitizeDownloadSegmentMock,
}));

vi.mock("@/features/import-export/lib/export-save-strategy", () => ({
  resolveExportSaveStrategy: resolveExportSaveStrategyMock,
}));

vi.mock("@/features/import-export/lib/import-export-tiled", () => ({
  exportTiledMapJsonBundle: exportTiledMapJsonBundleMock,
}));

vi.mock("@/features/import-export/lib/import-export-action-utils", () => ({
  getMapExportData: getMapExportDataMock,
  getUniqueArchivePath: getUniqueArchivePathMock,
}));

import {
  DEFAULT_PHASER_MAP_EXPORT_OPTIONS,
  exportSelectedPhaserMaps,
  isPhaserMapOption,
  normalizePhaserMapBundleEntries,
} from "@/features/import-export/lib/phaser-map-action-utils";

beforeEach(() => {
  buildDownloadFilenameMock.mockReset();
  createZipArchiveMock.mockReset();
  exportTiledMapJsonBundleMock.mockReset();
  getMapExportDataMock.mockReset();
  getUniqueArchivePathMock.mockReset();
  resolveExportSaveStrategyMock.mockReset();
  sanitizeDownloadSegmentMock.mockReset();

  buildDownloadFilenameMock.mockImplementation(
    (name: string, extension: string) => `${name}${extension}`,
  );
  createZipArchiveMock.mockImplementation(() => new Uint8Array([7, 8, 9]));
  exportTiledMapJsonBundleMock.mockResolvedValue([]);
  getMapExportDataMock.mockReturnValue({
    layers: [],
    imageLayers: [],
    layerGroups: [],
    objectLayers: [],
    objects: [],
  });
  getUniqueArchivePathMock.mockImplementation(
    (path: string, usedPaths: Set<string>) => {
      let nextPath = path;
      let suffix = 2;

      while (usedPaths.has(nextPath)) {
        nextPath = path.replace(/(\.[^.]+)$/u, `-${suffix}$1`);
        suffix += 1;
      }

      usedPaths.add(nextPath);
      return nextPath;
    },
  );
  resolveExportSaveStrategyMock.mockImplementation(
    (strategy?: ExportSaveStrategy) => strategy,
  );
  sanitizeDownloadSegmentMock.mockImplementation(
    (value: string, fallback: string) => {
      const sanitized = value
        .replace(/[^A-Za-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "");
      return sanitized || fallback;
    },
  );
});

function createSaveStrategy() {
  return {
    saveBlob: vi.fn(async () => true),
    saveByteArray: vi.fn(async () => true),
  } satisfies ExportSaveStrategy;
}

function createProjectFixture() {
  const mapA = {
    id: "map-a" as TileMapData["id"],
    name: "Forest:Map",
    groupId: "group-a" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 2,
    heightInTiles: 2,
    tileSize: 16,
    layerOrder: [],
    createdAt: 1,
  } as TileMapData;
  const mapB = {
    id: "map-b" as TileMapData["id"],
    name: "Forest/Map",
    groupId: "group-b" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 1,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: [],
    createdAt: 2,
  } as TileMapData;
  const tilesetA = {
    id: "tileset-a" as Tileset["id"],
    name: "terrain",
    groupId: "tileset-group-a" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-a" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 32,
    createdAt: 1,
  } as Tileset;
  const tilesetB = {
    id: "tileset-b" as Tileset["id"],
    name: "terrain-override",
    groupId: "tileset-group-b" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-b" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 32,
    createdAt: 2,
  } as Tileset;

  return {
    id: "project-1" as Project["id"],
    name: "Phaser Demo",
    createdAt: 1,
    updatedAt: 1,
    tileSize: 16,
    tilesetGroups: [],
    tilesets: [tilesetA],
    overrideTilesets: [tilesetB],
    mapGroups: [
      {
        id: mapA.groupId,
        name: "World/1",
      },
      {
        id: mapB.groupId,
        name: "World 1",
      },
    ],
    maps: [mapA, mapB],
    layers: [],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
  } as Project;
}

test("normalizePhaserMapBundleEntries renames TMJ roots to JSON", () => {
  const entries = normalizePhaserMapBundleEntries([
    {
      path: "maps/forest.tmj",
      data: new Uint8Array([1, 2, 3]),
    },
    {
      path: "tilesets/forest.png",
      data: new Uint8Array([4, 5, 6]),
    },
  ]);

  expect(entries.map((entry) => entry.path)).toEqual([
    "maps/forest.json",
    "tilesets/forest.png",
  ]);
});

test("DEFAULT_PHASER_MAP_EXPORT_OPTIONS force Phaser-safe Tiled JSON defaults", () => {
  expect(DEFAULT_PHASER_MAP_EXPORT_OPTIONS).toEqual({
    format: "json",
    encoding: "base64",
    compression: "zlib",
    compressionLevel: 6,
    tilesetMode: "inline",
    renderOrder: "right-down",
  });
});

test("isPhaserMapOption matches only the Phaser map option", () => {
  expect(isPhaserMapOption("map-phaser")).toBe(true);
  expect(isPhaserMapOption("map-tiled")).toBe(false);
});

test("exportSelectedPhaserMaps returns false when there is no project or no selected maps", async () => {
  const project = createProjectFixture();

  await expect(
    exportSelectedPhaserMaps(null, ["map-a"], "map-phaser"),
  ).resolves.toBe(false);
  await expect(
    exportSelectedPhaserMaps(project, ["missing-map"], "map-phaser"),
  ).resolves.toBe(false);
});

test("exportSelectedPhaserMaps rejects unsupported option ids", async () => {
  const project = createProjectFixture();

  await expect(
    exportSelectedPhaserMaps(project, ["map-a"], "map-tiled"),
  ).rejects.toThrow("Unsupported Phaser export option: map-tiled.");
});

test("exportSelectedPhaserMaps exports a single selected map as a Phaser JSON zip", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  const bundleEntries = [
    {
      path: "maps/forest.tmj",
      data: new Uint8Array([1, 2, 3]),
    },
    {
      path: "tilesets/terrain.png",
      data: new Uint8Array([4, 5, 6]),
    },
  ];
  exportTiledMapJsonBundleMock.mockResolvedValue(bundleEntries);

  const result = await exportSelectedPhaserMaps(
    project,
    [project.maps[0].id],
    "map-phaser",
    saveStrategy,
  );

  expect(result).toBe(true);
  expect(resolveExportSaveStrategyMock).toHaveBeenCalledWith(saveStrategy);
  expect(exportTiledMapJsonBundleMock).toHaveBeenCalledWith(
    project.maps[0],
    [],
    [...project.tilesets, ...(project.overrideTilesets ?? [])],
    [],
    [],
    [],
    [],
    DEFAULT_PHASER_MAP_EXPORT_OPTIONS,
  );
  expect(createZipArchiveMock).toHaveBeenCalledWith([
    {
      path: "maps/forest.json",
      data: new Uint8Array([1, 2, 3]),
    },
    {
      path: "tilesets/terrain.png",
      data: new Uint8Array([4, 5, 6]),
    },
  ]);
  expect(saveStrategy.saveByteArray).toHaveBeenCalledWith(
    new Uint8Array([7, 8, 9]),
    "Forest:Map.json.zip",
  );
});

test("exportSelectedPhaserMaps exports multiple selected maps into grouped archive paths", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  exportTiledMapJsonBundleMock.mockImplementation(async () => [
    {
      path: "map.tmj",
      data: new Uint8Array([1]),
    },
    {
      path: "shared/terrain.png",
      data: new Uint8Array([2]),
    },
  ]);

  const result = await exportSelectedPhaserMaps(
    project,
    project.maps.map((map) => map.id),
    "map-phaser",
    saveStrategy,
  );

  expect(result).toBe(true);
  expect(createZipArchiveMock).toHaveBeenCalledWith([
    {
      path: "World-1/Forest-Map/map.json",
      data: new Uint8Array([1]),
    },
    {
      path: "World-1/Forest-Map/shared/terrain.png",
      data: new Uint8Array([2]),
    },
    {
      path: "World-1/Forest-Map/map-2.json",
      data: new Uint8Array([1]),
    },
    {
      path: "World-1/Forest-Map/shared/terrain-2.png",
      data: new Uint8Array([2]),
    },
  ]);
  expect(sanitizeDownloadSegmentMock).toHaveBeenCalledWith(
    "World/1",
    "Ungrouped",
  );
  expect(sanitizeDownloadSegmentMock).toHaveBeenCalledWith(
    "World 1",
    "Ungrouped",
  );
  expect(sanitizeDownloadSegmentMock).toHaveBeenCalledWith("Forest:Map", "Map");
  expect(sanitizeDownloadSegmentMock).toHaveBeenCalledWith("Forest/Map", "Map");
  expect(saveStrategy.saveByteArray).toHaveBeenCalledWith(
    new Uint8Array([7, 8, 9]),
    "Phaser Demo phaser maps.zip",
  );
});
