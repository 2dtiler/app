import {
  buildEntryMap,
  getProvidedEntry,
  importImageAsset,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  normalizeBundlePath,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  UNITY_PREFAB_IMPORT_ACCEPT,
  buildUnityBundleManifestPath,
  parseUnityMetaGuid,
  parseUnityTileAssetTextureGuid,
  parseUnityBundleManifest,
  parseUnityTextureMetaTileSize,
} from "@/features/import-export/lib/unity-bundle-utils";
import { parseUnityPrefabTilemap } from "@/features/import-export/lib/unity-prefab-parser";
import { generateTilesetId } from "@/utils/ids";
import type {
  ImportExportArchiveEntry,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  UnityBundleManifest,
  UnityBundleManifestLayer,
  UnityImportMissingResource,
  UnityMapImportPreparationResult,
  UnityMapImportResult,
} from "@/types";
import { TILE_SIZES } from "@/types";

function coerceUnityTileSize(tileSize: number, context: string) {
  if (!TILE_SIZES.includes(tileSize as Tileset["tileSize"])) {
    throw new Error(
      `Unsupported Unity tile size ${tileSize} in ${normalizeBundlePath(context)}. Supported sizes are ${TILE_SIZES.join(", ")}.`,
    );
  }

  return tileSize as Tileset["tileSize"];
}

function getUnityMissingResourceLabel(
  kind: UnityImportMissingResource["kind"],
) {
  if (kind === "json") {
    return "2D Tiler Unity manifest";
  }
  if (kind === "asset") {
    return "Unity Tile asset";
  }
  if (kind === "meta") {
    return "Unity .meta file";
  }
  return "Unity texture image";
}

function addUnityMissingResource(
  missingResources: Map<string, UnityImportMissingResource>,
  path: string,
  kind: UnityImportMissingResource["kind"],
  referringPath: string,
) {
  const normalizedPath = normalizeBundlePath(path);
  if (missingResources.has(normalizedPath)) {
    return;
  }

  missingResources.set(normalizedPath, {
    path: normalizedPath,
    kind,
    referringPath: normalizeBundlePath(referringPath),
    label: getUnityMissingResourceLabel(kind),
  });
}

function buildMissingUnityTileAssetPath(guid: string) {
  return normalizeBundlePath(`.unity-missing/tiles/${guid}.asset`);
}

function buildMissingUnityTileAssetMetaPath(guid: string) {
  return `${buildMissingUnityTileAssetPath(guid)}.meta`;
}

function buildMissingUnityTexturePath(guid: string) {
  return normalizeBundlePath(`.unity-missing/textures/${guid}.png`);
}

function buildMissingUnityTextureMetaPath(guid: string) {
  return `${buildMissingUnityTexturePath(guid)}.meta`;
}

function buildUnityGuidResourceIndex(
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const resourcePathByGuid = new Map<string, string>();

  for (const [path, data] of providedEntries.entries()) {
    if (!path.toLowerCase().endsWith(".meta")) {
      continue;
    }

    const guid = parseUnityMetaGuid(data);
    if (!guid) {
      continue;
    }

    resourcePathByGuid.set(guid, path.slice(0, -5));
  }

  return resourcePathByGuid;
}

function getUsedUnityTileAssetGuids(
  prefab: ReturnType<typeof parseUnityPrefabTilemap>,
) {
  const tileAssetGuids = new Set<string>();

  for (const layer of prefab.layers) {
    for (const tile of layer.tiles) {
      const tileAssetGuid = layer.tileAssetGuids[tile.tileIndex];
      if (tileAssetGuid) {
        tileAssetGuids.add(tileAssetGuid);
      }
    }
  }

  return [...tileAssetGuids];
}

function collectUnityPrefabMissingResources(
  prefab: ReturnType<typeof parseUnityPrefabTilemap>,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  rootPath: string,
) {
  const missingResources = new Map<string, UnityImportMissingResource>();
  const resourcePathByGuid = buildUnityGuidResourceIndex(providedEntries);

  for (const tileAssetGuid of getUsedUnityTileAssetGuids(prefab)) {
    const tileAssetPath = resourcePathByGuid.get(tileAssetGuid);
    if (!tileAssetPath) {
      addUnityMissingResource(
        missingResources,
        buildMissingUnityTileAssetMetaPath(tileAssetGuid),
        "meta",
        rootPath,
      );
      addUnityMissingResource(
        missingResources,
        buildMissingUnityTileAssetPath(tileAssetGuid),
        "asset",
        rootPath,
      );
      continue;
    }

    const tileAssetData = getProvidedEntry(providedEntries, tileAssetPath);
    if (!tileAssetData) {
      addUnityMissingResource(
        missingResources,
        tileAssetPath,
        "asset",
        `${tileAssetPath}.meta`,
      );
      continue;
    }

    const textureGuid = parseUnityTileAssetTextureGuid(tileAssetData);
    if (!textureGuid) {
      throw new Error(
        `Unsupported Unity Tile asset: ${tileAssetPath}. Missing referenced sprite GUID.`,
      );
    }

    const texturePath = resourcePathByGuid.get(textureGuid);
    if (!texturePath) {
      addUnityMissingResource(
        missingResources,
        buildMissingUnityTextureMetaPath(textureGuid),
        "meta",
        tileAssetPath,
      );
      addUnityMissingResource(
        missingResources,
        buildMissingUnityTexturePath(textureGuid),
        "image",
        tileAssetPath,
      );
      continue;
    }

    if (!getProvidedEntry(providedEntries, texturePath)) {
      addUnityMissingResource(
        missingResources,
        texturePath,
        "image",
        `${texturePath}.meta`,
      );
    }
  }

  return missingResources;
}

async function importManifestSourceTilesets(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  manifest: UnityBundleManifest,
) {
  const tilesets: Tileset[] = [];

  for (const descriptor of manifest.sourceTilesets) {
    const importedAsset = await importImageAsset(
      descriptor.imagePath,
      requireProvidedEntry(providedEntries, descriptor.imagePath),
    );

    tilesets.push({
      id: descriptor.id,
      name: descriptor.name,
      groupId: "unity-import-tilesets" as Tileset["groupId"],
      tileSize: descriptor.tileSize,
      assetId: importedAsset.assetId,
      imageWidth: descriptor.imageWidth,
      imageHeight: descriptor.imageHeight,
      createdAt: descriptor.createdAt,
    });
  }

  return tilesets;
}

function inferUnityPrefabTileSize(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  prefab: ReturnType<typeof parseUnityPrefabTilemap>,
) {
  const resourcePathByGuid = buildUnityGuidResourceIndex(providedEntries);
  const inferredTileSizes = new Set<number>();

  for (const tileAssetGuid of getUsedUnityTileAssetGuids(prefab)) {
    const tileAssetPath = resourcePathByGuid.get(tileAssetGuid);
    if (!tileAssetPath) {
      throw new Error(
        `Missing Unity Tile asset metadata for GUID ${tileAssetGuid}.`,
      );
    }

    const tileAssetData = requireProvidedEntry(providedEntries, tileAssetPath);
    const textureGuid = parseUnityTileAssetTextureGuid(tileAssetData);
    if (!textureGuid) {
      throw new Error(
        `Unsupported Unity Tile asset: ${tileAssetPath}. Missing referenced sprite GUID.`,
      );
    }

    const texturePath = resourcePathByGuid.get(textureGuid);
    if (!texturePath) {
      throw new Error(
        `Missing Unity texture metadata for GUID ${textureGuid} referenced by ${tileAssetPath}.`,
      );
    }

    const textureMetaPath = `${texturePath}.meta`;
    const inferredTileSize = parseUnityTextureMetaTileSize(
      requireProvidedEntry(providedEntries, textureMetaPath),
    );
    if (!inferredTileSize) {
      throw new Error(
        `Unity texture metadata is missing tile slicing information: ${normalizeBundlePath(textureMetaPath)}.`,
      );
    }

    inferredTileSizes.add(inferredTileSize);
  }

  if (inferredTileSizes.size === 0) {
    return null;
  }

  if (inferredTileSizes.size > 1) {
    throw new Error(
      "Unity import found multiple tile sizes across referenced textures. Use a consistent slice size before importing.",
    );
  }

  return coerceUnityTileSize(
    [...inferredTileSizes][0],
    "Unity texture metadata",
  );
}

async function resolveUnityPrefabTileAssets(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  prefab: ReturnType<typeof parseUnityPrefabTilemap>,
  tileSize: number,
) {
  const resourcePathByGuid = buildUnityGuidResourceIndex(providedEntries);
  const tileRefByTileAssetGuid = new Map<string, TileRef>();
  const tilesets: Tileset[] = [];

  for (const tileAssetGuid of getUsedUnityTileAssetGuids(prefab)) {
    if (tileRefByTileAssetGuid.has(tileAssetGuid)) {
      continue;
    }

    const tileAssetPath = resourcePathByGuid.get(tileAssetGuid);
    if (!tileAssetPath) {
      throw new Error(
        `Missing Unity Tile asset metadata for GUID ${tileAssetGuid}.`,
      );
    }

    const tileAssetData = requireProvidedEntry(providedEntries, tileAssetPath);
    const textureGuid = parseUnityTileAssetTextureGuid(tileAssetData);
    if (!textureGuid) {
      throw new Error(
        `Unsupported Unity Tile asset: ${tileAssetPath}. Missing referenced sprite GUID.`,
      );
    }

    const texturePath = resourcePathByGuid.get(textureGuid);
    if (!texturePath) {
      throw new Error(
        `Missing Unity texture metadata for GUID ${textureGuid} referenced by ${tileAssetPath}.`,
      );
    }

    const importedAsset = await importImageAsset(
      texturePath,
      requireProvidedEntry(providedEntries, texturePath),
    );
    const tilesetId = generateTilesetId();
    const tilesetName =
      stripExtension(tileAssetPath.split("/").pop() ?? tileAssetGuid) ||
      tileAssetGuid;

    tilesets.push({
      id: tilesetId,
      name: tilesetName,
      groupId: "unity-import-tilesets" as Tileset["groupId"],
      tileSize: tileSize as Tileset["tileSize"],
      assetId: importedAsset.assetId,
      imageWidth: importedAsset.width,
      imageHeight: importedAsset.height,
      createdAt: Date.now(),
    });
    tileRefByTileAssetGuid.set(tileAssetGuid, {
      tilesetId,
      sx: 0,
      sy: 0,
      sw: tileSize,
      sh: tileSize,
    });
  }

  return {
    tilesets,
    tileRefByTileAssetGuid,
  };
}

function getManifestLayerForPrefabLayer(
  prefabLayer: ReturnType<typeof parseUnityPrefabTilemap>["layers"][number],
  manifestLayers: readonly UnityBundleManifestLayer[],
  index: number,
) {
  if (prefabLayer.exportId) {
    const manifestLayer = manifestLayers.find(
      (layer) => layer.exportId === prefabLayer.exportId,
    );
    if (manifestLayer) {
      return manifestLayer;
    }
  }

  return manifestLayers[index];
}

async function importUnityMapEntries(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  manifestPath: string,
  rootPath: string,
): Promise<UnityMapImportResult> {
  const manifest = parseUnityBundleManifest(
    requireProvidedEntry(providedEntries, manifestPath),
  );
  const mapId = "unity-import-map" as TileMapData["id"];
  const prefabData = requireProvidedEntry(providedEntries, rootPath);
  const prefab = tryParseUnityPrefab(prefabData);

  if (!prefab) {
    const tilesets = await importManifestSourceTilesets(
      providedEntries,
      manifest,
    );
    const layers = buildUnityImportLayersFromManifest(manifest.layers, mapId);

    return {
      map: {
        id: mapId,
        name: manifest.map.name,
        groupId: "unity-import-group" as TileMapData["groupId"],
        orientation: manifest.map.orientation,
        widthInTiles: manifest.map.widthInTiles,
        heightInTiles: manifest.map.heightInTiles,
        tileSize: manifest.map.tileSize,
        properties: {},
        layerOrder: layers.map((layer) => layer.id),
        createdAt: Date.now(),
      },
      layers,
      tilesets,
      imageLayers: [],
      layerGroups: [],
      objectLayers: [],
      objects: [],
    };
  }

  const prefabTileSize =
    inferUnityPrefabTileSize(providedEntries, prefab) ?? manifest.map.tileSize;
  const mapName =
    stripExtension(
      normalizeBundlePath(rootPath).split("/").pop() ?? rootPath,
    ) || manifest.map.name;

  const { tilesets, tileRefByTileAssetGuid } =
    await resolveUnityPrefabTileAssets(providedEntries, prefab, prefabTileSize);

  const layers = buildUnityImportLayersFromPrefab(
    prefab,
    manifest.layers,
    mapId,
    tileRefByTileAssetGuid,
  );

  return {
    map: {
      id: mapId,
      name: mapName,
      groupId: "unity-import-group" as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles: prefab.widthInTiles,
      heightInTiles: prefab.heightInTiles,
      tileSize: prefabTileSize,
      properties: {},
      layerOrder: layers.map((layer) => layer.id),
      createdAt: Date.now(),
    },
    layers,
    tilesets,
    imageLayers: [],
    layerGroups: [],
    objectLayers: [],
    objects: [],
  };
}

function buildManifestOnlyLayer(
  layer: UnityBundleManifestLayer,
  index: number,
  mapId: TileMapData["id"],
) {
  return {
    id: (layer.exportId ?? `unity-layer-${index}`) as TileLayer["id"],
    mapId,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    type: "tile" as const,
    tiles: Object.fromEntries(
      layer.cells.map((cell) => [
        cell.coordinate,
        {
          tilesetId: cell.tilesetId,
          sx: cell.sx,
          sy: cell.sy,
          sw: cell.sw,
          sh: cell.sh,
          rotation: cell.rotation,
          flipX: cell.flipX,
          flipY: cell.flipY,
        },
      ]),
    ),
  };
}

function tryParseUnityPrefab(prefabData: Uint8Array) {
  try {
    return parseUnityPrefabTilemap(prefabData);
  } catch {
    return null;
  }
}

function buildPrefabLayerTiles(
  prefabLayer: ReturnType<typeof parseUnityPrefabTilemap>["layers"][number],
  tileRefByTileAssetGuid: ReadonlyMap<string, TileRef>,
) {
  return Object.fromEntries(
    prefabLayer.tiles.flatMap((tile) => {
      const tileAssetGuid = prefabLayer.tileAssetGuids[tile.tileIndex];
      const tileRef = tileAssetGuid
        ? tileRefByTileAssetGuid.get(tileAssetGuid)
        : undefined;
      if (!tileRef) {
        return [];
      }

      return [
        [
          tile.coordinate,
          {
            ...tileRef,
            rotation: tile.rotation,
            flipX: tile.flipX,
            flipY: tile.flipY,
          },
        ],
      ];
    }),
  );
}

function buildUnityImportLayersFromManifest(
  manifestLayers: readonly UnityBundleManifestLayer[],
  mapId: TileMapData["id"],
) {
  return manifestLayers.map((layer, index) =>
    buildManifestOnlyLayer(layer, index, mapId),
  );
}

function buildUnityImportLayersFromPrefab(
  prefab: ReturnType<typeof parseUnityPrefabTilemap>,
  manifestLayers: readonly UnityBundleManifestLayer[],
  mapId: TileMapData["id"],
  tileRefByTileAssetGuid: ReadonlyMap<string, TileRef>,
) {
  return prefab.layers.map((layer, index) => ({
    id: (layer.exportId ??
      getManifestLayerForPrefabLayer(layer, manifestLayers, index)?.exportId ??
      `unity-layer-${index}`) as TileLayer["id"],
    mapId,
    name: layer.name,
    visible: layer.visible,
    locked:
      getManifestLayerForPrefabLayer(layer, manifestLayers, index)?.locked ??
      false,
    type: "tile" as const,
    tiles: buildPrefabLayerTiles(layer, tileRefByTileAssetGuid),
  }));
}

export async function prepareUnityMapImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<UnityMapImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  if (!normalizedRootPath.toLowerCase().endsWith(".prefab")) {
    throw new Error(
      "Select a Unity Tilemap prefab file (.prefab) to import a map.",
    );
  }

  const providedEntries = buildEntryMap(entries);
  const manifestPath = buildUnityBundleManifestPath(normalizedRootPath);
  const missingResources = new Map<string, UnityImportMissingResource>();
  const manifestData = getProvidedEntry(providedEntries, manifestPath);

  if (!manifestData) {
    addUnityMissingResource(
      missingResources,
      manifestPath,
      "json",
      normalizedRootPath,
    );
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources: [...missingResources.values()],
    };
  }

  const manifest = parseUnityBundleManifest(manifestData);
  const prefab = tryParseUnityPrefab(
    requireProvidedEntry(providedEntries, normalizedRootPath),
  );

  if (prefab) {
    const prefabMissingResources = collectUnityPrefabMissingResources(
      prefab,
      providedEntries,
      normalizedRootPath,
    );

    for (const [path, resource] of prefabMissingResources.entries()) {
      missingResources.set(path, resource);
    }
  } else {
    for (const descriptor of manifest.sourceTilesets) {
      if (!getProvidedEntry(providedEntries, descriptor.imagePath)) {
        addUnityMissingResource(
          missingResources,
          descriptor.imagePath,
          "image",
          manifestPath,
        );
      }
    }
  }

  if (missingResources.size > 0) {
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources: [...missingResources.values()],
    };
  }

  return {
    status: "ready",
    result: await importUnityMapEntries(
      providedEntries,
      manifestPath,
      normalizedRootPath,
    ),
  };
}

export { UNITY_PREFAB_IMPORT_ACCEPT };
