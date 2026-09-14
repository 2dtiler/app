import { assert, test } from "vitest";
import {
  applyBlobsmith8x6Layout,
  applyTileMapDual4x4Layout,
  assignTileToSelectionTarget,
  canApplyTileMapDual4x4Layout,
  cloneAutotileConfig,
  countConfiguredAssignments,
  deleteWangSetFromAutotileConfig,
  getAutotileActiveSlotIds,
  getAutotileAssignmentGroups,
  getSelectionInstructions,
  isTileMapDual4x4LayoutApplied,
} from "@/features/map-editor/lib/autotile-dialog";
import type {
  AutotileConfig,
  AutotilePatternSlotId,
  AutotileTerrain,
  AutotileWangSetId,
} from "@/types";

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

test("deleteWangSetFromAutotileConfig keeps named Wang mode while sets remain", () => {
  const draft = deleteWangSetFromAutotileConfig(
    cloneAutotileConfig({
      version: 1,
      preset: "wang-named-colors",
      terrains: [
        {
          id: "terrain-land",
          name: "Land",
          paletteTile: null,
          patternTiles: {},
        },
      ],
      rules: [],
      wangSets: [
        {
          id: wangSetId,
          name: "Biomes",
          type: "edge",
          tile: null,
          colors: [],
          tiles: [],
        },
        {
          id: "wang-set-2" as AutotileWangSetId,
          name: "Roads",
          type: "mixed",
          tile: null,
          colors: [],
          tiles: [],
        },
      ],
    }),
    wangSetId,
    "full-corners",
  );

  assert.strictEqual(draft.preset, "wang-named-colors");
  assert.strictEqual(draft.wangSets?.length, 1);
  assert.strictEqual(draft.wangSets?.[0]?.id, "wang-set-2");
  assert.strictEqual(draft.terrains[0]?.id, "terrain-land");
});

test("deleteWangSetFromAutotileConfig exits named Wang mode on final delete", () => {
  const draft = deleteWangSetFromAutotileConfig(
    cloneAutotileConfig({
      version: 1,
      preset: "wang-named-colors",
      terrains: [
        {
          id: "terrain-land",
          name: "Land",
          paletteTile: null,
          patternTiles: {},
        },
      ],
      rules: [],
      wangSets: [
        {
          id: wangSetId,
          name: "Biomes",
          type: "edge",
          tile: null,
          colors: [],
          tiles: [],
        },
      ],
    }),
    wangSetId,
    "full-corners",
  );

  assert.strictEqual(draft.preset, "full-corners");
  assert.isUndefined(draft.wangSets);
  assert.strictEqual(draft.terrains[0]?.id, "terrain-land");
});

test("deleteWangSetFromAutotileConfig falls back to edges corners by default", () => {
  const draft = deleteWangSetFromAutotileConfig(
    cloneAutotileConfig({
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
          colors: [],
          tiles: [],
        },
      ],
    }),
    wangSetId,
  );

  assert.strictEqual(draft.preset, "edges-corners");
  assert.isUndefined(draft.wangSets);
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

test("applyBlobsmith8x6Layout returns null when slot count is not 47", () => {
  const terrain: AutotileTerrain = {
    id: "terrain-land",
    name: "Land",
    paletteTile: null,
    patternTiles: {},
  };

  assert.strictEqual(
    applyBlobsmith8x6Layout(terrain, ["blob-00"] as AutotilePatternSlotId[], 16),
    null,
  );
});

test("applyBlobsmith8x6Layout binds 8×6 grid cells in index order", () => {
  const slotIds = Array.from(
    { length: 47 },
    (_, index) => `blob-${index}` as AutotilePatternSlotId,
  );
  const terrain: AutotileTerrain = {
    id: "terrain-land",
    name: "Land",
    paletteTile: null,
    patternTiles: {
      "blob-0": { sx: 999, sy: 999, sw: 16, sh: 16 },
    },
  };

  const result = applyBlobsmith8x6Layout(terrain, slotIds, 16);

  assert.ok(result);
  assert.deepEqual(result.patternTiles?.["blob-0"], {
    sx: 0,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.patternTiles?.["blob-7"], {
    sx: 112,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.patternTiles?.["blob-8"], {
    sx: 0,
    sy: 16,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.patternTiles?.["blob-46"], {
    sx: 96,
    sy: 80,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.paletteTile, {
    sx: 96,
    sy: 80,
    sw: 16,
    sh: 16,
  });
  assert.strictEqual(Object.keys(result.patternTiles ?? {}).length, 47);
});

test("applyTileMapDual4x4Layout binds Godot TileMapDual cells by editor mask", () => {
  const terrain: AutotileTerrain = {
    id: "terrain-land",
    name: "Land",
    paletteTile: null,
    patternTiles: {
      leftover: { sx: 999, sy: 999, sw: 16, sh: 16 },
    },
  };

  const result = applyTileMapDual4x4Layout(terrain, 16);

  assert.deepEqual(result.patternTiles?.["dual-01"], {
    sx: 48,
    sy: 48,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.patternTiles?.["dual-04"], {
    sx: 0,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.patternTiles?.["dual-0a"], {
    sx: 16,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.patternTiles?.["dual-0f"], {
    sx: 32,
    sy: 16,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.paletteTile, {
    sx: 32,
    sy: 16,
    sw: 16,
    sh: 16,
  });
  assert.strictEqual(result.patternTiles?.leftover, undefined);
  assert.strictEqual(Object.keys(result.patternTiles ?? {}).length, 15);
  assert.strictEqual(isTileMapDual4x4LayoutApplied(result, 16), true);
});

test("applyTileMapDual4x4Layout scales cells by tile size", () => {
  const result = applyTileMapDual4x4Layout(
    {
      id: "terrain-land",
      name: "Land",
      paletteTile: null,
      patternTiles: {},
    },
    32,
  );

  assert.deepEqual(result.paletteTile, {
    sx: 64,
    sy: 32,
    sw: 32,
    sh: 32,
  });
  assert.deepEqual(result.patternTiles?.["dual-08"], {
    sx: 32,
    sy: 96,
    sw: 32,
    sh: 32,
  });
});

test("canApplyTileMapDual4x4Layout requires a 4 by 4 atlas", () => {
  assert.strictEqual(canApplyTileMapDual4x4Layout(64, 64, 16), true);
  assert.strictEqual(canApplyTileMapDual4x4Layout(48, 64, 16), false);
  assert.strictEqual(canApplyTileMapDual4x4Layout(64, 48, 16), false);
  assert.strictEqual(canApplyTileMapDual4x4Layout(128, 128, 16), true);
});
