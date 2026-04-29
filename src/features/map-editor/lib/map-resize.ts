import type { MapId, Project, PropertyValue, TileRef } from "@/types";

export interface ApplyMapResizeOptions {
  mapId: MapId;
  width: number;
  height: number;
  properties?: Record<string, PropertyValue>;
  originOffsetXInTiles?: number;
  originOffsetYInTiles?: number;
}

function remapLayerTiles(
  tiles: Record<string, TileRef>,
  width: number,
  height: number,
  offsetXInTiles: number,
  offsetYInTiles: number,
): Record<string, TileRef> {
  const nextTiles: Record<string, TileRef> = {};

  for (const [key, tileRef] of Object.entries(tiles)) {
    const [x, y] = key.split(",").map(Number);
    const nextX = x + offsetXInTiles;
    const nextY = y + offsetYInTiles;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
      continue;
    }
    nextTiles[`${nextX},${nextY}`] = tileRef;
  }

  return nextTiles;
}

export function applyMapResizeToProject(
  project: Project,
  {
    mapId,
    width,
    height,
    properties,
    originOffsetXInTiles = 0,
    originOffsetYInTiles = 0,
  }: ApplyMapResizeOptions,
): boolean {
  const map = project.maps.find((entry) => entry.id === mapId);
  if (!map) {
    return false;
  }

  map.widthInTiles = width;
  map.heightInTiles = height;
  if (properties) {
    map.properties = properties;
  }

  for (const layer of project.layers) {
    if (layer.mapId !== map.id) {
      continue;
    }
    layer.tiles = remapLayerTiles(
      layer.tiles,
      width,
      height,
      originOffsetXInTiles,
      originOffsetYInTiles,
    );
  }

  const pixelOffsetX = originOffsetXInTiles * map.tileSize;
  const pixelOffsetY = originOffsetYInTiles * map.tileSize;

  if (pixelOffsetX !== 0 || pixelOffsetY !== 0) {
    for (const imageLayer of project.imageLayers) {
      if (imageLayer.mapId !== map.id) {
        continue;
      }
      imageLayer.x += pixelOffsetX;
      imageLayer.y += pixelOffsetY;
    }

    const objectLayerIds = new Set(
      project.objectLayers
        .filter((layer) => layer.mapId === map.id)
        .map((layer) => layer.id),
    );

    for (const object of project.objects) {
      if (!objectLayerIds.has(object.layerId)) {
        continue;
      }
      object.x += pixelOffsetX;
      object.y += pixelOffsetY;
    }
  }

  return true;
}
