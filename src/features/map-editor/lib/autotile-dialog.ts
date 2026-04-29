import {
  AUTOTILE_CONFIG_VERSION,
  type AutotileConfig,
  type AutotilePatternSlotId,
  type AutotilePresetId,
  type AutotileTerrain,
  type AutotileTileRegion,
} from "@/types";
import {
  AUTOTILE_PATTERN_SLOTS,
  getAutotilePresetDefinition,
} from "@/features/map-editor/lib/autotile-preset-rules";
import type { AutotileSelectionTarget } from "@/features/map-editor/types/dialogs";
import type { AutotileAssignmentGroupDefinition } from "@/features/map-editor/types/autotile-dialog";

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

function normalizeTerrain(terrain: AutotileTerrain): AutotileTerrain {
  return {
    ...terrain,
    patternTiles: terrain.patternTiles ?? {},
  };
}

export function createEmptyAutotileConfig(): AutotileConfig {
  return {
    version: AUTOTILE_CONFIG_VERSION,
    preset: DEFAULT_AUTOTILE_PRESET_ID,
    terrains: [],
    rules: [],
  };
}

export function cloneAutotileConfig(
  autotile: AutotileConfig | null | undefined,
): AutotileConfig {
  if (!autotile) {
    return createEmptyAutotileConfig();
  }

  const cloned = JSON.parse(JSON.stringify(autotile)) as AutotileConfig;

  return {
    version: cloned.version,
    preset: cloned.preset ?? DEFAULT_AUTOTILE_PRESET_ID,
    terrains: cloned.terrains.map(normalizeTerrain),
    rules: cloned.rules ?? [],
  };
}

export function assignTileToSelectionTarget(
  terrains: AutotileTerrain[],
  target: AutotileSelectionTarget,
  tile: AutotileTileRegion | null,
): AutotileTerrain[] {
  return terrains.map((terrain) => {
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
  });
}

export function getTargetTile(
  autotile: AutotileConfig,
  target: AutotileSelectionTarget | null,
): AutotileTileRegion | null {
  if (!target) {
    return null;
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
  const activeSlotIds = new Set(getAutotileActiveSlotIds(presetId));
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
    return "Select the center paint tile or a pattern block on the right, then click a tile in the picker.";
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
