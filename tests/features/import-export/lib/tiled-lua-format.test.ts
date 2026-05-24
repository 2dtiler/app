import { assert, expect, test } from "vitest";
import { encodeTiledLuaDocument } from "@/features/import-export/lib/tiled-lua";
import {
  buildTiledLuaMapDocument,
  buildTiledLuaTilesetDocument,
  createSyntheticTiledLuaJsonEntries,
  normalizeTiledLuaMapDocument,
  normalizeTiledLuaTilesetDocument,
} from "@/features/import-export/lib/tiled-lua-format";

function decodeJson(data: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
}

test("normalizes rich Tiled Lua map documents", () => {
  const normalized = normalizeTiledLuaMapDocument({
    version: 1.9,
    tiledversion: "1.10.2",
    orientation: "staggered",
    renderorder: "right-down",
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    compressionlevel: -1,
    staggeraxis: "x",
    staggerindex: "odd",
    hexsidelength: 8,
    nextlayerid: 7,
    nextobjectid: 9,
    properties: {
      title: "Dungeon",
      difficulty: 3,
      wet: true,
      note: null,
      target: { id: 42 },
    },
    layers: [
      {
        type: "tilelayer",
        id: 1,
        name: "Ground",
        visible: false,
        opacity: 0.5,
        width: 2,
        height: 2,
        data: [1, "2", false, 4],
        properties: { cost: 1.5 },
      },
      {
        type: "tilelayer",
        name: "Encoded",
        data: "AAAA",
        encoding: "base64",
        compression: "zlib",
      },
      {
        type: "imagelayer",
        name: "Backdrop",
        image: "images/bg.png",
      },
      {
        type: "objectgroup",
        name: "Objects",
        objects: [
          { id: 1, name: "Point", shape: "point", x: 1, y: 2 },
          { id: 2, name: "Ellipse", shape: "ellipse", width: 8, height: 4 },
          {
            id: 3,
            name: "Poly",
            shape: "polygon",
            polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
          },
          {
            id: 4,
            name: "Line",
            shape: "polyline",
            polyline: [{ x: 0, y: 0 }, { x: 1, y: 2 }],
          },
          {
            id: 5,
            name: "Label",
            shape: "text",
            text: "Hello",
            fontfamily: "Mono",
            pixelsize: 18,
            wrap: true,
            color: "#ffffff",
          },
        ],
      },
      {
        type: "group",
        name: "Group",
        layers: [{ type: "imagelayer", name: "Child", image: "child.png" }],
      },
    ],
    tilesets: [
      { firstgid: 1, exportfilename: "terrain.lua" },
      {
        firstgid: 100,
        name: "embedded",
        tilewidth: 16,
        tileheight: 16,
        tilecount: 4,
        columns: 2,
        margin: 1,
        spacing: 2,
        image: "embedded.png",
        imagewidth: 32,
        imageheight: 32,
        properties: { theme: "stone" },
        tiles: [
          {
            id: 0,
            properties: { solid: true },
            animation: [{ tileid: 1, duration: 100 }],
          },
        ],
        wangsets: [
          {
            name: "Wang",
            type: "corner",
            tile: 0,
            colors: [{ name: "grass", color: "#00ff00", tile: 1, probability: 1 }],
            wangtiles: [{ tileid: 0, wangid: [1, 0, 1, 0] }],
          },
        ],
      },
    ],
  });

  assert.strictEqual(normalized.orientation, "staggered");
  assert.strictEqual(normalized.properties?.length, 5);
  assert.deepEqual(normalized.layers[0]?.data, [1, 2, 0, 4]);
  assert.strictEqual(normalized.layers[1]?.compression, "zlib");
  assert.strictEqual(normalized.layers[3]?.objects?.[0]?.point, true);
  assert.strictEqual(normalized.layers[3]?.objects?.[1]?.ellipse, true);
  assert.deepEqual(normalized.layers[3]?.objects?.[4]?.text, {
    text: "Hello",
    fontfamily: "Mono",
    pixelsize: 18,
    wrap: true,
    color: "#ffffff",
  });
  assert.deepEqual(normalized.tilesets[0], {
    firstgid: 1,
    source: "terrain.lua",
  });
  assert.strictEqual(normalized.tilesets[1]?.wangsets?.[0]?.colors[0]?.name, "grass");
  assert.strictEqual(normalized.tilesets[1]?.tiles?.[0]?.animation?.[0]?.duration, 100);
});

test("builds Tiled Lua map and tileset documents from JSON-like inputs", () => {
  const mapDocument = buildTiledLuaMapDocument({
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    width: 1,
    height: 1,
    tilewidth: 16,
    tileheight: 16,
    infinite: true,
    compressionlevel: -1,
    nextlayerid: 2,
    nextobjectid: 3,
    properties: [{ name: "target", type: "object", value: 7 }],
    layers: [
      {
        type: "tilelayer",
        id: 1,
        name: "Ground",
        width: 1,
        height: 1,
        data: [1],
      },
      {
        type: "objectgroup",
        name: "Objects",
        objects: [
          {
            id: 1,
            name: "Label",
            x: 0,
            y: 0,
            text: {
              text: "Hello",
              fontfamily: "Mono",
              pixelsize: 16,
              wrap: false,
              color: "#000000",
            },
            properties: [{ name: "target", type: "object", value: 7 }],
          },
          {
            id: 2,
            name: "Path",
            polyline: [{ x: 0, y: 0 }],
          },
        ],
      },
    ],
    tilesets: [
      { firstgid: 1, source: "terrain.lua" },
      {
        firstgid: 10,
        name: "embedded",
        tilewidth: 16,
        tileheight: 16,
        tilecount: 1,
        columns: 1,
        image: "embedded.png",
        imagewidth: 16,
        imageheight: 16,
      },
    ],
  });
  const tilesetDocument = buildTiledLuaTilesetDocument({
    name: "terrain",
    tilewidth: 16,
    tileheight: 16,
    tilecount: 1,
    columns: 1,
    image: "terrain.png",
    imagewidth: 16,
    imageheight: 16,
    properties: [{ name: "solid", type: "bool", value: true }],
  });

  assert.strictEqual(mapDocument.infinite, true);
  assert.deepEqual(mapDocument.properties, { target: { id: 7 } });
  assert.strictEqual(mapDocument.layers[0]?.encoding, "lua");
  assert.strictEqual(mapDocument.layers[1]?.objects[0]?.shape, "text");
  assert.strictEqual(mapDocument.layers[1]?.objects[1]?.shape, "polyline");
  assert.strictEqual(mapDocument.tilesets[0]?.filename, "terrain.lua");
  assert.strictEqual(tilesetDocument.luaversion, "5.1");
  assert.deepEqual(tilesetDocument.properties, { solid: true });
});

test("creates synthetic JSON entries for Tiled Lua maps and tilesets", () => {
  const entries = createSyntheticTiledLuaJsonEntries("maps/level.lua", [
    {
      path: "maps/level.lua",
      data: encodeTiledLuaDocument({
        width: 1,
        height: 1,
        tilewidth: 16,
        tileheight: 16,
        layers: [],
        tilesets: [{ firstgid: 1, filename: "../tilesets/terrain.lua" }],
      }),
    },
    {
      path: "tilesets/terrain.lua",
      data: encodeTiledLuaDocument({
        name: "terrain",
        tilewidth: 16,
        tileheight: 16,
        tilecount: 1,
        columns: 1,
      }),
    },
    {
      path: "images/terrain.png",
      data: new Uint8Array([1, 2, 3]),
    },
  ]);

  assert.strictEqual(entries[0]?.path, "maps/level.lua");
  assert.strictEqual(decodeJson(entries[0]!.data).type, "map");
  assert.strictEqual(decodeJson(entries[1]!.data).name, "terrain");
  assert.deepEqual([...entries[2]!.data], [1, 2, 3]);
});

test("rejects unsupported Tiled Lua normalization inputs", () => {
  expect(() => normalizeTiledLuaMapDocument({ layers: [null] })).toThrow(
    /Invalid Tiled Lua layer/,
  );
  expect(() =>
    normalizeTiledLuaMapDocument({ layers: [{ type: "custom" }] }),
  ).toThrow(/Unsupported Tiled Lua layer/);
  expect(() =>
    normalizeTiledLuaMapDocument({
      properties: { bad: { nested: true } },
      layers: [],
    }),
  ).toThrow(/Unsupported Tiled Lua property/);
  expect(() => normalizeTiledLuaTilesetDocument({ tiles: [null] })).not.toThrow();
});
