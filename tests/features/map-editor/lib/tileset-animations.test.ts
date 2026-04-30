import { assert, test } from "vitest";
import {
  TILESET_ANIMATION_DRAG_MIME,
  cloneTilesetAnimationConfig,
  createAnimationDragPayload,
  createAnimationPlacementStamp,
  createEmptyAnimationConfig,
  findAnimationCellForLocalTileId,
  findTiledAnimationDefinitionConflicts,
  getAnimationCellCount,
  getMapReferencedTilesetIds,
  getTileColumns,
  getTileIndexFromRegion,
  getTileRegionFromIndex,
  getTilesetAnimationById,
  getTilesetAnimations,
  hasPlacedAnimations,
  hasTilesetAnimationDefinitions,
  normalizeTilesetAnimationConfig,
  parseAnimationDragPayload,
  resolveAnimationPlacementStamp,
  resolveAnimationFrame,
  resolveAnimatedTileRef,
} from "@/features/map-editor/lib/tileset-animations";
import type {
  LayerId,
  MapGroupId,
  MapId,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  TilesetAnimation,
  TilesetAnimationConfig,
} from "@/types";

function createAnimatedTileset() {
  const animation = {
    id: "animation-water" as TilesetAnimation["id"],
    name: "Waterfall",
    widthInTiles: 2,
    heightInTiles: 1,
    frames: [
      {
        durationMs: 100,
        cells: [
          { sx: 0, sy: 0, sw: 16, sh: 16 },
          { sx: 16, sy: 0, sw: 16, sh: 16 },
        ],
      },
      {
        durationMs: 100,
        cells: [
          { sx: 0, sy: 16, sw: 16, sh: 16 },
          { sx: 16, sy: 16, sw: 16, sh: 16 },
        ],
      },
    ],
    createdAt: 1,
    updatedAt: 2,
  } satisfies TilesetAnimation;

  const tileset = {
    id: "tileset-1" as Tileset["id"],
    name: "Terrain",
    groupId: "group-1" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-1" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 32,
    animations: {
      version: 1,
      animations: [animation],
    },
    createdAt: 1,
  } satisfies Tileset;

  return { animation, tileset };
}

test("createAnimationPlacementStamp keeps multi-cell animation metadata", () => {
  const { animation, tileset } = createAnimatedTileset();

  const stamp = createAnimationPlacementStamp(tileset, animation);

  assert.strictEqual(stamp.tilesetId, tileset.id);
  assert.strictEqual(stamp.animationId, animation.id);
  assert.strictEqual(stamp.widthInTiles, 2);
  assert.strictEqual(stamp.heightInTiles, 1);
  assert.deepEqual(
    stamp.cells.map((cell) => ({
      dx: cell.dx,
      dy: cell.dy,
      animationCellIndex: cell.ref.animationCellIndex,
      sx: cell.ref.sx,
      sy: cell.ref.sy,
    })),
    [
      { dx: 0, dy: 0, animationCellIndex: 0, sx: 0, sy: 0 },
      { dx: 1, dy: 0, animationCellIndex: 1, sx: 16, sy: 0 },
    ],
  );
});

test("resolveAnimationPlacementStamp returns the selected animation footprint", () => {
  const { animation, tileset } = createAnimatedTileset();

  const stamp = resolveAnimationPlacementStamp(
    [tileset],
    tileset.id,
    animation.id,
  );

  assert.ok(stamp);
  assert.strictEqual(stamp.widthInTiles, animation.widthInTiles);
  assert.strictEqual(stamp.heightInTiles, animation.heightInTiles);
  assert.deepEqual(
    stamp.cells.map((cell) => ({ dx: cell.dx, dy: cell.dy })),
    [
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ],
  );
  assert.strictEqual(
    resolveAnimationPlacementStamp([tileset], tileset.id, null),
    null,
  );
  assert.strictEqual(
    resolveAnimationPlacementStamp(
      [tileset],
      tileset.id,
      "missing" as TilesetAnimation["id"],
    ),
    null,
  );
});

test("normalizeTilesetAnimationConfig fills invalid animation defaults", () => {
  const dirtyConfig = {
    version: 99,
    animations: [
      {
        id: "animation-dirty" as TilesetAnimation["id"],
        name: "   ",
        widthInTiles: 0,
        heightInTiles: 2.4,
        frames: [
          {
            durationMs: 0,
            cells: [{ sx: 0, sy: 0, sw: 16, sh: 16 }],
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  } as unknown as TilesetAnimationConfig;

  const normalized = normalizeTilesetAnimationConfig(dirtyConfig);
  const animation = normalized.animations[0];
  assert.ok(animation);
  assert.strictEqual(normalized.version, 1);
  assert.strictEqual(animation.name, "Animation");
  assert.strictEqual(animation.widthInTiles, 1);
  assert.strictEqual(animation.heightInTiles, 2);
  assert.strictEqual(animation.frames[0]?.durationMs, 120);
  assert.deepEqual(animation.frames[0]?.cells, [
    { sx: 0, sy: 0, sw: 16, sh: 16 },
    null,
  ]);

  const cloned = cloneTilesetAnimationConfig(normalized);
  assert.deepEqual(cloned, normalized);
  cloned.animations[0]!.frames[0]!.cells[0]!.sx = 16;
  assert.strictEqual(normalized.animations[0]?.frames[0]?.cells[0]?.sx, 0);
});

test("tileset animation lookup and tile region helpers use normalized tile grid positions", () => {
  const { animation, tileset } = createAnimatedTileset();

  assert.deepEqual(createEmptyAnimationConfig(), {
    version: 1,
    animations: [],
  });
  assert.deepEqual(getTilesetAnimations(null), []);
  assert.strictEqual(getTilesetAnimationById(tileset, animation.id), animation);
  assert.strictEqual(
    getTilesetAnimationById(tileset, "missing" as TilesetAnimation["id"]),
    null,
  );
  assert.strictEqual(hasTilesetAnimationDefinitions([tileset]), true);
  assert.strictEqual(hasTilesetAnimationDefinitions([]), false);
  assert.strictEqual(getAnimationCellCount(animation), 2);
  assert.strictEqual(getTileColumns(tileset), 2);
  assert.deepEqual(getTileRegionFromIndex(tileset, 3), {
    sx: 16,
    sy: 16,
    sw: 16,
    sh: 16,
  });
  assert.strictEqual(getTileIndexFromRegion(tileset, { sx: 16, sy: 16 }), 3);
});

test("resolveAnimatedTileRef advances each placed animation cell by elapsed time", () => {
  const { animation, tileset } = createAnimatedTileset();
  const ref = {
    tilesetId: tileset.id,
    sx: 16,
    sy: 0,
    sw: 16,
    sh: 16,
    animationId: animation.id,
    animationCellIndex: 1,
  } satisfies TileRef;

  const firstFrameRef = resolveAnimatedTileRef(ref, [tileset], 50);
  const secondFrameRef = resolveAnimatedTileRef(ref, [tileset], 150);

  assert.strictEqual(firstFrameRef.sx, 16);
  assert.strictEqual(firstFrameRef.sy, 0);
  assert.strictEqual(secondFrameRef.sx, 16);
  assert.strictEqual(secondFrameRef.sy, 16);
  assert.deepEqual(resolveAnimationFrame(animation, -25), {
    frameIndex: 1,
    elapsedInFrameMs: 75,
  });
  assert.deepEqual(resolveAnimationFrame({ ...animation, frames: [] }, 50), {
    frameIndex: 0,
    elapsedInFrameMs: 0,
  });
});

test("resolveAnimationFrame respects each frame duration", () => {
  const { animation } = createAnimatedTileset();
  const unevenAnimation = {
    ...animation,
    frames: [
      {
        ...animation.frames[0]!,
        durationMs: 80,
      },
      {
        ...animation.frames[1]!,
        durationMs: 240,
      },
    ],
  } satisfies TilesetAnimation;

  assert.deepEqual(resolveAnimationFrame(unevenAnimation, 79), {
    frameIndex: 0,
    elapsedInFrameMs: 79,
  });
  assert.deepEqual(resolveAnimationFrame(unevenAnimation, 80), {
    frameIndex: 1,
    elapsedInFrameMs: 0,
  });
  assert.deepEqual(resolveAnimationFrame(unevenAnimation, 239), {
    frameIndex: 1,
    elapsedInFrameMs: 159,
  });
  assert.deepEqual(resolveAnimationFrame(unevenAnimation, 319), {
    frameIndex: 1,
    elapsedInFrameMs: 239,
  });
  assert.deepEqual(resolveAnimationFrame(unevenAnimation, 320), {
    frameIndex: 0,
    elapsedInFrameMs: 0,
  });
});

test("parseAnimationDragPayload accepts only the animation drag mime payload", () => {
  const { animation, tileset } = createAnimatedTileset();
  const payload = createAnimationDragPayload(tileset.id, animation.id);
  const dataTransfer = {
    getData: (type: string) =>
      type === TILESET_ANIMATION_DRAG_MIME ? JSON.stringify(payload) : "",
  } as unknown as DataTransfer;
  const invalidDataTransfer = {
    getData: () => JSON.stringify({ kind: "tile" }),
  } as unknown as DataTransfer;

  assert.deepEqual(parseAnimationDragPayload(dataTransfer), payload);
  assert.strictEqual(parseAnimationDragPayload(invalidDataTransfer), null);
});

test("map animation helpers find placed refs and referenced tilesets", () => {
  const { animation, tileset } = createAnimatedTileset();
  const layerId = "layer-1" as LayerId;
  const mapId = "map-1" as MapId;
  const layer = {
    id: layerId,
    mapId,
    name: "Ground",
    type: "tile",
    visible: true,
    locked: false,
    tiles: {
      "0,0": {
        tilesetId: tileset.id,
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
        animationId: animation.id,
      },
    },
  } satisfies TileLayer;
  const map = {
    id: mapId,
    name: "Map",
    groupId: "group-1" as MapGroupId,
    orientation: "orthogonal",
    widthInTiles: 1,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: [layerId],
    createdAt: 1,
  } satisfies TileMapData;

  assert.strictEqual(hasPlacedAnimations([layer]), true);
  assert.deepEqual([...getMapReferencedTilesetIds(map, [layer])], [tileset.id]);
});

test("findAnimationCellForLocalTileId maps Tiled base tiles back to animation cells", () => {
  const { animation, tileset } = createAnimatedTileset();

  const match = findAnimationCellForLocalTileId(tileset, 1);

  assert.deepEqual(match, {
    animationId: animation.id,
    animationCellIndex: 1,
  });
  assert.strictEqual(findAnimationCellForLocalTileId(tileset, 5), null);
});

test("findTiledAnimationDefinitionConflicts reports duplicate Tiled base tiles", () => {
  const { animation, tileset } = createAnimatedTileset();
  const conflictingAnimation = {
    ...animation,
    id: "animation-duplicate" as TilesetAnimation["id"],
  };

  const conflicts = findTiledAnimationDefinitionConflicts([
    {
      ...tileset,
      animations: {
        version: 1,
        animations: [animation, conflictingAnimation],
      },
    },
  ]);

  assert.deepEqual(conflicts, [
    {
      tilesetId: tileset.id,
      animationId: conflictingAnimation.id,
      localTileId: 0,
    },
    {
      tilesetId: tileset.id,
      animationId: conflictingAnimation.id,
      localTileId: 1,
    },
  ]);
});
