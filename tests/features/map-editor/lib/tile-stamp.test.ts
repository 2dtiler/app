import { assert, test } from "vitest";
import {
  areTileRefsEqual,
  createTileStamp,
  getTileStampRef,
  isMultiTileStamp,
} from "@/features/map-editor/lib/tile-stamp";
import type { TileRef, TilesetId } from "@/types";

const TILESET_ID = "tileset-1" as TilesetId;

function createTileRef(overrides: Partial<TileRef> = {}): TileRef {
  return {
    tilesetId: TILESET_ID,
    sx: 0,
    sy: 0,
    sw: 16,
    sh: 16,
    ...overrides,
  };
}

test("compares tile refs including transforms", () => {
  const baseTile = createTileRef();

  assert.equal(areTileRefsEqual(null, undefined), true);
  assert.equal(areTileRefsEqual(baseTile, createTileRef()), true);
  assert.equal(
    areTileRefsEqual(baseTile, createTileRef({ rotation: 90 })),
    false,
  );
  assert.equal(
    areTileRefsEqual(createTileRef({ flipX: true }), createTileRef()),
    false,
  );
  assert.equal(
    areTileRefsEqual(createTileRef({ flipY: true }), createTileRef()),
    false,
  );
  assert.equal(areTileRefsEqual(baseTile, createTileRef({ sx: 16 })), false);
});

test("creates tile stamps from a selected source region", () => {
  const stamp = createTileStamp(
    {
      tilesetId: TILESET_ID,
      sx: 16,
      sy: 32,
      sw: 32,
      sh: 16,
    },
    16,
  );

  assert.equal(stamp.width, 2);
  assert.equal(stamp.height, 1);
  assert.deepEqual(stamp.cells, [
    { dx: 0, dy: 0, ref: createTileRef({ sx: 16, sy: 32 }) },
    { dx: 1, dy: 0, ref: createTileRef({ sx: 32, sy: 32 }) },
  ]);
  assert.equal(isMultiTileStamp(stamp), true);
});

test("wraps stamp coordinates and detects single-tile stamps", () => {
  const stamp = createTileStamp(
    {
      tilesetId: TILESET_ID,
      sx: 0,
      sy: 0,
      sw: 32,
      sh: 32,
    },
    16,
  );
  const singleTileStamp = createTileStamp(
    {
      tilesetId: TILESET_ID,
      sx: 0,
      sy: 0,
      sw: 8,
      sh: 8,
    },
    16,
  );

  assert.deepEqual(
    getTileStampRef(stamp, 2, -1),
    createTileRef({ sx: 0, sy: 16 }),
  );
  assert.equal(isMultiTileStamp(singleTileStamp), false);
});
