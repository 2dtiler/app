import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AssetId, ImageLayer, TileRef, TilesetId } from "@/types";

const { getAssetUrlMock } = vi.hoisted(() => ({
  getAssetUrlMock: vi.fn(),
}));

vi.mock("@/services/db", () => ({
  getAssetUrl: getAssetUrlMock,
}));

import {
  drawImageLayerWithOrientation,
  drawTileWithOrientation,
  evictImageLayer,
  evictTileset,
  evictUnusedTilesets,
  getTileImage,
  imageLayerImageCache,
  loadImageLayerImage,
  loadTilesetImage,
  tilesetImageCache,
} from "@/features/map-editor/components/MapCanvas/texture-cache";

const originalImage = globalThis.Image;
const urlCtor = URL as typeof URL & {
  revokeObjectURL?: (url: string) => void;
};
const originalRevokeObjectURL = urlCtor.revokeObjectURL;
const createdImages: MockImage[] = [];
let decodeImplementation = async () => undefined;

class MockImage {
  src = "";

  constructor() {
    createdImages.push(this);
  }

  decode() {
    return decodeImplementation();
  }
}

beforeEach(() => {
  createdImages.length = 0;
  decodeImplementation = async () => undefined;
  getAssetUrlMock.mockReset();
  tilesetImageCache.clear();
  imageLayerImageCache.clear();
  Object.assign(globalThis, {
    Image: MockImage as unknown as typeof Image,
  });
  urlCtor.revokeObjectURL = vi.fn();
});

afterEach(() => {
  evictUnusedTilesets(new Set());

  for (const assetId of [...imageLayerImageCache.keys()]) {
    evictImageLayer(assetId);
  }

  if (originalImage) {
    Object.assign(globalThis, {
      Image: originalImage,
    });
  } else {
    Reflect.deleteProperty(globalThis, "Image");
  }

  if (originalRevokeObjectURL) {
    urlCtor.revokeObjectURL = originalRevokeObjectURL;
  } else {
    Reflect.deleteProperty(urlCtor, "revokeObjectURL");
  }
});

function createCanvasContext() {
  return {
    drawImage: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createTileRef(overrides: Partial<TileRef> = {}) {
  return {
    tilesetId: "tileset-1" as TilesetId,
    sx: 4,
    sy: 8,
    sw: 16,
    sh: 16,
    ...overrides,
  } as TileRef;
}

test("loadTilesetImage deduplicates in-flight work and reuses the cached image", async () => {
  let resolveDecode = () => undefined;

  decodeImplementation = () =>
    new Promise<void>((resolve) => {
      resolveDecode = resolve;
    });
  getAssetUrlMock.mockResolvedValue("blob:tileset");

  const firstPromise = loadTilesetImage(
    "tileset-1" as TilesetId,
    "asset-1" as AssetId,
  );
  const secondPromise = loadTilesetImage(
    "tileset-1" as TilesetId,
    "asset-1" as AssetId,
  );

  expect(secondPromise).toBe(firstPromise);

  await Promise.resolve();
  resolveDecode();

  const [firstImage, secondImage] = await Promise.all([
    firstPromise,
    secondPromise,
  ]);

  expect(firstImage).toBe(secondImage);
  expect(getAssetUrlMock).toHaveBeenCalledTimes(1);
  expect(createdImages).toHaveLength(1);
  expect(createdImages[0]?.src).toBe("blob:tileset");
  await expect(
    loadTilesetImage("tileset-1" as TilesetId, "asset-1" as AssetId),
  ).resolves.toBe(firstImage);
});

test("loadTilesetImage returns null when the asset is missing or decode fails", async () => {
  getAssetUrlMock.mockResolvedValueOnce(null).mockResolvedValueOnce("blob:bad");

  await expect(
    loadTilesetImage(
      "tileset-missing" as TilesetId,
      "asset-missing" as AssetId,
    ),
  ).resolves.toBeNull();

  decodeImplementation = async () => {
    throw new Error("decode failed");
  };

  await expect(
    loadTilesetImage("tileset-broken" as TilesetId, "asset-broken" as AssetId),
  ).resolves.toBeNull();
  expect(tilesetImageCache.size).toBe(0);
});

test("evictUnusedTilesets and evictTileset revoke blob URLs while getTileImage tracks the cache", async () => {
  getAssetUrlMock
    .mockResolvedValueOnce("blob:keep")
    .mockResolvedValueOnce("blob:drop")
    .mockResolvedValueOnce("blob:single");

  const keptImage = await loadTilesetImage(
    "tileset-keep" as TilesetId,
    "asset-keep" as AssetId,
  );
  await loadTilesetImage("tileset-drop" as TilesetId, "asset-drop" as AssetId);

  expect(
    getTileImage(createTileRef({ tilesetId: "tileset-keep" as TilesetId })),
  ).toBe(keptImage);
  expect(
    getTileImage(createTileRef({ tilesetId: "tileset-missing" as TilesetId })),
  ).toBe(null);

  evictUnusedTilesets(new Set(["tileset-keep" as TilesetId]));

  expect(tilesetImageCache.has("tileset-keep" as TilesetId)).toBe(true);
  expect(tilesetImageCache.has("tileset-drop" as TilesetId)).toBe(false);
  expect(urlCtor.revokeObjectURL).toHaveBeenCalledWith("blob:drop");

  await loadTilesetImage(
    "tileset-single" as TilesetId,
    "asset-single" as AssetId,
  );
  evictTileset("tileset-single" as TilesetId);

  expect(tilesetImageCache.has("tileset-single" as TilesetId)).toBe(false);
  expect(urlCtor.revokeObjectURL).toHaveBeenCalledWith("blob:single");
});

test("loadTilesetImage reloads when the same tileset id points at a new asset", async () => {
  getAssetUrlMock
    .mockResolvedValueOnce("blob:first")
    .mockResolvedValueOnce("blob:second");

  const firstImage = await loadTilesetImage(
    "tileset-replaced" as TilesetId,
    "asset-first" as AssetId,
  );
  const secondImage = await loadTilesetImage(
    "tileset-replaced" as TilesetId,
    "asset-second" as AssetId,
  );

  expect(secondImage).not.toBe(firstImage);
  expect(getAssetUrlMock).toHaveBeenCalledTimes(2);
  expect(urlCtor.revokeObjectURL).toHaveBeenCalledWith("blob:first");
  expect(createdImages[1]?.src).toBe("blob:second");
});

test("drawTileWithOrientation draws directly when there is no rotation or flipping", () => {
  const ctx = createCanvasContext();
  const image = new MockImage() as unknown as HTMLImageElement;
  const ref = createTileRef();

  drawTileWithOrientation(ctx, image, ref, 10, 12, 32);

  expect(ctx.drawImage).toHaveBeenCalledWith(
    image,
    4,
    8,
    16,
    16,
    10,
    12,
    32,
    32,
  );
  expect(ctx.save).not.toHaveBeenCalled();
});

test("drawTileWithOrientation applies the expected canvas transforms for rotated and flipped tiles", () => {
  const ctx = createCanvasContext();
  const image = new MockImage() as unknown as HTMLImageElement;
  const ref = createTileRef({ rotation: 90, flipX: true, flipY: true });

  drawTileWithOrientation(ctx, image, ref, 10, 12, 32);

  expect(ctx.save).toHaveBeenCalledTimes(1);
  expect(ctx.translate).toHaveBeenCalledWith(26, 28);
  expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
  expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
  expect(ctx.drawImage).toHaveBeenCalledWith(
    image,
    4,
    8,
    16,
    16,
    -16,
    -16,
    32,
    32,
  );
  expect(ctx.restore).toHaveBeenCalledTimes(1);
});

test("drawImageLayerWithOrientation draws directly when there is no rotation or flipping", () => {
  const ctx = createCanvasContext();
  const image = new MockImage() as unknown as HTMLImageElement;

  drawImageLayerWithOrientation(ctx, image, {
    x: 2,
    y: 4,
    width: 10,
    height: 20,
  });

  expect(ctx.drawImage).toHaveBeenCalledWith(image, 2, 4, 10, 20);
  expect(ctx.save).not.toHaveBeenCalled();
});

test("drawImageLayerWithOrientation rotates around the layer center when needed", () => {
  const ctx = createCanvasContext();
  const image = new MockImage() as unknown as HTMLImageElement;
  const layer = {
    x: 2,
    y: 4,
    width: 10,
    height: 20,
    rotation: 180,
    flipX: true,
    flipY: false,
  } as Pick<
    ImageLayer,
    "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY"
  >;

  drawImageLayerWithOrientation(ctx, image, layer);

  expect(ctx.save).toHaveBeenCalledTimes(1);
  expect(ctx.translate).toHaveBeenCalledWith(7, 14);
  expect(ctx.rotate).toHaveBeenCalledWith(Math.PI);
  expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
  expect(ctx.drawImage).toHaveBeenCalledWith(image, -5, -10, 10, 20);
  expect(ctx.restore).toHaveBeenCalledTimes(1);
});

test("loadImageLayerImage caches successful loads and evictImageLayer revokes their blob URL", async () => {
  getAssetUrlMock.mockResolvedValue("blob:image-layer");

  const firstImage = await loadImageLayerImage("asset-image" as AssetId);
  const secondImage = await loadImageLayerImage("asset-image" as AssetId);

  expect(firstImage).toBe(secondImage);
  expect(getAssetUrlMock).toHaveBeenCalledTimes(1);
  expect(imageLayerImageCache.get("asset-image" as AssetId)).toBe(firstImage);

  evictImageLayer("asset-image" as AssetId);

  expect(imageLayerImageCache.has("asset-image" as AssetId)).toBe(false);
  expect(urlCtor.revokeObjectURL).toHaveBeenCalledWith("blob:image-layer");
});

test("loadImageLayerImage returns null when image decoding fails", async () => {
  getAssetUrlMock.mockResolvedValue("blob:image-layer-broken");
  decodeImplementation = async () => {
    throw new Error("decode failed");
  };

  await expect(
    loadImageLayerImage("asset-broken" as AssetId),
  ).resolves.toBeNull();
  expect(imageLayerImageCache.size).toBe(0);
});
