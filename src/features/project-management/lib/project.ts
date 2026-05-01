import { normalizeTextObject } from "@/features/map-editor/lib/text-objects";
import type {
  Project,
  TileMapData,
  TileSize,
  Tileset,
  TilesetId,
} from "@/types";
import {
  AUTOTILE_CONFIG_VERSION,
  DEFAULT_HEX_STAGGER_AXIS,
  DEFAULT_HEX_STAGGER_INDEX,
  TILESET_ANIMATION_CONFIG_VERSION,
} from "@/types";

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

  if (tileset.autotile) {
    tileset.autotile.version = AUTOTILE_CONFIG_VERSION;
    if (!Array.isArray(tileset.autotile.terrains)) {
      tileset.autotile.terrains = [];
    }
    if (!Array.isArray(tileset.autotile.rules)) {
      tileset.autotile.rules = [];
    }
  }

  if (tileset.animations) {
    tileset.animations.version = TILESET_ANIMATION_CONFIG_VERSION;
    if (!Array.isArray(tileset.animations.animations)) {
      tileset.animations.animations = [];
    }
    tileset.animations.animations = tileset.animations.animations.map(
      (animation) => {
        const widthInTiles = Math.max(
          1,
          Math.round(Number(animation.widthInTiles) || 1),
        );
        const heightInTiles = Math.max(
          1,
          Math.round(Number(animation.heightInTiles) || 1),
        );
        const cellCount = widthInTiles * heightInTiles;
        const frames = Array.isArray(animation.frames) ? animation.frames : [];

        return {
          ...animation,
          name: animation.name || "Animation",
          widthInTiles,
          heightInTiles,
          frames: frames.map((frame) => {
            const cells = Array.isArray(frame.cells) ? frame.cells : [];

            return {
              durationMs: Math.max(
                1,
                Math.round(Number(frame.durationMs) || 120),
              ),
              cells: Array.from(
                { length: cellCount },
                (_, index) => cells[index] ?? null,
              ),
            };
          }),
        };
      },
    );
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
