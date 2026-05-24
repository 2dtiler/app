import { assert, expect, test } from "vitest";
import {
  buildUnityBundleManifestPath,
  buildUnityGenericMetaFile,
  buildUnityLayerExportName,
  buildUnityTileAssetFile,
  buildUnityTilesetTextureMetaFile,
  encodeUnityBundleManifest,
  encodeUnityTextFile,
} from "@/features/import-export/lib/unity-bundle-utils";
import { prepareUnityMapImport } from "@/features/import-export/lib/unity-map-import";
import { db } from "@/services/db";
import type { UnityBundleManifest } from "@/types";

function buildUnityPrefabBundleFixture(tileAssetGuid: string) {
  return encodeUnityTextFile(`%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100000
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 100001}
  - component: {fileID: 100002}
  m_Layer: 0
  m_Name: Grid
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &100001
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children:
  - {fileID: 200001}
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
--- !u!156049354 &100002
Grid:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 100000}
  m_Enabled: 1
  m_CellSize: {x: 1, y: 1, z: 0}
  m_CellGap: {x: 0, y: 0, z: 0}
  m_CellLayout: 0
  m_CellSwizzle: 0
--- !u!1 &200000
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 200001}
  - component: {fileID: 200002}
  - component: {fileID: 200003}
  m_Layer: 0
  m_Name: ${buildUnityLayerExportName("Ground", "layer-ground")}
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &200001
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 200000}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 100001}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
--- !u!1839735485 &200002
Tilemap:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 200000}
  m_Enabled: 1
  m_AnimationFrameRate: 1
  m_Color: {r: 1, g: 1, b: 1, a: 1}
  m_Origin: {x: 0, y: 0, z: 0}
  m_Size: {x: 4, y: 3, z: 1}
  m_TileAnchor: {x: 0.5, y: 0.5, z: 0}
  m_TileAssetArray:
  - {fileID: 11400000, guid: ${tileAssetGuid}, type: 2}
  m_Tiles:
  - first: {x: 1, y: 1, z: 0}
    second:
      m_TileIndex: 0
      m_TileSpriteIndex: 0
      m_Color: {r: 1, g: 1, b: 1, a: 1}
      m_Matrix:
        e00: 1
        e01: 0
        e02: 0
        e03: 0
        e10: 0
        e11: 1
        e12: 0
        e13: 0
        e20: 0
        e21: 0
        e22: 1
        e23: 0
        e30: 0
        e31: 0
        e32: 0
        e33: 1
  m_TileSpriteArray: []
  m_AnimatedTiles: []
--- !u!483328833 &200003
TilemapRenderer:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 200000}
  m_Enabled: 1
  m_SortOrder: 0
  m_Mode: 0
`);
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

test("prepareUnityMapImport prefers prefab and texture metadata over manifest map metadata", async () => {
  await withStubbedUnityImportEnvironment(
    async () => {
      const prefabPath = "Forest.prefab";
      const manifestPath = buildUnityBundleManifestPath(prefabPath);
      const textureGuid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const tileAssetGuid = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      const manifest: UnityBundleManifest = {
        version: 1,
        source: "2dtiler",
        map: {
          name: "Wrong Manifest Name",
          widthInTiles: 99,
          heightInTiles: 77,
          tileSize: 16,
          orientation: "orthogonal",
        },
        sourceTilesets: [],
        layers: [
          {
            exportId: "layer-ground",
            name: "Manifest Ground",
            visible: false,
            locked: true,
            cells: [],
          },
        ],
      };

      const result = await prepareUnityMapImport(prefabPath, [
        {
          path: prefabPath,
          data: buildUnityPrefabBundleFixture(tileAssetGuid),
        },
        {
          path: manifestPath,
          data: encodeUnityBundleManifest(manifest),
        },
        {
          path: "tiles/grass.asset",
          data: encodeUnityTextFile(
            buildUnityTileAssetFile("grass", textureGuid),
          ),
        },
        {
          path: "tiles/grass.asset.meta",
          data: encodeUnityTextFile(buildUnityGenericMetaFile(tileAssetGuid)),
        },
        {
          path: "tiles/grass.png",
          data: new Uint8Array([137, 80, 78, 71]),
        },
        {
          path: "tiles/grass.png.meta",
          data: encodeUnityTextFile(
            buildUnityTilesetTextureMetaFile(textureGuid, 32),
          ),
        },
      ]);

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.strictEqual(result.result.map.name, "Forest");
      assert.strictEqual(result.result.map.widthInTiles, 4);
      assert.strictEqual(result.result.map.heightInTiles, 3);
      assert.strictEqual(result.result.map.tileSize, 32);
      assert.strictEqual(result.result.layers[0]?.name, "Ground");
      assert.strictEqual(result.result.layers[0]?.locked, true);
      assert.deepEqual(result.result.layers[0]?.tiles["1,1"], {
        tilesetId: result.result.tilesets[0]?.id,
        sx: 0,
        sy: 0,
        sw: 32,
        sh: 32,
        rotation: 0,
        flipX: false,
        flipY: false,
      });
    },
    { width: 32, height: 32 },
  );
});

test("prepareUnityMapImport imports manifest-only bundles", async () => {
  await withStubbedUnityImportEnvironment(
    async () => {
      const prefabPath = "ManifestOnly.prefab";
      const manifest: UnityBundleManifest = {
        version: 1,
        source: "2dtiler",
        map: {
          name: "Manifest Only",
          widthInTiles: 2,
          heightInTiles: 2,
          tileSize: 16,
          orientation: "orthogonal",
        },
        sourceTilesets: [
          {
            id: "tileset-1" as never,
            name: "terrain",
            imagePath: "images/terrain.png",
            tileSize: 16,
            imageWidth: 32,
            imageHeight: 32,
            createdAt: 5,
          },
        ],
        layers: [
          {
            exportId: "layer-ground",
            name: "Ground",
            visible: false,
            locked: true,
            cells: [
              {
                coordinate: "1,0",
                tilesetId: "tileset-1" as never,
                sx: 16,
                sy: 0,
                sw: 16,
                sh: 16,
                rotation: 90,
                flipX: true,
                flipY: false,
              },
            ],
          },
        ],
      };

      const result = await prepareUnityMapImport(prefabPath, [
        {
          path: prefabPath,
          data: encodeUnityTextFile("not a parseable prefab"),
        },
        {
          path: buildUnityBundleManifestPath(prefabPath),
          data: encodeUnityBundleManifest(manifest),
        },
        {
          path: "images/terrain.png",
          data: new Uint8Array([1, 2, 3]),
        },
      ]);

      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }

      assert.strictEqual(result.result.map.name, "Manifest Only");
      assert.strictEqual(result.result.layers[0]?.visible, false);
      assert.strictEqual(result.result.layers[0]?.locked, true);
      assert.deepEqual(result.result.layers[0]?.tiles["1,0"], {
        tilesetId: "tileset-1",
        sx: 16,
        sy: 0,
        sw: 16,
        sh: 16,
        rotation: 90,
        flipX: true,
        flipY: false,
      });
      assert.strictEqual(result.result.tilesets[0]?.name, "terrain");
    },
    { width: 32, height: 32 },
  );
});

test("prepareUnityMapImport reports missing manifest and prefab resources", async () => {
  const missingManifest = await prepareUnityMapImport("Missing.prefab", [
    {
      path: "Missing.prefab",
      data: encodeUnityTextFile("not a parseable prefab"),
    },
  ]);

  assert.strictEqual(missingManifest.status, "missing-resources");
  if (missingManifest.status !== "missing-resources") {
    return;
  }
  assert.strictEqual(missingManifest.missingResources[0]?.kind, "json");

  const tileAssetGuid = "cccccccccccccccccccccccccccccccc";
  const textureGuid = "dddddddddddddddddddddddddddddddd";
  const prefabPath = "MissingAssets.prefab";
  const manifest: UnityBundleManifest = {
    version: 1,
    source: "2dtiler",
    map: {
      name: "Missing Assets",
      widthInTiles: 1,
      heightInTiles: 1,
      tileSize: 16,
      orientation: "orthogonal",
    },
    sourceTilesets: [],
    layers: [],
  };
  const missingPrefabAssets = await prepareUnityMapImport(prefabPath, [
    {
      path: prefabPath,
      data: buildUnityPrefabBundleFixture(tileAssetGuid),
    },
    {
      path: buildUnityBundleManifestPath(prefabPath),
      data: encodeUnityBundleManifest(manifest),
    },
    {
      path: "tiles/missing.asset",
      data: encodeUnityTextFile(buildUnityTileAssetFile("missing", textureGuid)),
    },
    {
      path: "tiles/missing.asset.meta",
      data: encodeUnityTextFile(buildUnityGenericMetaFile(tileAssetGuid)),
    },
  ]);

  assert.strictEqual(missingPrefabAssets.status, "missing-resources");
  if (missingPrefabAssets.status !== "missing-resources") {
    return;
  }
  assert.deepEqual(
    missingPrefabAssets.missingResources.map((resource) => resource.kind),
    ["meta", "image"],
  );
});

test("prepareUnityMapImport validates input and unsupported tile metadata", async () => {
  await expect(prepareUnityMapImport("Scene.unity", [])).rejects.toThrow(
    /prefab file/,
  );

  const prefabPath = "BadTile.prefab";
  const textureGuid = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const tileAssetGuid = "ffffffffffffffffffffffffffffffff";
  const manifest: UnityBundleManifest = {
    version: 1,
    source: "2dtiler",
    map: {
      name: "Bad Tile",
      widthInTiles: 1,
      heightInTiles: 1,
      tileSize: 16,
      orientation: "orthogonal",
    },
    sourceTilesets: [],
    layers: [],
  };

  await expect(
    prepareUnityMapImport(prefabPath, [
        {
          path: prefabPath,
          data: buildUnityPrefabBundleFixture(tileAssetGuid),
        },
        {
          path: buildUnityBundleManifestPath(prefabPath),
          data: encodeUnityBundleManifest(manifest),
        },
        {
          path: "tiles/bad.asset",
          data: encodeUnityTextFile(buildUnityTileAssetFile("bad", textureGuid)),
        },
        {
          path: "tiles/bad.asset.meta",
          data: encodeUnityTextFile(buildUnityGenericMetaFile(tileAssetGuid)),
        },
        {
          path: "tiles/bad.png",
          data: new Uint8Array([1, 2, 3]),
        },
        {
          path: "tiles/bad.png.meta",
          data: encodeUnityTextFile(buildUnityGenericMetaFile(textureGuid)),
        },
      ]),
  ).rejects.toThrow(/missing tile slicing/);
});
