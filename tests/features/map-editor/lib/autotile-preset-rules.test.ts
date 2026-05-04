import { assert, test } from "vitest";
import { resolveAutotileWrites } from "@/features/map-editor/lib/autotile";
import {
  AUTOTILE_PATTERN_SLOTS,
  buildPresetAutotileRules,
  getAutotilePresetCardGroups,
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

test("blob preset exposes the 47 valid gated 8-neighbor masks", () => {
  const preset = getAutotilePresetDefinition("blob-47");

  assert.strictEqual(preset.requiredSlots.length, 47);
  assert.ok(preset.requiredSlots.includes("blob-00"));
  assert.ok(preset.requiredSlots.includes("blob-ff"));
  assert.strictEqual(
    AUTOTILE_PATTERN_SLOTS["blob-00"]?.neighbors.northEast,
    "ignore",
  );
  assert.strictEqual(
    AUTOTILE_PATTERN_SLOTS["blob-ff"]?.neighbors.northEast,
    "same",
  );
});

test("wang preset exposes the 16 cardinal edge combinations", () => {
  const preset = getAutotilePresetDefinition("wang-tiles");

  assert.strictEqual(preset.editorLayout, "wang");
  assert.strictEqual(preset.requiredSlots.length, 16);
  assert.ok(preset.requiredSlots.includes("wang-00"));
  assert.ok(preset.requiredSlots.includes("wang-0f"));
  assert.strictEqual(
    AUTOTILE_PATTERN_SLOTS["wang-00"]?.neighbors.north,
    "different",
  );
  assert.strictEqual(
    AUTOTILE_PATTERN_SLOTS["wang-00"]?.neighbors.northEast,
    "ignore",
  );
  assert.strictEqual(
    AUTOTILE_PATTERN_SLOTS["wang-0f"]?.neighbors.north,
    "same",
  );
  assert.strictEqual(AUTOTILE_PATTERN_SLOTS["wang-0f"]?.neighbors.east, "same");
  assert.strictEqual(
    AUTOTILE_PATTERN_SLOTS["wang-0f"]?.neighbors.southWest,
    "ignore",
  );
});

test("blob preset groups patterns into small shape-based sections", () => {
  const groups = getAutotilePresetCardGroups("blob-47");

  assert.deepEqual(
    groups.map((group) => group.id),
    [
      "isolated",
      "end-caps",
      "straight-runs",
      "filled-turns",
      "turn-cut-ins",
      "tee-open-north",
      "tee-open-east",
      "tee-open-south",
      "tee-open-west",
      "solid-core",
      "single-cut-in",
      "double-cut-ins",
      "triple-cut-ins",
      "cross-cut-in",
    ],
  );
  assert.strictEqual(
    groups.reduce((total, group) => total + group.slotIds.length, 0),
    47,
  );
  assert.strictEqual(
    Math.max(...groups.map((group) => group.slotIds.length)),
    6,
  );
  assert.deepEqual(groups[0]?.slotIds, ["blob-00"]);
  assert.deepEqual(groups[9]?.slotIds, ["blob-ff"]);
});

test("wang preset groups its edge patterns into a single compact section", () => {
  const groups = getAutotilePresetCardGroups("wang-tiles");

  assert.deepEqual(
    groups.map((group) => group.id),
    ["wang-patterns"],
  );
  assert.strictEqual(groups[0]?.slotIds.length, 16);
  assert.deepEqual(groups[0]?.slotIds.slice(0, 2), ["wang-00", "wang-01"]);
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

test("blob preset compiles isolated and fully-surrounded rules", () => {
  const rules = buildPresetAutotileRules({
    preset: "blob-47",
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: { sx: 0, sy: 0, sw: 16, sh: 16 },
        patternTiles: {
          "blob-00": { sx: 16, sy: 0, sw: 16, sh: 16 },
          "blob-ff": { sx: 32, sy: 0, sw: 16, sh: 16 },
        },
      },
    ],
  });

  assert.deepEqual(
    rules.map((rule) => rule.name),
    ["Land Blob 0x00", "Land Blob 0xFF"],
  );
  assert.deepEqual(rules[0]?.neighbors.northWest, { kind: "any" });
  assert.deepEqual(rules[1]?.neighbors.northWest, {
    kind: "terrain",
    terrainId: "terrain-land",
  });
});

test("wang preset compiles cardinal edge matchers and ignores diagonals", () => {
  const rules = buildPresetAutotileRules({
    preset: "wang-tiles",
    terrains: [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: { sx: 0, sy: 0, sw: 16, sh: 16 },
        patternTiles: {
          "wang-00": { sx: 16, sy: 0, sw: 16, sh: 16 },
          "wang-0f": { sx: 32, sy: 0, sw: 16, sh: 16 },
        },
      },
    ],
  });

  assert.deepEqual(
    rules.map((rule) => rule.name),
    ["Land All Edges Open", "Land All Edges Match"],
  );
  assert.deepEqual(rules[0]?.neighbors.north, {
    kind: "notTerrain",
    terrainId: "terrain-land",
  });
  assert.deepEqual(rules[1]?.neighbors.west, {
    kind: "terrain",
    terrainId: "terrain-land",
  });
  assert.deepEqual(rules[1]?.neighbors.northWest, { kind: "any" });
});
