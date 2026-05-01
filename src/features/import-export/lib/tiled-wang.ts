import {
  AUTOTILE_CONFIG_VERSION,
  type AutotileConfig,
  type AutotilePatternTiles,
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

function readNumber(value: string | null | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export function buildTiledJsonWangSets(
  tileset: Pick<
    Tileset,
    "autotile" | "imageHeight" | "imageWidth" | "tileSize"
  >,
): TiledJsonWangSet[] | undefined {
  const autotile = tileset.autotile;
  if (!autotile || autotile.preset !== "wang-tiles") {
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

function isSupportedEdgeWangSet(wangSet: TiledJsonWangSet): boolean {
  return (
    (!wangSet.type || wangSet.type === "edge") &&
    (wangSet.colors?.length ?? 0) === 2
  );
}

export function buildAutotileFromTiledWangSets(
  tileset: Pick<Tileset, "imageHeight" | "imageWidth" | "tileSize">,
  wangSets: readonly TiledJsonWangSet[] | undefined,
): AutotileConfig | null {
  const terrains = (wangSets ?? []).flatMap((wangSet, index) => {
    if (!isSupportedEdgeWangSet(wangSet)) {
      return [];
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
      return [];
    }

    const setTile = localIdToTileRegion(tileset, wangSet.tile);
    const allMatchingTile = patternTiles[createWangPatternId(15)] ?? null;

    return [
      {
        id: generateAutotileTerrainId(),
        name: wangSet.name || `Wang Terrain ${index + 1}`,
        paletteTile: setTile ?? allMatchingTile ?? firstPatternTile,
        patternTiles,
      },
    ];
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
