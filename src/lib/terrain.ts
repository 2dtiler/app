/**
 * terrain.ts — Utility functions for the Fill Terrain tool.
 *
 * The core algorithm is weighted random tile selection:
 * given an array of TerrainTile entries (each with a probability weight),
 * pick one tile at random proportional to its weight.
 */

import type { TerrainTile, TileRef } from "@/types";

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
