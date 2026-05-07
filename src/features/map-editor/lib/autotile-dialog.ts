import {
  AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE,
  AUTOTILE_WANG_ID_LENGTH,
  AUTOTILE_WANG_POSITION_INDEXES,
  AUTOTILE_CONFIG_VERSION,
  type AutotileConfig,
  type AutotilePatternSlotId,
  type AutotilePresetId,
  type AutotileTerrain,
  type AutotileTileRegion,
  type AutotileWangColor,
  type AutotileWangId,
  type AutotileWangSet,
  type AutotileWangSetType,
  type AutotileWangTile,
} from "@/types";
import {
  AUTOTILE_PATTERN_SLOTS,
  getAutotilePresetDefinition,
} from "@/features/map-editor/lib/autotile-preset-rules";
import type { AutotileSelectionTarget } from "@/features/map-editor/types/dialogs";
import type { AutotileAssignmentGroupDefinition } from "@/features/map-editor/types/autotile-dialog";
import { generateAutotileWangSetId } from "@/utils/ids";

export const DEFAULT_AUTOTILE_PRESET_ID: AutotilePresetId = "edges-corners";

const INSIDE_CORNER_SLOT_IDS = [
  "innerCornerNorthWest",
  "innerCornerNorthEast",
  "innerCornerSouthWest",
  "innerCornerSouthEast",
] as const satisfies readonly AutotilePatternSlotId[];

const EDGE_OUTSIDE_GROUP: AutotileAssignmentGroupDefinition = {
  id: "edges-outside",
  title: "Edges + Outside Corners",
  description:
    "Assign the center paint tile first, then fill the surrounding edge and outside-corner tiles.",
  cells: [
    { slotId: "outerCornerNorthWest", row: 0, column: 0 },
    { slotId: "edgeNorth", row: 0, column: 1 },
    { slotId: "outerCornerNorthEast", row: 0, column: 2 },
    { slotId: "edgeWest", row: 1, column: 0 },
    { slotId: "edgeEast", row: 1, column: 2 },
    { slotId: "outerCornerSouthWest", row: 2, column: 0 },
    { slotId: "edgeSouth", row: 2, column: 1 },
    { slotId: "outerCornerSouthEast", row: 2, column: 2 },
  ],
};

const INSIDE_CORNER_GROUP: AutotileAssignmentGroupDefinition = {
  id: "inside-corners",
  title: "Inside Corners",
  description:
    "Use these cut-in tiles when the terrain wraps around an empty inside corner.",
  cells: [
    { slotId: "innerCornerNorthWest", row: 0, column: 0 },
    { slotId: "innerCornerNorthEast", row: 0, column: 2 },
    { slotId: "innerCornerSouthWest", row: 2, column: 0 },
    { slotId: "innerCornerSouthEast", row: 2, column: 2 },
  ],
};

const DEFAULT_WANG_COLORS = ["#57a773", "#3a86ff", "#f2c14e", "#ef476f"];

function normalizeTerrain(terrain: AutotileTerrain): AutotileTerrain {
  return {
    ...terrain,
    patternTiles: terrain.patternTiles ?? {},
  };
}

function createEmptyWangId(): AutotileWangId {
  return Array.from(
    { length: AUTOTILE_WANG_ID_LENGTH },
    () => 0,
  ) as AutotileWangId;
}

export function normalizeWangIdForSetType(
  wangId: readonly number[] | undefined,
  type: AutotileWangSetType,
): AutotileWangId {
  const normalized = createEmptyWangId();
  const activeIndexes = new Set<number>(
    AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE[type].map(
      (position) => AUTOTILE_WANG_POSITION_INDEXES[position],
    ),
  );

  for (let index = 0; index < AUTOTILE_WANG_ID_LENGTH; index += 1) {
    const value = Number(wangId?.[index] ?? 0);
    normalized[index] =
      activeIndexes.has(index) && Number.isInteger(value) && value >= 0
        ? value
        : 0;
  }

  return normalized;
}

function normalizeWangColor(color: AutotileWangColor): AutotileWangColor {
  return {
    index: color.index,
    name: color.name,
    color: color.color,
    tile: color.tile ?? null,
    probability:
      Number.isFinite(color.probability) && color.probability >= 0
        ? color.probability
        : 1,
  };
}

function normalizeWangTile(
  tile: AutotileWangTile,
  type: AutotileWangSetType,
): AutotileWangTile {
  return {
    tile: tile.tile ?? null,
    wangId: normalizeWangIdForSetType(tile.wangId, type),
    probability:
      Number.isFinite(tile.probability) && tile.probability >= 0
        ? tile.probability
        : 1,
  };
}

function normalizeWangSet(wangSet: AutotileWangSet): AutotileWangSet {
  const type = wangSet.type ?? "edge";

  return {
    ...wangSet,
    type,
    tile: wangSet.tile ?? null,
    colors: (wangSet.colors ?? []).map(normalizeWangColor),
    tiles: (wangSet.tiles ?? []).map((tile) => normalizeWangTile(tile, type)),
  };
}

export function createDefaultWangColor(index: number): AutotileWangColor {
  return {
    index,
    name: `Color ${index}`,
    color: DEFAULT_WANG_COLORS[(index - 1) % DEFAULT_WANG_COLORS.length],
    tile: null,
    probability: 1,
  };
}

export function createDefaultWangSet(order: number): AutotileWangSet {
  return {
    id: generateAutotileWangSetId(),
    name: `Wang Set ${order}`,
    type: "edge",
    tile: null,
    colors: [createDefaultWangColor(1), createDefaultWangColor(2)],
    tiles: [],
  };
}

export function createDefaultWangTile(
  type: AutotileWangSetType,
): AutotileWangTile {
  return {
    tile: null,
    wangId: normalizeWangIdForSetType(undefined, type),
    probability: 1,
  };
}

export function createEmptyAutotileConfig(): AutotileConfig {
  return {
    version: AUTOTILE_CONFIG_VERSION,
    preset: DEFAULT_AUTOTILE_PRESET_ID,
    terrains: [],
    rules: [],
    wangSets: [],
  };
}

export function cloneAutotileConfig(
  autotile: AutotileConfig | null | undefined,
): AutotileConfig {
  if (!autotile) {
    return createEmptyAutotileConfig();
  }

  const cloned = JSON.parse(JSON.stringify(autotile)) as AutotileConfig;

  const normalized: AutotileConfig = {
    version: cloned.version,
    preset: cloned.preset ?? DEFAULT_AUTOTILE_PRESET_ID,
    terrains: cloned.terrains.map(normalizeTerrain),
    rules: cloned.rules ?? [],
  };

  if (cloned.wangSets) {
    normalized.wangSets = cloned.wangSets.map(normalizeWangSet);
  }

  return normalized;
}

export function deleteWangSetFromAutotileConfig(
  autotile: AutotileConfig,
  wangSetId: AutotileWangSet["id"],
  fallbackPreset: AutotilePresetId = DEFAULT_AUTOTILE_PRESET_ID,
): AutotileConfig {
  const remainingWangSets = (autotile.wangSets ?? []).filter(
    (wangSet) => wangSet.id !== wangSetId,
  );

  if (remainingWangSets.length > 0) {
    return {
      ...autotile,
      wangSets: remainingWangSets,
    };
  }

  return {
    ...autotile,
    preset:
      fallbackPreset === "wang-named-colors"
        ? DEFAULT_AUTOTILE_PRESET_ID
        : fallbackPreset,
    wangSets: undefined,
  };
}

export function assignTileToSelectionTarget(
  autotile: AutotileConfig,
  target: AutotileSelectionTarget,
  tile: AutotileTileRegion | null,
): AutotileConfig {
  if (target.type === "terrain" || target.type === "pattern") {
    return {
      ...autotile,
      terrains: autotile.terrains.map((terrain) => {
        if (terrain.id !== target.terrainId) {
          return terrain;
        }

        if (target.type === "terrain") {
          return {
            ...terrain,
            paletteTile: tile,
          };
        }

        return {
          ...terrain,
          patternTiles: {
            ...(terrain.patternTiles ?? {}),
            [target.slotId]: tile,
          },
        };
      }),
    };
  }

  return {
    ...autotile,
    wangSets: (autotile.wangSets ?? []).map((wangSet) => {
      if (wangSet.id !== target.wangSetId) {
        return wangSet;
      }

      if (target.type === "wangSetTile") {
        return {
          ...wangSet,
          tile,
        };
      }

      if (target.type === "wangColorTile") {
        return {
          ...wangSet,
          colors: wangSet.colors.map((color) =>
            color.index === target.colorIndex
              ? {
                  ...color,
                  tile,
                }
              : color,
          ),
        };
      }

      return {
        ...wangSet,
        tiles: wangSet.tiles.map((wangTile, tileIndex) =>
          tileIndex === target.tileIndex
            ? {
                ...wangTile,
                tile,
              }
            : wangTile,
        ),
      };
    }),
  };
}

export function getTargetTile(
  autotile: AutotileConfig,
  target: AutotileSelectionTarget | null,
): AutotileTileRegion | null {
  if (!target) {
    return null;
  }

  if (
    target.type === "wangSetTile" ||
    target.type === "wangColorTile" ||
    target.type === "wangTile"
  ) {
    const wangSet = autotile.wangSets?.find(
      (candidate) => candidate.id === target.wangSetId,
    );

    if (!wangSet) {
      return null;
    }

    if (target.type === "wangSetTile") {
      return wangSet.tile;
    }

    if (target.type === "wangColorTile") {
      return (
        wangSet.colors.find((color) => color.index === target.colorIndex)
          ?.tile ?? null
      );
    }

    return wangSet.tiles[target.tileIndex]?.tile ?? null;
  }

  const terrain = autotile.terrains.find(
    (candidate) => candidate.id === target.terrainId,
  );

  if (!terrain) {
    return null;
  }

  if (target.type === "terrain") {
    return terrain.paletteTile;
  }

  return terrain.patternTiles?.[target.slotId] ?? null;
}

export function countConfiguredAssignments(
  terrain: AutotileTerrain,
  slotIds: readonly AutotilePatternSlotId[],
): number {
  return slotIds.reduce((count, slotId) => {
    return terrain.patternTiles?.[slotId] ? count + 1 : count;
  }, 0);
}

export function getAutotileActiveSlotIds(
  presetId: AutotileConfig["preset"],
): AutotilePatternSlotId[] {
  const preset = getAutotilePresetDefinition(presetId);
  return [...preset.requiredSlots, ...preset.optionalSlots];
}

export function getAutotileAssignmentGroups(
  presetId: AutotileConfig["preset"],
): AutotileAssignmentGroupDefinition[] {
  const preset = getAutotilePresetDefinition(presetId);

  if (
    preset.editorLayout === "cards" ||
    preset.editorLayout === "wang" ||
    preset.editorLayout === "wang-named"
  ) {
    return [];
  }

  const activeSlotIds = new Set([
    ...preset.requiredSlots,
    ...preset.optionalSlots,
  ]);
  const groups = [EDGE_OUTSIDE_GROUP];

  if (INSIDE_CORNER_SLOT_IDS.some((slotId) => activeSlotIds.has(slotId))) {
    groups.push(INSIDE_CORNER_GROUP);
  }

  return groups;
}

export function getSelectionInstructions(
  draft: AutotileConfig,
  target: AutotileSelectionTarget | null,
): string {
  if (!target) {
    return draft.preset === "wang-named-colors"
      ? "Select a Wang set tile, color tile, or Wang tile assignment on the right, then click a tile in the picker."
      : "Select the center paint tile or a pattern tile on the right, then click a tile in the picker.";
  }

  if (
    target.type === "wangSetTile" ||
    target.type === "wangColorTile" ||
    target.type === "wangTile"
  ) {
    const wangSet = draft.wangSets?.find(
      (candidate) => candidate.id === target.wangSetId,
    );
    const wangSetName = wangSet?.name || "this Wang set";

    if (target.type === "wangSetTile") {
      return `Click a tile to use as the representative tile for ${wangSetName}.`;
    }

    if (target.type === "wangColorTile") {
      const colorName =
        wangSet?.colors.find((color) => color.index === target.colorIndex)
          ?.name ?? `Color ${target.colorIndex}`;
      return `Click a tile to use as the palette tile for ${colorName}.`;
    }

    return `Click a tile to use for Wang tile assignment ${target.tileIndex + 1}.`;
  }

  const terrain = draft.terrains.find(
    (candidate) => candidate.id === target.terrainId,
  );
  const terrainName = terrain?.name || "This terrain";

  if (target.type === "terrain") {
    return `Click a tile to use as the paint tile for ${terrainName}.`;
  }

  return `Click a tile to use for ${terrainName} -> ${AUTOTILE_PATTERN_SLOTS[target.slotId].label}.`;
}

export function hasPatternAssignments(terrain: AutotileTerrain): boolean {
  return Object.values(terrain.patternTiles ?? {}).some(Boolean);
}
