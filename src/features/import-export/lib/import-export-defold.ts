import { getAsset } from "@/services/db";
import {
  buildEntryMap,
  getProvidedEntry,
  importImageAsset,
} from "@/features/import-export/lib/tiled-map-import-shared";
import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  decodeText,
  getFileExtensionFromMimeType,
  getTileColumns,
  getTileCount,
  normalizeBundlePath,
  resolveBundlePath,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import { generateLayerId, generateMapId, generateTilesetId } from "@/utils/ids";
import type {
  DefoldMapExportOptions,
  DefoldMapFormat,
  DefoldMapImportPreparationResult,
  DefoldTilesetImportPreparationResult,
  ImportExportArchiveEntry,
  LayerGroup,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TileRef,
  Tileset,
  TilesetGroupId,
  TileSize,
} from "@/types";
import { TILE_SIZES } from "@/types";

export const DEFOLD_MAP_IMPORT_ACCEPT =
  ".tilemap,.collection,text/plain,application/octet-stream";
export const DEFOLD_TILESOURCE_IMPORT_ACCEPT =
  ".tilesource,text/plain,application/octet-stream";

const IMPORT_MAP_GROUP_ID = "__defold-import-map-group__";
const IMPORT_TILESET_GROUP_ID = "__defold-import-tileset-group__";
const DEFAULT_DEFOLD_TILEMAP_MATERIAL = "/builtins/materials/tile_map.material";

interface DefoldTilesourceDocument {
  imagePath: string;
  tileWidth: number;
  tileHeight: number;
  tileMargin: number;
  tileSpacing: number;
}

interface DefoldTilemapCellDocument {
  x: number;
  y: number;
  tile: number;
  hFlip: boolean;
  vFlip: boolean;
}

interface DefoldTilemapLayerDocument {
  id: string;
  z: number;
  isVisible: boolean;
  cells: DefoldTilemapCellDocument[];
}

interface DefoldTilemapDocument {
  tileSetPath: string;
  layers: DefoldTilemapLayerDocument[];
}

interface DefoldTilesourceBundleResult {
  entries: ImportExportArchiveEntry[];
  tilesourcePath: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeDefoldString(value: string) {
  return JSON.stringify(value);
}

function encodeDefoldText(lines: string[]) {
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

function decodeDefoldText(path: string, data: Uint8Array) {
  const text = decodeText(data).replace(/\r\n?/g, "\n");
  if (text.includes("\u0000")) {
    throw new Error(`Binary Defold resources are not supported: ${path}.`);
  }
  return text;
}

function formatDefoldResourcePath(path: string) {
  const normalized = normalizeBundlePath(path);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function getScalarValue(block: string, key: string) {
  const match = block.match(
    new RegExp(`(?:^|\\n)\\s*${escapeRegExp(key)}:\\s*(.+)$`, "m"),
  );
  return match?.[1]?.trim() ?? null;
}

function parseDefoldStringLiteral(rawValue: string | null) {
  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue) as string;
  }

  return rawValue;
}

function parseNumber(rawValue: string | null, fallback = 0) {
  const parsed = Number(rawValue ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFlag(rawValue: string | null) {
  return parseNumber(rawValue, 0) !== 0;
}

function extractNamedBlocks(text: string, blockName: string) {
  const blocks: string[] = [];
  const pattern = new RegExp(`\\b${escapeRegExp(blockName)}\\s*\\{`, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const openBraceIndex = text.indexOf("{", match.index);
    let depth = 1;
    let cursor = openBraceIndex + 1;

    while (cursor < text.length && depth > 0) {
      const character = text[cursor];
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
      }
      cursor += 1;
    }

    if (depth !== 0) {
      throw new Error(`Invalid Defold ${blockName} block.`);
    }

    blocks.push(text.slice(openBraceIndex + 1, cursor - 1).trim());
    pattern.lastIndex = cursor;
  }

  return blocks;
}

function normalizeDefoldMapName(path: string) {
  const fileName = stripExtension(path).split("/").pop() ?? "defold-map";
  return fileName || "defold-map";
}

function normalizeDefoldLayerName(name: string, index: number) {
  const candidate = name.trim();
  return candidate.length > 0 ? candidate : `layer-${index + 1}`;
}

function toDefoldComponentId(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function getSupportedDefoldFlipState(
  ref: Pick<TileRef, "rotation" | "flipX" | "flipY">,
) {
  const rotation = (((ref.rotation ?? 0) % 360) + 360) % 360;
  const flipX = ref.flipX ?? false;
  const flipY = ref.flipY ?? false;

  switch (`${rotation}:${flipX ? 1 : 0}:${flipY ? 1 : 0}`) {
    case "0:0:0":
      return { hFlip: false, vFlip: false };
    case "0:1:0":
      return { hFlip: true, vFlip: false };
    case "0:0:1":
      return { hFlip: false, vFlip: true };
    case "0:1:1":
    case "180:0:0":
      return { hFlip: true, vFlip: true };
    default:
      throw new Error(
        "Defold export only supports unrotated tiles, flips, and 180-degree rotations.",
      );
  }
}

function parseDefoldTilesourceDocument(
  path: string,
  data: Uint8Array,
): DefoldTilesourceDocument {
  const text = decodeDefoldText(path, data);
  return {
    imagePath: resolveBundlePath(
      path,
      parseDefoldStringLiteral(getScalarValue(text, "image")),
    ),
    tileWidth: parseNumber(getScalarValue(text, "tile_width"), 0),
    tileHeight: parseNumber(getScalarValue(text, "tile_height"), 0),
    tileMargin: parseNumber(getScalarValue(text, "tile_margin"), 0),
    tileSpacing: parseNumber(getScalarValue(text, "tile_spacing"), 0),
  };
}

function parseDefoldTilemapDocument(
  path: string,
  data: Uint8Array,
): DefoldTilemapDocument {
  const text = decodeDefoldText(path, data);
  const tileSetPath = resolveBundlePath(
    path,
    parseDefoldStringLiteral(getScalarValue(text, "tile_set")),
  );
  if (!tileSetPath) {
    throw new Error(`Missing Defold tile_set reference in ${path}.`);
  }

  const layers = extractNamedBlocks(text, "layers").map(
    (layerBlock, index) => ({
      id: normalizeDefoldLayerName(
        parseDefoldStringLiteral(getScalarValue(layerBlock, "id")),
        index,
      ),
      z: parseNumber(getScalarValue(layerBlock, "z"), index),
      isVisible: !getScalarValue(layerBlock, "is_visible")
        ? true
        : parseFlag(getScalarValue(layerBlock, "is_visible")),
      cells: extractNamedBlocks(layerBlock, "cell").map((cellBlock) => ({
        x: parseNumber(getScalarValue(cellBlock, "x"), 0),
        y: parseNumber(getScalarValue(cellBlock, "y"), 0),
        tile: parseNumber(getScalarValue(cellBlock, "tile"), -1),
        hFlip: parseFlag(getScalarValue(cellBlock, "h_flip")),
        vFlip: parseFlag(getScalarValue(cellBlock, "v_flip")),
      })),
    }),
  );

  return {
    tileSetPath,
    layers,
  };
}

function extractDefoldCollectionTilemapPaths(path: string, data: Uint8Array) {
  const text = decodeDefoldText(path, data);
  const matches = text.matchAll(
    /component:\s+(?:\\)?"([^"\n]+\.tilemap)(?:\\)?"/g,
  );
  const paths = new Set<string>();

  for (const match of matches) {
    const rawPath = match[1];
    if (!rawPath) {
      continue;
    }
    paths.add(resolveBundlePath(path, rawPath));
  }

  return [...paths];
}

function ensureSupportedTilesource(
  document: DefoldTilesourceDocument,
  path: string,
) {
  if (document.tileWidth !== document.tileHeight) {
    throw new Error(
      `Defold tilesource ${path} uses non-square tiles, which are not supported yet.`,
    );
  }

  if (document.tileMargin !== 0 || document.tileSpacing !== 0) {
    throw new Error(
      `Defold tilesource ${path} uses tile margin or spacing, which 2D Tiler does not support yet.`,
    );
  }

  if (!TILE_SIZES.includes(document.tileWidth as TileSize)) {
    throw new Error(
      `Unsupported Defold tile size ${document.tileWidth} in ${path}.`,
    );
  }
}

async function createImportedDefoldTileset(
  tilesourcePath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const tilesourceData = getProvidedEntry(providedEntries, tilesourcePath);
  if (!tilesourceData) {
    return {
      status: "missing-resources" as const,
      missingResource: {
        path: normalizeBundlePath(tilesourcePath),
        kind: "tilesource" as const,
        referringPath: normalizeBundlePath(tilesourcePath),
        label: "Tile source resource",
      },
    };
  }

  const document = parseDefoldTilesourceDocument(
    tilesourcePath,
    tilesourceData,
  );
  ensureSupportedTilesource(document, tilesourcePath);

  const imageData = getProvidedEntry(providedEntries, document.imagePath);
  if (!imageData) {
    return {
      status: "missing-resources" as const,
      missingResource: {
        path: normalizeBundlePath(document.imagePath),
        kind: "image" as const,
        referringPath: normalizeBundlePath(tilesourcePath),
        label: "Image asset",
      },
    };
  }

  const importedImage = await importImageAsset(document.imagePath, imageData);
  const tileset: Tileset = {
    id: generateTilesetId(),
    name: normalizeDefoldMapName(tilesourcePath),
    groupId: IMPORT_TILESET_GROUP_ID as TilesetGroupId,
    tileSize: document.tileWidth as TileSize,
    assetId: importedImage.assetId,
    imageWidth: importedImage.width,
    imageHeight: importedImage.height,
    createdAt: Date.now(),
  };

  return {
    status: "ready" as const,
    tileset,
  };
}

function getMapReferencedTilesets(
  layers: readonly TileLayer[],
  availableTilesets: readonly Tileset[],
) {
  const referencedIds = new Set<string>();

  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedIds.add(ref.tilesetId as string);
    }
  }

  if (referencedIds.size === 0) {
    if (availableTilesets.length === 1) {
      return [availableTilesets[0]];
    }

    throw new Error(
      "Defold export requires exactly one tileset when the map has no painted tiles.",
    );
  }

  const referencedTilesets = availableTilesets.filter((tileset) =>
    referencedIds.has(tileset.id as string),
  );

  if (referencedTilesets.length !== 1) {
    throw new Error(
      "Defold tilemaps support exactly one tilesource per map export.",
    );
  }

  return referencedTilesets;
}

async function buildDefoldTilesourceBundle(
  tileset: Tileset,
  options?: {
    imageFolder?: string;
    tilesourceFolder?: string;
    imageBaseName?: string;
    tilesourceBaseName?: string;
    usedPaths?: Set<string>;
  },
): Promise<DefoldTilesourceBundleResult> {
  const assetRecord = await getAsset(tileset.assetId);
  if (!assetRecord) {
    throw new Error(`Missing tileset asset for ${tileset.name}.`);
  }

  const usedPaths = options?.usedPaths ?? new Set<string>();
  const imagePath = createRelativeAssetPath(
    options?.imageFolder ?? "images",
    options?.imageBaseName ?? tileset.name,
    getFileExtensionFromMimeType(assetRecord.mimeType),
    usedPaths,
  );
  const tilesourcePath = createRelativeAssetPath(
    options?.tilesourceFolder ?? "",
    options?.tilesourceBaseName ?? tileset.name,
    ".tilesource",
    usedPaths,
  );

  const lines = [
    `image: ${escapeDefoldString(formatDefoldResourcePath(imagePath))}`,
    `tile_width: ${tileset.tileSize}`,
    `tile_height: ${tileset.tileSize}`,
    "tile_margin: 0",
    "tile_spacing: 0",
    'collision: ""',
    'material_tag: "tile"',
    'collision_groups: "default"',
    "animations {",
    '  id: "anim"',
    `  start_tile: 1`,
    `  end_tile: ${Math.max(1, getTileCount(tileset))}`,
    "  playback: PLAYBACK_ONCE_FORWARD",
    "  fps: 30",
    "  flip_horizontal: 0",
    "  flip_vertical: 0",
    "}",
    "extrude_borders: 0",
    "inner_padding: 0",
  ];

  return {
    entries: [
      {
        path: imagePath,
        data: new Uint8Array(assetRecord.data),
      },
      {
        path: tilesourcePath,
        data: encodeDefoldText(lines),
      },
    ],
    tilesourcePath,
  };
}

function buildDefoldTilemapText(
  layers: readonly TileLayer[],
  tileset: Tileset,
  tilesourcePath: string,
) {
  const lines = [
    `tile_set: ${escapeDefoldString(formatDefoldResourcePath(tilesourcePath))}`,
  ];
  const columns = getTileColumns(tileset);

  for (const [index, layer] of layers.entries()) {
    lines.push("layers {");
    lines.push(`  id: ${escapeDefoldString(layer.name)}`);
    lines.push(`  z: ${index}.0`);
    lines.push(`  is_visible: ${layer.visible ? 1 : 0}`);

    const entries = Object.entries(layer.tiles)
      .map(([coordinate, ref]) => ({ coordinate, ref }))
      .sort((left, right) => {
        const [leftX, leftY] = left.coordinate.split(",").map(Number);
        const [rightX, rightY] = right.coordinate.split(",").map(Number);
        return leftY - rightY || leftX - rightX;
      });

    for (const { coordinate, ref } of entries) {
      if (ref.tilesetId !== tileset.id) {
        throw new Error(
          "Defold export does not support maps that mix multiple tilesets.",
        );
      }

      const [x, y] = coordinate.split(",").map((value) => Number(value));
      const tileX = Math.floor(ref.sx / tileset.tileSize);
      const tileY = Math.floor(ref.sy / tileset.tileSize);
      const tileId = tileY * columns + tileX;
      const transform = getSupportedDefoldFlipState(ref);

      lines.push("  cell {");
      lines.push(`    x: ${x}`);
      lines.push(`    y: ${y}`);
      lines.push(`    tile: ${tileId}`);
      lines.push(`    h_flip: ${transform.hFlip ? 1 : 0}`);
      lines.push(`    v_flip: ${transform.vFlip ? 1 : 0}`);
      lines.push("  }");
    }

    lines.push("}");
  }

  lines.push(
    `material: ${escapeDefoldString(DEFAULT_DEFOLD_TILEMAP_MATERIAL)}`,
  );
  lines.push("blend_mode: BLEND_MODE_ALPHA");

  return encodeDefoldText(lines);
}

function buildDefoldCollectionText(name: string, tilemapPath: string) {
  const componentId = toDefoldComponentId(name, "tilemap");
  const embeddedComponentLines = [
    "components {",
    `  id: ${escapeDefoldString(componentId)}`,
    `  component: ${escapeDefoldString(formatDefoldResourcePath(tilemapPath))}`,
    "  position {",
    "    x: 0.0",
    "    y: 0.0",
    "    z: 0.0",
    "  }",
    "  rotation {",
    "    x: 0.0",
    "    y: 0.0",
    "    z: 0.0",
    "    w: 1.0",
    "  }",
    "}",
  ];

  const dataLines = embeddedComponentLines.map(
    (line) => `"${line.replace(/\\/g, "\\\\").replace(/\"/g, '\\\"')}\\n"`,
  );

  return encodeDefoldText([
    `name: ${escapeDefoldString(name)}`,
    "scale_along_z: 0",
    "embedded_instances {",
    '  id: "go"',
    "  data:",
    ...dataLines.map((line) => `  ${line}`),
    "  position {",
    "    x: 0.0",
    "    y: 0.0",
    "    z: 0.0",
    "  }",
    "  rotation {",
    "    x: 0.0",
    "    y: 0.0",
    "    z: 0.0",
    "    w: 1.0",
    "  }",
    "  scale3 {",
    "    x: 1.0",
    "    y: 1.0",
    "    z: 1.0",
    "  }",
    "}",
  ]);
}

export async function exportDefoldTilesourceBundle(
  tileset: Tileset,
): Promise<ImportExportArchiveEntry[]> {
  return (await buildDefoldTilesourceBundle(tileset)).entries;
}

export async function exportDefoldMapBundle(
  map: TileMapData,
  layers: readonly TileLayer[],
  tilesets: readonly Tileset[],
  imageLayers: readonly LayerGroup[] | readonly unknown[] = [],
  layerGroups: readonly LayerGroup[] = [],
  objectLayers: readonly ObjectLayer[] = [],
  objects: readonly MapObject[] = [],
  options?: DefoldMapExportOptions,
): Promise<ImportExportArchiveEntry[]> {
  if (map.orientation !== "orthogonal") {
    throw new Error("Defold export only supports orthogonal maps.");
  }

  if (
    imageLayers.length > 0 ||
    layerGroups.length > 0 ||
    objectLayers.length > 0 ||
    objects.length > 0
  ) {
    throw new Error(
      "Defold export currently supports tile layers only. Image layers, groups, and objects are not supported.",
    );
  }

  const [tileset] = getMapReferencedTilesets(layers, tilesets);
  const usedPaths = new Set<string>();
  const format: DefoldMapFormat = options?.format ?? "collection";
  const tilesourceBundle = await buildDefoldTilesourceBundle(tileset, {
    imageFolder: "images",
    tilesourceFolder: "tilesources",
    usedPaths,
  });
  const tilemapPath = createRelativeAssetPath(
    "",
    map.name,
    ".tilemap",
    usedPaths,
  );
  const entries: ImportExportArchiveEntry[] = [
    ...tilesourceBundle.entries,
    {
      path: tilemapPath,
      data: buildDefoldTilemapText(
        layers,
        tileset,
        tilesourceBundle.tilesourcePath,
      ),
    },
  ];

  if (format === "collection") {
    const collectionPath = createRelativeAssetPath(
      "",
      map.name,
      ".collection",
      usedPaths,
    );
    entries.push({
      path: collectionPath,
      data: buildDefoldCollectionText(map.name, tilemapPath),
    });
  }

  return entries;
}

export async function prepareDefoldTilesetImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<DefoldTilesetImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  const providedEntries = buildEntryMap(entries);
  const result = await createImportedDefoldTileset(
    normalizedRootPath,
    providedEntries,
  );

  if (result.status === "missing-resources") {
    return {
      status: "missing-resources",
      rootPath: normalizedRootPath,
      missingResources: [result.missingResource],
    };
  }

  return {
    status: "ready",
    result: [result.tileset],
  };
}

export async function prepareDefoldMapImport(
  rootPath: string,
  entries: readonly ImportExportArchiveEntry[],
): Promise<DefoldMapImportPreparationResult> {
  const normalizedRootPath = normalizeBundlePath(rootPath);
  const providedEntries = buildEntryMap(entries);
  const rootData = getProvidedEntry(providedEntries, normalizedRootPath);
  if (!rootData) {
    throw new Error(`Missing Defold root resource: ${normalizedRootPath}.`);
  }

  let format: DefoldMapFormat = "tilemap";
  let tilemapPath = normalizedRootPath;

  if (normalizedRootPath.toLowerCase().endsWith(".collection")) {
    format = "collection";
    const tilemapPaths = extractDefoldCollectionTilemapPaths(
      normalizedRootPath,
      rootData,
    );
    if (tilemapPaths.length === 0) {
      throw new Error(
        "The Defold collection does not reference any tilemap components.",
      );
    }
    if (tilemapPaths.length > 1) {
      throw new Error(
        "Collections containing multiple tilemap components are not supported yet.",
      );
    }
    tilemapPath = tilemapPaths[0];
    if (!getProvidedEntry(providedEntries, tilemapPath)) {
      return {
        status: "missing-resources",
        format,
        rootPath: normalizedRootPath,
        missingResources: [
          {
            path: normalizeBundlePath(tilemapPath),
            kind: "tilemap",
            referringPath: normalizedRootPath,
            label: "Tilemap resource",
          },
        ],
      };
    }
  }

  const tilemapData = getProvidedEntry(providedEntries, tilemapPath);
  if (!tilemapData) {
    throw new Error(`Missing Defold tilemap resource: ${tilemapPath}.`);
  }

  const tilemapDocument = parseDefoldTilemapDocument(tilemapPath, tilemapData);
  const importedTileset = await createImportedDefoldTileset(
    tilemapDocument.tileSetPath,
    providedEntries,
  );

  if (importedTileset.status === "missing-resources") {
    return {
      status: "missing-resources",
      format,
      rootPath: normalizedRootPath,
      missingResources: [importedTileset.missingResource],
    };
  }

  const tileset = importedTileset.tileset;
  const columns = getTileColumns(tileset);
  const layerDocuments = [...tilemapDocument.layers].sort(
    (left, right) => left.z - right.z,
  );
  const mapId = generateMapId();
  const layers: TileLayer[] = [];
  const layerOrder: string[] = [];
  let widthInTiles = 1;
  let heightInTiles = 1;

  for (const layerDocument of layerDocuments) {
    const layerId = generateLayerId();
    const tiles: TileLayer["tiles"] = {};

    for (const cell of layerDocument.cells) {
      if (cell.tile < 0) {
        continue;
      }

      const tileX = cell.tile % columns;
      const tileY = Math.floor(cell.tile / columns);
      if (tileX < 0 || tileY < 0) {
        continue;
      }

      widthInTiles = Math.max(widthInTiles, cell.x + 1);
      heightInTiles = Math.max(heightInTiles, cell.y + 1);
      tiles[`${cell.x},${cell.y}`] = {
        tilesetId: tileset.id,
        sx: tileX * tileset.tileSize,
        sy: tileY * tileset.tileSize,
        sw: tileset.tileSize,
        sh: tileset.tileSize,
        ...(cell.hFlip ? { flipX: true } : {}),
        ...(cell.vFlip ? { flipY: true } : {}),
      };
    }

    layers.push({
      id: layerId,
      mapId,
      name: layerDocument.id,
      type: "tile",
      visible: layerDocument.isVisible,
      locked: false,
      tiles,
    });
    layerOrder.push(layerId);
  }

  const map: TileMapData = {
    id: mapId,
    name: normalizeDefoldMapName(normalizedRootPath),
    groupId: IMPORT_MAP_GROUP_ID as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles,
    heightInTiles,
    tileSize: tileset.tileSize,
    properties: {},
    layerOrder: layerOrder as TileMapData["layerOrder"],
    createdAt: Date.now(),
  };

  return {
    status: "ready",
    result: {
      map,
      layers,
      tilesets: [tileset],
      imageLayers: [],
      layerGroups: [],
      objectLayers: [],
      objects: [],
    },
  };
}
