import {
  AUTOTILE_NEIGHBOR_POSITIONS,
  type AutotileConfig,
  type AutotileNeighborMatcher,
  type AutotilePatternRelation,
  type AutotilePatternSlotId,
  type AutotileRule,
  type AutotileTerrain,
} from "@/types";
import type {
  AutotilePatternSlotDefinition,
  AutotilePresetDefinition,
} from "@/features/map-editor/types/autotile-builder";
import { generateAutotileRuleId } from "@/utils/ids";

const OPTIONAL_PATTERN_SLOTS =
  [] as const satisfies readonly AutotilePatternSlotId[];

const PATTERN_SLOT_DEFINITIONS = [
  {
    id: "innerCornerNorthWest",
    label: "Inside Top Left Corner",
    shortLabel: "Inside TL",
    description:
      "Use this when the terrain wraps around the top and left, but the top-left diagonal opens up.",
    priority: 10,
    neighbors: {
      northWest: "different",
      north: "same",
      northEast: "ignore",
      west: "same",
      east: "ignore",
      southWest: "ignore",
      south: "ignore",
      southEast: "ignore",
    },
  },
  {
    id: "innerCornerNorthEast",
    label: "Inside Top Right Corner",
    shortLabel: "Inside TR",
    description:
      "Use this when the terrain wraps around the top and right, but the top-right diagonal opens up.",
    priority: 10,
    neighbors: {
      northWest: "ignore",
      north: "same",
      northEast: "different",
      west: "ignore",
      east: "same",
      southWest: "ignore",
      south: "ignore",
      southEast: "ignore",
    },
  },
  {
    id: "innerCornerSouthWest",
    label: "Inside Bottom Left Corner",
    shortLabel: "Inside BL",
    description:
      "Use this when the terrain wraps around the bottom and left, but the bottom-left diagonal opens up.",
    priority: 10,
    neighbors: {
      northWest: "ignore",
      north: "ignore",
      northEast: "ignore",
      west: "same",
      east: "ignore",
      southWest: "different",
      south: "same",
      southEast: "ignore",
    },
  },
  {
    id: "innerCornerSouthEast",
    label: "Inside Bottom Right Corner",
    shortLabel: "Inside BR",
    description:
      "Use this when the terrain wraps around the bottom and right, but the bottom-right diagonal opens up.",
    priority: 10,
    neighbors: {
      northWest: "ignore",
      north: "ignore",
      northEast: "ignore",
      west: "ignore",
      east: "same",
      southWest: "ignore",
      south: "same",
      southEast: "different",
    },
  },
  {
    id: "outerCornerNorthWest",
    label: "Outside Top Left Corner",
    shortLabel: "Outside TL",
    description:
      "Use this when the top and left sides both open away from the terrain.",
    priority: 20,
    neighbors: {
      northWest: "ignore",
      north: "different",
      northEast: "ignore",
      west: "different",
      east: "ignore",
      southWest: "ignore",
      south: "ignore",
      southEast: "ignore",
    },
  },
  {
    id: "outerCornerNorthEast",
    label: "Outside Top Right Corner",
    shortLabel: "Outside TR",
    description:
      "Use this when the top and right sides both open away from the terrain.",
    priority: 20,
    neighbors: {
      northWest: "ignore",
      north: "different",
      northEast: "ignore",
      west: "ignore",
      east: "different",
      southWest: "ignore",
      south: "ignore",
      southEast: "ignore",
    },
  },
  {
    id: "outerCornerSouthWest",
    label: "Outside Bottom Left Corner",
    shortLabel: "Outside BL",
    description:
      "Use this when the bottom and left sides both open away from the terrain.",
    priority: 20,
    neighbors: {
      northWest: "ignore",
      north: "ignore",
      northEast: "ignore",
      west: "different",
      east: "ignore",
      southWest: "ignore",
      south: "different",
      southEast: "ignore",
    },
  },
  {
    id: "outerCornerSouthEast",
    label: "Outside Bottom Right Corner",
    shortLabel: "Outside BR",
    description:
      "Use this when the bottom and right sides both open away from the terrain.",
    priority: 20,
    neighbors: {
      northWest: "ignore",
      north: "ignore",
      northEast: "ignore",
      west: "ignore",
      east: "different",
      southWest: "ignore",
      south: "different",
      southEast: "ignore",
    },
  },
  {
    id: "edgeNorth",
    label: "Top Edge",
    shortLabel: "Top",
    description: "Use this when the top side opens away from the terrain.",
    priority: 30,
    neighbors: {
      northWest: "ignore",
      north: "different",
      northEast: "ignore",
      west: "ignore",
      east: "ignore",
      southWest: "ignore",
      south: "ignore",
      southEast: "ignore",
    },
  },
  {
    id: "edgeEast",
    label: "Right Edge",
    shortLabel: "Right",
    description: "Use this when the right side opens away from the terrain.",
    priority: 30,
    neighbors: {
      northWest: "ignore",
      north: "ignore",
      northEast: "ignore",
      west: "ignore",
      east: "different",
      southWest: "ignore",
      south: "ignore",
      southEast: "ignore",
    },
  },
  {
    id: "edgeSouth",
    label: "Bottom Edge",
    shortLabel: "Bottom",
    description: "Use this when the bottom side opens away from the terrain.",
    priority: 30,
    neighbors: {
      northWest: "ignore",
      north: "ignore",
      northEast: "ignore",
      west: "ignore",
      east: "ignore",
      southWest: "ignore",
      south: "different",
      southEast: "ignore",
    },
  },
  {
    id: "edgeWest",
    label: "Left Edge",
    shortLabel: "Left",
    description: "Use this when the left side opens away from the terrain.",
    priority: 30,
    neighbors: {
      northWest: "ignore",
      north: "ignore",
      northEast: "ignore",
      west: "different",
      east: "ignore",
      southWest: "ignore",
      south: "ignore",
      southEast: "ignore",
    },
  },
  {
    id: "solid",
    label: "Fully Surrounded",
    shortLabel: "Solid",
    description:
      "Use this when the terrain is fully surrounded on all four sides by the same terrain.",
    priority: 90,
    neighbors: {
      northWest: "ignore",
      north: "same",
      northEast: "ignore",
      west: "same",
      east: "same",
      southWest: "ignore",
      south: "same",
      southEast: "ignore",
    },
  },
] as const satisfies readonly AutotilePatternSlotDefinition[];

export const AUTOTILE_PATTERN_SLOTS = Object.fromEntries(
  PATTERN_SLOT_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<AutotilePatternSlotId, AutotilePatternSlotDefinition>;

export const AUTOTILE_PRESET_DEFINITIONS = [
  {
    id: "edges-only",
    label: "Edges Only",
    description:
      "Pick the four boundary tiles. Good for simple cliffs, walls, and shorelines.",
    requiredSlots: ["edgeNorth", "edgeEast", "edgeSouth", "edgeWest"],
    optionalSlots: [...OPTIONAL_PATTERN_SLOTS],
  },
  {
    id: "edges-corners",
    label: "Edges + Outside Corners",
    description:
      "Adds separate corner tiles when two open sides meet, while keeping setup light.",
    requiredSlots: [
      "edgeNorth",
      "edgeEast",
      "edgeSouth",
      "edgeWest",
      "outerCornerNorthWest",
      "outerCornerNorthEast",
      "outerCornerSouthWest",
      "outerCornerSouthEast",
    ],
    optionalSlots: [...OPTIONAL_PATTERN_SLOTS],
  },
  {
    id: "full-corners",
    label: "Full Corners",
    description:
      "Adds inside corners for cut-ins and more detailed transitions.",
    requiredSlots: [
      "edgeNorth",
      "edgeEast",
      "edgeSouth",
      "edgeWest",
      "outerCornerNorthWest",
      "outerCornerNorthEast",
      "outerCornerSouthWest",
      "outerCornerSouthEast",
      "innerCornerNorthWest",
      "innerCornerNorthEast",
      "innerCornerSouthWest",
      "innerCornerSouthEast",
    ],
    optionalSlots: [...OPTIONAL_PATTERN_SLOTS],
  },
] as const satisfies readonly AutotilePresetDefinition[];

const DEFAULT_PRESET_ID =
  "edges-corners" as const satisfies AutotileConfig["preset"];

function relationToMatcher(
  relation: AutotilePatternRelation,
  terrain: AutotileTerrain,
): AutotileNeighborMatcher {
  switch (relation) {
    case "same":
      return { kind: "terrain", terrainId: terrain.id };
    case "different":
      return { kind: "notTerrain", terrainId: terrain.id };
    case "ignore":
      return { kind: "any" };
  }
}

function getPresetDefinition(
  presetId: AutotileConfig["preset"],
): AutotilePresetDefinition {
  return (
    AUTOTILE_PRESET_DEFINITIONS.find((preset) => preset.id === presetId) ??
    AUTOTILE_PRESET_DEFINITIONS.find(
      (preset) => preset.id === DEFAULT_PRESET_ID,
    )!
  );
}

function buildPatternNeighbors(
  terrain: AutotileTerrain,
  slot: AutotilePatternSlotDefinition,
): AutotileRule["neighbors"] {
  return Object.fromEntries(
    AUTOTILE_NEIGHBOR_POSITIONS.map((position) => [
      position,
      relationToMatcher(slot.neighbors[position], terrain),
    ]),
  ) as AutotileRule["neighbors"];
}

function getPresetSlots(
  presetId: AutotileConfig["preset"],
): AutotilePatternSlotDefinition[] {
  const preset = getPresetDefinition(presetId);
  const slotIds = [...preset.requiredSlots, ...preset.optionalSlots];

  return slotIds
    .map((slotId) => AUTOTILE_PATTERN_SLOTS[slotId])
    .sort((left, right) => left.priority - right.priority);
}

function buildRuleName(
  terrain: AutotileTerrain,
  slot: AutotilePatternSlotDefinition,
): string {
  return `${terrain.name || "Terrain"} ${slot.label}`;
}

export function buildPresetAutotileRules(
  autotile: Pick<AutotileConfig, "preset" | "terrains">,
): AutotileRule[] {
  const orderedSlots = getPresetSlots(autotile.preset);

  return autotile.terrains.flatMap((terrain) =>
    orderedSlots.flatMap((slot) => {
      const output = terrain.patternTiles?.[slot.id] ?? null;

      if (!output) {
        return [];
      }

      return [
        {
          id: generateAutotileRuleId(),
          name: buildRuleName(terrain, slot),
          centerTerrainId: terrain.id,
          neighbors: buildPatternNeighbors(terrain, slot),
          output,
        },
      ];
    }),
  );
}

export function getAutotilePresetDefinition(
  presetId: AutotileConfig["preset"],
): AutotilePresetDefinition {
  return getPresetDefinition(presetId);
}

export function getAutotilePresetSlots(
  presetId: AutotileConfig["preset"],
): AutotilePatternSlotDefinition[] {
  return getPresetSlots(presetId);
}
