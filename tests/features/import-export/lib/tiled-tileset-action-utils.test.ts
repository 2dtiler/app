import { beforeEach, assert, test, vi } from "vitest";
import { unzipSync } from "fflate";
import { parseHTML } from "linkedom";
import {
  exportSelectedTiledTilesets,
  isTiledTilesetExportOption,
  isTiledTilesetImportOption,
} from "@/features/import-export/lib/tiled-tileset-action-utils";
import {
  createProjectFixture,
  createSaveStrategy,
  expectToThrow,
} from "./action-utils-test-support";
import type { AutotileConfig } from "@/types";

const { window } = parseHTML("<html><body></body></html>");

class TestXMLSerializer {
  serializeToString(document: { toString: () => string }) {
    return document.toString();
  }
}

Object.assign(globalThis, {
  DOMParser: window.DOMParser,
  XMLSerializer: TestXMLSerializer,
  document: window.document,
  window,
});

Object.defineProperty(window.document, "implementation", {
  configurable: true,
  value: {
    createDocument: (_namespace: string, rootName: string) =>
      new window.DOMParser().parseFromString(
        `<${rootName}></${rootName}>`,
        "application/xml",
      ),
  },
});

function decodeText(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

function createTestTileset() {
  return {
    id: "tileset-1",
    name: "terrain",
    groupId: "group",
    tileSize: 16,
    assetId: "asset-1",
    imageWidth: 32,
    imageHeight: 16,
    createdAt: Date.now(),
  };
}

function createTestProject() {
  return {
    id: "project",
    name: "Demo",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tileSize: 16,
    tilesetGroups: [],
    tilesets: [createTestTileset()],
    mapGroups: [],
    maps: [],
    layers: [],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
}

function createWangAutotileConfig() {
  return {
    version: 1,
    preset: "wang-tiles",
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: { sx: 16, sy: 0, sw: 16, sh: 16 },
        patternTiles: {
          "wang-00": { sx: 0, sy: 0, sw: 16, sh: 16 },
          "wang-0f": { sx: 16, sy: 0, sw: 16, sh: 16 },
        },
      },
    ],
    rules: [],
  } as AutotileConfig;
}

const { getAssetMock } = vi.hoisted(() => ({
  getAssetMock: vi.fn(),
}));

vi.mock("@/services/db", () => ({
  getAsset: getAssetMock,
}));

beforeEach(() => {
  getAssetMock.mockReset();
  getAssetMock.mockImplementation(async (assetId: string) => ({
    id: assetId,
    data: new Uint8Array([1, 2, 3]).buffer,
    mimeType: assetId === "asset-b" ? "image/jpeg" : "image/png",
  }));
});

test("Tiled tileset option predicates match the Tiled tileset options", () => {
  assert.strictEqual(isTiledTilesetImportOption("tileset-tiled-file"), true);
  assert.strictEqual(isTiledTilesetImportOption("tileset-tiled"), false);
  assert.strictEqual(isTiledTilesetExportOption("tileset-tiled"), true);
  assert.strictEqual(isTiledTilesetExportOption("tileset-defold"), false);
});

test("exportSelectedTiledTilesets exports grouped archives and rejects invalid input", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();

  assert.strictEqual(
    await exportSelectedTiledTilesets(null, [], "tileset-tiled", {
      format: "xml",
    }),
    false,
  );
  assert.strictEqual(
    await exportSelectedTiledTilesets(project, ["missing"], "tileset-tiled", {
      format: "xml",
    }),
    false,
  );
  await expectToThrow(
    () =>
      exportSelectedTiledTilesets(
        project,
        [project.tilesets[0]!.id],
        "tileset-defold",
        { format: "xml" },
        saveStrategy,
      ),
    /Unsupported Tiled tileset export option/,
  );
  await expectToThrow(
    () =>
      exportSelectedTiledTilesets(
        project,
        [project.tilesets[0]!.id],
        "tileset-tiled",
        undefined,
        saveStrategy,
      ),
    /Missing Tiled tileset export options/,
  );

  assert.strictEqual(
    await exportSelectedTiledTilesets(
      project,
      project.tilesets.map((tileset) => tileset.id),
      "tileset-tiled",
      { format: "json" },
      saveStrategy,
    ),
    true,
  );
  const jsonArchive = unzipSync(saveStrategy.saveByteArray.mock.calls[0]![0]);
  assert.ok(
    Object.keys(jsonArchive).some((path) => path.endsWith("Tileset A.tsj")),
  );
  assert.ok(
    Object.keys(jsonArchive).some((path) =>
      path.includes("Tileset-B/Tileset-B.tsj"),
    ),
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Project Root tiled tilesets.zip",
  );

  getAssetMock.mockResolvedValueOnce(undefined);
  await expectToThrow(
    () =>
      exportSelectedTiledTilesets(
        project,
        [project.tilesets[0]!.id],
        "tileset-tiled",
        { format: "lua" },
        saveStrategy,
      ),
    /Missing tileset asset/,
  );
});

test("exportSelectedTiledTilesets emits zero margin and spacing for xml, json, and lua", async () => {
  const project = createTestProject();
  const tileset = project.tilesets[0]!;

  for (const format of ["xml", "json", "lua"] as const) {
    let archive: Uint8Array | null = null;

    const didExport = await exportSelectedTiledTilesets(
      project,
      [tileset.id],
      "tileset-tiled",
      { format },
      {
        saveBlob: async () => true,
        saveByteArray: async (data) => {
          archive = data;
          return true;
        },
      },
    );

    assert.strictEqual(didExport, true);
    assert.ok(archive);

    const files = unzipSync(archive);

    if (format === "xml") {
      const xmlEntry = Object.entries(files).find(([path]) =>
        path.endsWith(".tsx"),
      );
      assert.ok(xmlEntry);
      const document = new DOMParser().parseFromString(
        decodeText(xmlEntry[1]),
        "application/xml",
      );
      const tilesetElement = document.querySelector("tileset");
      assert.ok(tilesetElement);
      assert.strictEqual(tilesetElement?.getAttribute("margin"), "0");
      assert.strictEqual(tilesetElement?.getAttribute("spacing"), "0");
      continue;
    }

    if (format === "json") {
      const jsonEntry = Object.entries(files).find(([path]) =>
        path.endsWith(".tsj"),
      );
      assert.ok(jsonEntry);
      const document = JSON.parse(decodeText(jsonEntry[1])) as {
        margin?: number;
        spacing?: number;
      };
      assert.strictEqual(document.margin, 0);
      assert.strictEqual(document.spacing, 0);
      continue;
    }

    const luaEntry = Object.entries(files).find(([path]) =>
      path.endsWith(".lua"),
    );
    assert.ok(luaEntry);
    const luaText = decodeText(luaEntry[1]);
    assert.match(luaText, /margin\s*=\s*0/);
    assert.match(luaText, /spacing\s*=\s*0/);
  }
});

test("exportSelectedTiledTilesets includes Wang metadata in JSON tilesets", async () => {
  const project = createTestProject();
  const tileset = project.tilesets[0]!;
  tileset.imageWidth = 64;
  tileset.autotile = createWangAutotileConfig();
  let archive: Uint8Array | null = null;

  const didExport = await exportSelectedTiledTilesets(
    project,
    [tileset.id],
    "tileset-tiled",
    { format: "json" },
    {
      saveBlob: async () => true,
      saveByteArray: async (data) => {
        archive = data;
        return true;
      },
    },
  );

  assert.strictEqual(didExport, true);
  assert.ok(archive);

  const files = unzipSync(archive);
  const jsonEntry = Object.entries(files).find(([path]) =>
    path.endsWith(".tsj"),
  );
  assert.ok(jsonEntry);

  const document = JSON.parse(decodeText(jsonEntry[1])) as {
    wangsets?: Array<{
      type?: string;
      colors?: unknown[];
      wangtiles?: Array<{ tileid?: number; wangid?: number[] }>;
    }>;
  };
  assert.strictEqual(document.wangsets?.[0]?.type, "edge");
  assert.strictEqual(document.wangsets?.[0]?.colors?.length, 2);
  assert.deepEqual(document.wangsets?.[0]?.wangtiles?.[0], {
    tileid: 0,
    wangid: [1, 0, 1, 0, 1, 0, 1, 0],
  });
});
