import type {
  Project,
  TileMapData,
  TileSize,
  Tileset,
  TilesetId,
} from "@/types";
import { DEFAULT_HEX_STAGGER_AXIS, DEFAULT_HEX_STAGGER_INDEX } from "@/types";
import { normalizeTextObject } from "./text-objects";

const DEFAULT_TILE_SIZE: TileSize = 32;
const IMAGE_LAYER_ROTATIONS = new Set([0, 90, 180, 270]);

export function getTilesetTileSize(
  tileset: Tileset | null | undefined,
  fallbackTileSize: TileSize,
): TileSize {
  return tileset?.tileSize ?? fallbackTileSize;
}

export function normalizeTileset(
  tileset: Tileset,
  fallbackTileSize: TileSize = DEFAULT_TILE_SIZE,
): Tileset {
  if (!tileset.tileSize) {
    tileset.tileSize = fallbackTileSize;
  }
  return tileset;
}

export function normalizeTileMap(map: TileMapData): TileMapData {
  map.orientation = map.orientation ?? "orthogonal";

  if (map.orientation === "hexagonal" || map.orientation === "staggered") {
    map.staggerAxis = map.staggerAxis ?? DEFAULT_HEX_STAGGER_AXIS;
    map.staggerIndex = map.staggerIndex ?? DEFAULT_HEX_STAGGER_INDEX;
  } else {
    delete map.staggerAxis;
    delete map.staggerIndex;
  }

  return map;
}

export function normalizeProject(project: Project): Project {
  const fallbackTileSize = project.tileSize ?? DEFAULT_TILE_SIZE;

  project.tileSize = fallbackTileSize;
  if (!project.terrains) {
    project.terrains = [];
  }
  if (!project.imageLayers) {
    project.imageLayers = [];
  }
  if (!project.objectLayers) {
    project.objectLayers = [];
  }
  if (!project.objects) {
    project.objects = [];
  }
  if (!project.overrideTilesets) {
    project.overrideTilesets = [];
  }

  for (const tileset of project.tilesets) {
    normalizeTileset(tileset, fallbackTileSize);
  }
  for (const tileset of project.overrideTilesets) {
    normalizeTileset(tileset, fallbackTileSize);
  }
  for (const map of project.maps) {
    normalizeTileMap(map);
  }
  for (const imageLayer of project.imageLayers) {
    if (typeof imageLayer.opacity !== "number") {
      imageLayer.opacity = 100;
    } else {
      imageLayer.opacity = Math.max(
        0,
        Math.min(100, Math.round(imageLayer.opacity)),
      );
    }

    imageLayer.rotation = IMAGE_LAYER_ROTATIONS.has(imageLayer.rotation ?? 0)
      ? imageLayer.rotation
      : 0;
    imageLayer.flipX = Boolean(imageLayer.flipX);
    imageLayer.flipY = Boolean(imageLayer.flipY);
  }

  for (const object of project.objects) {
    normalizeTextObject(object);
  }

  return project;
}

export function getActiveTilesetTileSize(
  project: Project,
  activeTilesetId: TilesetId | null,
): TileSize {
  const activeTileset = project.tilesets.find(
    (tileset) => tileset.id === activeTilesetId,
  );
  return getTilesetTileSize(activeTileset, project.tileSize);
}
