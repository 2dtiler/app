import { assert, test } from "vitest";
import {
  createTileKey,
  getDualGridCornerMask,
  getDualGridFillRegion,
  isDualGridLayer,
  resolveDualGridTerrainSource,
  resolveDualGridWrites,
  tryAutoEnableDualGridOnActiveLayer,
} from "@/features/map-editor/lib/dual-grid";
import { createDualGridSlotId } from "@/features/map-editor/lib/autotile-preset-rules";
import { getAutotilePresetDefinition } from "@/features/map-editor/lib/autotile-preset-rules";
import type {
  AutotileTerrain,
  AutotileTerrainId,
  TileMapData,
  TilesetId,
} from "@/types";

const terrainId = "terrain-dual" as AutotileTerrainId;
const tilesetId = "tileset-dual" as TilesetId;

function createTerrain(): AutotileTerrain {
  const patternTiles: NonNullable<AutotileTerrain["patternTiles"]> = {};

  for (let mask = 1; mask <= 15; mask++) {
    patternTiles[createDualGridSlotId(mask)] = {
      sx: mask * 16,
      sy: 0,
      sw: 16,
      sh: 16,
    };
  }

  return {
    id: terrainId,
    name: "Grass",
    paletteTile: { sx: 240, sy: 0, sw: 16, sh: 16 },
    patternTiles,
  };
}

test("dual-grid-15 preset exposes 15 required slots", () => {
  const preset = getAutotilePresetDefinition("dual-grid-15");

  assert.strictEqual(preset.requiredSlots.length, 15);
  assert.strictEqual(preset.requiredSlots[0], "dual-01");
  assert.strictEqual(preset.requiredSlots[14], "dual-0f");
});

test("isDualGridLayer only matches dual-grid tilingMode", () => {
  assert.strictEqual(isDualGridLayer({ tilingMode: "dual-grid" }), true);
  assert.strictEqual(isDualGridLayer({ tilingMode: "standard" }), false);
  assert.strictEqual(isDualGridLayer({}), false);
});

test("getDualGridCornerMask encodes the four logical corners", () => {
  const logical = {
    [createTileKey(0, 0)]: terrainId,
    [createTileKey(1, 0)]: terrainId,
    [createTileKey(1, 1)]: terrainId,
  };

  assert.strictEqual(getDualGridCornerMask(logical, 1, 1, terrainId), 1 | 2 | 8);
  assert.strictEqual(getDualGridCornerMask({}, 1, 1, terrainId), 0);
});

test("resolveDualGridWrites rebuilds the four affected vertices", () => {
  const terrain = createTerrain();
  const result = resolveDualGridWrites({
    mapWidth: 4,
    mapHeight: 4,
    logicalTerrains: {},
    terrain,
    tilesetId,
    writes: [{ x: 1, y: 1, terrainId }],
  });

  assert.strictEqual(result.logicalTerrains[createTileKey(1, 1)], terrainId);
  assert.deepEqual(result.tiles.get(createTileKey(1, 1)), {
    tilesetId,
    sx: 128,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.tiles.get(createTileKey(2, 1)), {
    tilesetId,
    sx: 64,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.tiles.get(createTileKey(1, 2)), {
    tilesetId,
    sx: 32,
    sy: 0,
    sw: 16,
    sh: 16,
  });
  assert.deepEqual(result.tiles.get(createTileKey(2, 2)), {
    tilesetId,
    sx: 16,
    sy: 0,
    sw: 16,
    sh: 16,
  });
});

test("resolveDualGridWrites clears display tiles when a vertex becomes empty", () => {
  const terrain = createTerrain();
  const result = resolveDualGridWrites({
    mapWidth: 4,
    mapHeight: 4,
    logicalTerrains: {
      [createTileKey(1, 1)]: terrainId,
    },
    terrain,
    tilesetId,
    writes: [{ x: 1, y: 1, terrainId: null }],
  });

  assert.strictEqual(result.logicalTerrains[createTileKey(1, 1)], undefined);
  assert.strictEqual(result.tiles.get(createTileKey(1, 1)), null);
  assert.strictEqual(result.tiles.get(createTileKey(2, 2)), null);
});

test("getDualGridFillRegion floods matching logical occupancy", () => {
  const map = {
    orientation: "orthogonal",
    widthInTiles: 4,
    heightInTiles: 3,
    tileSize: 16,
  } as TileMapData;

  const region = getDualGridFillRegion(
    map,
    {
      [createTileKey(0, 0)]: terrainId,
      [createTileKey(1, 0)]: terrainId,
      [createTileKey(1, 1)]: terrainId,
      [createTileKey(3, 0)]: terrainId,
    },
    4,
    3,
    0,
    0,
  );

  assert.deepEqual(
    region.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  );
});

test("resolveDualGridTerrainSource prefers the active tileset after a switch", () => {
  const activeTerrain = createTerrain();
  const otherTerrain: AutotileTerrain = {
    ...createTerrain(),
    id: "terrain-other" as AutotileTerrainId,
  };
  const tilesets = [
    {
      id: "tileset-other" as TilesetId,
      autotile: {
        version: 1,
        preset: "dual-grid-15",
        terrains: [otherTerrain],
        rules: [],
      },
    },
    {
      id: tilesetId,
      autotile: {
        version: 1,
        preset: "dual-grid-15",
        terrains: [activeTerrain],
        rules: [],
      },
    },
  ] as const;

  const resolved = resolveDualGridTerrainSource(
    tilesets,
    otherTerrain.id,
    tilesetId,
  );

  assert.strictEqual(resolved?.tilesetId, tilesetId);
  assert.strictEqual(resolved?.terrain.id, terrainId);
});

test("resolveDualGridTerrainSource falls back to preferred tileset when selection is empty", () => {
  const activeTerrain = createTerrain();
  const tilesets = [
    {
      id: tilesetId,
      autotile: {
        version: 1,
        preset: "dual-grid-15",
        terrains: [activeTerrain],
        rules: [],
      },
    },
  ] as const;

  const resolved = resolveDualGridTerrainSource(
    tilesets,
    undefined,
    tilesetId,
  );

  assert.strictEqual(resolved?.tilesetId, tilesetId);
  assert.strictEqual(resolved?.terrain.id, terrainId);
});

test("tryAutoEnableDualGridOnActiveLayer enables orthogonal tile layers", () => {
  const draft = {
    activeMapId: "map-1",
    activeLayerId: "layer-1",
    project: {
      maps: [
        {
          id: "map-1",
          orientation: "orthogonal",
        },
      ],
      layers: [
        {
          id: "layer-1",
          name: "Ground",
          tilingMode: "standard",
          tiles: { "0,0": { tilesetId, sx: 0, sy: 0, sw: 16, sh: 16 } },
          logicalTerrains: undefined,
        },
      ],
    },
  };

  const result = tryAutoEnableDualGridOnActiveLayer(draft as never);

  assert.strictEqual(result.enabled, true);
  assert.strictEqual(result.clearedTiles, true);
  assert.strictEqual(result.layerName, "Ground");
  assert.strictEqual(draft.project.layers[0]?.tilingMode, "dual-grid");
  assert.deepEqual(draft.project.layers[0]?.tiles, {});
  assert.deepEqual(draft.project.layers[0]?.logicalTerrains, {});
});

test("tryAutoEnableDualGridOnActiveLayer skips non-orthogonal maps", () => {
  const draft = {
    activeMapId: "map-1",
    activeLayerId: "layer-1",
    project: {
      maps: [
        {
          id: "map-1",
          orientation: "isometric",
        },
      ],
      layers: [
        {
          id: "layer-1",
          name: "Ground",
          tilingMode: "standard",
          tiles: {},
        },
      ],
    },
  };

  const result = tryAutoEnableDualGridOnActiveLayer(draft as never);

  assert.strictEqual(result.enabled, false);
  assert.strictEqual(draft.project.layers[0]?.tilingMode, "standard");
});
