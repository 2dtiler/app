import { assert, test } from "vitest";
import { resolveAutotileWrites } from "@/features/map-editor/lib/autotile";
import {
  AUTOTILE_PATTERN_SLOTS,
  buildPresetAutotileRules,
  getAutotilePresetDefinition,
} from "@/features/map-editor/lib/autotile-preset-rules";
import type { AutotileConfig, TilesetId } from "@/types";

const TILESET_ID = "tileset-visual" as TilesetId;

function createTileRef(sx: number, sy: number) {
  return {
    tilesetId: TILESET_ID,
    sx,
    sy,
    sw: 16,
    sh: 16,
  };
}

test("preset definitions expose the required visual slots for setup", () => {
  const preset = getAutotilePresetDefinition("full-corners");

  assert.deepEqual(preset.requiredSlots, [
    "edgeNorth",
    "edgeEast",
    "edgeSouth",
    "edgeWest",
    "outerCornerNorthWest",
    "outerCornerNorthEast",
    "outerCornerSouthWest",
    "outerCornerSouthEast",
    "innerCornerNorthWest",
    "innerCornerNorthEast",
    "innerCornerSouthWest",
    "innerCornerSouthEast",
  ]);
  assert.deepEqual(preset.optionalSlots, []);
});

test("compiled preset rules keep more specific corner tiles ahead of edges", () => {
  const rules = buildPresetAutotileRules({
    preset: "edges-corners",
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: { sx: 0, sy: 0, sw: 16, sh: 16 },
        patternTiles: {
          outerCornerNorthWest: { sx: 16, sy: 0, sw: 16, sh: 16 },
          edgeNorth: { sx: 32, sy: 0, sw: 16, sh: 16 },
        },
      },
    ],
  });

  assert.strictEqual(rules.length, 2);
  assert.strictEqual(rules[0]?.name, "Land Outside Top Left Corner");
  assert.strictEqual(rules[1]?.name, "Land Top Edge");
  assert.deepEqual(rules[0]?.neighbors.north, {
    kind: "notTerrain",
    terrainId: "terrain-land",
  });
  assert.deepEqual(rules[0]?.neighbors.west, {
    kind: "notTerrain",
    terrainId: "terrain-land",
  });
});

test("compiled preset rules plug into resolveAutotileWrites", () => {
  const terrains = [
    {
      id: "terrain-land",
      name: "Land",
      paletteTile: { sx: 0, sy: 0, sw: 16, sh: 16 },
      patternTiles: {
        outerCornerNorthWest: { sx: 16, sy: 0, sw: 16, sh: 16 },
        edgeNorth: { sx: 32, sy: 0, sw: 16, sh: 16 },
      },
    },
  ] as AutotileConfig["terrains"];

  const autotile: AutotileConfig = {
    version: 1,
    preset: "edges-corners",
    terrains,
    rules: buildPresetAutotileRules({ preset: "edges-corners", terrains }),
  };

  const resolved = resolveAutotileWrites({
    autotile,
    baseTiles: {},
    mapWidth: 3,
    mapHeight: 3,
    tilesetId: TILESET_ID,
    writes: [{ x: 1, y: 1, terrainId: "terrain-land" }],
  });

  assert.deepEqual(resolved.get("1,1"), createTileRef(16, 0));
  assert.strictEqual(
    AUTOTILE_PATTERN_SLOTS.outerCornerNorthWest.description,
    "Use this when the top and left sides both open away from the terrain.",
  );
});
