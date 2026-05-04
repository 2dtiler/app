import { assert, test } from "vitest";
import {
  appendTiledXmlWangSetElements,
  buildAutotileFromTiledWangSets,
  buildTiledJsonWangSets,
  createTiledWangIdFromMask,
  readTiledXmlWangSets,
} from "@/features/import-export/lib/tiled-wang";
import "./tiled-test-support";
import type { AutotileConfig, TiledJsonWangSet, Tileset } from "@/types";

function createWangTileset() {
  const autotile = {
    version: 1,
    preset: "wang-tiles",
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: { sx: 16, sy: 0, sw: 16, sh: 16 },
        patternTiles: {
          "wang-00": { sx: 0, sy: 0, sw: 16, sh: 16 },
          "wang-05": { sx: 32, sy: 0, sw: 16, sh: 16 },
          "wang-0f": { sx: 16, sy: 0, sw: 16, sh: 16 },
        },
      },
    ],
    rules: [],
  } as AutotileConfig;

  return {
    id: "tileset-1" as Tileset["id"],
    name: "Terrain",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-1" as Tileset["assetId"],
    imageWidth: 64,
    imageHeight: 16,
    autotile,
    createdAt: 1,
  } as Tileset;
}

test("tiled wang ids encode cardinal edges in the expected order", () => {
  assert.deepEqual(createTiledWangIdFromMask(0), [1, 0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(createTiledWangIdFromMask(5), [2, 0, 1, 0, 2, 0, 1, 0]);
  assert.deepEqual(createTiledWangIdFromMask(15), [2, 0, 2, 0, 2, 0, 2, 0]);
});

test("two-color edge wang sets round-trip to autotile terrain config", () => {
  const tileset = createWangTileset();
  const wangSets = buildTiledJsonWangSets(tileset);

  assert.ok(wangSets);
  assert.strictEqual(wangSets?.[0]?.type, "edge");
  assert.strictEqual(wangSets?.[0]?.colors?.length, 2);
  assert.deepEqual(
    wangSets?.[0]?.wangtiles?.map((tile) => tile.tileid),
    [0, 2, 1],
  );

  const imported = buildAutotileFromTiledWangSets(tileset, wangSets);

  assert.ok(imported);
  assert.strictEqual(imported?.preset, "wang-tiles");
  assert.strictEqual(imported?.terrains.length, 1);
  assert.deepEqual(imported?.terrains[0]?.paletteTile, {
    sx: 16,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(imported?.terrains[0]?.patternTiles?.["wang-05"], {
    sx: 32,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.strictEqual(imported?.rules.length, 3);
});

test("multi-color mixed wang sets import into named Wang config", () => {
  const tileset = createWangTileset();
  const mixedWangSet: TiledJsonWangSet = {
    name: "Terrain Colors",
    type: "mixed",
    tile: 2,
    colors: [
      { name: "Grass", color: "#00ff00", tile: 0, probability: 2 },
      { name: "Water", color: "#0000ff", tile: 1, probability: 0.5 },
      { name: "Sand", color: "#ffff00", tile: 2, probability: 3 },
    ],
    wangtiles: [
      { tileid: 0, wangid: [1, 2, 3, 1, 2, 3, 1, 2] },
      { tileid: 3, wangid: [3, 0, 3, 0, 3, 0, 3, 0] },
      { tileid: 99, wangid: [1, 1, 1, 1, 1, 1, 1, 1] },
    ],
  };

  const imported = buildAutotileFromTiledWangSets(tileset, [mixedWangSet]);

  assert.ok(imported);
  assert.strictEqual(imported?.preset, "wang-named-colors");
  assert.strictEqual(imported?.terrains.length, 0);
  assert.strictEqual(imported?.rules.length, 0);
  assert.strictEqual(imported?.wangSets?.length, 1);
  assert.strictEqual(imported?.wangSets?.[0]?.name, "Terrain Colors");
  assert.strictEqual(imported?.wangSets?.[0]?.type, "mixed");
  assert.strictEqual(imported?.wangSets?.[0]?.colors[2]?.name, "Sand");
  assert.strictEqual(imported?.wangSets?.[0]?.colors[2]?.probability, 3);
  assert.strictEqual(imported?.wangSets?.[0]?.tiles.length, 2);
  assert.deepEqual(
    imported?.wangSets?.[0]?.tiles[0]?.wangId,
    [1, 2, 3, 1, 2, 3, 1, 2],
  );

  const exported = buildTiledJsonWangSets({ ...tileset, autotile: imported! });

  assert.strictEqual(exported?.[0]?.type, "mixed");
  assert.strictEqual(exported?.[0]?.colors?.length, 3);
  assert.deepEqual(
    exported?.[0]?.colors?.map((color) => color.name),
    ["Grass", "Water", "Sand"],
  );
  assert.deepEqual(
    exported?.[0]?.wangtiles?.map((tile) => tile.wangid),
    [
      [1, 2, 3, 1, 2, 3, 1, 2],
      [3, 0, 3, 0, 3, 0, 3, 0],
    ],
  );
});

test("two-color named edge wang sets preserve color names", () => {
  const tileset = createWangTileset();
  const namedEdgeWangSet: TiledJsonWangSet = {
    name: "Shoreline",
    type: "edge",
    tile: 0,
    colors: [
      { name: "Grass", color: "#00aa00", tile: 0, probability: 2 },
      { name: "Water", color: "#0055ff", tile: 1, probability: 3 },
    ],
    wangtiles: [{ tileid: 2, wangid: [1, 0, 2, 0, 1, 0, 2, 0] }],
  };

  const imported = buildAutotileFromTiledWangSets(tileset, [namedEdgeWangSet]);
  const exported = buildTiledJsonWangSets({ ...tileset, autotile: imported! });

  assert.strictEqual(imported?.preset, "wang-named-colors");
  assert.deepEqual(
    imported?.wangSets?.[0]?.colors.map((color) => color.name),
    ["Grass", "Water"],
  );
  assert.deepEqual(
    exported?.[0]?.colors?.map((color) => color.probability),
    [2, 3],
  );
  assert.deepEqual(
    exported?.[0]?.wangtiles?.[0]?.wangid,
    [1, 0, 2, 0, 1, 0, 2, 0],
  );
});

test("corner wang sets preserve corner color indexes", () => {
  const tileset = createWangTileset();
  const cornerWangSet: TiledJsonWangSet = {
    name: "Corner Colors",
    type: "corner",
    tile: 1,
    colors: [
      { name: "Light", color: "#eeeeee", tile: 1, probability: 1 },
      { name: "Dark", color: "#222222", tile: 2, probability: 4 },
    ],
    wangtiles: [{ tileid: 2, wangid: [0, 1, 0, 2, 0, 1, 0, 2] }],
  };

  const imported = buildAutotileFromTiledWangSets(tileset, [cornerWangSet]);
  const exported = buildTiledJsonWangSets({ ...tileset, autotile: imported! });

  assert.strictEqual(imported?.preset, "wang-named-colors");
  assert.strictEqual(imported?.wangSets?.[0]?.type, "corner");
  assert.deepEqual(
    imported?.wangSets?.[0]?.tiles[0]?.wangId,
    [0, 1, 0, 2, 0, 1, 0, 2],
  );
  assert.deepEqual(
    exported?.[0]?.wangtiles?.[0]?.wangid,
    [0, 1, 0, 2, 0, 1, 0, 2],
  );
});

test("xml wang sets round-trip named color metadata", () => {
  const document = window.document.implementation.createDocument("", "tileset");
  const wangSets: TiledJsonWangSet[] = [
    {
      name: "Biomes",
      type: "mixed",
      tile: 3,
      colors: [
        { name: "Forest", color: "#116611", tile: 0, probability: 2.5 },
        { name: "River", color: "#2255ff", tile: 1, probability: 0.75 },
      ],
      wangtiles: [{ tileid: 2, wangid: [1, 2, 1, 2, 1, 2, 1, 2] }],
    },
  ];

  appendTiledXmlWangSetElements(document, document.documentElement, wangSets);
  const readBack = readTiledXmlWangSets(document.documentElement);

  assert.deepEqual(readBack, wangSets);
});
