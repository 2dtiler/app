import { assert, test } from "vitest";
import {
  markPaintBufferErased,
  syncPaintBufferWithResolvedTiles,
} from "@/features/map-editor/lib/paint-buffer";
import type { TileRef, TilesetId } from "@/types";

const TILESET_ID = "tileset-1" as TilesetId;

function createTileRef(sx: number): TileRef {
  return {
    tilesetId: TILESET_ID,
    sx,
    sy: 0,
    sw: 16,
    sh: 16,
  };
}

test("leaves committed tiles out of the buffer when the resolved tile matches", () => {
  const committed = createTileRef(16);
  const paintBuffer = new Map<string, TileRef | null>();

  const mutated = syncPaintBufferWithResolvedTiles(
    paintBuffer,
    { "1,1": committed },
    new Map([["1,1", createTileRef(16)]]),
  );

  assert.equal(mutated, false);
  assert.equal(paintBuffer.has("1,1"), false);
});

test("records a preview only when the resolved tile differs from the committed tile", () => {
  const paintBuffer = new Map<string, TileRef | null>();
  const next = createTileRef(32);

  const mutated = syncPaintBufferWithResolvedTiles(
    paintBuffer,
    { "1,1": createTileRef(16) },
    new Map([["1,1", next]]),
  );

  assert.equal(mutated, true);
  assert.equal(paintBuffer.get("1,1"), next);
});

test("drops a stale buffer entry when resolve returns the committed tile", () => {
  const committed = createTileRef(16);
  const paintBuffer = new Map<string, TileRef | null>([
    ["1,1", createTileRef(32)],
  ]);

  const mutated = syncPaintBufferWithResolvedTiles(
    paintBuffer,
    { "1,1": committed },
    new Map([["1,1", createTileRef(16)]]),
  );

  assert.equal(mutated, true);
  assert.equal(paintBuffer.has("1,1"), false);
});

test("marks a committed tile erased without rewriting an existing erase", () => {
  const paintBuffer = new Map<string, TileRef | null>([["2,2", null]]);

  assert.equal(
    markPaintBufferErased(paintBuffer, "1,1", createTileRef(16)),
    true,
  );
  assert.equal(paintBuffer.get("1,1"), null);
  assert.equal(
    markPaintBufferErased(paintBuffer, "1,1", createTileRef(16)),
    false,
  );
});
