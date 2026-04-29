import { assert, test } from "vitest";
import { encodeUnityTextFile } from "@/features/import-export/lib/unity-bundle-utils";
import { prepareUnityTilesetImport } from "@/features/import-export/lib/unity-tileset-import";
import { db } from "@/services/db";

function buildUnitySpriteSheetMeta(guid: string, tileSize: number) {
  return [
    "fileFormatVersion: 2",
    `guid: ${guid}`,
    "TextureImporter:",
    "  internalIDToNameTable: []",
    "  externalObjects: {}",
    "  serializedVersion: 13",
    "  mipmaps:",
    "    enableMipMap: 0",
    "  textureSettings:",
    "    serializedVersion: 2",
    "    filterMode: 0",
    "    aniso: 1",
    "    mipBias: 0",
    "    wrapU: 1",
    "    wrapV: 1",
    "    wrapW: 1",
    "  spriteMode: 2",
    "  spritePixelsToUnits: 100",
    "  userData: ",
    "  spriteSheet:",
    "    serializedVersion: 2",
    "    sprites:",
    "    - serializedVersion: 2",
    "      name: tile_0_0",
    "      rect:",
    "        serializedVersion: 2",
    "        x: 0",
    "        y: 0",
    `        width: ${tileSize}`,
    `        height: ${tileSize}`,
    "    - serializedVersion: 2",
    "      name: tile_1_0",
    "      rect:",
    "        serializedVersion: 2",
    `        x: ${tileSize}`,
    "        y: 0",
    `        width: ${tileSize}`,
    `        height: ${tileSize}`,
    "",
  ].join("\n");
}

async function withStubbedUnityImportEnvironment(
  run: () => Promise<void>,
  dimensions: { width: number; height: number },
) {
  const originalImage = globalThis.Image;
  const originalPut = db.assets.put;

  class MockImage {
    naturalWidth = dimensions.width;
    naturalHeight = dimensions.height;
    src = "";

    async decode() {
      return undefined;
    }
  }

  Object.assign(globalThis, {
    Image: MockImage as unknown as typeof Image,
  });
  db.assets.put = (async () => undefined) as typeof db.assets.put;

  try {
    await run();
  } finally {
    if (originalImage) {
      Object.assign(globalThis, {
        Image: originalImage,
      });
    } else {
      Reflect.deleteProperty(globalThis, "Image");
    }
    db.assets.put = originalPut;
  }
}

test("prepareUnityTilesetImport infers tile size from Unity sprite slicing metadata", async () => {
  await withStubbedUnityImportEnvironment(
    async () => {
      const result = await prepareUnityTilesetImport("tiles/terrain.png", [
        {
          path: "tiles/terrain.png",
          data: new Uint8Array([1, 2, 3]),
        },
        {
          path: "tiles/terrain.png.meta",
          data: encodeUnityTextFile(
            buildUnitySpriteSheetMeta("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 16),
          ),
        },
      ]);

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.strictEqual(result.result[0]?.tileSize, 16);
      assert.strictEqual(result.result[0]?.imageWidth, 32);
      assert.strictEqual(result.result[0]?.imageHeight, 32);
    },
    { width: 32, height: 32 },
  );
});
