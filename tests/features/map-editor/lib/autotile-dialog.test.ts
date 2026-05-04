import { assert, test } from "vitest";
import {
  assignTileToSelectionTarget,
  cloneAutotileConfig,
  countConfiguredAssignments,
  getAutotileActiveSlotIds,
  getAutotileAssignmentGroups,
  getSelectionInstructions,
} from "@/features/map-editor/lib/autotile-dialog";
import type { AutotileConfig, AutotileWangSetId } from "@/types";

const wangSetId = "wang-set-1" as AutotileWangSetId;

test("cloneAutotileConfig creates a default draft when no config exists", () => {
  const draft = cloneAutotileConfig(undefined);

  assert.strictEqual(draft.preset, "edges-corners");
  assert.deepEqual(draft.terrains, []);
  assert.deepEqual(draft.rules, []);
  assert.deepEqual(draft.wangSets, []);
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
  assert.deepEqual(getAutotileAssignmentGroups("wang-tiles"), []);
  assert.strictEqual(getAutotileActiveSlotIds("wang-tiles").length, 16);
});

test("assignTileToSelectionTarget updates terrain coverage counts", () => {
  const draft = assignTileToSelectionTarget(
    {
      version: 1,
      preset: "edges-corners",
      terrains: [
        {
          id: "terrain-land",
          name: "Land",
          paletteTile: null,
          patternTiles: {},
        },
      ],
      rules: [],
    } as AutotileConfig,
    {
      type: "pattern",
      terrainId: "terrain-land",
      slotId: "edgeNorth",
    },
    { sx: 16, sy: 0, sw: 16, sh: 16 },
  );
  const terrain = draft.terrains[0];

  assert.strictEqual(
    countConfiguredAssignments(terrain, ["edgeNorth", "edgeEast"]),
    1,
  );
  assert.deepEqual(terrain.patternTiles?.edgeNorth, {
    sx: 16,
    sy: 0,
    sw: 16,
    sh: 16,
  });
});

test("assignTileToSelectionTarget updates named Wang tiles", () => {
  const draft = assignTileToSelectionTarget(
    cloneAutotileConfig({
      version: 1,
      preset: "wang-named-colors",
      terrains: [],
      rules: [],
      wangSets: [
        {
          id: wangSetId,
          name: "Biomes",
          type: "mixed",
          tile: null,
          colors: [
            {
              index: 1,
              name: "Grass",
              color: "#00ff00",
              tile: null,
              probability: 1,
            },
          ],
          tiles: [
            {
              tile: null,
              wangId: [1, 0, 1, 0, 1, 0, 1, 0],
              probability: 1,
            },
          ],
        },
      ],
    }),
    {
      type: "wangTile",
      wangSetId,
      tileIndex: 0,
    },
    { sx: 32, sy: 0, sw: 16, sh: 16 },
  );

  assert.deepEqual(draft.wangSets?.[0]?.tiles[0]?.tile, {
    sx: 32,
    sy: 0,
    sw: 16,
    sh: 16,
  });

  const colorDraft = assignTileToSelectionTarget(
    draft,
    {
      type: "wangColorTile",
      wangSetId,
      colorIndex: 1,
    },
    { sx: 0, sy: 16, sw: 16, sh: 16 },
  );

  assert.deepEqual(colorDraft.wangSets?.[0]?.colors[0]?.tile, {
    sx: 0,
    sy: 16,
    sw: 16,
    sh: 16,
  });
});

test("cloneAutotileConfig preserves named Wang sets", () => {
  const draft = cloneAutotileConfig({
    version: 1,
    preset: "wang-named-colors",
    terrains: [],
    rules: [],
    wangSets: [
      {
        id: wangSetId,
        name: "Corners",
        type: "corner",
        tile: null,
        colors: [],
        tiles: [
          {
            tile: null,
            wangId: [1, 1, 1, 1, 1, 1, 1, 1],
            probability: 1,
          },
        ],
      },
    ],
  });

  assert.strictEqual(draft.wangSets?.[0]?.name, "Corners");
  assert.deepEqual(
    draft.wangSets?.[0]?.tiles[0]?.wangId,
    [0, 1, 0, 1, 0, 1, 0, 1],
  );
});

test("getSelectionInstructions describes named Wang targets", () => {
  const draft = cloneAutotileConfig({
    version: 1,
    preset: "wang-named-colors",
    terrains: [],
    rules: [],
    wangSets: [
      {
        id: wangSetId,
        name: "Biomes",
        type: "edge",
        tile: null,
        colors: [
          {
            index: 1,
            name: "Grass",
            color: "#00ff00",
            tile: null,
            probability: 1,
          },
        ],
        tiles: [],
      },
    ],
  });

  assert.strictEqual(
    getSelectionInstructions(draft, null),
    "Select a Wang set tile, color tile, or Wang tile assignment on the right, then click a tile in the picker.",
  );
  assert.strictEqual(
    getSelectionInstructions(draft, {
      type: "wangColorTile",
      wangSetId,
      colorIndex: 1,
    }),
    "Click a tile to use as the palette tile for Grass.",
  );
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
