import { afterEach, assert, test } from "vitest";
import {
  clearImageLayerEditorContext,
  getImageLayerEditorContext,
  getPendingImageLayerEditorRequest,
  setImageLayerEditorContext,
} from "@/features/image-editor/lib/image-layer-editor-context";
import type { AssetId, LayerId } from "@/types";

function createContext() {
  return {
    layerId: "layer-1" as LayerId,
    assetId: "asset-1" as AssetId,
    width: 64,
    height: 32,
  };
}

afterEach(() => {
  clearImageLayerEditorContext();
});

test("tracks and clears image layer editor requests", () => {
  assert.equal(getImageLayerEditorContext(), null);
  assert.equal(getPendingImageLayerEditorRequest(), null);

  const context = createContext();
  setImageLayerEditorContext(context);
  const request = getPendingImageLayerEditorRequest();

  assert.deepEqual(getImageLayerEditorContext(), context);
  assert.deepEqual(request?.context, context);

  clearImageLayerEditorContext((request?.requestId ?? 0) + 1);
  assert.deepEqual(getImageLayerEditorContext(), context);

  clearImageLayerEditorContext(request?.requestId);
  assert.equal(getImageLayerEditorContext(), null);
  assert.equal(getPendingImageLayerEditorRequest(), null);
});

test("does not create pending requests for null contexts", () => {
  setImageLayerEditorContext(createContext());
  const firstRequestId = getPendingImageLayerEditorRequest()?.requestId;

  setImageLayerEditorContext(null);
  assert.equal(getPendingImageLayerEditorRequest(), null);

  setImageLayerEditorContext(createContext());
  assert.equal(
    getPendingImageLayerEditorRequest()?.requestId,
    (firstRequestId ?? 0) + 1,
  );
});
