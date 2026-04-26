import { generateLayerId, generateMapId, generateTilesetId } from "@/utils/ids";
import {
  decodeText,
  normalizeBundlePath,
  parseXmlDocument,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  buildEntryMap,
  getProvidedEntry,
  importImageAsset,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import type {
  GameMakerImportMissingResource,
  GameMakerMapFormat,
  GameMakerMapImportPreparationResult,
  GameMakerMapImportResult,
  ImportExportArchiveEntry,
  TileLayer,
  TileMapData,
  TileSize,
  Tileset,
} from "@/types";

export const GAME_MAKER_MAP_IMPORT_ACCEPT =
  ".room.gmx,.yy,text/xml,application/xml,application/json,text/json,text/plain,application/octet-stream";

type LegacyTilesetDescriptor = {
  name: string;
  imagePath: string;
  tileSize: number;
};

type ModernTilesetDescriptor = {
  path: string;
  name: string;
  imagePath: string;
  tileSize: number;
  tileXOffset: number;
  tileYOffset: number;
  tileSeparation: number;
  outColumns: number;
};

function detectGameMakerMapFormat(fileName: string): GameMakerMapFormat | null {
  const normalizedFileName = fileName.toLowerCase();

  if (normalizedFileName.endsWith(".room.gmx")) {
    return "gmx";
  }

  if (normalizedFileName.endsWith(".yy")) {
    return "yy";
  }

  return null;
}

function addMissingResource(
  missingResources: Map<string, GameMakerImportMissingResource>,
  path: string,
  kind: GameMakerImportMissingResource["kind"],
  referringPath: string,
  label: string,
) {
  const normalizedPath = normalizeBundlePath(path);
  if (missingResources.has(normalizedPath)) {
    return;
  }

  missingResources.set(normalizedPath, {
    path: normalizedPath,
    kind,
    referringPath: normalizeBundlePath(referringPath),
    label,
  });
}

function readNumberField(
  value: Record<string, unknown>,
  keys: string[],
  fallback = 0,
) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string" && candidate.trim() !== "") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function readStringField(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }

  return null;
}

function parseJsonEntry(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  return JSON.parse(
    decodeText(requireProvidedEntry(providedEntries, path)),
  ) as Record<string, unknown>;
}

function toTileSize(value: number): TileSize {
  if (value <= 0 || value !== Math.floor(value)) {
    throw new Error(`Unsupported GameMaker tile size: ${value}.`);
  }

  return value as TileSize;
}

function getLegacyTilesetDescriptors(document: XMLDocument) {
  const descriptors = new Map<string, LegacyTilesetDescriptor>();

  for (const element of Array.from(
    document.querySelectorAll("tilesetResources > tileset"),
  )) {
    const name = element.getAttribute("name");
    const imagePath = element.getAttribute("image");
    const tileSize = Number(element.getAttribute("tileSize") ?? "0");
    if (!name || !imagePath || tileSize <= 0) {
      continue;
    }

    descriptors.set(name, {
      name,
      imagePath,
      tileSize,
    });
  }

  return descriptors;
}

function collectMissingLegacyResources(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const document = parseXmlDocument(
    decodeText(requireProvidedEntry(providedEntries, rootPath)),
  );
  const descriptors = getLegacyTilesetDescriptors(document);
  const missingResources = new Map<string, GameMakerImportMissingResource>();

  for (const tileElement of Array.from(
    document.querySelectorAll("tiles > tile"),
  )) {
    const bgName = tileElement.getAttribute("bgName");
    if (!bgName) {
      continue;
    }

    const imagePath =
      tileElement.getAttribute("bgPath") ??
      descriptors.get(bgName)?.imagePath ??
      `images/${bgName}.png`;
    if (!getProvidedEntry(providedEntries, imagePath)) {
      addMissingResource(
        missingResources,
        imagePath,
        "image",
        rootPath,
        `Tileset image: ${bgName}`,
      );
    }
  }

  return [...missingResources.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function collectMissingModernResources(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const room = parseJsonEntry(providedEntries, rootPath);
  const layers = Array.isArray(room.layers) ? room.layers : [];
  const missingResources = new Map<string, GameMakerImportMissingResource>();

  for (const layer of layers) {
    if (!layer || typeof layer !== "object") {
      continue;
    }

    const layerRecord = layer as Record<string, unknown>;
    const resourceType = readStringField(layerRecord, [
      "resourceType",
      "modelName",
      "__type",
    ]);
    if (!resourceType?.includes("TileLayer")) {
      continue;
    }

    const tilesetId = layerRecord.tilesetId;
    const tilesetPath =
      tilesetId && typeof tilesetId === "object"
        ? readStringField(tilesetId as Record<string, unknown>, ["path"])
        : readStringField(layerRecord, ["tilesetPath"]);
    const tilesetName =
      tilesetId && typeof tilesetId === "object"
        ? readStringField(tilesetId as Record<string, unknown>, ["name"])
        : readStringField(layerRecord, ["tilesetName", "name"]);
    const resolvedTilesetPath =
      tilesetPath ??
      (tilesetName ? `tilesets/${tilesetName}/${tilesetName}.yy` : null);

    if (!resolvedTilesetPath) {
      throw new Error(
        "GameMaker YY tile layer is missing a tileset reference.",
      );
    }

    if (!getProvidedEntry(providedEntries, resolvedTilesetPath)) {
      addMissingResource(
        missingResources,
        resolvedTilesetPath,
        "json",
        rootPath,
        `Tileset resource: ${tilesetName ?? stripExtension(resolvedTilesetPath)}`,
      );
      continue;
    }

    const tilesetRecord = parseJsonEntry(providedEntries, resolvedTilesetPath);
    const imagePath =
      readStringField(tilesetRecord, [
        "texturePath",
        "imagePath",
        "sourceImagePath",
      ]) ??
      `images/${stripExtension(resolvedTilesetPath).split("/").pop() ?? "tileset"}.png`;
    if (!getProvidedEntry(providedEntries, imagePath)) {
      addMissingResource(
        missingResources,
        imagePath,
        "image",
        resolvedTilesetPath,
        `Tileset image: ${tilesetName ?? stripExtension(resolvedTilesetPath)}`,
      );
    }
  }

  return [...missingResources.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

async function importLegacyRoom(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
): Promise<GameMakerMapImportResult> {
  const document = parseXmlDocument(
    decodeText(requireProvidedEntry(providedEntries, rootPath)),
  );
  const tileElements = Array.from(document.querySelectorAll("tiles > tile"));
  const legacyDescriptors = getLegacyTilesetDescriptors(document);
  const referencedTilesets = new Map<string, Tileset>();

  for (const tileElement of tileElements) {
    const bgName = tileElement.getAttribute("bgName");
    if (!bgName || referencedTilesets.has(bgName)) {
      continue;
    }

    const descriptor = legacyDescriptors.get(bgName);
    const tileSize = Number(
      descriptor?.tileSize ?? tileElement.getAttribute("w") ?? "0",
    );
    if (tileSize <= 0) {
      throw new Error(
        `Unable to resolve tile size for GameMaker tileset ${bgName}.`,
      );
    }

    const imagePath =
      tileElement.getAttribute("bgPath") ??
      descriptor?.imagePath ??
      `images/${bgName}.png`;
    const importedImage = await importImageAsset(
      imagePath,
      requireProvidedEntry(providedEntries, imagePath),
    );
    referencedTilesets.set(bgName, {
      id: generateTilesetId(),
      name: bgName,
      groupId: "gamemaker-import" as Tileset["groupId"],
      tileSize: toTileSize(tileSize),
      assetId: importedImage.assetId,
      imageWidth: importedImage.width,
      imageHeight: importedImage.height,
      createdAt: Date.now(),
    });
  }

  const layersByDepth = new Map<number, Element[]>();
  for (const tileElement of tileElements) {
    const depth = Number(tileElement.getAttribute("depth") ?? "0");
    const bucket = layersByDepth.get(depth) ?? [];
    bucket.push(tileElement);
    layersByDepth.set(depth, bucket);
  }

  const orderedDepths = [...layersByDepth.keys()].sort(
    (left, right) => right - left,
  );
  const layers: TileLayer[] = [];
  const layerOrder: TileMapData["layerOrder"] = [];
  let maxCellX = 0;
  let maxCellY = 0;
  let mapTileSize: TileSize | null = null;

  orderedDepths.forEach((depth, index) => {
    const entries = layersByDepth.get(depth) ?? [];
    const layerId = generateLayerId();
    const tiles: TileLayer["tiles"] = {};

    for (const tileElement of entries) {
      const bgName = tileElement.getAttribute("bgName");
      if (!bgName) {
        continue;
      }

      const tileset = referencedTilesets.get(bgName);
      if (!tileset) {
        continue;
      }

      mapTileSize ??= tileset.tileSize;
      if (mapTileSize !== tileset.tileSize) {
        throw new Error(
          "GameMaker import requires all tilesets to use the same tile size.",
        );
      }

      const x = Number(tileElement.getAttribute("x") ?? "0");
      const y = Number(tileElement.getAttribute("y") ?? "0");
      const cellX = Math.round(x / tileset.tileSize);
      const cellY = Math.round(y / tileset.tileSize);
      maxCellX = Math.max(maxCellX, cellX);
      maxCellY = Math.max(maxCellY, cellY);
      tiles[`${cellX},${cellY}`] = {
        tilesetId: tileset.id,
        sx: Number(tileElement.getAttribute("xo") ?? "0"),
        sy: Number(tileElement.getAttribute("yo") ?? "0"),
        sw: tileset.tileSize,
        sh: tileset.tileSize,
      };
    }

    layers.push({
      id: layerId,
      mapId: "gamemaker-import" as TileMapData["id"],
      name: entries[0]?.getAttribute("name") ?? `Tiles ${index + 1}`,
      visible: true,
      locked: false,
      tiles,
    });
    layerOrder.push(layerId);
  });

  if (!mapTileSize) {
    throw new Error("GameMaker room does not contain any tiles.");
  }

  const widthPixels = Number(
    document.querySelector("width")?.textContent ?? "0",
  );
  const heightPixels = Number(
    document.querySelector("height")?.textContent ?? "0",
  );
  const widthInTiles =
    widthPixels > 0 ? Math.ceil(widthPixels / mapTileSize) : maxCellX + 1;
  const heightInTiles =
    heightPixels > 0 ? Math.ceil(heightPixels / mapTileSize) : maxCellY + 1;
  const mapId = generateMapId();

  return {
    map: {
      id: mapId,
      name:
        document.querySelector("name")?.textContent || stripExtension(rootPath),
      groupId: "gamemaker-import" as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles,
      heightInTiles,
      tileSize: mapTileSize,
      layerOrder,
      createdAt: Date.now(),
    },
    layers: layers.map((layer) => ({ ...layer, mapId })),
    tilesets: [...referencedTilesets.values()],
    imageLayers: [],
    layerGroups: [],
    objectLayers: [],
    objects: [],
  };
}

function parseModernTilesetDescriptor(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  const record = parseJsonEntry(providedEntries, path);
  const name = readStringField(record, ["name"]) ?? stripExtension(path);
  const tileSize = readNumberField(record, ["tilewidth", "tileWidth"]);
  const tileHeight = readNumberField(
    record,
    ["tileheight", "tileHeight"],
    tileSize,
  );
  if (tileSize <= 0 || tileHeight !== tileSize) {
    throw new Error(`Unsupported GameMaker tileset dimensions for ${name}.`);
  }

  return {
    path,
    name,
    imagePath:
      readStringField(record, [
        "texturePath",
        "imagePath",
        "sourceImagePath",
      ]) ?? `images/${stripExtension(path).split("/").pop() ?? name}.png`,
    tileSize,
    tileXOffset: readNumberField(record, ["tilexoff", "tileXOffset"]),
    tileYOffset: readNumberField(record, ["tileyoff", "tileYOffset"]),
    tileSeparation: readNumberField(record, ["tilesep", "tileSep"]),
    outColumns: Math.max(
      1,
      readNumberField(record, ["out_columns", "outColumns"], 1),
    ),
  } satisfies ModernTilesetDescriptor;
}

async function importModernRoom(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
): Promise<GameMakerMapImportResult> {
  const room = parseJsonEntry(providedEntries, rootPath);
  const layersInput = Array.isArray(room.layers) ? room.layers : [];
  const tileLayersInput = layersInput.filter(
    (layer): layer is Record<string, unknown> =>
      Boolean(
        layer &&
        typeof layer === "object" &&
        readStringField(layer as Record<string, unknown>, [
          "resourceType",
          "modelName",
          "__type",
        ])?.includes("TileLayer"),
      ),
  );
  if (tileLayersInput.length === 0) {
    throw new Error("GameMaker YY room does not contain any tile layers.");
  }

  const tilesetDescriptors = new Map<string, ModernTilesetDescriptor>();
  const tilesetsByPath = new Map<string, Tileset>();
  let mapTileSize: TileSize | null = null;

  for (const layer of tileLayersInput) {
    const tilesetId = layer.tilesetId;
    const tilesetPath =
      tilesetId && typeof tilesetId === "object"
        ? readStringField(tilesetId as Record<string, unknown>, ["path"])
        : readStringField(layer, ["tilesetPath"]);
    const tilesetName =
      tilesetId && typeof tilesetId === "object"
        ? readStringField(tilesetId as Record<string, unknown>, ["name"])
        : readStringField(layer, ["tilesetName", "name"]);
    const resolvedTilesetPath =
      tilesetPath ??
      (tilesetName ? `tilesets/${tilesetName}/${tilesetName}.yy` : null);
    if (!resolvedTilesetPath) {
      throw new Error(
        "GameMaker YY tile layer is missing a tileset reference.",
      );
    }

    if (!tilesetDescriptors.has(resolvedTilesetPath)) {
      const descriptor = parseModernTilesetDescriptor(
        providedEntries,
        resolvedTilesetPath,
      );
      const importedImage = await importImageAsset(
        descriptor.imagePath,
        requireProvidedEntry(providedEntries, descriptor.imagePath),
      );
      const tileSize = toTileSize(descriptor.tileSize);
      mapTileSize ??= tileSize;
      if (mapTileSize !== tileSize) {
        throw new Error(
          "GameMaker import requires all tilesets to use the same tile size.",
        );
      }

      tilesetDescriptors.set(resolvedTilesetPath, descriptor);
      tilesetsByPath.set(resolvedTilesetPath, {
        id: generateTilesetId(),
        name: descriptor.name,
        groupId: "gamemaker-import" as Tileset["groupId"],
        tileSize,
        assetId: importedImage.assetId,
        imageWidth: importedImage.width,
        imageHeight: importedImage.height,
        createdAt: Date.now(),
      });
    }
  }

  if (!mapTileSize) {
    throw new Error("GameMaker YY room does not contain usable tileset data.");
  }

  const mapId = generateMapId();
  const layers: TileLayer[] = [];
  const layerOrder: TileMapData["layerOrder"] = [];
  let widthInTiles = 0;
  let heightInTiles = 0;

  tileLayersInput.forEach((layer, index) => {
    const tilesetIdValue = layer.tilesetId;
    const tilesetPath =
      tilesetIdValue && typeof tilesetIdValue === "object"
        ? readStringField(tilesetIdValue as Record<string, unknown>, ["path"])
        : readStringField(layer, ["tilesetPath"]);
    const tilesetName =
      tilesetIdValue && typeof tilesetIdValue === "object"
        ? readStringField(tilesetIdValue as Record<string, unknown>, ["name"])
        : readStringField(layer, ["tilesetName", "name"]);
    const resolvedTilesetPath =
      tilesetPath ??
      (tilesetName ? `tilesets/${tilesetName}/${tilesetName}.yy` : null);
    if (!resolvedTilesetPath) {
      return;
    }

    const descriptor = tilesetDescriptors.get(resolvedTilesetPath);
    const tileset = tilesetsByPath.get(resolvedTilesetPath);
    if (!descriptor || !tileset) {
      return;
    }

    const tilesRecord = layer.tiles;
    const tileData =
      tilesRecord && typeof tilesRecord === "object"
        ? (tilesRecord as Record<string, unknown>)
        : {};
    const serialisedWidth = readNumberField(
      tileData,
      ["SerialiseWidth", "serialiseWidth", "width"],
      0,
    );
    const serialisedHeight = readNumberField(
      tileData,
      ["SerialiseHeight", "serialiseHeight", "height"],
      0,
    );
    const denseTiles = Array.isArray(tileData.TileSerialiseData)
      ? tileData.TileSerialiseData
      : Array.isArray(tileData.tileSerialiseData)
        ? tileData.tileSerialiseData
        : [];
    widthInTiles = Math.max(widthInTiles, serialisedWidth);
    heightInTiles = Math.max(heightInTiles, serialisedHeight);

    const tiles: TileLayer["tiles"] = {};
    denseTiles.forEach((value, tileIndex) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        return;
      }

      const cellX = tileIndex % serialisedWidth;
      const cellY = Math.floor(tileIndex / serialisedWidth);
      tiles[`${cellX},${cellY}`] = {
        tilesetId: tileset.id,
        sx:
          descriptor.tileXOffset +
          (numericValue % descriptor.outColumns) *
            (descriptor.tileSize + descriptor.tileSeparation),
        sy:
          descriptor.tileYOffset +
          Math.floor(numericValue / descriptor.outColumns) *
            (descriptor.tileSize + descriptor.tileSeparation),
        sw: descriptor.tileSize,
        sh: descriptor.tileSize,
      };
    });

    const layerId = generateLayerId();
    layers.push({
      id: layerId,
      mapId,
      name: readStringField(layer, ["name"]) ?? `Tiles ${index + 1}`,
      visible: layer.visible !== false,
      locked: false,
      tiles,
    });
    layerOrder.push(layerId);
  });

  const roomSettings =
    room.roomSettings && typeof room.roomSettings === "object"
      ? (room.roomSettings as Record<string, unknown>)
      : {};
  const roomWidthPixels = readNumberField(roomSettings, ["Width", "width"]);
  const roomHeightPixels = readNumberField(roomSettings, ["Height", "height"]);
  if (roomWidthPixels > 0) {
    widthInTiles = Math.max(
      widthInTiles,
      Math.ceil(roomWidthPixels / mapTileSize),
    );
  }
  if (roomHeightPixels > 0) {
    heightInTiles = Math.max(
      heightInTiles,
      Math.ceil(roomHeightPixels / mapTileSize),
    );
  }

  return {
    map: {
      id: mapId,
      name: readStringField(room, ["name"]) ?? stripExtension(rootPath),
      groupId: "gamemaker-import" as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles,
      heightInTiles,
      tileSize: mapTileSize,
      layerOrder,
      createdAt: Date.now(),
    },
    layers,
    tilesets: [...tilesetsByPath.values()],
    imageLayers: [],
    layerGroups: [],
    objectLayers: [],
    objects: [],
  };
}

export async function prepareGameMakerMapImport(
  rootPath: string,
  providedEntries: readonly ImportExportArchiveEntry[],
): Promise<GameMakerMapImportPreparationResult> {
  const format = detectGameMakerMapFormat(rootPath);
  if (!format) {
    throw new Error("Unsupported GameMaker room file type.");
  }

  const normalizedRootPath = normalizeBundlePath(rootPath);
  const providedEntryMap = buildEntryMap(providedEntries);
  const missingResources =
    format === "gmx"
      ? collectMissingLegacyResources(normalizedRootPath, providedEntryMap)
      : collectMissingModernResources(normalizedRootPath, providedEntryMap);

  if (missingResources.length > 0) {
    return {
      status: "missing-resources",
      format,
      rootPath: normalizedRootPath,
      missingResources,
    };
  }

  return {
    status: "ready",
    result:
      format === "gmx"
        ? await importLegacyRoom(normalizedRootPath, providedEntryMap)
        : await importModernRoom(normalizedRootPath, providedEntryMap),
  };
}
