import {
  AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE,
  AUTOTILE_WANG_POSITION_INDEXES,
  type Tileset,
} from "@/types";
import { formatGodotColorRgba } from "@/features/import-export/lib/godot-scene-utils";
import {
  buildAutotileFromTiledWangSets,
  buildTiledJsonWangSets,
} from "@/features/import-export/lib/tiled-wang";
import {
  getTileColumns,
  getTileCount,
} from "@/features/import-export/lib/tiled-xml-utils";

const GODOT_TILE_SHAPE_SQUARE = 0;
const GODOT_TILE_SHAPE_ISOMETRIC = 1;
const GODOT_TILE_SHAPE_HALF_OFFSET = 2;
const GODOT_TILE_SHAPE_HEXAGON = 3;
const GODOT_TILE_OFFSET_AXIS_HORIZONTAL = 0;
const GODOT_TERRAIN_MODE_MATCH_CORNERS_AND_SIDES = 0;
const GODOT_TERRAIN_MODE_MATCH_CORNERS = 1;
const GODOT_TERRAIN_MODE_MATCH_SIDES = 2;
const GODOT_OPEN_COLOR = "#000000";
const GODOT_DEFAULT_TERRAIN_COLOR = "#ffffff";

const GODOT_SQUARE_EDGE_KEYS = {
  north: "top_side",
  east: "right_side",
  south: "bottom_side",
  west: "left_side",
} as const;

const GODOT_SQUARE_CORNER_KEYS = {
  northEast: "top_right_corner",
  southEast: "bottom_right_corner",
  southWest: "bottom_left_corner",
  northWest: "top_left_corner",
} as const;

const GODOT_ISOMETRIC_EDGE_KEYS = {
  north: "top_right_side",
  east: "bottom_right_side",
  south: "bottom_left_side",
  west: "top_left_side",
} as const;

const GODOT_ISOMETRIC_CORNER_KEYS = {
  northEast: "right_corner",
  southEast: "bottom_corner",
  southWest: "left_corner",
  northWest: "top_corner",
} as const;

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseGodotStringLiteral(rawValue: string | undefined) {
  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue) as string;
  }

  return rawValue;
}

function clampColorChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function parseHexColor(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized?.startsWith("#")) {
    return null;
  }

  const hex = normalized.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }

  const expanded =
    hex.length === 3 || hex.length === 4
      ? hex
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const alpha =
    expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255;

  if ([red, green, blue, alpha].some((channel) => Number.isNaN(channel))) {
    return null;
  }

  return {
    red,
    green,
    blue,
    alpha,
  };
}

function formatGodotColorFromHex(value: string | undefined) {
  const parsed = parseHexColor(value) ?? parseHexColor(GODOT_DEFAULT_TERRAIN_COLOR)!;
  return formatGodotColorRgba(
    parsed.red / 255,
    parsed.green / 255,
    parsed.blue / 255,
    parsed.alpha / 255,
  );
}

function parseGodotColor(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^Color\(([^)]+)\)$/);
  if (!match) {
    return null;
  }

  const components = match[1]
    .split(",")
    .map((component) => Number(component.trim()));
  if (
    components.length < 3 ||
    components.length > 4 ||
    components.some((component) => !Number.isFinite(component))
  ) {
    return null;
  }

  return {
    red: clampColorChannel((components[0] ?? 0) * 255),
    green: clampColorChannel((components[1] ?? 0) * 255),
    blue: clampColorChannel((components[2] ?? 0) * 255),
    alpha: clampColorChannel((components[3] ?? 1) * 255),
  };
}

function formatHexColorFromGodot(value: string | undefined) {
  const parsed = parseGodotColor(value);
  if (!parsed) {
    return GODOT_DEFAULT_TERRAIN_COLOR;
  }

  const suffix = parsed.alpha === 255 ? "" : parsed.alpha.toString(16).padStart(2, "0");
  return `#${parsed.red.toString(16).padStart(2, "0")}${parsed.green
    .toString(16)
    .padStart(2, "0")}${parsed.blue.toString(16).padStart(2, "0")}${suffix}`;
}

function getGodotTerrainMode(wangSetType: string | undefined) {
  if (wangSetType === "corner") {
    return GODOT_TERRAIN_MODE_MATCH_CORNERS;
  }
  if (wangSetType === "mixed") {
    return GODOT_TERRAIN_MODE_MATCH_CORNERS_AND_SIDES;
  }
  return GODOT_TERRAIN_MODE_MATCH_SIDES;
}

function getWangSetTypeFromTerrainMode(mode: number) {
  if (mode === GODOT_TERRAIN_MODE_MATCH_CORNERS) {
    return "corner" as const;
  }
  if (mode === GODOT_TERRAIN_MODE_MATCH_CORNERS_AND_SIDES) {
    return "mixed" as const;
  }
  return "edge" as const;
}

function getNeighborKeyMap(
  wangSetType: string | undefined,
  tileShape: number,
  tileOffsetAxis: number,
) {
  if (
    tileShape === GODOT_TILE_SHAPE_HALF_OFFSET ||
    tileShape === GODOT_TILE_SHAPE_HEXAGON
  ) {
    throw new Error(
      "Godot Wang terrain export currently supports square and isometric tile shapes only.",
    );
  }

  const edgeKeys =
    tileShape === GODOT_TILE_SHAPE_ISOMETRIC
      ? GODOT_ISOMETRIC_EDGE_KEYS
      : GODOT_SQUARE_EDGE_KEYS;
  const cornerKeys =
    tileShape === GODOT_TILE_SHAPE_ISOMETRIC
      ? GODOT_ISOMETRIC_CORNER_KEYS
      : GODOT_SQUARE_CORNER_KEYS;

  if (wangSetType === "corner") {
    return cornerKeys;
  }
  if (wangSetType === "mixed") {
    return { ...edgeKeys, ...cornerKeys };
  }

  if (
    tileShape !== GODOT_TILE_SHAPE_SQUARE &&
    tileShape !== GODOT_TILE_SHAPE_ISOMETRIC &&
    tileOffsetAxis !== GODOT_TILE_OFFSET_AXIS_HORIZONTAL
  ) {
    throw new Error(
      "Godot Wang terrain export currently supports square and isometric tile shapes only.",
    );
  }

  return edgeKeys;
}

function isLegacyTwoColorEdgeWangSet(wangSet: {
  type?: string;
  colors?: Array<{
    name?: string;
    color?: string;
    probability?: number;
  }>;
}) {
  const colors = wangSet.colors ?? [];
  return (
    (wangSet.type ?? "edge") === "edge" &&
    colors.length === 2 &&
    (colors[0]?.name ?? "Open") === "Open" &&
    (colors[0]?.color ?? "").trim().toLowerCase() === GODOT_OPEN_COLOR &&
    (colors[1]?.color ?? "").trim().toLowerCase() === GODOT_DEFAULT_TERRAIN_COLOR &&
    readNumber(String(colors[0]?.probability ?? 1), 1) === 1 &&
    readNumber(String(colors[1]?.probability ?? 1), 1) === 1
  );
}

function getLocalIdCoordinates(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  localId: number,
) {
  if (
    !Number.isInteger(localId) ||
    localId < 0 ||
    localId >= getTileCount(tileset)
  ) {
    return null;
  }

  const columns = getTileColumns(tileset);
  return {
    atlasX: localId % columns,
    atlasY: Math.floor(localId / columns),
  };
}

function getLocalIdFromAtlasCoordinates(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  atlasX: number,
  atlasY: number,
) {
  if (
    !Number.isInteger(atlasX) ||
    !Number.isInteger(atlasY) ||
    atlasX < 0 ||
    atlasY < 0
  ) {
    return -1;
  }

  const columns = getTileColumns(tileset);
  const localId = atlasY * columns + atlasX;
  return localId >= 0 && localId < getTileCount(tileset) ? localId : -1;
}

function computeCenterTerrainIndex(
  wangId: readonly number[] | undefined,
  wangSetType: string | undefined,
  legacyEdgeSet: boolean,
) {
  if (legacyEdgeSet) {
    return 0;
  }

  const activePositions = AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE[
    wangSetType === "corner" || wangSetType === "mixed" ? wangSetType : "edge"
  ];
  const counts = new Map<number, number>();

  for (const position of activePositions) {
    const wangValue = wangId?.[AUTOTILE_WANG_POSITION_INDEXES[position]] ?? 0;
    if (!Number.isInteger(wangValue) || wangValue <= 0) {
      continue;
    }

    counts.set(wangValue, (counts.get(wangValue) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return -1;
  }
  if (counts.size === 1) {
    return [...counts.keys()][0]! - 1;
  }

  const ordered = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  );
  if ((ordered[0]?.[1] ?? 0) === (ordered[1]?.[1] ?? -1)) {
    return -1;
  }

  return (ordered[0]?.[0] ?? 0) - 1;
}

function readNamedTileProbability(
  tileset: Pick<Tileset, "autotile" | "imageHeight" | "imageWidth" | "tileSize">,
  wangSetIndex: number,
  localId: number,
  wangId: readonly number[] | undefined,
) {
  const namedWangSet = tileset.autotile?.wangSets?.[wangSetIndex];
  if (!namedWangSet || !wangId) {
    return 1;
  }

  const coordinates = getLocalIdCoordinates(tileset, localId);
  if (!coordinates) {
    return 1;
  }

  const tileSize = tileset.tileSize;
  const matchingTile = namedWangSet.tiles.find((candidate) => {
    return (
      candidate.tile?.sx === coordinates.atlasX * tileSize &&
      candidate.tile?.sy === coordinates.atlasY * tileSize &&
      candidate.tile?.sw === tileSize &&
      candidate.tile?.sh === tileSize &&
      candidate.wangId.join(",") === wangId.join(",")
    );
  });

  return matchingTile?.probability ?? 1;
}

function inferRepresentativeTileId(
  assignments: Array<{
    localId: number;
    wangId: number[];
  }>,
  targetValue: number,
  wangSetType: string | undefined,
) {
  const activePositions = AUTOTILE_WANG_ACTIVE_POSITIONS_BY_TYPE[
    wangSetType === "corner" || wangSetType === "mixed" ? wangSetType : "edge"
  ];

  for (const assignment of assignments) {
    const values = activePositions.map(
      (position) => assignment.wangId[AUTOTILE_WANG_POSITION_INDEXES[position]] ?? 0,
    );
    if (values.length > 0 && values.every((value) => value === targetValue)) {
      return assignment.localId;
    }
  }

  return assignments[0]?.localId ?? -1;
}

function buildTileAssignments(
  tileset: Pick<Tileset, "autotile" | "imageHeight" | "imageWidth" | "tileSize">,
  tileShape: number,
  tileOffsetAxis: number,
) {
  const wangSets = buildTiledJsonWangSets(tileset) ?? [];
  const assignmentsByLocalId = new Map<
    number,
    Array<{
      terrainSet: number;
      terrain: number;
      peeringBits: Record<string, number>;
      probability: number;
    }>
  >();
  const resourceLines: string[] = [];

  wangSets.forEach((wangSet, wangSetIndex) => {
    const legacyEdgeSet = isLegacyTwoColorEdgeWangSet(wangSet);
    const keyMap = getNeighborKeyMap(
      wangSet.type,
      tileShape,
      tileOffsetAxis,
    );
    const terrainColors = legacyEdgeSet
      ? (wangSet.colors ?? []).slice(1)
      : wangSet.colors ?? [];

    resourceLines.push(
      `terrain_set_${wangSetIndex}/mode = ${getGodotTerrainMode(wangSet.type)}`,
    );
    terrainColors.forEach((color, terrainIndex) => {
      resourceLines.push(
        `terrain_set_${wangSetIndex}/terrain_${terrainIndex}/name = ${JSON.stringify(
          color.name ?? `Terrain ${terrainIndex + 1}`,
        )}`,
      );
      resourceLines.push(
        `terrain_set_${wangSetIndex}/terrain_${terrainIndex}/color = ${formatGodotColorFromHex(
          color.color,
        )}`,
      );
    });

    for (const wangTile of wangSet.wangtiles ?? []) {
      const localId = wangTile.tileid ?? -1;
      const coordinates = getLocalIdCoordinates(tileset, localId);
      if (!coordinates || !wangTile.wangid) {
        continue;
      }

      const peeringBits: Record<string, number> = {};
      for (const [position, godotKey] of Object.entries(keyMap)) {
        const wangValue =
          wangTile.wangid[
            AUTOTILE_WANG_POSITION_INDEXES[
              position as keyof typeof AUTOTILE_WANG_POSITION_INDEXES
            ]
          ] ?? 0;

        if (legacyEdgeSet) {
          if (wangValue === 2) {
            peeringBits[godotKey] = 0;
          }
          continue;
        }

        if (wangValue > 0) {
          peeringBits[godotKey] = wangValue - 1;
        }
      }

      const terrain = computeCenterTerrainIndex(
        wangTile.wangid,
        wangSet.type,
        legacyEdgeSet,
      );
      const assignments = assignmentsByLocalId.get(localId) ?? [];
      assignments.push({
        terrainSet: wangSetIndex,
        terrain,
        peeringBits,
        probability: readNamedTileProbability(
          tileset,
          wangSetIndex,
          localId,
          wangTile.wangid,
        ),
      });
      assignmentsByLocalId.set(localId, assignments);
    }
  });

  return {
    resourceLines,
    assignmentsByLocalId,
  };
}

export function buildGodotTerrainExportLines(
  tileset: Pick<Tileset, "autotile" | "imageHeight" | "imageWidth" | "tileSize">,
  options?: {
    tileShape?: number;
    tileOffsetAxis?: number;
    terrainSetOffset?: number;
  },
) {
  if (!tileset.autotile) {
    return {
      resourceLines: [] as string[],
      sourceLines: [] as string[],
      terrainSetCount: 0,
    };
  }

  const tileShape = options?.tileShape ?? GODOT_TILE_SHAPE_SQUARE;
  const tileOffsetAxis =
    options?.tileOffsetAxis ?? GODOT_TILE_OFFSET_AXIS_HORIZONTAL;
  const terrainSetOffset = options?.terrainSetOffset ?? 0;
  const { assignmentsByLocalId, resourceLines } = buildTileAssignments(
    tileset,
    tileShape,
    tileOffsetAxis,
  );

  const sourceLines: string[] = [];
  for (const [localId, assignments] of [...assignmentsByLocalId.entries()].sort(
    (left, right) => left[0] - right[0],
  )) {
    const coordinates = getLocalIdCoordinates(tileset, localId);
    if (!coordinates) {
      continue;
    }

    assignments.forEach((assignment, assignmentIndex) => {
      const alternativeId = assignmentIndex;
      if (alternativeId > 0) {
        sourceLines.push(`${coordinates.atlasX}:${coordinates.atlasY}/${alternativeId} = 0`);
      }

      sourceLines.push(
        `${coordinates.atlasX}:${coordinates.atlasY}/${alternativeId}/terrain_set = ${assignment.terrainSet + terrainSetOffset}`,
      );
      if (assignment.terrain >= 0) {
        sourceLines.push(
          `${coordinates.atlasX}:${coordinates.atlasY}/${alternativeId}/terrain = ${assignment.terrain}`,
        );
      }
      for (const [godotKey, value] of Object.entries(assignment.peeringBits)) {
        sourceLines.push(
          `${coordinates.atlasX}:${coordinates.atlasY}/${alternativeId}/terrains_peering_bit/${godotKey} = ${value}`,
        );
      }
      if (assignment.probability !== 1) {
        sourceLines.push(
          `${coordinates.atlasX}:${coordinates.atlasY}/${alternativeId}/probability = ${assignment.probability}`,
        );
      }
    });
  }

  return {
    resourceLines: resourceLines.map((line) =>
      line.replace(
        /^terrain_set_(\d+)\//,
        (_match, terrainSetIndex: string) =>
          `terrain_set_${Number.parseInt(terrainSetIndex, 10) + terrainSetOffset}/`,
      ),
    ),
    sourceLines,
    terrainSetCount: buildTiledJsonWangSets(tileset)?.length ?? 0,
  };
}

function parseTerrainSetDefinitions(resourceProperties: Record<string, string>) {
  const terrainSets = new Map<
    number,
    {
      mode: number;
      terrains: Map<number, { name: string; color: string }>;
    }
  >();

  for (const [key, rawValue] of Object.entries(resourceProperties)) {
    const modeMatch = key.match(/^terrain_set_(\d+)\/mode$/);
    if (modeMatch) {
      const terrainSetIndex = Number.parseInt(modeMatch[1]!, 10);
      const current =
        terrainSets.get(terrainSetIndex) ?? {
          mode: GODOT_TERRAIN_MODE_MATCH_SIDES,
          terrains: new Map<number, { name: string; color: string }>(),
        };
      current.mode = readNumber(rawValue, GODOT_TERRAIN_MODE_MATCH_SIDES);
      terrainSets.set(terrainSetIndex, current);
      continue;
    }

    const terrainMatch = key.match(
      /^terrain_set_(\d+)\/terrain_(\d+)\/(name|color)$/,
    );
    if (!terrainMatch) {
      continue;
    }

    const terrainSetIndex = Number.parseInt(terrainMatch[1]!, 10);
    const terrainIndex = Number.parseInt(terrainMatch[2]!, 10);
    const propertyName = terrainMatch[3]!;
    const current =
      terrainSets.get(terrainSetIndex) ?? {
        mode: GODOT_TERRAIN_MODE_MATCH_SIDES,
        terrains: new Map<number, { name: string; color: string }>(),
      };
    const terrain =
      current.terrains.get(terrainIndex) ?? {
        name: `Terrain ${terrainIndex + 1}`,
        color: GODOT_DEFAULT_TERRAIN_COLOR,
      };

    if (propertyName === "name") {
      terrain.name = parseGodotStringLiteral(rawValue) || terrain.name;
    } else {
      terrain.color = formatHexColorFromGodot(rawValue);
    }

    current.terrains.set(terrainIndex, terrain);
    terrainSets.set(terrainSetIndex, current);
  }

  return [...terrainSets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([index, terrainSet]) => ({
      index,
      mode: terrainSet.mode,
      terrains: [...terrainSet.terrains.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([terrainIndex, terrain]) => ({
          index: terrainIndex,
          ...terrain,
        })),
    }));
}

function parseTerrainTileAssignments(sourceProperties: Record<string, string>) {
  const assignments = new Map<
    string,
    {
      localId: number;
      alternativeId: number;
      terrainSet: number;
      terrain: number;
      probability: number;
      peeringBits: Record<string, number>;
    }
  >();

  for (const [key, rawValue] of Object.entries(sourceProperties)) {
    const match = key.match(/^(\d+):(\d+)\/(\d+)(?:\/(.+))?$/);
    if (!match) {
      continue;
    }

    const atlasX = Number.parseInt(match[1]!, 10);
    const atlasY = Number.parseInt(match[2]!, 10);
    const alternativeId = Number.parseInt(match[3]!, 10);
    const propertyPath = match[4] ?? null;
    if (!propertyPath) {
      continue;
    }

    const localId = atlasY * 100000 + atlasX;
    const assignmentKey = `${localId}:${alternativeId}`;
    const current =
      assignments.get(assignmentKey) ?? {
        localId,
        alternativeId,
        terrainSet: -1,
        terrain: -1,
        probability: 1,
        peeringBits: {},
      };

    if (propertyPath === "terrain_set") {
      current.terrainSet = readNumber(rawValue, -1);
    } else if (propertyPath === "terrain") {
      current.terrain = readNumber(rawValue, -1);
    } else if (propertyPath === "probability") {
      current.probability = readNumber(rawValue, 1);
    } else if (propertyPath.startsWith("terrains_peering_bit/")) {
      current.peeringBits[propertyPath.slice("terrains_peering_bit/".length)] =
        readNumber(rawValue, -1);
    }

    assignments.set(assignmentKey, current);
  }

  return [...assignments.values()].filter((assignment) => assignment.terrainSet >= 0);
}

function getAssignmentLocalId(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  encodedLocalId: number,
) {
  const atlasX = encodedLocalId % 100000;
  const atlasY = Math.floor(encodedLocalId / 100000);
  return getLocalIdFromAtlasCoordinates(tileset, atlasX, atlasY);
}

function isLegacyGodotEdgeSet(
  terrainSet: {
    terrains: Array<{ index: number }>;
  },
  assignments: Array<{ wangId: number[]; terrain: number }>,
  wangSetType: string,
) {
  return (
    wangSetType === "edge" &&
    terrainSet.terrains.length === 1 &&
    assignments.every((assignment) => {
      const edgeValues = [0, 2, 4, 6].map((index) => assignment.wangId[index] ?? 0);
      return (
        (assignment.terrain === -1 || assignment.terrain === 0) &&
        edgeValues.every((value) => value === 0 || value === 1)
      );
    })
  );
}

function buildTiledWangIdFromGodotAssignment(
  assignment: {
    peeringBits: Record<string, number>;
  },
  wangSetType: string,
  tileShape: number,
  tileOffsetAxis: number,
  legacyEdgeSet: boolean,
) {
  const wangId = Array(8).fill(0);
  const keyMap = getNeighborKeyMap(wangSetType, tileShape, tileOffsetAxis);

  for (const [position, godotKey] of Object.entries(keyMap)) {
    const positionIndex = AUTOTILE_WANG_POSITION_INDEXES[
      position as keyof typeof AUTOTILE_WANG_POSITION_INDEXES
    ];
    const terrainValue = assignment.peeringBits[godotKey];

    if (legacyEdgeSet) {
      wangId[positionIndex] = terrainValue === 0 ? 2 : 1;
      continue;
    }

    wangId[positionIndex] = terrainValue >= 0 ? terrainValue + 1 : 0;
  }

  return wangId;
}

export function buildAutotileFromGodotTerrainProperties(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  resourceProperties: Record<string, string>,
  sourceProperties: Record<string, string>,
) {
  const terrainSets = parseTerrainSetDefinitions(resourceProperties);
  if (terrainSets.length === 0) {
    return null;
  }

  const tileShape = readNumber(resourceProperties.tile_shape, GODOT_TILE_SHAPE_SQUARE);
  const tileOffsetAxis = readNumber(
    resourceProperties.tile_offset_axis,
    GODOT_TILE_OFFSET_AXIS_HORIZONTAL,
  );
  const rawAssignments = parseTerrainTileAssignments(sourceProperties);
  if (rawAssignments.length === 0) {
    return null;
  }

  const tiledWangSets = terrainSets.flatMap((terrainSet) => {
    const wangSetType = getWangSetTypeFromTerrainMode(terrainSet.mode);
    const assignments = rawAssignments
      .filter((assignment) => assignment.terrainSet === terrainSet.index)
      .map((assignment) => ({
        assignment,
        localId: getAssignmentLocalId(tileset, assignment.localId),
      }))
      .filter(
        (entry): entry is {
          assignment: (typeof rawAssignments)[number];
          localId: number;
        } => entry.localId >= 0,
      )
      .map((entry) => ({
        localId: entry.localId,
        terrain: entry.assignment.terrain,
        probability: entry.assignment.probability,
        wangId: buildTiledWangIdFromGodotAssignment(
          entry.assignment,
          wangSetType,
          tileShape,
          tileOffsetAxis,
          false,
        ),
      }));

    if (assignments.length === 0) {
      return [];
    }

    const legacyEdgeSet = isLegacyGodotEdgeSet(terrainSet, assignments, wangSetType);

    if (legacyEdgeSet) {
      const representativeTileId = inferRepresentativeTileId(
        assignments,
        1,
        wangSetType,
      );
      return [
        {
          name: terrainSet.terrains[0]?.name ?? `Wang Terrain ${terrainSet.index + 1}`,
          type: "edge",
          tile: representativeTileId,
          colors: [
            {
              name: "Open",
              color: GODOT_OPEN_COLOR,
              tile: -1,
              probability: 1,
            },
            {
              name: terrainSet.terrains[0]?.name ?? `Terrain ${terrainSet.index + 1}`,
              color: terrainSet.terrains[0]?.color ?? GODOT_DEFAULT_TERRAIN_COLOR,
              tile: representativeTileId,
              probability: 1,
            },
          ],
          wangtiles: assignments.map((assignment) => ({
            tileid: assignment.localId,
            wangid: assignment.wangId.map((value, index) =>
              index % 2 === 0 ? (value === 1 ? 2 : 1) : 0,
            ),
          })),
        },
      ];
    }

    const representativeAssignments = new Map<number, number>();
    terrainSet.terrains.forEach((terrain) => {
      representativeAssignments.set(
        terrain.index,
        inferRepresentativeTileId(assignments, terrain.index + 1, wangSetType),
      );
    });

    return [
      {
        name: `Wang Colors ${terrainSet.index + 1}`,
        type: wangSetType,
        tile: assignments[0]?.localId ?? -1,
        colors: terrainSet.terrains.map((terrain) => ({
          name: terrain.name,
          color: terrain.color,
          tile: representativeAssignments.get(terrain.index) ?? -1,
          probability: 1,
        })),
        wangtiles: assignments.map((assignment) => ({
          tileid: assignment.localId,
          wangid: assignment.wangId,
        })),
      },
    ];
  });

  if (tiledWangSets.length === 0) {
    return null;
  }

  const autotile = buildAutotileFromTiledWangSets(tileset, tiledWangSets);
  if (!autotile || autotile.preset !== "wang-named-colors") {
    return autotile;
  }

  const assignmentsBySignature = new Map<string, number>();
  tiledWangSets.forEach((wangSet, wangSetIndex) => {
    for (const wangTile of wangSet.wangtiles ?? []) {
      const matchingAssignment = rawAssignments.find((assignment) => {
        return (
          assignment.terrainSet === wangSetIndex &&
          getAssignmentLocalId(tileset, assignment.localId) === wangTile.tileid &&
          buildTiledWangIdFromGodotAssignment(
            assignment,
            wangSet.type ?? "edge",
            tileShape,
            tileOffsetAxis,
            false,
          ).join(",") === (wangTile.wangid ?? []).join(",")
        );
      });
      if (!matchingAssignment) {
        continue;
      }

      assignmentsBySignature.set(
        `${wangSetIndex}:${wangTile.tileid}:${(wangTile.wangid ?? []).join(",")}`,
        matchingAssignment.probability,
      );
    }
  });

  autotile.wangSets = (autotile.wangSets ?? []).map((wangSet, wangSetIndex) => ({
    ...wangSet,
    tiles: wangSet.tiles.map((wangTile) => {
      const localId = getLocalIdFromAtlasCoordinates(
        tileset,
        Math.floor((wangTile.tile?.sx ?? 0) / tileset.tileSize),
        Math.floor((wangTile.tile?.sy ?? 0) / tileset.tileSize),
      );

      return {
        ...wangTile,
        probability:
          assignmentsBySignature.get(
            `${wangSetIndex}:${localId}:${wangTile.wangId.join(",")}`,
          ) ?? wangTile.probability,
      };
    }),
  }));

  return autotile;
}