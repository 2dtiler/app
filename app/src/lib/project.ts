import type { Project, TileSize, Tileset, TilesetId } from "@/types";

const DEFAULT_TILE_SIZE: TileSize = 32;

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
