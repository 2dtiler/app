import { assert, test } from "vitest";
import {
  beginCanvasResizeAction,
  clampCanvasDimension,
  getCanvasResizeCommit,
  getResizeDeltaInPixels,
  updateCanvasResizeAction,
} from "@/features/image-editor/lib/canvas-resize-controller";

test("clampCanvasDimension keeps sizes within the supported canvas bounds", () => {
  assert.strictEqual(clampCanvasDimension(Number.NaN, 12), 12);
  assert.strictEqual(clampCanvasDimension(-10, 12), 1);
  assert.strictEqual(clampCanvasDimension(2048, 12), 1024);
  assert.strictEqual(clampCanvasDimension(15.6, 12), 16);
});

test("getResizeDeltaInPixels converts pointer movement using zoom", () => {
  assert.strictEqual(getResizeDeltaInPixels(11, 4), 2);
  assert.strictEqual(getResizeDeltaInPixels(-11, 4), -2);
  assert.strictEqual(getResizeDeltaInPixels(10, 0), 0);
});

test("updateCanvasResizeAction tracks preview and commit state", () => {
  const action = beginCanvasResizeAction("se", 100, 200, 16, 24);

  const preview = updateCanvasResizeAction(action, 112, 220, 4);

  assert.deepEqual(preview, { width: 19, height: 29 });
  assert.deepEqual(getCanvasResizeCommit(action, true), preview);
  assert.isNull(getCanvasResizeCommit(action, false));
});

test("getCanvasResizeCommit ignores unchanged sizes", () => {
  const action = beginCanvasResizeAction("e", 20, 30, 32, 48);

  assert.isNull(getCanvasResizeCommit(action, true));
});
