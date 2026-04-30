import { assert, test } from "vitest";
import {
  appendXmlTilesetAnimationData,
  buildTiledJsonAnimationFields,
  getTiledAnimationProperties,
  getTiledAnimationTileEntries,
  readJsonTilesetAnimationConfig,
  readXmlTilesetAnimationConfig,
} from "@/features/import-export/lib/tiled-animation-conversion";
import {
  createTestAnimationConfig,
  createTestTileset,
} from "./tiled-test-support";
import type { TilesetAnimation } from "@/types";

test("buildTiledJsonAnimationFields emits custom metadata and standard frames", () => {
  const tileset = createTestTileset();
  tileset.animations = createTestAnimationConfig();

  const fields = buildTiledJsonAnimationFields(tileset);

  assert.strictEqual(fields.properties?.[0]?.name, "2dtiler:animations");
  assert.strictEqual(
    fields.properties?.[0]?.value?.includes("Waterfall"),
    true,
  );
  assert.deepEqual(fields.tiles?.[0], {
    id: 0,
    animation: [
      { tileid: 0, duration: 100 },
      { tileid: 1, duration: 150 },
    ],
  });
  assert.strictEqual(
    getTiledAnimationProperties(createTestTileset()),
    undefined,
  );
  assert.deepEqual(buildTiledJsonAnimationFields(createTestTileset()), {});
});

test("appendXmlTilesetAnimationData round-trips 2D Tiler animation metadata", () => {
  const tileset = createTestTileset();
  tileset.animations = createTestAnimationConfig();
  const document = window.document.implementation.createDocument("", "tileset");
  const tilesetElement = document.documentElement;

  appendXmlTilesetAnimationData(document, tilesetElement, tileset);

  assert.strictEqual(
    tilesetElement
      .querySelector('properties > property[name="2dtiler:animations"]')
      ?.getAttribute("value")
      ?.includes("Waterfall"),
    true,
  );
  assert.strictEqual(
    tilesetElement
      .querySelector('tile[id="0"] > animation > frame[tileid="1"]')
      ?.getAttribute("duration"),
    "150",
  );
  const config = readXmlTilesetAnimationConfig(tilesetElement, tileset);
  assert.deepEqual(config, tileset.animations);
});

test("readXmlTilesetAnimationConfig creates one-cell animations from Tiled frames", () => {
  const tileset = createTestTileset();
  const document = new DOMParser().parseFromString(
    '<tileset><tile id="0"><animation><frame tileid="0" duration="80"/><frame tileid="1" duration="120"/></animation></tile></tileset>',
    "application/xml",
  );

  const config = readXmlTilesetAnimationConfig(
    document.documentElement,
    tileset,
  );

  assert.strictEqual(config?.animations[0]?.name, "Tile 1");
  assert.strictEqual(config?.animations[0]?.frames[0]?.durationMs, 80);
  assert.deepEqual(config?.animations[0]?.frames[1]?.cells[0], {
    sx: 16,
    sy: 0,
    sw: 16,
    sh: 16,
  });
});

test("readJsonTilesetAnimationConfig creates one-cell animations from Tiled JSON frames", () => {
  const tileset = createTestTileset();

  const config = readJsonTilesetAnimationConfig(
    {
      tiles: [
        {
          id: 1,
          animation: [
            { tileid: 1, duration: 90 },
            { tileid: 0, duration: 110 },
          ],
        },
      ],
    },
    tileset,
  );

  assert.strictEqual(config?.animations[0]?.name, "Tile 2");
  assert.strictEqual(config?.animations[0]?.frames[0]?.durationMs, 90);
  assert.deepEqual(config?.animations[0]?.frames[1]?.cells[0], {
    sx: 0,
    sy: 0,
    sw: 16,
    sh: 16,
  });
});

test("getTiledAnimationTileEntries rejects duplicate Tiled base tile definitions", () => {
  const tileset = createTestTileset();
  const firstAnimation = createTestAnimationConfig().animations[0]!;
  const duplicateAnimation = {
    ...firstAnimation,
    id: "animation-duplicate" as TilesetAnimation["id"],
  };
  tileset.animations = {
    version: 1,
    animations: [firstAnimation, duplicateAnimation],
  };

  assert.throws(
    () => getTiledAnimationTileEntries(tileset),
    /cannot represent multiple animations/,
  );
});
