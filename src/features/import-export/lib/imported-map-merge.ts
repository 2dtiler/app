import { findLastLayerId } from "@/features/map-editor/lib/layers";
import {
  cloneImportedTileset,
  remapLayerTreeId,
  remapObjectPropertyValues,
  remapTileEntries,
} from "@/features/project-management/lib/project-import";
import type { EditorTravels } from "@/store/types";
import type {
  GodotMapImportResult,
  ImageLayer,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapGroupId,
  MapObject,
  ObjectId,
  ObjectLayer,
  Project,
  TiledMapImportResult,
  TileLayer,
  TilesetGroupId,
  TilesetId,
} from "@/types";
import {
  generateLayerGroupId,
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";

export function mergeImportedMapData(
  imported: TiledMapImportResult | GodotMapImportResult,
  currentProject: Project | null,
  activeMapGroupId: MapGroupId | null,
  activeTilesetGroupId: TilesetGroupId | null,
  setState: EditorTravels["setState"],
) {
  if (!currentProject) {
    return;
  }

  const {
    map,
    layers,
    tilesets,
    overrideTilesets = [],
    imageLayers: importedImageLayers,
    layerGroups: importedLayerGroups,
    objectLayers: importedObjectLayers,
    objects: importedObjects,
  } = imported;

  const targetMapGroupId =
    activeMapGroupId ?? currentProject.mapGroups[0]?.id ?? null;
  const targetTilesetGroupId =
    activeTilesetGroupId ?? currentProject.tilesetGroups[0]?.id ?? null;
  if (!targetMapGroupId || !targetTilesetGroupId) {
    return;
  }

  const newMapId = generateMapId();
  const layerIdMap = new Map<string, LayerId>();
  const groupIdMap = new Map<string, LayerGroupId>();
  const objectIdMap = new Map<string, ObjectId>();
  const tilesetIdMap = new Map<string, TilesetId>();

  for (const layer of layers) {
    layerIdMap.set(layer.id as string, generateLayerId());
  }
  for (const layer of importedImageLayers) {
    layerIdMap.set(layer.id as string, generateLayerId());
  }
  for (const layer of importedObjectLayers) {
    layerIdMap.set(layer.id as string, generateLayerId());
  }
  for (const group of importedLayerGroups) {
    groupIdMap.set(group.id as string, generateLayerGroupId());
  }
  for (const object of importedObjects) {
    objectIdMap.set(object.id as string, generateObjectId());
  }

  const reservedTilesetIds = new Set(
    [
      ...currentProject.tilesets,
      ...(currentProject.overrideTilesets ?? []),
    ].map((tileset) => tileset.id as string),
  );
  const reserveImportedTilesetId = (tilesetId: TilesetId): TilesetId => {
    const existingId = tilesetIdMap.get(tilesetId as string);
    if (existingId) {
      return existingId;
    }

    const nextId = reservedTilesetIds.has(tilesetId as string)
      ? generateTilesetId()
      : tilesetId;
    reservedTilesetIds.add(nextId as string);
    tilesetIdMap.set(tilesetId as string, nextId);
    return nextId;
  };

  for (const tileset of tilesets) {
    reserveImportedTilesetId(tileset.id);
  }
  for (const tileset of overrideTilesets) {
    reserveImportedTilesetId(tileset.id);
  }

  const remappedTilesets = tilesets.map((tileset) =>
    cloneImportedTileset(
      tileset,
      tilesetIdMap,
      targetTilesetGroupId as TilesetGroupId,
    ),
  );
  const remappedOverrideTilesets = overrideTilesets.map((tileset) =>
    cloneImportedTileset(
      tileset,
      tilesetIdMap,
      targetTilesetGroupId as TilesetGroupId,
    ),
  );
  const remappedLayers: TileLayer[] = layers.map((layer) => ({
    ...layer,
    id: layerIdMap.get(layer.id as string) ?? layer.id,
    mapId: newMapId,
    tiles: remapTileEntries(layer.tiles, tilesetIdMap),
  }));
  const remappedImageLayers: ImageLayer[] = importedImageLayers.map(
    (layer) => ({
      ...layer,
      id: layerIdMap.get(layer.id as string) ?? layer.id,
      mapId: newMapId,
    }),
  );
  const remappedObjectLayers: ObjectLayer[] = importedObjectLayers.map(
    (layer) => ({
      ...layer,
      id: layerIdMap.get(layer.id as string) ?? layer.id,
      mapId: newMapId,
      objectOrder: layer.objectOrder.map(
        (objectId) => objectIdMap.get(objectId as string) ?? objectId,
      ),
    }),
  );
  const remappedLayerGroups: LayerGroup[] = importedLayerGroups.map(
    (group) => ({
      ...group,
      id: groupIdMap.get(group.id as string) ?? group.id,
      mapId: newMapId,
      childOrder: group.childOrder.map((id) =>
        remapLayerTreeId(id, layerIdMap, groupIdMap),
      ),
    }),
  );
  const remappedObjects: MapObject[] = importedObjects.map((object) => ({
    ...object,
    id: objectIdMap.get(object.id as string) ?? object.id,
    layerId: (layerIdMap.get(object.layerId as string) ??
      object.layerId) as LayerId,
    points: object.points.map((point) => ({ ...point })),
    properties: remapObjectPropertyValues(object.properties, objectIdMap),
  }));
  const remappedMap = {
    ...map,
    id: newMapId,
    groupId: targetMapGroupId as MapGroupId,
    layerOrder: map.layerOrder.map((id) =>
      remapLayerTreeId(id, layerIdMap, groupIdMap),
    ),
    properties: remapObjectPropertyValues(map.properties ?? {}, objectIdMap),
    createdAt: Date.now(),
  };

  setState((draft) => {
    if (!draft.project) {
      return;
    }
    if (!draft.project.imageLayers) draft.project.imageLayers = [];
    if (!draft.project.layerGroups) draft.project.layerGroups = [];
    if (!draft.project.objectLayers) draft.project.objectLayers = [];
    if (!draft.project.objects) draft.project.objects = [];
    if (!draft.project.overrideTilesets) {
      draft.project.overrideTilesets = [];
    }

    for (const tileset of remappedTilesets) {
      draft.project.tilesets.push(tileset);
    }
    for (const tileset of remappedOverrideTilesets) {
      draft.project.overrideTilesets.push(tileset);
    }

    draft.project.maps.push(remappedMap);

    for (const layer of remappedLayers) {
      draft.project.layers.push(layer);
    }
    for (const layer of remappedImageLayers) {
      draft.project.imageLayers.push(layer);
    }
    for (const group of remappedLayerGroups) {
      draft.project.layerGroups.push(group);
    }
    for (const layer of remappedObjectLayers) {
      draft.project.objectLayers.push(layer);
    }
    for (const object of remappedObjects) {
      draft.project.objects.push(object);
    }

    draft.activeMapId = newMapId;
    draft.activeLayerId =
      findLastLayerId(
        remappedMap.layerOrder,
        remappedLayers,
        remappedLayerGroups,
        remappedImageLayers,
        remappedObjectLayers,
      ) ?? null;
    draft.activeMapGroupId = targetMapGroupId as MapGroupId;
  });
}
