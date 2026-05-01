import {
  AUTOTILE_NEIGHBOR_POSITIONS,
  type AutotileConfig,
  type AutotileNeighborMatcher,
  type AutotileNeighborPosition,
  type AutotilePatternRelation,
  type AutotilePatternSlotId,
  type AutotileRule,
  type AutotileTerrain,
} from "@/types";
import type {
  AutotilePatternCardGroupDefinition,
  AutotilePatternSlotDefinition,
  AutotilePresetDefinition,
} from "@/features/map-editor/types/autotile-builder";
import { generateAutotileRuleId } from "@/utils/ids";

const OPTIONAL_PATTERN_SLOTS =
  [] as const satisfies readonly AutotilePatternSlotId[];

const BLOB_VERTICAL_RUN_MASK = 1 | 16;
const BLOB_HORIZONTAL_RUN_MASK = 4 | 64;

const BLOB_PATTERN_CARD_GROUP_META = [
  {
    id: "isolated",
    title: "Isolated",
    description: "Single-tile islands with no matching neighbors.",
  },
  {
    id: "end-caps",
    title: "End Caps",
    description: "One-sided extensions that taper into open space.",
  },
  {
    id: "straight-runs",
    title: "Straight Runs",
    description: "Two-sided bridges that continue straight through the tile.",
  },
  {
    id: "filled-turns",
    title: "Filled Turns",
    description: "Two-sided turns where the shared corner stays filled.",
  },
  {
    id: "turn-cut-ins",
    title: "Turn Cut-Ins",
    description: "Two-sided turns where the shared inside corner opens up.",
  },
  {
    id: "tee-open-north",
    title: "T-Junctions Open North",
    description: "Three-sided junctions that open toward the top edge.",
  },
  {
    id: "tee-open-east",
    title: "T-Junctions Open East",
    description: "Three-sided junctions that open toward the right edge.",
  },
  {
    id: "tee-open-south",
    title: "T-Junctions Open South",
    description: "Three-sided junctions that open toward the bottom edge.",
  },
  {
    id: "tee-open-west",
    title: "T-Junctions Open West",
    description: "Three-sided junctions that open toward the left edge.",
  },
  {
    id: "solid-core",
    title: "Solid Core",
    description: "Fully surrounded tiles with all four corners filled.",
  },
  {
    id: "single-cut-in",
    title: "Single Cut-In",
    description: "Fully surrounded tiles with one inside corner opening.",
  },
  {
    id: "double-cut-ins",
    title: "Double Cut-Ins",
    description: "Fully surrounded tiles with two inside corners opening.",
  },
  {
    id: "triple-cut-ins",
    title: "Triple Cut-Ins",
    description: "Fully surrounded tiles with three inside corners opening.",
  },
  {
    id: "cross-cut-in",
    title: "Cross Cut-In",
    description: "Fully surrounded tiles with all four inside corners open.",
  },
] as const;

const BLOB_CARDINAL_NEIGHBORS = [
  { position: "north", label: "North", bit: 1 },
  { position: "east", label: "East", bit: 4 },
  { position: "south", label: "South", bit: 16 },
  { position: "west", label: "West", bit: 64 },
] as const satisfies readonly {
  position: Extract<
    AutotileNeighborPosition,
    "north" | "east" | "south" | "west"
  >;
  label: string;
  bit: number;
}[];

const BLOB_DIAGONAL_NEIGHBORS = [
  {
    position: "northEast",
    label: "Top Right",
    bit: 2,
    vertical: "north",
    horizontal: "east",
  },
  {
    position: "southEast",
    label: "Bottom Right",
    bit: 8,
    vertical: "south",
    horizontal: "east",
  },
  {
    position: "southWest",
    label: "Bottom Left",
    bit: 32,
    vertical: "south",
    horizontal: "west",
  },
  {
    position: "northWest",
    label: "Top Left",
    bit: 128,
    vertical: "north",
    horizontal: "west",
  },
] as const satisfies readonly {
  position: Extract<
    AutotileNeighborPosition,
    "northEast" | "southEast" | "southWest" | "northWest"
  >;
  label: string;
  bit: number;
  vertical: Extract<AutotileNeighborPosition, "north" | "south">;
  horizontal: Extract<AutotileNeighborPosition, "east" | "west">;
}[];

const WANG_EDGE_NEIGHBORS = [
  { position: "north", label: "Top", bit: 1 },
  { position: "east", label: "Right", bit: 2 },
  { position: "south", label: "Bottom", bit: 4 },
  { position: "west", label: "Left", bit: 8 },
] as const satisfies readonly {
  position: Extract<
    AutotileNeighborPosition,
    "north" | "east" | "south" | "west"
  >;
  label: string;
  bit: number;
}[];

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

function formatBlobMask(mask: number): string {
  return mask.toString(16).toUpperCase().padStart(2, "0");
}

function createBlobPatternId(mask: number): AutotilePatternSlotId {
  return `blob-${formatBlobMask(mask).toLowerCase()}`;
}

function createBlobPatternDefinition(
  mask: number,
  priority: number,
): AutotilePatternSlotDefinition {
  const neighbors = Object.fromEntries(
    AUTOTILE_NEIGHBOR_POSITIONS.map((position) => [
      position,
      "different" as AutotilePatternRelation,
    ]),
  ) as Record<AutotileNeighborPosition, AutotilePatternRelation>;

  for (const neighbor of BLOB_CARDINAL_NEIGHBORS) {
    neighbors[neighbor.position] = mask & neighbor.bit ? "same" : "different";
  }

  for (const neighbor of BLOB_DIAGONAL_NEIGHBORS) {
    const verticalMatches = neighbors[neighbor.vertical] === "same";
    const horizontalMatches = neighbors[neighbor.horizontal] === "same";

    if (verticalMatches && horizontalMatches) {
      neighbors[neighbor.position] = mask & neighbor.bit ? "same" : "different";
      continue;
    }

    neighbors[neighbor.position] = "ignore";
  }

  return {
    id: createBlobPatternId(mask),
    label: `Blob 0x${formatBlobMask(mask)}`,
    shortLabel: `0x${formatBlobMask(mask)}`,
    description: "",
    priority,
    neighbors,
  };
}

function createBlobPatternDefinitions(): AutotilePatternSlotDefinition[] {
  const definitions: Array<{
    mask: number;
    definition: AutotilePatternSlotDefinition;
  }> = [];

  for (let cardinalMask = 0; cardinalMask < 16; cardinalMask++) {
    const cardinalBits = {
      north: Boolean(cardinalMask & 1),
      east: Boolean(cardinalMask & 2),
      south: Boolean(cardinalMask & 4),
      west: Boolean(cardinalMask & 8),
    } as const;

    const gatedDiagonals = BLOB_DIAGONAL_NEIGHBORS.filter(
      (neighbor) =>
        cardinalBits[neighbor.vertical] && cardinalBits[neighbor.horizontal],
    );
    const diagonalVariants = 1 << gatedDiagonals.length;

    for (
      let diagonalMask = 0;
      diagonalMask < diagonalVariants;
      diagonalMask++
    ) {
      let mask = 0;

      for (const neighbor of BLOB_CARDINAL_NEIGHBORS) {
        if (cardinalBits[neighbor.position]) {
          mask |= neighbor.bit;
        }
      }

      gatedDiagonals.forEach((neighbor, index) => {
        if (diagonalMask & (1 << index)) {
          mask |= neighbor.bit;
        }
      });

      definitions.push({
        mask,
        definition: createBlobPatternDefinition(mask, 0),
      });
    }
  }

  return definitions
    .sort((left, right) => left.mask - right.mask)
    .map(({ definition }, index) => ({
      ...definition,
      priority: 100 + index,
    }));
}

const BLOB_PATTERN_DEFINITIONS = createBlobPatternDefinitions();

function formatWangMask(mask: number): string {
  return mask.toString(16).toUpperCase().padStart(2, "0");
}

export function createWangPatternId(mask: number): AutotilePatternSlotId {
  return `wang-${formatWangMask(mask).toLowerCase()}`;
}

export function parseWangMask(slotId: AutotilePatternSlotId): number | null {
  if (!slotId.startsWith("wang-")) {
    return null;
  }

  const parsed = Number.parseInt(slotId.slice(5), 16);
  return Number.isNaN(parsed) || parsed < 0 || parsed > 15 ? null : parsed;
}

function getWangMatchedEdgeLabels(mask: number): string[] {
  return WANG_EDGE_NEIGHBORS.filter((edge) => mask & edge.bit).map(
    (edge) => edge.label,
  );
}

function createWangPatternLabel(mask: number): string {
  const matchedEdges = getWangMatchedEdgeLabels(mask);

  if (matchedEdges.length === 0) {
    return "All Edges Open";
  }

  if (matchedEdges.length === WANG_EDGE_NEIGHBORS.length) {
    return "All Edges Match";
  }

  return `${matchedEdges.join(" + ")} ${matchedEdges.length === 1 ? "Edge" : "Edges"} Match`;
}

function createWangPatternDescription(mask: number): string {
  const matchedEdges = getWangMatchedEdgeLabels(mask);

  if (matchedEdges.length === 0) {
    return "Use this when no cardinal edge touches the same terrain.";
  }

  if (matchedEdges.length === WANG_EDGE_NEIGHBORS.length) {
    return "Use this when all four cardinal edges touch the same terrain.";
  }

  const openEdges = WANG_EDGE_NEIGHBORS.filter(
    (edge) => !(mask & edge.bit),
  ).map((edge) => edge.label.toLowerCase());
  return `Use this when ${matchedEdges.map((edge) => edge.toLowerCase()).join(", ")} match the same terrain and ${openEdges.join(", ")} open away from it.`;
}

function createWangPatternDefinition(
  mask: number,
  priority: number,
): AutotilePatternSlotDefinition {
  const neighbors = Object.fromEntries(
    AUTOTILE_NEIGHBOR_POSITIONS.map((position) => [
      position,
      "ignore" as AutotilePatternRelation,
    ]),
  ) as Record<AutotileNeighborPosition, AutotilePatternRelation>;

  for (const edge of WANG_EDGE_NEIGHBORS) {
    neighbors[edge.position] = mask & edge.bit ? "same" : "different";
  }

  const label = createWangPatternLabel(mask);

  return {
    id: createWangPatternId(mask),
    label,
    shortLabel: `0x${formatWangMask(mask)}`,
    description: createWangPatternDescription(mask),
    priority,
    neighbors,
  };
}

function createWangPatternDefinitions(): AutotilePatternSlotDefinition[] {
  return Array.from({ length: 16 }, (_, mask) =>
    createWangPatternDefinition(mask, 200 + mask),
  );
}

export const WANG_PATTERN_DEFINITIONS = createWangPatternDefinitions();

const BLOB_PATTERN_CARD_GROUPS = BLOB_PATTERN_CARD_GROUP_META.map((group) => ({
  ...group,
  slotIds: BLOB_PATTERN_DEFINITIONS.filter((definition) => {
    const mask = parseBlobMask(definition.id);
    return mask !== null && getBlobPatternCardGroupId(mask) === group.id;
  }).map((definition) => definition.id),
})) satisfies readonly AutotilePatternCardGroupDefinition[];

export const AUTOTILE_PATTERN_SLOTS = Object.fromEntries(
  [
    ...PATTERN_SLOT_DEFINITIONS,
    ...BLOB_PATTERN_DEFINITIONS,
    ...WANG_PATTERN_DEFINITIONS,
  ].map((definition) => [definition.id, definition]),
) as Record<AutotilePatternSlotId, AutotilePatternSlotDefinition>;

export const AUTOTILE_PRESET_DEFINITIONS = [
  {
    id: "edges-only",
    label: "Edges Only",
    description:
      "Pick the four boundary tiles. Good for simple cliffs, walls, and shorelines.",
    editorLayout: "grid",
    requiredSlots: ["edgeNorth", "edgeEast", "edgeSouth", "edgeWest"],
    optionalSlots: [...OPTIONAL_PATTERN_SLOTS],
  },
  {
    id: "edges-corners",
    label: "Edges + Outside Corners",
    description:
      "Adds separate corner tiles when two open sides meet, while keeping setup light.",
    editorLayout: "grid",
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
    editorLayout: "grid",
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
  {
    id: "blob-47",
    label: "47-Tile Blob",
    description:
      "Assign the full 8-neighbor blob set for polished RPG-style terrain transitions.",
    editorLayout: "cards",
    requiredSlots: BLOB_PATTERN_DEFINITIONS.map((definition) => definition.id),
    optionalSlots: [...OPTIONAL_PATTERN_SLOTS],
  },
  {
    id: "wang-tiles",
    label: "Wang Tiles (16)",
    description:
      "Assign the 16 cardinal edge combinations for Wang-style terrain transitions.",
    editorLayout: "wang",
    requiredSlots: WANG_PATTERN_DEFINITIONS.map((definition) => definition.id),
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

function parseBlobMask(slotId: AutotilePatternSlotId): number | null {
  if (!slotId.startsWith("blob-")) {
    return null;
  }

  const parsed = Number.parseInt(slotId.slice(5), 16);
  return Number.isNaN(parsed) ? null : parsed;
}

function countBlobCardinalMatches(mask: number): number {
  return BLOB_CARDINAL_NEIGHBORS.reduce((count, neighbor) => {
    return count + (mask & neighbor.bit ? 1 : 0);
  }, 0);
}

function countBlobDiagonalMatches(mask: number): number {
  return BLOB_DIAGONAL_NEIGHBORS.reduce((count, neighbor) => {
    return count + (mask & neighbor.bit ? 1 : 0);
  }, 0);
}

function getBlobOpenSideGroupId(mask: number): string {
  if (!(mask & 1)) {
    return "tee-open-north";
  }
  if (!(mask & 4)) {
    return "tee-open-east";
  }
  if (!(mask & 16)) {
    return "tee-open-south";
  }

  return "tee-open-west";
}

function getBlobPatternCardGroupId(mask: number): string {
  const cardinalCount = countBlobCardinalMatches(mask);

  switch (cardinalCount) {
    case 0:
      return "isolated";
    case 1:
      return "end-caps";
    case 2: {
      const isStraight =
        mask === BLOB_VERTICAL_RUN_MASK || mask === BLOB_HORIZONTAL_RUN_MASK;

      if (isStraight) {
        return "straight-runs";
      }

      return countBlobDiagonalMatches(mask) === 0
        ? "turn-cut-ins"
        : "filled-turns";
    }
    case 3:
      return getBlobOpenSideGroupId(mask);
    case 4: {
      const missingDiagonalCount = 4 - countBlobDiagonalMatches(mask);

      switch (missingDiagonalCount) {
        case 0:
          return "solid-core";
        case 1:
          return "single-cut-in";
        case 2:
          return "double-cut-ins";
        case 3:
          return "triple-cut-ins";
        default:
          return "cross-cut-in";
      }
    }
    default:
      return "isolated";
  }
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

export function getAutotilePresetCardGroups(
  presetId: AutotileConfig["preset"],
): AutotilePatternCardGroupDefinition[] {
  const preset = getPresetDefinition(presetId);

  if (preset.id === "blob-47") {
    return [...BLOB_PATTERN_CARD_GROUPS];
  }

  if (preset.id === "wang-tiles") {
    return [
      {
        id: "wang-patterns",
        title: "Wang Edge Patterns",
        description: "Assign the 16 top, right, bottom, and left edge states.",
        slotIds: preset.requiredSlots,
      },
    ];
  }

  const slotIds = [...preset.requiredSlots, ...preset.optionalSlots];

  return [
    {
      id: "patterns",
      title: "Patterns",
      description: "Assign pattern tiles for this preset.",
      slotIds,
    },
  ];
}
