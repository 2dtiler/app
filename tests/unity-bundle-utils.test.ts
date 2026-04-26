import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnityLayerExportName,
  buildUnityTileAssetFile,
  buildUnityTilesetTextureMetaFile,
  parseUnityLayerExportName,
  parseUnityMetaGuid,
  parseUnityTextureMetaTileSize,
  parseUnityTileAssetTextureGuid,
} from "../src/features/import-export/lib/unity-bundle-utils";

test("Unity layer export names round-trip stable ids", () => {
  const encoded = buildUnityLayerExportName("Ground", "layer-123");

  assert.equal(encoded, "Ground [2DTILER:layer-123]");
  assert.deepEqual(parseUnityLayerExportName(encoded), {
    name: "Ground",
    exportId: "layer-123",
  });
  assert.deepEqual(parseUnityLayerExportName("Foreground"), {
    name: "Foreground",
  });
});

test("Unity meta and tile asset helpers parse exported GUID chain", () => {
  const textureMeta = buildUnityTilesetTextureMetaFile(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    32,
  );
  const tileAsset = buildUnityTileAssetFile(
    "Tile-0-0",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );

  assert.equal(
    parseUnityMetaGuid(textureMeta),
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(parseUnityTextureMetaTileSize(textureMeta), 32);
  assert.equal(
    parseUnityTileAssetTextureGuid(tileAsset),
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );
});
