import { assert, test } from "vitest";
import {
  classifyAutotileTile,
  findAutotileTerrainByPaletteTile,
  resolveAutotileWrites,
} from "@/features/map-editor/lib/autotile";
import type { AutotileConfig, TileRef, TilesetId } from "@/types";

const TILESET_ID = "tileset-1" as TilesetId;

function createTileRef(sx: number, sy: number): TileRef {
  return {
    tilesetId: TILESET_ID,
    sx,
    sy,
    sw: 16,
    sh: 16,
  };
}

function createAutotileConfig(): AutotileConfig {
  return {
    version: 1,
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: { sx: 0, sy: 0, sw: 16, sh: 16 },
      },
      {
        id: "terrain-water",
        name: "Water",
        paletteTile: { sx: 16, sy: 0, sw: 16, sh: 16 },
      },
    ],
    rules: [
      {
        id: "rule-land-north-west-water",
        name: "Land corner",
        centerTerrainId: "terrain-land",
        neighbors: {
          northWest: { kind: "any" },
          north: { kind: "terrain", terrainId: "terrain-water" },
          northEast: { kind: "any" },
          west: { kind: "terrain", terrainId: "terrain-water" },
          east: { kind: "any" },
          southWest: { kind: "any" },
          south: { kind: "any" },
          southEast: { kind: "any" },
        },
        output: { sx: 48, sy: 0, sw: 16, sh: 16 },
      },
      {
        id: "rule-land-north-water",
        name: "Land north edge",
        centerTerrainId: "terrain-land",
        neighbors: {
          northWest: { kind: "any" },
          north: { kind: "terrain", terrainId: "terrain-water" },
          northEast: { kind: "any" },
          west: { kind: "any" },
          east: { kind: "any" },
          southWest: { kind: "any" },
          south: { kind: "any" },
          southEast: { kind: "any" },
        },
        output: { sx: 32, sy: 0, sw: 16, sh: 16 },
      },
      {
        id: "rule-water-open-top",
        name: "Water with empty north",
        centerTerrainId: "terrain-water",
        neighbors: {
          northWest: { kind: "any" },
          north: { kind: "empty" },
          northEast: { kind: "any" },
          west: { kind: "any" },
          east: { kind: "any" },
          southWest: { kind: "any" },
          south: { kind: "any" },
          southEast: { kind: "any" },
        },
        output: { sx: 64, sy: 0, sw: 16, sh: 16 },
      },
    ],
  } as AutotileConfig;
}

test("palette and rule tiles both classify back to their terrain", () => {
  const autotile = createAutotileConfig();

  assert.strictEqual(
    findAutotileTerrainByPaletteTile(autotile, {
      sx: 16,
      sy: 0,
      sw: 16,
      sh: 16,
    })?.id,
    "terrain-water",
  );
  assert.strictEqual(
    classifyAutotileTile(autotile, TILESET_ID, createTileRef(32, 0)),
    "terrain-land",
  );
});

test("first matching rule wins when multiple rules match the same center cell", () => {
  const resolved = resolveAutotileWrites({
    autotile: createAutotileConfig(),
    baseTiles: {
      "1,0": createTileRef(16, 0),
      "0,1": createTileRef(16, 0),
    },
    mapWidth: 4,
    mapHeight: 4,
    tilesetId: TILESET_ID,
    writes: [{ x: 1, y: 1, terrainId: "terrain-land" as const }],
  });

  assert.deepEqual(resolved.get("1,1"), createTileRef(48, 0));
});

test("painting a terrain rewrites the painted cell and immediate neighbors", () => {
  const resolved = resolveAutotileWrites({
    autotile: createAutotileConfig(),
    baseTiles: {
      "1,1": createTileRef(0, 0),
    },
    mapWidth: 4,
    mapHeight: 4,
    tilesetId: TILESET_ID,
    writes: [{ x: 1, y: 0, terrainId: "terrain-water" as const }],
  });

  assert.deepEqual(resolved.get("1,0"), createTileRef(64, 0));
  assert.deepEqual(resolved.get("1,1"), createTileRef(32, 0));
});

test("erasing an autotile terrain clears the cell and retile neighbors", () => {
  const resolved = resolveAutotileWrites({
    autotile: createAutotileConfig(),
    baseTiles: {
      "1,0": createTileRef(64, 0),
      "1,1": createTileRef(32, 0),
    },
    mapWidth: 4,
    mapHeight: 4,
    tilesetId: TILESET_ID,
    writes: [{ x: 1, y: 0, terrainId: null }],
  });

  assert.strictEqual(resolved.get("1,0"), null);
  assert.deepEqual(resolved.get("1,1"), createTileRef(0, 0));
});
