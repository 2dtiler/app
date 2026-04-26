import assert from "node:assert/strict";
import test from "node:test";
import { parseUnityPrefabTilemap } from "../src/features/import-export/lib/unity-prefab-parser";

const UNITY_PREFAB_FIXTURE = `%YAML 1.1
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
  - {fileID: 200011}
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
--- !u!1839735485 &200012
Tilemap:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 200010}
  m_Enabled: 1
  m_AnimationFrameRate: 1
  m_Color: {r: 1, g: 1, b: 1, a: 1}
  m_Origin: {x: 0, y: 0, z: 0}
  m_Size: {x: 4, y: 3, z: 1}
  m_TileAnchor: {x: 0.5, y: 0.5, z: 0}
  m_TileAssetArray:
  - {fileID: 11400000, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 2}
  - {fileID: 11400000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 2}
  m_Tiles:
  - first: {x: 1, y: 0, z: 0}
    second:
      m_TileIndex: 1
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
  - first: {x: 0, y: 1, z: 0}
    second:
      m_TileIndex: 0
      m_TileSpriteIndex: 0
      m_Color: {r: 1, g: 1, b: 1, a: 1}
      m_Matrix:
        e00: 0
        e01: -1
        e02: 0
        e03: 0
        e10: 1
        e11: 0
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
--- !u!1 &200010
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 200011}
  - component: {fileID: 200012}
  - component: {fileID: 200013}
  m_Layer: 0
  m_Name: Foreground
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 0
--- !u!4 &200011
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 200010}
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
  - {fileID: 11400000, guid: cccccccccccccccccccccccccccccccc, type: 2}
  m_Tiles:
  - first: {x: 2, y: 2, z: 0}
    second:
      m_TileIndex: 0
      m_TileSpriteIndex: 0
      m_Color: {r: 1, g: 1, b: 1, a: 1}
      m_Matrix:
        e00: -1
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
  m_Name: Ground Renamed
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
`;

test("parseUnityPrefabTilemap reads actual layer order and tile transforms", () => {
  const parsed = parseUnityPrefabTilemap(UNITY_PREFAB_FIXTURE);

  assert.equal(parsed.widthInTiles, 4);
  assert.equal(parsed.heightInTiles, 3);
  assert.deepEqual(
    parsed.layers.map((layer) => [layer.name, layer.visible]),
    [
      ["Foreground", false],
      ["Ground Renamed", true],
    ],
  );

  assert.equal(
    parsed.layers[0].tileAssetGuids[1],
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );
  assert.deepEqual(parsed.layers[0].tiles[0], {
    coordinate: "1,2",
    tileIndex: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });
  assert.deepEqual(parsed.layers[0].tiles[1], {
    coordinate: "0,1",
    tileIndex: 0,
    rotation: 90,
    flipX: false,
    flipY: false,
  });
  assert.deepEqual(parsed.layers[1].tiles[0], {
    coordinate: "2,0",
    tileIndex: 0,
    rotation: 0,
    flipX: true,
    flipY: false,
  });
});

test("parseUnityPrefabTilemap rejects prefabs without Tilemap components", () => {
  assert.throws(
    () =>
      parseUnityPrefabTilemap("%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n"),
    /does not contain any Tilemap components/,
  );
});
