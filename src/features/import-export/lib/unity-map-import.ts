import {
  buildEntryMap,
  getProvidedEntry,
  importImageAsset,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import { normalizeBundlePath } from "@/features/import-export/lib/tiled-xml-utils";
import {
  UNITY_PREFAB_IMPORT_ACCEPT,
  buildUnityBundleManifestPath,
  getUnityTileKey,
  parseUnityBundleManifest,
} from "@/features/import-export/lib/unity-bundle-utils";
import { parseUnityPrefabTilemap } from "@/features/import-export/lib/unity-prefab-parser";
import type {
  ImportExportArchiveEntry,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  UnityBundleManifestLayer,
  UnityImportMissingResource,
  UnityMapImportPreparationResult,
  UnityMapImportResult,
} from "@/types";

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
    label: kind === "json" ? "2D Tiler Unity manifest" : "Source tileset image",
  });
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

  const layers = buildUnityImportLayers(
    requireProvidedEntry(providedEntries, rootPath),
    manifest.layers,
    mapId,
  );
  const prefab = tryParseUnityPrefab(
    requireProvidedEntry(providedEntries, rootPath),
  );

  return {
    map: {
      id: mapId,
      name: manifest.map.name,
      groupId: "unity-import-group" as TileMapData["groupId"],
      orientation: manifest.map.orientation,
      widthInTiles: prefab?.widthInTiles || manifest.map.widthInTiles,
      heightInTiles: prefab?.heightInTiles || manifest.map.heightInTiles,
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

function buildManifestOnlyLayer(
  layer: UnityBundleManifestLayer,
  index: number,
  mapId: TileMapData["id"],
) {
  return {
    id: `unity-layer-${index}` as TileLayer["id"],
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

function buildManifestLayerTileRefLookup(
  layer: UnityBundleManifestLayer | undefined,
) {
  if (!layer) {
    return [];
  }

  const tileRefs: TileRef[] = [];
  const seenTileKeys = new Set<string>();

  for (const cell of layer.cells) {
    const tileRef: TileRef = {
      tilesetId: cell.tilesetId,
      sx: cell.sx,
      sy: cell.sy,
      sw: cell.sw,
      sh: cell.sh,
      rotation: cell.rotation,
      flipX: cell.flipX,
      flipY: cell.flipY,
    };
    const tileKey = getUnityTileKey(tileRef);
    if (seenTileKeys.has(tileKey)) {
      continue;
    }

    seenTileKeys.add(tileKey);
    tileRefs.push(tileRef);
  }

  return tileRefs;
}

function buildPrefabLayerTiles(
  prefabLayer: ReturnType<typeof parseUnityPrefabTilemap>["layers"][number],
  manifestLayer: UnityBundleManifestLayer | undefined,
) {
  const manifestTileRefs = buildManifestLayerTileRefLookup(manifestLayer);

  return Object.fromEntries(
    prefabLayer.tiles.flatMap((tile) => {
      const manifestTileRef = manifestTileRefs[tile.tileIndex];
      if (!manifestTileRef) {
        return [];
      }

      return [
        [
          tile.coordinate,
          {
            ...manifestTileRef,
            rotation: tile.rotation,
            flipX: tile.flipX,
            flipY: tile.flipY,
          },
        ],
      ];
    }),
  );
}

function buildUnityImportLayers(
  prefabData: Uint8Array,
  manifestLayers: readonly UnityBundleManifestLayer[],
  mapId: TileMapData["id"],
) {
  const prefab = tryParseUnityPrefab(prefabData);
  if (!prefab) {
    return manifestLayers.map((layer, index) =>
      buildManifestOnlyLayer(layer, index, mapId),
    );
  }

  return prefab.layers.map((layer, index) => ({
    id: `unity-layer-${index}` as TileLayer["id"],
    mapId,
    name: layer.name,
    visible: layer.visible,
    locked: manifestLayers[index]?.locked ?? false,
    type: "tile" as const,
    tiles: buildPrefabLayerTiles(layer, manifestLayers[index]),
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
