import {
  AUTOTILE_CONFIG_VERSION,
  type AutotileConfig,
  type AutotilePatternTiles,
  type AutotileWangColor,
  type AutotileWangId,
  type AutotileWangSet,
  type AutotileWangSetId,
  type AutotileWangSetType,
  type AutotileWangTile,
  type AutotileTileRegion,
  type TiledJsonWangColor,
  type TiledJsonWangSet,
  type TiledJsonWangTile,
  type Tileset,
} from "@/types";
import {
  buildPresetAutotileRules,
  createWangPatternId,
  parseWangMask,
  WANG_PATTERN_DEFINITIONS,
} from "@/features/map-editor/lib/autotile-preset-rules";
import { generateAutotileTerrainId } from "@/utils/ids";
import {
  getTileColumns,
  getTileCount,
} from "@/features/import-export/lib/tiled-xml-utils";

const TILED_WANG_ID_LENGTH = 8;
const TILED_WANG_OPEN_COLOR_INDEX = 1;
const TILED_WANG_TERRAIN_COLOR_INDEX = 2;
const TILED_WANG_EDGE_INDEXES = {
  north: 0,
  east: 2,
  south: 4,
  west: 6,
} as const;
const TILED_WANG_CORNER_INDEXES = [1, 3, 5, 7] as const;
const OPEN_WANG_COLOR = "#000000";
const TERRAIN_WANG_COLOR = "#ffffff";
const DEFAULT_NAMED_WANG_COLOR = "#999999";

const TILED_WANG_SET_TYPES = ["edge", "corner", "mixed"] as const;

function readNumber(value: string | null | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readProbability(value: number | null | undefined, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function normalizeTiledWangSetType(
  type: string | null | undefined,
): AutotileWangSetType {
  return TILED_WANG_SET_TYPES.find((candidate) => candidate === type) ?? "edge";
}

export function normalizeTiledWangId(
  wangId: readonly number[] | undefined,
): AutotileWangId | null {
  if (!wangId || wangId.length < TILED_WANG_ID_LENGTH) {
    return null;
  }

  const normalized = wangId.slice(0, TILED_WANG_ID_LENGTH).map((value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  });

  if (normalized.some((value) => value === null)) {
    return null;
  }

  return normalized as AutotileWangId;
}

function createNamedWangSetId(index: number) {
  return `tiled-wang-set-${index + 1}` as AutotileWangSetId;
}

function hasOnlyKnownWangColorIndexes(
  wangId: AutotileWangId,
  colors: readonly AutotileWangColor[],
) {
  const indexes = new Set(colors.map((color) => color.index));
  return wangId.every(
    (colorIndex) => colorIndex === 0 || indexes.has(colorIndex),
  );
}

function tileRegionToLocalId(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  region: AutotileTileRegion | null | undefined,
): number | null {
  if (!region) {
    return null;
  }

  const tileSize = tileset.tileSize;
  if (
    region.sw !== tileSize ||
    region.sh !== tileSize ||
    region.sx % tileSize !== 0 ||
    region.sy % tileSize !== 0 ||
    region.sx < 0 ||
    region.sy < 0 ||
    region.sx + region.sw > tileset.imageWidth ||
    region.sy + region.sh > tileset.imageHeight
  ) {
    return null;
  }

  const columns = getTileColumns(tileset);
  const tileX = Math.floor(region.sx / tileSize);
  const tileY = Math.floor(region.sy / tileSize);
  const localId = tileY * columns + tileX;

  return localId >= 0 && localId < getTileCount(tileset) ? localId : null;
}

function localIdToTileRegion(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  localId: number | null | undefined,
): AutotileTileRegion | null {
  if (
    localId === null ||
    localId === undefined ||
    !Number.isInteger(localId) ||
    localId < 0 ||
    localId >= getTileCount(tileset)
  ) {
    return null;
  }

  const columns = getTileColumns(tileset);
  const tileSize = tileset.tileSize;
  const tileX = localId % columns;
  const tileY = Math.floor(localId / columns);

  return {
    sx: tileX * tileSize,
    sy: tileY * tileSize,
    sw: tileSize,
    sh: tileSize,
  };
}

export function createTiledWangIdFromMask(mask: number): number[] {
  const wangId = Array(TILED_WANG_ID_LENGTH).fill(0) as number[];
  wangId[TILED_WANG_EDGE_INDEXES.north] =
    mask & 1 ? TILED_WANG_TERRAIN_COLOR_INDEX : TILED_WANG_OPEN_COLOR_INDEX;
  wangId[TILED_WANG_EDGE_INDEXES.east] =
    mask & 2 ? TILED_WANG_TERRAIN_COLOR_INDEX : TILED_WANG_OPEN_COLOR_INDEX;
  wangId[TILED_WANG_EDGE_INDEXES.south] =
    mask & 4 ? TILED_WANG_TERRAIN_COLOR_INDEX : TILED_WANG_OPEN_COLOR_INDEX;
  wangId[TILED_WANG_EDGE_INDEXES.west] =
    mask & 8 ? TILED_WANG_TERRAIN_COLOR_INDEX : TILED_WANG_OPEN_COLOR_INDEX;
  return wangId;
}

function parseTiledWangId(
  wangId: readonly number[] | undefined,
): number | null {
  if (!wangId || wangId.length < TILED_WANG_ID_LENGTH) {
    return null;
  }

  if (
    TILED_WANG_CORNER_INDEXES.some((index) => Number(wangId[index] ?? 0) !== 0)
  ) {
    return null;
  }

  let mask = 0;
  const edgeEntries = [
    [TILED_WANG_EDGE_INDEXES.north, 1],
    [TILED_WANG_EDGE_INDEXES.east, 2],
    [TILED_WANG_EDGE_INDEXES.south, 4],
    [TILED_WANG_EDGE_INDEXES.west, 8],
  ] as const;

  for (const [wangIndex, bit] of edgeEntries) {
    const colorIndex = Number(wangId[wangIndex] ?? 0);
    if (colorIndex === TILED_WANG_TERRAIN_COLOR_INDEX) {
      mask |= bit;
      continue;
    }

    if (colorIndex !== TILED_WANG_OPEN_COLOR_INDEX) {
      return null;
    }
  }

  return mask;
}

function buildTiledWangColors(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  terrainName: string,
  terrainTile: AutotileTileRegion | null | undefined,
): TiledJsonWangColor[] {
  return [
    {
      name: "Open",
      color: OPEN_WANG_COLOR,
      tile: -1,
      probability: 1,
    },
    {
      name: terrainName,
      color: TERRAIN_WANG_COLOR,
      tile: tileRegionToLocalId(tileset, terrainTile) ?? -1,
      probability: 1,
    },
  ];
}

function buildTiledWangTiles(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  patternTiles: AutotilePatternTiles | undefined,
): TiledJsonWangTile[] {
  return WANG_PATTERN_DEFINITIONS.flatMap((definition) => {
    const mask = parseWangMask(definition.id);
    const tileId = tileRegionToLocalId(tileset, patternTiles?.[definition.id]);

    if (mask === null || tileId === null) {
      return [];
    }

    return [
      {
        tileid: tileId,
        wangid: createTiledWangIdFromMask(mask),
      },
    ];
  });
}

function buildNamedTiledWangColors(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  colors: readonly AutotileWangColor[],
): TiledJsonWangColor[] {
  return [...colors]
    .sort((left, right) => left.index - right.index)
    .map((color) => ({
      name: color.name || `Color ${color.index}`,
      color: color.color || DEFAULT_NAMED_WANG_COLOR,
      tile: tileRegionToLocalId(tileset, color.tile) ?? -1,
      probability: readProbability(color.probability),
    }));
}

function buildColorIndexRemap(
  colors: readonly AutotileWangColor[],
): Map<number, number> {
  const sorted = [...colors].sort((a, b) => a.index - b.index);
  const remap = new Map<number, number>();
  sorted.forEach((color, i) => {
    remap.set(color.index, i + 1);
  });
  return remap;
}

function buildNamedTiledWangTiles(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  tiles: readonly AutotileWangTile[],
  colorIndexRemap: Map<number, number>,
): TiledJsonWangTile[] {
  return tiles.flatMap((wangTile) => {
    const tileId = tileRegionToLocalId(tileset, wangTile.tile);
    if (tileId === null) {
      return [];
    }

    return [
      {
        tileid: tileId,
        wangid: wangTile.wangId.map((index) =>
          index === 0 ? 0 : (colorIndexRemap.get(index) ?? 0),
        ),
      },
    ];
  });
}

function buildNamedTiledJsonWangSets(
  tileset: Pick<
    Tileset,
    "autotile" | "imageHeight" | "imageWidth" | "tileSize"
  >,
): TiledJsonWangSet[] {
  return (tileset.autotile?.wangSets ?? []).flatMap((wangSet) => {
    if (wangSet.colors.length === 0) {
      return [];
    }

    const colorIndexRemap = buildColorIndexRemap(wangSet.colors);
    const wangTiles = buildNamedTiledWangTiles(
      tileset,
      wangSet.tiles,
      colorIndexRemap,
    );

    return [
      {
        name: wangSet.name || "Wang Colors",
        type: wangSet.type,
        tile: tileRegionToLocalId(tileset, wangSet.tile) ?? -1,
        colors: buildNamedTiledWangColors(tileset, wangSet.colors),
        wangtiles: wangTiles,
      },
    ];
  });
}

export function buildTiledJsonWangSets(
  tileset: Pick<
    Tileset,
    "autotile" | "imageHeight" | "imageWidth" | "tileSize"
  >,
): TiledJsonWangSet[] | undefined {
  const autotile = tileset.autotile;
  if (!autotile) {
    return undefined;
  }

  if (autotile.preset === "wang-named-colors" || autotile.wangSets?.length) {
    const wangSets = buildNamedTiledJsonWangSets(tileset);
    return wangSets.length > 0 ? wangSets : undefined;
  }

  if (autotile.preset !== "wang-tiles") {
    return undefined;
  }

  const wangSets = autotile.terrains.flatMap((terrain) => {
    const wangTiles = buildTiledWangTiles(tileset, terrain.patternTiles);
    if (wangTiles.length === 0) {
      return [];
    }

    const terrainName = terrain.name || "Wang Terrain";
    return [
      {
        name: terrainName,
        type: "edge",
        tile: tileRegionToLocalId(tileset, terrain.paletteTile) ?? -1,
        colors: buildTiledWangColors(tileset, terrainName, terrain.paletteTile),
        wangtiles: wangTiles,
      },
    ];
  });

  return wangSets.length > 0 ? wangSets : undefined;
}

export function appendTiledXmlWangSets(
  document: XMLDocument,
  tilesetElement: Element,
  tileset: Pick<
    Tileset,
    "autotile" | "imageHeight" | "imageWidth" | "tileSize"
  >,
) {
  const wangSets = buildTiledJsonWangSets(tileset);
  if (!wangSets) {
    return;
  }

  appendTiledXmlWangSetElements(document, tilesetElement, wangSets);
}

export function appendTiledXmlWangSetElements(
  document: XMLDocument,
  tilesetElement: Element,
  wangSets: readonly TiledJsonWangSet[] | undefined,
) {
  if (!wangSets || wangSets.length === 0) {
    return;
  }

  const wangSetsElement = document.createElement("wangsets");

  for (const wangSet of wangSets) {
    const wangSetElement = document.createElement("wangset");
    wangSetElement.setAttribute("name", wangSet.name ?? "Wang Terrain");
    wangSetElement.setAttribute("type", wangSet.type ?? "edge");
    wangSetElement.setAttribute("tile", String(wangSet.tile ?? -1));

    for (const color of wangSet.colors ?? []) {
      const colorElement = document.createElement("wangcolor");
      colorElement.setAttribute("name", color.name ?? "Color");
      colorElement.setAttribute("color", color.color ?? TERRAIN_WANG_COLOR);
      colorElement.setAttribute("tile", String(color.tile ?? -1));
      colorElement.setAttribute("probability", String(color.probability ?? 1));
      wangSetElement.append(colorElement);
    }

    for (const wangTile of wangSet.wangtiles ?? []) {
      if (wangTile.tileid === undefined || !wangTile.wangid) {
        continue;
      }

      const wangTileElement = document.createElement("wangtile");
      wangTileElement.setAttribute("tileid", String(wangTile.tileid));
      wangTileElement.setAttribute("wangid", wangTile.wangid.join(","));
      wangSetElement.append(wangTileElement);
    }

    wangSetsElement.append(wangSetElement);
  }

  tilesetElement.append(wangSetsElement);
}

export function readTiledXmlWangSets(
  tilesetElement: Element,
): TiledJsonWangSet[] {
  const wangSetsElement = Array.from(tilesetElement.children).find(
    (child) => child.tagName === "wangsets",
  );

  if (!wangSetsElement) {
    return [];
  }

  return Array.from(wangSetsElement.children)
    .filter((child) => child.tagName === "wangset")
    .map((wangSetElement) => {
      const colors = Array.from(wangSetElement.children)
        .filter((child) => child.tagName === "wangcolor")
        .map((colorElement) => ({
          name: colorElement.getAttribute("name") ?? undefined,
          color: colorElement.getAttribute("color") ?? undefined,
          tile: readNumber(colorElement.getAttribute("tile"), -1),
          probability: readNumber(colorElement.getAttribute("probability"), 1),
        }));
      const wangtiles = Array.from(wangSetElement.children)
        .filter((child) => child.tagName === "wangtile")
        .map((wangTileElement) => ({
          tileid: readNumber(wangTileElement.getAttribute("tileid"), -1),
          wangid: (wangTileElement.getAttribute("wangid") ?? "")
            .split(",")
            .map((value) => Number(value.trim()) || 0),
        }));

      return {
        name: wangSetElement.getAttribute("name") ?? undefined,
        type: wangSetElement.getAttribute("type") ?? undefined,
        tile: readNumber(wangSetElement.getAttribute("tile"), -1),
        colors,
        wangtiles,
      };
    });
}

function normalizeColorValue(color: string | undefined) {
  return color?.trim().toLowerCase();
}

function isLegacyTilerEdgeWangSet(wangSet: TiledJsonWangSet): boolean {
  const colors = wangSet.colors ?? [];
  const openColor = colors[0];
  const terrainColor = colors[1];

  return (
    (!wangSet.type || wangSet.type === "edge") &&
    colors.length === 2 &&
    (openColor?.name ?? "Open") === "Open" &&
    normalizeColorValue(openColor?.color) === OPEN_WANG_COLOR &&
    normalizeColorValue(terrainColor?.color) === TERRAIN_WANG_COLOR &&
    readProbability(openColor?.probability) === 1 &&
    readProbability(terrainColor?.probability) === 1
  );
}

function buildLegacyTerrainFromTiledWangSet(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  wangSet: TiledJsonWangSet,
  index: number,
) {
  if (!isLegacyTilerEdgeWangSet(wangSet)) {
    return null;
  }

  const patternTiles: AutotilePatternTiles = {};
  let firstPatternTile: AutotileTileRegion | null = null;

  for (const wangTile of wangSet.wangtiles ?? []) {
    const mask = parseTiledWangId(wangTile.wangid);
    const tile = localIdToTileRegion(tileset, wangTile.tileid);
    if (mask === null || !tile) {
      continue;
    }

    patternTiles[createWangPatternId(mask)] = tile;
    firstPatternTile = firstPatternTile ?? tile;
  }

  if (!firstPatternTile) {
    return null;
  }

  const setTile = localIdToTileRegion(tileset, wangSet.tile);
  const allMatchingTile = patternTiles[createWangPatternId(15)] ?? null;

  return {
    id: generateAutotileTerrainId(),
    name: wangSet.name || `Wang Terrain ${index + 1}`,
    paletteTile: setTile ?? allMatchingTile ?? firstPatternTile,
    patternTiles,
  };
}

function buildNamedWangColorFromTiled(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  color: TiledJsonWangColor,
  index: number,
): AutotileWangColor {
  const colorIndex = index + 1;

  return {
    index: colorIndex,
    name: color.name || `Color ${colorIndex}`,
    color: color.color || DEFAULT_NAMED_WANG_COLOR,
    tile: localIdToTileRegion(tileset, color.tile),
    probability: readProbability(color.probability),
  };
}

function buildNamedWangTileFromTiled(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  wangTile: TiledJsonWangTile,
  colors: readonly AutotileWangColor[],
): AutotileWangTile | null {
  const tile = localIdToTileRegion(tileset, wangTile.tileid);
  const wangId = normalizeTiledWangId(wangTile.wangid);

  if (!tile || !wangId || !hasOnlyKnownWangColorIndexes(wangId, colors)) {
    return null;
  }

  return {
    tile,
    wangId,
    probability: 1,
  };
}

function buildNamedWangSetFromTiled(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  wangSet: TiledJsonWangSet,
  index: number,
): AutotileWangSet | null {
  const colors = (wangSet.colors ?? []).map((color, colorIndex) =>
    buildNamedWangColorFromTiled(tileset, color, colorIndex),
  );

  if (colors.length === 0) {
    return null;
  }

  const tiles = (wangSet.wangtiles ?? []).flatMap((wangTile) => {
    const built = buildNamedWangTileFromTiled(tileset, wangTile, colors);
    return built ? [built] : [];
  });

  return {
    id: createNamedWangSetId(index),
    name: wangSet.name || `Wang Colors ${index + 1}`,
    type: normalizeTiledWangSetType(wangSet.type),
    tile: localIdToTileRegion(tileset, wangSet.tile),
    colors,
    tiles,
  };
}

function buildLegacyAutotileFromTiledWangSets(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  wangSets: readonly TiledJsonWangSet[],
): AutotileConfig | null {
  const terrains = wangSets.flatMap((wangSet, index) => {
    const terrain = buildLegacyTerrainFromTiledWangSet(tileset, wangSet, index);
    return terrain ? [terrain] : [];
  });

  if (terrains.length === 0) {
    return null;
  }

  const autotile: AutotileConfig = {
    version: AUTOTILE_CONFIG_VERSION,
    preset: "wang-tiles",
    terrains,
    rules: [],
  };

  return {
    ...autotile,
    rules: buildPresetAutotileRules(autotile),
  };
}

export function buildAutotileFromTiledWangSets(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  wangSets: readonly TiledJsonWangSet[] | undefined,
): AutotileConfig | null {
  const tiledWangSets = wangSets ?? [];

  if (tiledWangSets.length === 0) {
    return null;
  }

  if (tiledWangSets.every(isLegacyTilerEdgeWangSet)) {
    return buildLegacyAutotileFromTiledWangSets(tileset, tiledWangSets);
  }

  const namedWangSets = tiledWangSets.flatMap((wangSet, index) => {
    const built = buildNamedWangSetFromTiled(tileset, wangSet, index);
    return built ? [built] : [];
  });

  if (namedWangSets.length === 0) {
    return buildLegacyAutotileFromTiledWangSets(tileset, tiledWangSets);
  }

  return {
    version: AUTOTILE_CONFIG_VERSION,
    preset: "wang-named-colors",
    terrains: [],
    rules: [],
    wangSets: namedWangSets,
  };
}
