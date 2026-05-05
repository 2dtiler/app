import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AssetId, Tileset, TilesetGroupId, TilesetId } from "@/types";

const { generateAssetIdMock, getAssetMock, saveAssetMock } = vi.hoisted(() => ({
  generateAssetIdMock: vi.fn(),
  getAssetMock: vi.fn(),
  saveAssetMock: vi.fn(),
}));

vi.mock("@/services/db", () => ({
  getAsset: getAssetMock,
  saveAsset: saveAssetMock,
}));

vi.mock("@/utils/ids", () => ({
  generateAssetId: generateAssetIdMock,
}));

import {
  getTilesetPlacementCanvasSize,
  mergeTilesetImageAtPosition,
  snapTilesetPlacementPosition,
  TILESET_MERGE_OUTPUT_MIME_TYPE,
} from "@/features/map-editor/lib/tileset-image-merge";

const originalDocument = globalThis.document;
const originalImage = globalThis.Image;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const createdImages: MockImage[] = [];

class MockImage {
  src = "";

  constructor() {
    createdImages.push(this);
  }

  decode() {
    return Promise.resolve();
  }
}

function createTileset(): Tileset {
  return {
    id: "tileset-1" as TilesetId,
    name: "Terrain",
    groupId: "group-1" as TilesetGroupId,
    tileSize: 16,
    assetId: "asset-base" as AssetId,
    imageWidth: 64,
    imageHeight: 32,
    createdAt: 1,
  };
}

beforeEach(() => {
  createdImages.length = 0;
  generateAssetIdMock.mockReturnValue("asset-merged");
  getAssetMock.mockResolvedValue({
    id: "asset-base",
    data: new ArrayBuffer(1),
    mimeType: "image/png",
    createdAt: 1,
  });
  saveAssetMock.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => "blob:base");
  URL.revokeObjectURL = vi.fn();
  Object.assign(globalThis, {
    Image: MockImage as unknown as typeof Image,
    document: {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          imageSmoothingEnabled: true,
        })),
        toBlob: vi.fn((callback: BlobCallback, mimeType: string) => {
          callback(new Blob([new Uint8Array([1, 2, 3])], { type: mimeType }));
        }),
      })),
    } as unknown as Document,
  });
});

afterEach(() => {
  if (originalDocument) {
    Object.assign(globalThis, { document: originalDocument });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (originalImage) {
    Object.assign(globalThis, { Image: originalImage });
  } else {
    Reflect.deleteProperty(globalThis, "Image");
  }

  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

test("snaps placement to the tile grid and clamps negative positions", () => {
  expect(snapTilesetPlacementPosition({ x: 31, y: 33 }, 16)).toEqual({
    x: 16,
    y: 32,
  });
  expect(snapTilesetPlacementPosition({ x: -8, y: -1 }, 16)).toEqual({
    x: 0,
    y: 0,
  });
});

test("expands the destination canvas right and down as needed", () => {
  expect(
    getTilesetPlacementCanvasSize(64, 32, 24, 40, { x: 48, y: 16 }),
  ).toEqual({ width: 72, height: 56 });
  expect(getTilesetPlacementCanvasSize(64, 32, 16, 16, { x: 0, y: 0 })).toEqual(
    { width: 64, height: 32 },
  );
});

test("merges the source image into a new expanded PNG asset", async () => {
  const sourceImage = new MockImage() as unknown as HTMLImageElement;
  const result = await mergeTilesetImageAtPosition({
    targetTileset: createTileset(),
    sourceImage,
    sourceWidth: 24,
    sourceHeight: 40,
    position: { x: 48, y: 16 },
  });

  expect(result).toEqual({
    assetId: "asset-merged",
    width: 72,
    height: 56,
    mimeType: TILESET_MERGE_OUTPUT_MIME_TYPE,
  });
  expect(saveAssetMock).toHaveBeenCalledWith(
    "asset-merged",
    expect.any(ArrayBuffer),
    TILESET_MERGE_OUTPUT_MIME_TYPE,
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:base");
});
