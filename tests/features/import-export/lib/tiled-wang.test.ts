import { assert, test } from "vitest";
import {
  buildAutotileFromTiledWangSets,
  buildTiledJsonWangSets,
  createTiledWangIdFromMask,
} from "@/features/import-export/lib/tiled-wang";
import type { AutotileConfig, Tileset } from "@/types";

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
