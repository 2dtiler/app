import { afterEach, expect, test, vi } from "vitest";
import { prepareTiledTilesetImport } from "@/features/import-export/lib/tiled-tileset-import";

const tilesetMocks = vi.hoisted(() => ({
  addMissingResource: vi.fn(
    (
      missing: Map<string, unknown>,
      path: string,
      kind: string,
      referringPath: string,
    ) => {
      missing.set(path, {
        kind,
        label: `Missing ${kind}`,
        path,
        referringPath,
      });
    },
  ),
  buildAutotileFromTiledWangSets: vi.fn(),
  buildEntryMap: vi.fn((entries: readonly { path: string; data: Uint8Array }[]) => {
    return new Map(entries.map((entry) => [entry.path, entry.data]));
  }),
  decodeText: vi.fn((data: Uint8Array) => new TextDecoder().decode(data)),
  generateTilesetId: vi.fn(() => "tileset-generated"),
  getProvidedEntry: vi.fn(
    (entries: ReadonlyMap<string, Uint8Array>, path: string) => entries.get(path),
  ),
  importTiledTilesetImageAsset: vi.fn(),
  normalizeBundlePath: vi.fn((path: string) => path.replace(/\\/g, "/")),
  normalizeTiledLuaTilesetDocument: vi.fn((value: unknown) => value),
  parseTiledLuaDocument: vi.fn(),
  parseXmlDocument: vi.fn(),
  readJsonTilesetAnimationConfig: vi.fn(),
  readTiledXmlWangSets: vi.fn(() => [{ id: "wang" }]),
  readXmlTilesetAnimationConfig: vi.fn(),
  requireProvidedEntry: vi.fn(
    (entries: ReadonlyMap<string, Uint8Array>, path: string) => {
      const data = entries.get(path);
      if (!data) {
        throw new Error(`Missing linked resource: ${path}.`);
      }
      return data;
    },
  ),
  resolveBundlePath: vi.fn((base: string, relative: string) => {
    const normalizedBase = base.replace(/\\/g, "/");
    const slashIndex = normalizedBase.lastIndexOf("/");
    const baseDir = slashIndex >= 0 ? normalizedBase.slice(0, slashIndex + 1) : "";
    return `${baseDir}${relative}`.replace(/\/\.\//g, "/");
  }),
  stripExtension: vi.fn((path: string) => path.replace(/\.[^/.]+$/, "")),
}));

vi.mock("@/utils/ids", () => ({
  generateTilesetId: tilesetMocks.generateTilesetId,
}));

vi.mock("@/features/import-export/lib/tiled-lua-format", () => ({
  normalizeTiledLuaTilesetDocument: tilesetMocks.normalizeTiledLuaTilesetDocument,
}));

vi.mock("@/features/import-export/lib/tiled-lua", () => ({
  parseTiledLuaDocument: tilesetMocks.parseTiledLuaDocument,
}));

vi.mock("@/features/import-export/lib/tiled-map-import-shared", () => ({
  addMissingResource: tilesetMocks.addMissingResource,
  buildEntryMap: tilesetMocks.buildEntryMap,
  getProvidedEntry: tilesetMocks.getProvidedEntry,
  importTiledTilesetImageAsset: tilesetMocks.importTiledTilesetImageAsset,
  requireProvidedEntry: tilesetMocks.requireProvidedEntry,
}));

vi.mock("@/features/import-export/lib/tiled-xml-utils", () => ({
  decodeText: tilesetMocks.decodeText,
  normalizeBundlePath: tilesetMocks.normalizeBundlePath,
  parseXmlDocument: tilesetMocks.parseXmlDocument,
  resolveBundlePath: tilesetMocks.resolveBundlePath,
  stripExtension: tilesetMocks.stripExtension,
}));

vi.mock("@/features/import-export/lib/tiled-animation-conversion", () => ({
  readJsonTilesetAnimationConfig: tilesetMocks.readJsonTilesetAnimationConfig,
  readXmlTilesetAnimationConfig: tilesetMocks.readXmlTilesetAnimationConfig,
}));

vi.mock("@/features/import-export/lib/tiled-wang", () => ({
  buildAutotileFromTiledWangSets: tilesetMocks.buildAutotileFromTiledWangSets,
  readTiledXmlWangSets: tilesetMocks.readTiledXmlWangSets,
}));

function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

function createXmlElement(
  tagName: string,
  attributes: Record<string, string | undefined>,
  imageAttributes?: Record<string, string | undefined>,
) {
  return {
    tagName,
    getAttribute: (name: string) => attributes[name] ?? null,
    querySelector: (selector: string) => {
      if (selector !== ":scope > image" || !imageAttributes) {
        return null;
      }

      return {
        getAttribute: (name: string) => imageAttributes[name] ?? null,
      };
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

test("prepareTiledTilesetImport reports missing linked tileset and image resources", async () => {
  tilesetMocks.parseXmlDocument.mockReturnValueOnce({
    documentElement: createXmlElement(
      "tileset",
      {
        source: "linked.tsj",
      },
    ),
  });

  const linkedTilesetResult = await prepareTiledTilesetImport(
    "tiles/root.tsx",
    [{ path: "tiles/root.tsx", data: encodeText("xml-linked") }],
    "xml",
  );

  expect(linkedTilesetResult).toEqual({
    status: "missing-resources",
    rootPath: "tiles/root.tsx",
    missingResources: [
      {
        kind: "tsj",
        label: "Missing tsj",
        path: "tiles/linked.tsj",
        referringPath: "tiles/linked.tsj",
      },
    ],
  });

  tilesetMocks.parseXmlDocument.mockReturnValueOnce({
    documentElement: createXmlElement(
      "tileset",
      {
        tilewidth: "16",
        tileheight: "16",
        margin: "0",
        spacing: "0",
      },
      {
        source: "terrain.png",
        width: "64",
        height: "16",
      },
    ),
  });

  const imageResult = await prepareTiledTilesetImport(
    "tiles/terrain.tsx",
    [{ path: "tiles/terrain.tsx", data: encodeText("xml-image") }],
    "xml",
  );

  expect(imageResult).toEqual({
    status: "missing-resources",
    rootPath: "tiles/terrain.tsx",
    missingResources: [
      {
        kind: "image",
        label: "Missing image",
        path: "tiles/terrain.png",
        referringPath: "tiles/terrain.tsx",
      },
    ],
  });
});

test("prepareTiledTilesetImport imports XML tilesets with autotile and animation metadata", async () => {
  tilesetMocks.parseXmlDocument.mockImplementation((text: string) => {
    if (text !== "xml-ready") {
      return undefined;
    }

    return {
      documentElement: createXmlElement(
        "tileset",
        {
          name: "Terrain",
          tilewidth: "16",
          tileheight: "16",
          margin: "1",
          spacing: "2",
        },
        {
          source: "terrain.png",
          width: "64",
          height: "16",
        },
      ),
    };
  });
  tilesetMocks.importTiledTilesetImageAsset.mockResolvedValueOnce({
    assetId: "asset-1",
    width: 64,
    height: 16,
  });
  tilesetMocks.buildAutotileFromTiledWangSets.mockReturnValueOnce({
    preset: "wang-tiles",
  });
  tilesetMocks.readXmlTilesetAnimationConfig.mockReturnValueOnce({
    version: 1,
    animations: [],
  });

  const result = await prepareTiledTilesetImport(
    "tiles/terrain.tsx",
    [
      { path: "tiles/terrain.tsx", data: encodeText("xml-ready") },
      { path: "tiles/terrain.png", data: new Uint8Array([1, 2, 3]) },
    ],
    "xml",
  );

  expect(result).toEqual({
    status: "ready",
    result: [
      expect.objectContaining({
        id: "tileset-generated",
        name: "Terrain",
        tileSize: 16,
        assetId: "asset-1",
        imageWidth: 64,
        imageHeight: 16,
        autotile: { preset: "wang-tiles" },
        animations: { version: 1, animations: [] },
      }),
    ],
  });
  expect(tilesetMocks.importTiledTilesetImageAsset).toHaveBeenCalledWith(
    "tiles/terrain.png",
    new Uint8Array([1, 2, 3]),
    {
      tileWidth: 16,
      tileHeight: 16,
      margin: 1,
      spacing: 2,
      imageWidth: 64,
      imageHeight: 16,
    },
  );
});

test("prepareTiledTilesetImport imports JSON and Lua tilesets and derives a fallback name from the image path", async () => {
  tilesetMocks.importTiledTilesetImageAsset.mockResolvedValue({
    assetId: "asset-1",
    width: 32,
    height: 16,
  });
  tilesetMocks.readJsonTilesetAnimationConfig.mockReturnValue({
    version: 1,
    animations: [],
  });

  const jsonResult = await prepareTiledTilesetImport(
    "tiles/terrain.tsj",
    [
      {
        path: "tiles/terrain.tsj",
        data: encodeText(
          JSON.stringify({
            type: "tileset",
            tilewidth: 16,
            tileheight: 16,
            image: "terrain.png",
            imagewidth: 32,
            imageheight: 16,
          }),
        ),
      },
      { path: "tiles/terrain.png", data: new Uint8Array([1]) },
    ],
    "json",
  );

  tilesetMocks.parseTiledLuaDocument.mockReturnValue({
    tilewidth: 16,
    tileheight: 16,
    image: "terrain.png",
    imagewidth: 32,
    imageheight: 16,
  });

  const luaResult = await prepareTiledTilesetImport(
    "tiles/terrain.lua",
    [
      { path: "tiles/terrain.lua", data: encodeText("lua-tileset") },
      { path: "tiles/terrain.png", data: new Uint8Array([2]) },
    ],
    "lua",
  );

  expect(jsonResult.status).toBe("ready");
  expect(luaResult.status).toBe("ready");
  expect(jsonResult.status === "ready" && jsonResult.result[0]?.name).toBe(
    "tiles/terrain",
  );
  expect(luaResult.status === "ready" && luaResult.result[0]?.name).toBe(
    "tiles/terrain",
  );
  expect(tilesetMocks.parseTiledLuaDocument).toHaveBeenCalled();
  expect(tilesetMocks.normalizeTiledLuaTilesetDocument).toHaveBeenCalled();
});

test("prepareTiledTilesetImport rejects unsupported, map, non-square, and image-less tilesets", async () => {
  tilesetMocks.parseXmlDocument.mockReturnValueOnce({
    documentElement: createXmlElement("tileset", {
      source: "linked.foo",
    }),
  });

  await expect(
    prepareTiledTilesetImport(
      "tiles/terrain.tsx",
      [{ path: "tiles/terrain.tsx", data: encodeText("xml-unsupported") }],
      "xml",
    ),
  ).rejects.toThrow("Unsupported linked Tiled tileset file type: linked.foo.");

  await expect(
    prepareTiledTilesetImport(
      "tiles/map.tsj",
      [
        {
          path: "tiles/map.tsj",
          data: encodeText(JSON.stringify({ layers: [] })),
        },
      ],
      "json",
    ),
  ).rejects.toThrow("Selected Tiled JSON file contains a map, not a tileset.");

  await expect(
    prepareTiledTilesetImport(
      "tiles/rect.tsj",
      [
        {
          path: "tiles/rect.tsj",
          data: encodeText(
            JSON.stringify({
              type: "tileset",
              tilewidth: 16,
              tileheight: 32,
              image: "terrain.png",
            }),
          ),
        },
        { path: "tiles/terrain.png", data: new Uint8Array([1]) },
      ],
      "json",
    ),
  ).rejects.toThrow("Only square Tiled tilesets are supported.");

  await expect(
    prepareTiledTilesetImport(
      "tiles/no-image.tsj",
      [
        {
          path: "tiles/no-image.tsj",
          data: encodeText(
            JSON.stringify({
              type: "tileset",
              tilewidth: 16,
              tileheight: 16,
            }),
          ),
        },
      ],
      "json",
    ),
  ).rejects.toThrow("Only image-based Tiled tilesets are supported.");
});