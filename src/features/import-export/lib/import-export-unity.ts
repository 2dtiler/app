import { canvasToPngBlob } from "@/features/image-editor/lib/image-editor-document";
import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  buildUnityLayerExportName,
  buildUnityBundleManifestPath,
  buildUnityGenericMetaFile,
  buildUnityTextureMetaFile,
  buildUnityTileAssetFile,
  buildUnityTileMatrix,
  encodeUnityBundleManifest,
  encodeUnityTextFile,
  generateUnityGuid,
  getUnityTileKey,
} from "@/features/import-export/lib/unity-bundle-utils";
import { getAsset } from "@/services/db";
import { sanitizeDownloadSegment } from "@/utils/format";
import { getFileExtensionFromMimeType } from "@/features/import-export/lib/tiled-xml-utils";
import type {
  ImageLayer,
  ImportExportArchiveEntry,
  LayerGroup,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  Tileset,
  UnityBundleManifest,
} from "@/types";

type SourceTilesetRecord = {
  tileset: Tileset;
  mimeType: string;
  bytes: Uint8Array;
};

type UnityTileAssetDescriptor = {
  tileName: string;
  tileAssetGuid: string;
};

function assertUnityExportSupported(
  map: TileMapData,
  imageLayers: readonly ImageLayer[],
  layerGroups: readonly LayerGroup[],
  objectLayers: readonly ObjectLayer[],
  objects: readonly MapObject[],
) {
  if (map.orientation !== "orthogonal") {
    throw new Error(
      "Unity Tilemap export currently supports orthogonal maps only.",
    );
  }

  if (imageLayers.length > 0) {
    throw new Error(
      "Unity Tilemap export does not include image layers yet. Remove image layers or use another export format.",
    );
  }

  if (layerGroups.length > 0) {
    throw new Error(
      "Unity Tilemap export does not include layer groups yet. Flatten the map layers before exporting.",
    );
  }

  if (objectLayers.length > 0 || objects.length > 0) {
    throw new Error(
      "Unity Tilemap export does not include object layers yet. Remove object layers or use another export format.",
    );
  }
}

function getReferencedTilesets(
  layers: readonly TileLayer[],
  tilesets: readonly Tileset[],
) {
  const referencedIds = new Set<string>();

  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedIds.add(ref.tilesetId as string);
    }
  }

  return tilesets.filter((tileset) => referencedIds.has(tileset.id as string));
}

async function buildSourceTilesetEntries(
  referencedTilesets: readonly Tileset[],
  usedPaths: Set<string>,
) {
  const entries: ImportExportArchiveEntry[] = [];
  const sourceTilesetRecords = new Map<string, SourceTilesetRecord>();
  const manifestTilesets: UnityBundleManifest["sourceTilesets"] = [];

  for (const tileset of referencedTilesets) {
    const record = await getAsset(tileset.assetId);
    if (!record) {
      throw new Error(`Missing image asset for Unity export: ${tileset.name}.`);
    }

    const extension = getFileExtensionFromMimeType(record.mimeType);
    const imagePath = createRelativeAssetPath(
      "images/source",
      tileset.name,
      extension,
      usedPaths,
    );
    const bytes = new Uint8Array(record.data);

    entries.push({
      path: imagePath,
      data: bytes,
    });
    manifestTilesets.push({
      id: tileset.id,
      name: tileset.name,
      imagePath,
      mimeType: record.mimeType,
      tileSize: tileset.tileSize,
      imageWidth: tileset.imageWidth,
      imageHeight: tileset.imageHeight,
      createdAt: tileset.createdAt,
    });
    sourceTilesetRecords.set(tileset.id as string, {
      tileset,
      mimeType: record.mimeType,
      bytes,
    });
  }

  return {
    entries,
    manifestTilesets,
    sourceTilesetRecords,
  };
}

async function cropTileImage(
  bytes: Uint8Array,
  mimeType: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
) {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: mimeType,
  });
  const bitmap = await createImageBitmap(blob);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to create a canvas context for Unity export.");
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const pngBlob = await canvasToPngBlob(canvas);
    if (!pngBlob) {
      throw new Error("Unable to encode cropped Unity tile image.");
    }

    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

async function buildUnityTileAssetEntries(
  layers: readonly TileLayer[],
  sourceTilesetRecords: ReadonlyMap<string, SourceTilesetRecord>,
  usedPaths: Set<string>,
) {
  const entries: ImportExportArchiveEntry[] = [];
  const descriptors = new Map<string, UnityTileAssetDescriptor>();

  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      const tileKey = getUnityTileKey(ref);
      if (descriptors.has(tileKey)) {
        continue;
      }

      const sourceRecord = sourceTilesetRecords.get(ref.tilesetId as string);
      if (!sourceRecord) {
        throw new Error("Unity export could not resolve a referenced tileset.");
      }

      const tileBaseName = `${sourceRecord.tileset.name}-${ref.sx}-${ref.sy}`;
      const imagePath = createRelativeAssetPath(
        "tiles/images",
        tileBaseName,
        ".png",
        usedPaths,
      );
      const tileAssetPath = createRelativeAssetPath(
        "tiles/assets",
        tileBaseName,
        ".asset",
        usedPaths,
      );
      const imageGuid = generateUnityGuid();
      const tileAssetGuid = generateUnityGuid();
      const croppedImage = await cropTileImage(
        sourceRecord.bytes,
        sourceRecord.mimeType,
        ref.sx,
        ref.sy,
        ref.sw,
        ref.sh,
      );

      entries.push({ path: imagePath, data: croppedImage });
      entries.push({
        path: `${imagePath}.meta`,
        data: encodeUnityTextFile(buildUnityTextureMetaFile(imageGuid)),
      });
      entries.push({
        path: tileAssetPath,
        data: encodeUnityTextFile(
          buildUnityTileAssetFile(tileBaseName, imageGuid),
        ),
      });
      entries.push({
        path: `${tileAssetPath}.meta`,
        data: encodeUnityTextFile(buildUnityGenericMetaFile(tileAssetGuid)),
      });

      descriptors.set(tileKey, {
        tileName: tileBaseName,
        tileAssetGuid,
      });
    }
  }

  return {
    entries,
    descriptors,
  };
}

function buildRootGameObjectBlock(
  rootGameObjectId: number,
  rootTransformId: number,
) {
  return [
    `--- !u!1 &${rootGameObjectId}`,
    "GameObject:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    "  serializedVersion: 6",
    "  m_Component:",
    `  - component: {fileID: ${rootTransformId}}`,
    `  - component: {fileID: ${rootTransformId + 1}}`,
    "  m_Layer: 0",
    "  m_Name: Grid",
    "  m_TagString: Untagged",
    "  m_Icon: {fileID: 0}",
    "  m_NavMeshLayer: 0",
    "  m_StaticEditorFlags: 0",
    "  m_IsActive: 1",
  ].join("\n");
}

function buildRootTransformBlock(
  rootGameObjectId: number,
  rootTransformId: number,
  childTransformIds: readonly number[],
) {
  return [
    `--- !u!4 &${rootTransformId}`,
    "Transform:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    `  m_GameObject: {fileID: ${rootGameObjectId}}`,
    "  serializedVersion: 2",
    "  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}",
    "  m_LocalPosition: {x: 0, y: 0, z: 0}",
    "  m_LocalScale: {x: 1, y: 1, z: 1}",
    "  m_ConstrainProportionsScale: 0",
    childTransformIds.length === 0 ? "  m_Children: []" : "  m_Children:",
    ...childTransformIds.map((id) => `  - {fileID: ${id}}`),
    "  m_Father: {fileID: 0}",
    "  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}",
  ].join("\n");
}

function buildGridBlock(rootGameObjectId: number, gridId: number) {
  return [
    `--- !u!156049354 &${gridId}`,
    "Grid:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    `  m_GameObject: {fileID: ${rootGameObjectId}}`,
    "  m_Enabled: 1",
    "  m_CellSize: {x: 1, y: 1, z: 0}",
    "  m_CellGap: {x: 0, y: 0, z: 0}",
    "  m_CellLayout: 0",
    "  m_CellSwizzle: 0",
  ].join("\n");
}

function buildLayerSection(
  map: TileMapData,
  layer: TileLayer,
  descriptorByKey: ReadonlyMap<string, UnityTileAssetDescriptor>,
  baseId: number,
  rootTransformId: number,
) {
  const layerGameObjectId = baseId;
  const layerTransformId = baseId + 1;
  const layerTilemapId = baseId + 2;
  const layerRendererId = baseId + 3;
  const uniqueTileKeys = [
    ...new Set(Object.values(layer.tiles).map(getUnityTileKey)),
  ];
  const tileIndexByKey = new Map(
    uniqueTileKeys.map((key, index) => [key, index]),
  );
  const tileAssetLines =
    uniqueTileKeys.length === 0
      ? ["  m_TileAssetArray: []"]
      : [
          "  m_TileAssetArray:",
          ...uniqueTileKeys.map((key) => {
            const descriptor = descriptorByKey.get(key);
            if (!descriptor) {
              throw new Error(
                "Unity export could not find a generated tile asset.",
              );
            }

            return `  - {fileID: 11400000, guid: ${descriptor.tileAssetGuid}, type: 2}`;
          }),
        ];
  const tileEntries = Object.entries(layer.tiles);
  const tileLines =
    tileEntries.length === 0
      ? ["  m_Tiles: []"]
      : [
          "  m_Tiles:",
          ...tileEntries.flatMap(([coordinate, ref]) => {
            const [xValue, yValue] = coordinate
              .split(",")
              .map((value) => Number(value));
            const matrix = buildUnityTileMatrix(ref);
            const tileIndex = tileIndexByKey.get(getUnityTileKey(ref)) ?? 0;
            const unityY = map.heightInTiles - yValue - 1;

            return [
              `  - first: {x: ${xValue}, y: ${unityY}, z: 0}`,
              "    second:",
              `      m_TileIndex: ${tileIndex}`,
              "      m_TileSpriteIndex: 0",
              "      m_Color: {r: 1, g: 1, b: 1, a: 1}",
              "      m_Matrix:",
              `        e00: ${matrix.e00}`,
              `        e01: ${matrix.e01}`,
              `        e02: ${matrix.e02}`,
              `        e03: ${matrix.e03}`,
              `        e10: ${matrix.e10}`,
              `        e11: ${matrix.e11}`,
              `        e12: ${matrix.e12}`,
              `        e13: ${matrix.e13}`,
              `        e20: ${matrix.e20}`,
              `        e21: ${matrix.e21}`,
              `        e22: ${matrix.e22}`,
              `        e23: ${matrix.e23}`,
              `        e30: ${matrix.e30}`,
              `        e31: ${matrix.e31}`,
              `        e32: ${matrix.e32}`,
              `        e33: ${matrix.e33}`,
            ];
          }),
        ];

  return [
    `--- !u!1 &${layerGameObjectId}`,
    "GameObject:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    "  serializedVersion: 6",
    "  m_Component:",
    `  - component: {fileID: ${layerTransformId}}`,
    `  - component: {fileID: ${layerTilemapId}}`,
    `  - component: {fileID: ${layerRendererId}}`,
    "  m_Layer: 0",
    `  m_Name: ${buildUnityLayerExportName(layer.name, layer.id)}`,
    "  m_TagString: Untagged",
    "  m_Icon: {fileID: 0}",
    "  m_NavMeshLayer: 0",
    "  m_StaticEditorFlags: 0",
    `  m_IsActive: ${layer.visible ? 1 : 0}`,
    `--- !u!4 &${layerTransformId}`,
    "Transform:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    `  m_GameObject: {fileID: ${layerGameObjectId}}`,
    "  serializedVersion: 2",
    "  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}",
    "  m_LocalPosition: {x: 0, y: 0, z: 0}",
    "  m_LocalScale: {x: 1, y: 1, z: 1}",
    "  m_ConstrainProportionsScale: 0",
    "  m_Children: []",
    `  m_Father: {fileID: ${rootTransformId}}`,
    "  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}",
    `--- !u!1839735485 &${layerTilemapId}`,
    "Tilemap:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    `  m_GameObject: {fileID: ${layerGameObjectId}}`,
    "  m_Enabled: 1",
    "  m_AnimationFrameRate: 1",
    "  m_Color: {r: 1, g: 1, b: 1, a: 1}",
    "  m_Origin: {x: 0, y: 0, z: 0}",
    `  m_Size: {x: ${map.widthInTiles}, y: ${map.heightInTiles}, z: 1}`,
    "  m_TileAnchor: {x: 0.5, y: 0.5, z: 0}",
    ...tileAssetLines,
    ...tileLines,
    "  m_TileSpriteArray: []",
    "  m_AnimatedTiles: []",
    `--- !u!483328833 &${layerRendererId}`,
    "TilemapRenderer:",
    "  m_ObjectHideFlags: 0",
    "  m_CorrespondingSourceObject: {fileID: 0}",
    "  m_PrefabInstance: {fileID: 0}",
    "  m_PrefabAsset: {fileID: 0}",
    `  m_GameObject: {fileID: ${layerGameObjectId}}`,
    "  m_Enabled: 1",
    "  m_SortOrder: 0",
    "  m_Mode: 0",
  ].join("\n");
}

function buildUnityPrefabText(
  prefabPath: string,
  map: TileMapData,
  layers: readonly TileLayer[],
  descriptorByKey: ReadonlyMap<string, UnityTileAssetDescriptor>,
) {
  const rootGameObjectId = 100000;
  const rootTransformId = 100001;
  const layerBaseIds = layers.map((_, index) => 200000 + index * 10);

  return [
    "%YAML 1.1",
    "%TAG !u! tag:unity3d.com,2011:",
    "# 2D Tiler Unity Tilemap bundle",
    `# Manifest: ${buildUnityBundleManifestPath(prefabPath)}`,
    buildRootGameObjectBlock(rootGameObjectId, rootTransformId),
    buildRootTransformBlock(
      rootGameObjectId,
      rootTransformId,
      layerBaseIds.map((baseId) => baseId + 1),
    ),
    buildGridBlock(rootGameObjectId, rootTransformId + 1),
    ...layers.map((layer, index) =>
      buildLayerSection(
        map,
        layer,
        descriptorByKey,
        layerBaseIds[index],
        rootTransformId,
      ),
    ),
    "",
  ].join("\n");
}

export async function exportUnityMapBundle(
  map: TileMapData,
  layers: readonly TileLayer[],
  tilesets: readonly Tileset[],
  imageLayers: readonly ImageLayer[],
  layerGroups: readonly LayerGroup[],
  objectLayers: readonly ObjectLayer[],
  objects: readonly MapObject[],
): Promise<ImportExportArchiveEntry[]> {
  assertUnityExportSupported(
    map,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
  );

  const referencedTilesets = getReferencedTilesets(layers, tilesets);
  const usedPaths = new Set<string>();
  const prefabName = `${sanitizeDownloadSegment(map.name, "Map")}.prefab`;
  const {
    entries: sourceTilesetEntries,
    manifestTilesets,
    sourceTilesetRecords,
  } = await buildSourceTilesetEntries(referencedTilesets, usedPaths);
  const { entries: tileAssetEntries, descriptors } =
    await buildUnityTileAssetEntries(layers, sourceTilesetRecords, usedPaths);
  const manifest: UnityBundleManifest = {
    version: 1,
    source: "2dtiler",
    map: {
      name: map.name,
      widthInTiles: map.widthInTiles,
      heightInTiles: map.heightInTiles,
      tileSize: map.tileSize,
      orientation: map.orientation,
    },
    sourceTilesets: manifestTilesets,
    layers: layers.map((layer) => ({
      exportId: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      cells: Object.entries(layer.tiles).map(([coordinate, ref]) => ({
        coordinate,
        tilesetId: ref.tilesetId,
        sx: ref.sx,
        sy: ref.sy,
        sw: ref.sw,
        sh: ref.sh,
        rotation: ref.rotation,
        flipX: ref.flipX,
        flipY: ref.flipY,
      })),
    })),
  };
  const manifestPath = buildUnityBundleManifestPath(prefabName);
  const prefabText = buildUnityPrefabText(prefabName, map, layers, descriptors);

  return [
    {
      path: prefabName,
      data: encodeUnityTextFile(prefabText),
    },
    {
      path: manifestPath,
      data: encodeUnityBundleManifest(manifest),
    },
    ...sourceTilesetEntries,
    ...tileAssetEntries,
  ];
}
