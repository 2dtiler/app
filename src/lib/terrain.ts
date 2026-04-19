/**
 * terrain.ts — Utility functions for fill and fill-terrain behavior.
 */

import { getAdjacentMapCells } from "./map-geometry";
import type { TerrainTile, TileRef } from "@/types";
import type { FillRegionOptions } from "@/types/editor-helpers";

function sameTileSource(a: TileRef | null, b: TileRef | null) {
  return (
    a !== null &&
    b !== null &&
    a.tilesetId === b.tilesetId &&
    a.sx === b.sx &&
    a.sy === b.sy
  );
}

export function getFillRegion({
  map,
  layer,
  mapWidth,
  mapHeight,
  startX,
  startY,
  fillMode,
  selectedTile,
  activeFillTerrain,
}: FillRegionOptions): [number, number][] {
  if (startX < 0 || startY < 0 || startX >= mapWidth || startY >= mapHeight) {
    return [];
  }

  const isTerrain = fillMode === "fillTerrain";
  if (isTerrain) {
    if (!activeFillTerrain || activeFillTerrain.length === 0) return [];
  } else if (!selectedTile) {
    return [];
  }

  const targetTile = layer.tiles[`${startX},${startY}`] ?? null;

  const visited = new Set<string>();
  const queue: [number, number][] = [[startX, startY]];
  const toFill: [number, number][] = [];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const [x, y] = queue[queueIndex++];
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) continue;
    visited.add(key);

    const currentTile = layer.tiles[key] ?? null;
    const matchesTarget =
      (currentTile === null && targetTile === null) ||
      sameTileSource(currentTile, targetTile);

    if (!matchesTarget) continue;

    toFill.push([x, y]);
    for (const cell of getAdjacentMapCells(map, x, y)) {
      queue.push([cell.x, cell.y]);
    }
  }

  return toFill;
}

/**
 * Pick a tile from the terrain using weighted random selection.
 *
 * Algorithm (cumulative distribution function):
 *   1. Sum all probability weights.
 *   2. Generate a random number in [0, totalWeight).
 *   3. Walk through the tiles, accumulating weights until
 *      the running total exceeds the random number.
 *   4. Return that tile's TileRef.
 *
 * If all weights are 0 or the array is empty, returns null.
 */
export function pickWeightedTile(tiles: TerrainTile[]): TileRef | null {
  if (tiles.length === 0) return null;

  const totalWeight = tiles.reduce((sum, t) => sum + t.probability, 0);
  if (totalWeight <= 0) return null;

  const rand = Math.random() * totalWeight;
  let cumulative = 0;

  for (const tile of tiles) {
    cumulative += tile.probability;
    if (rand < cumulative) {
      return tile.tileRef;
    }
  }

  // Floating-point edge case — return the last tile
  return tiles[tiles.length - 1].tileRef;
}
