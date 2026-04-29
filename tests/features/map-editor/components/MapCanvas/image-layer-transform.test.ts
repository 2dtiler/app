import { assert, test } from "vitest";
import {
  getImageLayerCenter,
  getImageLayerHandlePosition,
  getImageLayerHandlePositions,
  getImageLayerPolygon,
  getImageLayerResizeCursor,
  pointInImageLayer,
  resizeImageLayerFromHandle,
  transformImageLayerPoint,
} from "@/features/map-editor/components/MapCanvas/image-layer-transform";

test("image layer transform helpers compute rotated points, handles, cursors, and resize bounds", () => {
  const rotatedLayer = {
    x: 10,
    y: 20,
    width: 20,
    height: 10,
    rotation: 90,
    flipX: false,
    flipY: false,
  };
  const axisAlignedLayer = {
    x: 10,
    y: 20,
    width: 20,
    height: 10,
    rotation: 0,
    flipX: false,
    flipY: false,
  };

  assert.deepEqual(getImageLayerCenter(axisAlignedLayer), { x: 20, y: 25 });
  assert.deepEqual(transformImageLayerPoint(rotatedLayer, { x: 10, y: 20 }), {
    x: 25,
    y: 15,
  });
  assert.deepEqual(getImageLayerPolygon(axisAlignedLayer), [
    { x: 10, y: 20 },
    { x: 30, y: 20 },
    { x: 30, y: 30 },
    { x: 10, y: 30 },
  ]);
  assert.deepEqual(getImageLayerHandlePosition(axisAlignedLayer, "se"), {
    x: 30,
    y: 30,
  });
  assert.strictEqual(getImageLayerHandlePositions(axisAlignedLayer).length, 8);
  assert.strictEqual(
    pointInImageLayer(axisAlignedLayer, { x: 15, y: 25 }),
    true,
  );
  assert.strictEqual(
    pointInImageLayer(axisAlignedLayer, { x: 5, y: 5 }),
    false,
  );
  assert.strictEqual(
    getImageLayerResizeCursor(axisAlignedLayer, "e"),
    "ew-resize",
  );
  assert.strictEqual(
    getImageLayerResizeCursor(axisAlignedLayer, "n"),
    "ew-resize",
  );

  assert.deepEqual(
    resizeImageLayerFromHandle(axisAlignedLayer, "se", { x: 40, y: 40 }, false),
    { x: 10, y: 20, width: 30, height: 20 },
  );
  assert.deepEqual(
    resizeImageLayerFromHandle(axisAlignedLayer, "se", { x: 40, y: 40 }, true),
    { x: 10, y: 20, width: 40, height: 20 },
  );
  assert.deepEqual(
    resizeImageLayerFromHandle(axisAlignedLayer, "nw", { x: 29, y: 29 }, false),
    { x: 26, y: 26, width: 4, height: 4 },
  );
});
