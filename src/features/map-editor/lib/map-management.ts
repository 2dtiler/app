import type { DeletedMapEntities } from "@/features/map-editor/types/asset-manager";
import type { MapId, Project } from "@/types";

export function deleteMapFromProject(
  project: Project,
  mapId: MapId,
): DeletedMapEntities {
  const layerIds = project.layers
    .filter((layer) => layer.mapId === mapId)
    .map((layer) => layer.id as string);
  const layerGroupIds = (project.layerGroups ?? [])
    .filter((group) => group.mapId === mapId)
    .map((group) => group.id as string);
  const objectLayerIds = (project.objectLayers ?? [])
    .filter((layer) => layer.mapId === mapId)
    .map((layer) => layer.id as string);
  const objectLayerIdSet = new Set(objectLayerIds);
  const objectIds = (project.objects ?? [])
    .filter((object) => objectLayerIdSet.has(object.layerId as string))
    .map((object) => object.id as string);

  project.layers = project.layers.filter((layer) => layer.mapId !== mapId);
  project.imageLayers = (project.imageLayers ?? []).filter(
    (layer) => layer.mapId !== mapId,
  );
  project.layerGroups = (project.layerGroups ?? []).filter(
    (group) => group.mapId !== mapId,
  );
  project.objectLayers = (project.objectLayers ?? []).filter(
    (layer) => layer.mapId !== mapId,
  );
  project.objects = (project.objects ?? []).filter(
    (object) => !objectLayerIdSet.has(object.layerId as string),
  );
  project.maps = project.maps.filter((map) => map.id !== mapId);

  return {
    layerIds,
    layerGroupIds,
    objectLayerIds,
    objectIds,
  };
}
