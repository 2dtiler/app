import { assert, test } from "vitest";
import {
  assignTileToSelectionTarget,
  cloneAutotileConfig,
  countConfiguredAssignments,
  getAutotileActiveSlotIds,
  getAutotileAssignmentGroups,
  getSelectionInstructions,
} from "@/features/map-editor/lib/autotile-dialog";

test("cloneAutotileConfig creates a default draft when no config exists", () => {
  const draft = cloneAutotileConfig(undefined);

  assert.strictEqual(draft.preset, "edges-corners");
  assert.deepEqual(draft.terrains, []);
  assert.deepEqual(draft.rules, []);
});

test("getAutotileAssignmentGroups only shows inside corners for full corners", () => {
  assert.deepEqual(
    getAutotileAssignmentGroups("edges-only").map((group) => group.id),
    ["edges-outside"],
  );
  assert.deepEqual(
    getAutotileAssignmentGroups("full-corners").map((group) => group.id),
    ["edges-outside", "inside-corners"],
  );
  assert.deepEqual(getAutotileActiveSlotIds("edges-only"), [
    "edgeNorth",
    "edgeEast",
    "edgeSouth",
    "edgeWest",
  ]);
  assert.deepEqual(getAutotileAssignmentGroups("blob-47"), []);
  assert.strictEqual(getAutotileActiveSlotIds("blob-47").length, 47);
});

test("assignTileToSelectionTarget updates terrain coverage counts", () => {
  const terrains = assignTileToSelectionTarget(
    [
      {
        id: "terrain-land",
        name: "Land",
        paletteTile: null,
        patternTiles: {},
      },
    ],
    {
      type: "pattern",
      terrainId: "terrain-land",
      slotId: "edgeNorth",
    },
    { sx: 16, sy: 0, sw: 16, sh: 16 },
  );

  assert.strictEqual(
    countConfiguredAssignments(terrains[0], ["edgeNorth", "edgeEast"]),
    1,
  );
  assert.deepEqual(terrains[0].patternTiles?.edgeNorth, {
    sx: 16,
    sy: 0,
    sw: 16,
    sh: 16,
  });
});

test("getSelectionInstructions requires selecting a target before the tileset", () => {
  const draft = cloneAutotileConfig({
    version: 1,
    preset: "edges-corners",
    terrains: [
      {
        id: "terrain-land",
        name: "Land to Water",
        paletteTile: null,
        patternTiles: {},
      },
    ],
    rules: [],
  });

  assert.strictEqual(
    getSelectionInstructions(draft, null),
    "Select the center paint tile or a pattern tile on the right, then click a tile in the picker.",
  );
  assert.strictEqual(
    getSelectionInstructions(draft, {
      type: "terrain",
      terrainId: "terrain-land",
    }),
    "Click a tile to use as the paint tile for Land to Water.",
  );
});
