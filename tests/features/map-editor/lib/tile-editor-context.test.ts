import { afterEach, assert, test } from "vitest";
import {
  clearTileEditorContext,
  getPendingTileEditorRequest,
  getTileEditorContext,
  setTileEditorContext,
} from "@/features/map-editor/lib/tile-editor-context";
import type { AssetId, LayerId, TilesetId } from "@/types";

function createContext() {
  return {
    tilesetId: "tileset-1" as TilesetId,
    assetId: "asset-1" as AssetId,
    sx: 0,
    sy: 16,
    sw: 16,
    sh: 16,
    layerId: "layer-1" as LayerId,
    tileX: 2,
    tileY: 3,
  };
}

afterEach(() => {
  clearTileEditorContext();
});

test("tracks and clears tile editor requests", () => {
  assert.equal(getTileEditorContext(), null);
  assert.equal(getPendingTileEditorRequest(), null);

  const context = createContext();
  setTileEditorContext(context);
  const request = getPendingTileEditorRequest();

  assert.deepEqual(getTileEditorContext(), context);
  assert.deepEqual(request?.context, context);

  clearTileEditorContext((request?.requestId ?? 0) + 1);
  assert.deepEqual(getTileEditorContext(), context);

  clearTileEditorContext(request?.requestId);
  assert.equal(getTileEditorContext(), null);
  assert.equal(getPendingTileEditorRequest(), null);
});

test("does not create pending requests for null contexts", () => {
  setTileEditorContext(createContext());
  const firstRequestId = getPendingTileEditorRequest()?.requestId;

  setTileEditorContext(null);
  assert.equal(getPendingTileEditorRequest(), null);

  setTileEditorContext(createContext());
  assert.equal(
    getPendingTileEditorRequest()?.requestId,
    (firstRequestId ?? 0) + 1,
  );
});
