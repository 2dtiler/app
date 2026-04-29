import { assert, test } from "vitest";
import {
  assignTileToSelectionTarget,
  cloneAutotileConfig,
  countConfiguredAssignments,
  getAutotileActiveSlotIds,
  getAutotileAssignmentGroups,
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
