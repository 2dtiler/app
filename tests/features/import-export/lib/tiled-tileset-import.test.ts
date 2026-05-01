import { assert, test } from "vitest";
import { buildTiledJsonAnimationFields } from "@/features/import-export/lib/tiled-animation-conversion";
import { prepareTiledTilesetImport } from "@/features/import-export/lib/tiled-tileset-import";
import { buildTiledJsonWangSets } from "@/features/import-export/lib/tiled-wang";
import {
  createTestAnimationConfig,
  createTestTileset,
  createTestWangAutotileConfig,
  encodeText,
  withStubbedImageImportEnvironment,
} from "./tiled-test-support";

test("prepareTiledTilesetImport preserves Wang autotile and animations from TSJ tilesets", async () => {
  const sourceTileset = createTestTileset();
  sourceTileset.imageWidth = 64;
  sourceTileset.autotile = createTestWangAutotileConfig();
  sourceTileset.animations = createTestAnimationConfig();

  const document = {
    type: "tileset",
    name: sourceTileset.name,
    tilewidth: sourceTileset.tileSize,
    tileheight: sourceTileset.tileSize,
    tilecount: 4,
    columns: 4,
    margin: 0,
    spacing: 0,
    image: "terrain.png",
    imagewidth: sourceTileset.imageWidth,
    imageheight: sourceTileset.imageHeight,
    wangsets: buildTiledJsonWangSets(sourceTileset),
    ...buildTiledJsonAnimationFields(sourceTileset),
  };

  await withStubbedImageImportEnvironment(
    async () => {
      const result = await prepareTiledTilesetImport(
        "terrain.tsj",
        [
          {
            path: "terrain.tsj",
            data: encodeText(JSON.stringify(document)),
          },
          {
            path: "terrain.png",
            data: new Uint8Array([1, 2, 3, 4]),
          },
        ],
        "json",
      );

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      const importedTileset = result.result[0];
      assert.strictEqual(importedTileset?.autotile?.preset, "wang-tiles");
      assert.deepEqual(
        importedTileset?.autotile?.terrains[0]?.patternTiles?.["wang-0f"],
        {
          sx: 16,
          sy: 0,
          sw: 16,
          sh: 16,
        },
      );
      assert.strictEqual(
        importedTileset?.animations?.animations[0]?.name,
        "Waterfall",
      );
      assert.deepEqual(
        importedTileset?.animations?.animations[0]?.frames[1]?.cells[0],
        {
          sx: 16,
          sy: 0,
          sw: 16,
          sh: 16,
        },
      );
    },
    { width: 64, height: 16 },
  );
});
