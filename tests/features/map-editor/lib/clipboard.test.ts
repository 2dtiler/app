import { afterEach, assert, beforeEach, test, vi } from "vitest";
import {
  getImageLayerClipboard,
  setImageLayerClipboard,
} from "@/features/map-editor/lib/image-layer-clipboard";
import {
  getClipboard,
  setClipboard,
} from "@/features/map-editor/lib/tile-clipboard";
import type {
  ImageLayerClipboard,
  TileClipboard,
} from "@/features/map-editor/types/editor-helpers";
import type { AssetId, TilesetId } from "@/types";

const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;
let dispatchEventMock: ReturnType<typeof vi.fn>;

function createTileClipboard(): TileClipboard {
  return {
    width: 1,
    height: 1,
    tiles: [
      {
        dx: 0,
        dy: 0,
        ref: {
          tilesetId: "tileset-1" as TilesetId,
          sx: 0,
          sy: 0,
          sw: 16,
          sh: 16,
        },
      },
    ],
  };
}

function createImageLayerClipboard(): ImageLayerClipboard {
  return {
    name: "Reference",
    x: 1,
    y: 2,
    width: 32,
    height: 16,
    rotation: 90,
    flipX: true,
    flipY: false,
    opacity: 75,
    assetId: "asset-1" as AssetId,
    mimeType: "image/png",
    data: new ArrayBuffer(4),
    operation: "copy",
  };
}

beforeEach(() => {
  dispatchEventMock = vi.fn();
  Object.assign(globalThis, {
    window: { dispatchEvent: dispatchEventMock },
    CustomEvent: class TestCustomEvent extends Event {},
  });
});

afterEach(() => {
  setClipboard(null);
  setImageLayerClipboard(null);
  vi.restoreAllMocks();

  if (originalWindow) {
    Object.assign(globalThis, { window: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  if (originalCustomEvent) {
    Object.assign(globalThis, { CustomEvent: originalCustomEvent });
  } else {
    Reflect.deleteProperty(globalThis, "CustomEvent");
  }
});

test("stores tile clipboard data and dispatches changes", () => {
  const clipboard = createTileClipboard();

  assert.equal(getClipboard(), null);
  setClipboard(clipboard);

  const event = dispatchEventMock.mock.calls[0][0] as Event;
  assert.deepEqual(getClipboard(), clipboard);
  assert.equal(event.type, "tile-clipboard-change");
});

test("stores image layer clipboard data and dispatches changes", () => {
  const clipboard = createImageLayerClipboard();

  assert.equal(getImageLayerClipboard(), null);
  setImageLayerClipboard(clipboard);

  const event = dispatchEventMock.mock.calls[0][0] as Event;
  assert.deepEqual(getImageLayerClipboard(), clipboard);
  assert.equal(event.type, "image-layer-clipboard-change");
});
