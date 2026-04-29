import {
  generateLayerId,
  generateMapId,
  generateObjectId,
  generateTilesetId,
} from "@/utils/ids";
import {
  GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY,
  GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY,
  GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY,
  GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY,
  GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY,
  GAMEMAKER_ROOM_SPEED_PROPERTY_KEY,
} from "@/features/import-export/lib/gamemaker-property-keys";
import {
  decodeText,
  normalizeBundlePath,
  parseXmlDocument,
  resolveBundlePath,
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
  ImageLayer,
  ImportExportArchiveEntry,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  TileSize,
  Tileset,
} from "@/types";

const DEFAULT_GAMEMAKER_TILE_SIZE = 32 as TileSize;
const DEFAULT_ROOM_SPEED = 60;

type LegacyTilesetDescriptor = {
  name: string;
  imagePath: string;
  tileSize: number;
};

type LegacyBackgroundDescriptor = {
  name: string;
  imagePath: string;
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

type ImportedImageRecord = Awaited<ReturnType<typeof importImageAsset>>;

type ParsedModernTileData = {
  width: number;
  height: number;
  cells: Array<{
    x: number;
    y: number;
    value: number;
  }>;
};

export const GAME_MAKER_MAP_IMPORT_ACCEPT =
  ".room.gmx,.yy,text/xml,application/xml,application/json,text/json,text/plain,application/octet-stream";

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

function normalizeGameMakerPath(fromPath: string, candidatePath: string) {
  if (candidatePath.startsWith("./") || candidatePath.startsWith("../")) {
    return resolveBundlePath(fromPath, candidatePath);
  }

  return normalizeBundlePath(candidatePath);
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

function readBooleanField(
  value: Record<string, unknown>,
  keys: string[],
  fallback = false,
) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "boolean") {
      return candidate;
    }
    if (typeof candidate === "number") {
      return candidate !== 0;
    }
    if (typeof candidate === "string") {
      const normalized = candidate.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no"].includes(normalized)) {
        return false;
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

function createProperty(
  value: string,
  type: PropertyValue["type"],
): PropertyValue {
  return { value, type };
}

function readResourceRef(
  source: Record<string, unknown>,
  objectKeys: string[],
  pathKeys: string[],
  nameKeys: string[],
  defaultFolder?: string,
) {
  let name: string | null = null;
  let path: string | null = null;

  for (const key of objectKeys) {
    const candidate = source[key];
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const candidateRecord = candidate as Record<string, unknown>;
    name ??= readStringField(candidateRecord, ["name"]);
    path ??= readStringField(candidateRecord, ["path"]);
  }

  name ??= readStringField(source, nameKeys);
  path ??= readStringField(source, pathKeys);

  if (!path && name && defaultFolder) {
    path = `${defaultFolder}/${name}/${name}.yy`;
  }

  return name || path ? { name, path } : null;
}

function readLayerType(layer: Record<string, unknown>) {
  return readStringField(layer, ["resourceType", "modelName", "__type"]);
}

function isTileLayer(layer: Record<string, unknown>) {
  return Boolean(readLayerType(layer)?.includes("TileLayer"));
}

function isBackgroundLayer(layer: Record<string, unknown>) {
  return Boolean(readLayerType(layer)?.includes("BackgroundLayer"));
}

function isInstanceLayer(layer: Record<string, unknown>) {
  return Boolean(readLayerType(layer)?.includes("InstanceLayer"));
}

function readTilesetRef(layer: Record<string, unknown>) {
  return readResourceRef(
    layer,
    ["tilesetId", "tileSetId", "tileset"],
    ["tilesetPath", "tileSetPath"],
    ["tilesetName", "tileSetName"],
    "tilesets",
  );
}

function readSpriteRef(record: Record<string, unknown>) {
  return readResourceRef(
    record,
    ["spriteId", "backgroundId", "sprite", "background"],
    ["spritePath", "backgroundPath"],
    ["spriteName", "backgroundName"],
    "sprites",
  );
}

function readObjectRef(record: Record<string, unknown>) {
  return readResourceRef(
    record,
    ["objectId", "objId", "object"],
    ["objectPath", "objPath"],
    ["objectName", "objName"],
    "objects",
  );
}

function readDirectImagePath(
  record: Record<string, unknown>,
  recordPath: string,
) {
  const directPath = readStringField(record, [
    "imagePath",
    "texturePath",
    "sourceImagePath",
    "backgroundPath",
    "spriteSheetPath",
  ]);
  return directPath ? normalizeGameMakerPath(recordPath, directPath) : null;
}

function deriveSpriteImagePath(
  spritePath: string,
  spriteRecord: Record<string, unknown>,
) {
  const directPath = readDirectImagePath(spriteRecord, spritePath);
  if (directPath) {
    return directPath;
  }

  const frames = Array.isArray(spriteRecord.frames) ? spriteRecord.frames : [];
  for (const frame of frames) {
    if (!frame || typeof frame !== "object") {
      continue;
    }

    const frameRecord = frame as Record<string, unknown>;
    const framePath = readStringField(frameRecord, ["path"]);
    if (framePath) {
      return normalizeGameMakerPath(spritePath, framePath);
    }

    const frameName = readStringField(frameRecord, ["name"]);
    if (frameName) {
      return normalizeGameMakerPath(spritePath, `${frameName}.png`);
    }
  }

  return null;
}

function resolveImagePathFromRecord(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  recordPath: string,
  record: Record<string, unknown>,
) {
  const directPath = readDirectImagePath(record, recordPath);
  if (directPath) {
    return directPath;
  }

  const spriteRef = readSpriteRef(record);
  const spritePath = spriteRef?.path
    ? normalizeGameMakerPath(recordPath, spriteRef.path)
    : null;
  if (!spritePath) {
    return null;
  }

  const spriteRecord = parseJsonEntry(providedEntries, spritePath);
  return deriveSpriteImagePath(spritePath, spriteRecord);
}

function collectMissingImageChain(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  missingResources: Map<string, GameMakerImportMissingResource>,
  referringPath: string,
  record: Record<string, unknown>,
  label: string,
) {
  const directPath = readDirectImagePath(record, referringPath);
  if (directPath) {
    if (!getProvidedEntry(providedEntries, directPath)) {
      addMissingResource(
        missingResources,
        directPath,
        "image",
        referringPath,
        label,
      );
    }
    return;
  }

  const spriteRef = readSpriteRef(record);
  const spritePath = spriteRef?.path
    ? normalizeGameMakerPath(referringPath, spriteRef.path)
    : null;
  if (!spritePath) {
    return;
  }

  if (!getProvidedEntry(providedEntries, spritePath)) {
    addMissingResource(
      missingResources,
      spritePath,
      "json",
      referringPath,
      `${label} sprite resource`,
    );
    return;
  }

  const spriteRecord = parseJsonEntry(providedEntries, spritePath);
  const derivedImagePath = deriveSpriteImagePath(spritePath, spriteRecord);
  if (
    derivedImagePath &&
    !getProvidedEntry(providedEntries, derivedImagePath)
  ) {
    addMissingResource(
      missingResources,
      derivedImagePath,
      "image",
      spritePath,
      label,
    );
  }
}

async function ensureImportedImage(
  imagePath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  importedImages: Map<string, ImportedImageRecord>,
) {
  const normalizedPath = normalizeBundlePath(imagePath);
  const existing = importedImages.get(normalizedPath);
  if (existing) {
    return existing;
  }

  const imported = await importImageAsset(
    normalizedPath,
    requireProvidedEntry(providedEntries, normalizedPath),
  );
  importedImages.set(normalizedPath, imported);
  return imported;
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

function getLegacyBackgroundDescriptors(document: XMLDocument) {
  const descriptors = new Map<string, LegacyBackgroundDescriptor>();

  for (const element of Array.from(
    document.querySelectorAll("backgroundResources > background"),
  )) {
    const name =
      element.getAttribute("name") ?? element.getAttribute("backgroundName");
    const imagePath =
      element.getAttribute("image") ?? element.getAttribute("backgroundPath");
    if (!name || !imagePath) {
      continue;
    }

    descriptors.set(name, {
      name,
      imagePath,
    });
  }

  return descriptors;
}

function buildRoomMetadataProperties(
  source: Record<string, unknown>,
  roomSettings: Record<string, unknown>,
) {
  const properties: Record<string, PropertyValue> = {};

  const caption = readStringField(source, ["caption"]);
  if (caption) {
    properties[GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY] = createProperty(
      caption,
      "string",
    );
  }

  properties[GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY] = createProperty(
    readBooleanField(roomSettings, ["persistent"], false) ? "true" : "false",
    "bool",
  );
  properties[GAMEMAKER_ROOM_SPEED_PROPERTY_KEY] = createProperty(
    String(readNumberField(source, ["roomSpeed", "speed"], DEFAULT_ROOM_SPEED)),
    "int",
  );

  const creationCodePath = readStringField(source, [
    "roomCreationCodeFile",
    "creationCodeFile",
  ]);
  if (creationCodePath) {
    properties[GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY] = createProperty(
      creationCodePath,
      "file",
    );
  }

  return properties;
}

function parseModernTileData(tileData: Record<string, unknown>) {
  let width = readNumberField(
    tileData,
    ["SerialiseWidth", "serialiseWidth", "width"],
    0,
  );
  let height = readNumberField(
    tileData,
    ["SerialiseHeight", "serialiseHeight", "height"],
    0,
  );
  const cells: ParsedModernTileData["cells"] = [];

  const denseValues = Array.isArray(tileData.TileSerialiseData)
    ? tileData.TileSerialiseData
    : Array.isArray(tileData.tileSerialiseData)
      ? tileData.tileSerialiseData
      : typeof tileData.TileCompressedData === "string"
        ? tileData.TileCompressedData.split(/[\s,]+/).filter(Boolean)
        : [];

  if (denseValues.length > 0) {
    if (width === 0 && height > 0) {
      width = Math.max(1, Math.ceil(denseValues.length / height));
    }
    if (height === 0 && width > 0) {
      height = Math.max(1, Math.ceil(denseValues.length / width));
    }

    denseValues.forEach((value, tileIndex) => {
      if (value && typeof value === "object") {
        const entry = value as Record<string, unknown>;
        const cellX = readNumberField(
          entry,
          ["x", "tileX"],
          tileIndex % Math.max(1, width),
        );
        const cellY = readNumberField(
          entry,
          ["y", "tileY"],
          Math.floor(tileIndex / Math.max(1, width)),
        );
        const tileValue = readNumberField(
          entry,
          ["value", "index", "tileIndex", "tile"],
          -1,
        );
        if (tileValue >= 0) {
          cells.push({ x: cellX, y: cellY, value: tileValue });
        }
        width = Math.max(width, cellX + 1);
        height = Math.max(height, cellY + 1);
        return;
      }

      const tileValue = Number(value);
      if (!Number.isFinite(tileValue) || tileValue < 0) {
        return;
      }

      const cellX = tileIndex % Math.max(1, width);
      const cellY = Math.floor(tileIndex / Math.max(1, width));
      cells.push({ x: cellX, y: cellY, value: tileValue });
    });

    return {
      width,
      height,
      cells,
    } satisfies ParsedModernTileData;
  }

  const sparseValues = Array.isArray(tileData.tiles)
    ? tileData.tiles
    : Array.isArray(tileData.TileData)
      ? tileData.TileData
      : [];
  for (const value of sparseValues) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const entry = value as Record<string, unknown>;
    const cellX = readNumberField(entry, ["x", "tileX"], 0);
    const cellY = readNumberField(entry, ["y", "tileY"], 0);
    const tileValue = readNumberField(
      entry,
      ["value", "index", "tileIndex", "tile"],
      -1,
    );
    if (tileValue < 0) {
      continue;
    }

    cells.push({ x: cellX, y: cellY, value: tileValue });
    width = Math.max(width, cellX + 1);
    height = Math.max(height, cellY + 1);
  }

  return {
    width,
    height,
    cells,
  } satisfies ParsedModernTileData;
}

function collectMissingLegacyResources(
  rootPath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
) {
  const document = parseXmlDocument(
    decodeText(requireProvidedEntry(providedEntries, rootPath)),
  );
  const tilesetDescriptors = getLegacyTilesetDescriptors(document);
  const backgroundDescriptors = getLegacyBackgroundDescriptors(document);
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
      tilesetDescriptors.get(bgName)?.imagePath ??
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

  for (const backgroundElement of Array.from(
    document.querySelectorAll("backgrounds > background"),
  )) {
    const backgroundName =
      backgroundElement.getAttribute("backgroundName") ??
      backgroundElement.getAttribute("name");
    const imagePath =
      backgroundElement.getAttribute("backgroundPath") ??
      (backgroundName
        ? backgroundDescriptors.get(backgroundName)?.imagePath
        : null) ??
      (backgroundName ? `images/${backgroundName}.png` : null);
    if (!imagePath) {
      continue;
    }

    if (!getProvidedEntry(providedEntries, imagePath)) {
      addMissingResource(
        missingResources,
        imagePath,
        "image",
        rootPath,
        `Background image: ${backgroundName ?? stripExtension(imagePath)}`,
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
    if (isTileLayer(layerRecord)) {
      const tilesetRef = readTilesetRef(layerRecord);
      const tilesetPath = tilesetRef?.path
        ? normalizeGameMakerPath(rootPath, tilesetRef.path)
        : null;
      if (!tilesetPath) {
        throw new Error(
          "GameMaker YY tile layer is missing a tileset reference.",
        );
      }

      if (!getProvidedEntry(providedEntries, tilesetPath)) {
        addMissingResource(
          missingResources,
          tilesetPath,
          "json",
          rootPath,
          `Tileset resource: ${tilesetRef?.name ?? stripExtension(tilesetPath)}`,
        );
        continue;
      }

      const tilesetRecord = parseJsonEntry(providedEntries, tilesetPath);
      collectMissingImageChain(
        providedEntries,
        missingResources,
        tilesetPath,
        tilesetRecord,
        `Tileset image: ${tilesetRef?.name ?? stripExtension(tilesetPath)}`,
      );
      continue;
    }

    if (isBackgroundLayer(layerRecord)) {
      collectMissingImageChain(
        providedEntries,
        missingResources,
        rootPath,
        layerRecord,
        `Background image: ${readStringField(layerRecord, ["name"]) ?? "Background"}`,
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
  const tilesetDescriptors = getLegacyTilesetDescriptors(document);
  const backgroundDescriptors = getLegacyBackgroundDescriptors(document);
  const importedImages = new Map<string, ImportedImageRecord>();
  const mapId = generateMapId();
  const layers: TileLayer[] = [];
  const imageLayers: ImageLayer[] = [];
  const objectLayers: ObjectLayer[] = [];
  const objects: MapObject[] = [];
  const layerOrderEntries: Array<{ id: string; depth: number }> = [];
  const referencedTilesets = new Map<string, Tileset>();
  let mapTileSize = Number(
    document.querySelector("tilewidth")?.textContent ?? "0",
  );
  let maxCellX = 0;
  let maxCellY = 0;

  const ensureLegacyTileset = async (bgName: string) => {
    const existing = referencedTilesets.get(bgName);
    if (existing) {
      return existing;
    }

    const descriptor = tilesetDescriptors.get(bgName);
    const imagePath = descriptor?.imagePath ?? `images/${bgName}.png`;
    const importedImage = await ensureImportedImage(
      imagePath,
      providedEntries,
      importedImages,
    );
    const tileSize =
      descriptor?.tileSize ?? mapTileSize ?? DEFAULT_GAMEMAKER_TILE_SIZE;
    const tileset: Tileset = {
      id: generateTilesetId(),
      name: bgName,
      groupId: "gamemaker-import" as Tileset["groupId"],
      tileSize: toTileSize(tileSize),
      assetId: importedImage.assetId,
      imageWidth: importedImage.width,
      imageHeight: importedImage.height,
      createdAt: Date.now(),
    };
    referencedTilesets.set(bgName, tileset);
    mapTileSize = tileset.tileSize;
    return tileset;
  };

  const tileElements = Array.from(document.querySelectorAll("tiles > tile"));
  const layersByDepth = new Map<number, Element[]>();
  for (const tileElement of tileElements) {
    const depth = Number(tileElement.getAttribute("depth") ?? "0");
    const bucket = layersByDepth.get(depth) ?? [];
    bucket.push(tileElement);
    layersByDepth.set(depth, bucket);
  }

  for (const [depth, entries] of [...layersByDepth.entries()].sort(
    (left, right) => right[0] - left[0],
  )) {
    const layerId = generateLayerId();
    const tiles: TileLayer["tiles"] = {};

    for (const tileElement of entries) {
      const bgName = tileElement.getAttribute("bgName");
      if (!bgName) {
        continue;
      }

      const tileset = await ensureLegacyTileset(bgName);
      const cellX = Math.round(
        Number(tileElement.getAttribute("x") ?? "0") / tileset.tileSize,
      );
      const cellY = Math.round(
        Number(tileElement.getAttribute("y") ?? "0") / tileset.tileSize,
      );
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
      mapId,
      name: entries[0]?.getAttribute("name") ?? "Tiles",
      visible: true,
      locked: false,
      tiles,
    });
    layerOrderEntries.push({ id: layerId, depth });
  }

  for (const backgroundElement of Array.from(
    document.querySelectorAll("backgrounds > background"),
  )) {
    const backgroundName =
      backgroundElement.getAttribute("backgroundName") ??
      backgroundElement.getAttribute("name") ??
      "Background";
    const imagePath =
      backgroundElement.getAttribute("backgroundPath") ??
      backgroundDescriptors.get(backgroundName)?.imagePath ??
      `images/${backgroundName}.png`;
    const importedImage = await ensureImportedImage(
      imagePath,
      providedEntries,
      importedImages,
    );
    const layerId = generateLayerId();
    imageLayers.push({
      id: layerId,
      mapId,
      name: backgroundElement.getAttribute("name") ?? backgroundName,
      type: "image",
      visible: backgroundElement.getAttribute("visible") !== "0",
      locked: false,
      assetId: importedImage.assetId,
      x: Number(backgroundElement.getAttribute("x") ?? "0"),
      y: Number(backgroundElement.getAttribute("y") ?? "0"),
      width:
        Number(backgroundElement.getAttribute("w") ?? "0") ||
        importedImage.width,
      height:
        Number(backgroundElement.getAttribute("h") ?? "0") ||
        importedImage.height,
      opacity: 100,
    });
    layerOrderEntries.push({
      id: layerId,
      depth: Number(backgroundElement.getAttribute("depth") ?? "0"),
    });
  }

  const instancesByDepth = new Map<number, Element[]>();
  for (const instanceElement of Array.from(
    document.querySelectorAll("instances > instance"),
  )) {
    const depth = Number(instanceElement.getAttribute("depth") ?? "0");
    const bucket = instancesByDepth.get(depth) ?? [];
    bucket.push(instanceElement);
    instancesByDepth.set(depth, bucket);
  }

  for (const [depth, entries] of [...instancesByDepth.entries()].sort(
    (left, right) => right[0] - left[0],
  )) {
    const layerId = generateLayerId();
    const objectOrder: ObjectLayer["objectOrder"] = [];

    for (const instanceElement of entries) {
      const objectId = generateObjectId();
      objectOrder.push(objectId);
      objects.push({
        id: objectId,
        layerId,
        name: instanceElement.getAttribute("name") ?? "Instance",
        type: "point",
        x: Number(instanceElement.getAttribute("x") ?? "0"),
        y: Number(instanceElement.getAttribute("y") ?? "0"),
        width: 0,
        height: 0,
        rotation: Number(instanceElement.getAttribute("rotation") ?? "0"),
        points: [],
        visible: instanceElement.getAttribute("visible") !== "0",
        locked: false,
        properties: {
          [GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY]: createProperty(
            instanceElement.getAttribute("objName") ??
              instanceElement.getAttribute("name") ??
              "Instance",
            "string",
          ),
          [GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY]: createProperty(
            String(Number(instanceElement.getAttribute("scaleX") ?? "1")),
            "float",
          ),
          [GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY]: createProperty(
            String(Number(instanceElement.getAttribute("scaleY") ?? "1")),
            "float",
          ),
          ...(instanceElement.getAttribute("objPath")
            ? {
                [GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY]: createProperty(
                  instanceElement.getAttribute("objPath") ?? "",
                  "file",
                ),
              }
            : {}),
          ...(instanceElement.getAttribute("code")
            ? {
                [GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY]:
                  createProperty(
                    instanceElement.getAttribute("code") ?? "",
                    "file",
                  ),
              }
            : {}),
        },
      });
    }

    objectLayers.push({
      id: layerId,
      mapId,
      name: entries[0]?.getAttribute("layerName") ?? `Instances ${depth}`,
      type: "object",
      visible: true,
      locked: false,
      objectOrder,
    });
    layerOrderEntries.push({ id: layerId, depth });
  }

  const widthPixels = Number(
    document.querySelector("width")?.textContent ?? "0",
  );
  const heightPixels = Number(
    document.querySelector("height")?.textContent ?? "0",
  );
  const tileSize = toTileSize(mapTileSize || DEFAULT_GAMEMAKER_TILE_SIZE);
  const roomMetadata = buildRoomMetadataProperties(
    {
      caption: document.querySelector("caption")?.textContent ?? undefined,
      speed: document.querySelector("speed")?.textContent ?? undefined,
      creationCodeFile:
        document.querySelector("creationCodeFile")?.textContent ?? undefined,
    },
    {
      persistent: document.querySelector("persistent")?.textContent ?? "0",
    },
  );

  return {
    map: {
      id: mapId,
      name:
        document.querySelector("name")?.textContent || stripExtension(rootPath),
      groupId: "gamemaker-import" as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles:
        widthPixels > 0
          ? Math.ceil(widthPixels / tileSize)
          : Math.max(1, maxCellX + 1),
      heightInTiles:
        heightPixels > 0
          ? Math.ceil(heightPixels / tileSize)
          : Math.max(1, maxCellY + 1),
      tileSize,
      properties: roomMetadata,
      layerOrder: layerOrderEntries
        .sort((left, right) => right.depth - left.depth)
        .map((entry) => entry.id as TileMapData["layerOrder"][number]),
      createdAt: Date.now(),
    },
    layers,
    tilesets: [...referencedTilesets.values()],
    imageLayers,
    layerGroups: [],
    objectLayers,
    objects,
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

  const imagePath = resolveImagePathFromRecord(providedEntries, path, record);
  if (!imagePath) {
    throw new Error(
      `GameMaker tileset ${name} does not resolve to an image asset.`,
    );
  }

  return {
    path,
    name,
    imagePath,
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
  const roomSettings =
    room.roomSettings && typeof room.roomSettings === "object"
      ? (room.roomSettings as Record<string, unknown>)
      : {};
  const importedImages = new Map<string, ImportedImageRecord>();
  const tilesetDescriptors = new Map<string, ModernTilesetDescriptor>();
  const tilesetsByPath = new Map<string, Tileset>();
  const mapId = generateMapId();
  const layers: TileLayer[] = [];
  const imageLayers: ImageLayer[] = [];
  const objectLayers: ObjectLayer[] = [];
  const objects: MapObject[] = [];
  const layerOrder: TileMapData["layerOrder"] = [];
  let inferredTileSize: TileSize | null = null;
  let widthInTiles = 0;
  let heightInTiles = 0;

  const ensureTileset = async (tilesetPath: string) => {
    const existing = tilesetsByPath.get(tilesetPath);
    if (existing) {
      return existing;
    }

    const descriptor = parseModernTilesetDescriptor(
      providedEntries,
      tilesetPath,
    );
    const importedImage = await ensureImportedImage(
      descriptor.imagePath,
      providedEntries,
      importedImages,
    );
    const tileSize = toTileSize(descriptor.tileSize);
    inferredTileSize ??= tileSize;
    if (inferredTileSize !== tileSize) {
      throw new Error(
        "GameMaker import requires all tilesets to use the same tile size.",
      );
    }

    const outColumns =
      descriptor.outColumns > 0
        ? descriptor.outColumns
        : Math.max(1, Math.floor(importedImage.width / descriptor.tileSize));
    const normalizedDescriptor = {
      ...descriptor,
      outColumns,
    } satisfies ModernTilesetDescriptor;
    tilesetDescriptors.set(tilesetPath, normalizedDescriptor);

    const tileset: Tileset = {
      id: generateTilesetId(),
      name: normalizedDescriptor.name,
      groupId: "gamemaker-import" as Tileset["groupId"],
      tileSize,
      assetId: importedImage.assetId,
      imageWidth: importedImage.width,
      imageHeight: importedImage.height,
      createdAt: Date.now(),
    };
    tilesetsByPath.set(tilesetPath, tileset);
    return tileset;
  };

  for (const layer of layersInput) {
    if (!layer || typeof layer !== "object") {
      continue;
    }

    const layerRecord = layer as Record<string, unknown>;
    const layerName = readStringField(layerRecord, ["name"]) ?? "Layer";

    if (isTileLayer(layerRecord)) {
      const tilesetRef = readTilesetRef(layerRecord);
      const tilesetPath = tilesetRef?.path
        ? normalizeGameMakerPath(rootPath, tilesetRef.path)
        : null;
      if (!tilesetPath) {
        throw new Error(
          "GameMaker YY tile layer is missing a tileset reference.",
        );
      }

      const tileset = await ensureTileset(tilesetPath);
      const descriptor = tilesetDescriptors.get(tilesetPath);
      if (!descriptor) {
        continue;
      }

      const tilesRecord =
        layerRecord.tiles && typeof layerRecord.tiles === "object"
          ? (layerRecord.tiles as Record<string, unknown>)
          : layerRecord;
      const tileData = parseModernTileData(tilesRecord);
      widthInTiles = Math.max(widthInTiles, tileData.width);
      heightInTiles = Math.max(heightInTiles, tileData.height);

      const tiles: TileLayer["tiles"] = {};
      for (const cell of tileData.cells) {
        tiles[`${cell.x},${cell.y}`] = {
          tilesetId: tileset.id,
          sx:
            descriptor.tileXOffset +
            (cell.value % descriptor.outColumns) *
              (descriptor.tileSize + descriptor.tileSeparation),
          sy:
            descriptor.tileYOffset +
            Math.floor(cell.value / descriptor.outColumns) *
              (descriptor.tileSize + descriptor.tileSeparation),
          sw: descriptor.tileSize,
          sh: descriptor.tileSize,
        };
      }

      const layerId = generateLayerId();
      layers.push({
        id: layerId,
        mapId,
        name: layerName,
        visible: readBooleanField(layerRecord, ["visible"], true),
        locked: false,
        tiles,
      });
      layerOrder.push(layerId);
      continue;
    }

    if (isBackgroundLayer(layerRecord)) {
      const imagePath = resolveImagePathFromRecord(
        providedEntries,
        rootPath,
        layerRecord,
      );
      if (!imagePath) {
        continue;
      }

      const importedImage = await ensureImportedImage(
        imagePath,
        providedEntries,
        importedImages,
      );
      const roomWidthPixels = readNumberField(
        roomSettings,
        ["Width", "width"],
        0,
      );
      const roomHeightPixels = readNumberField(
        roomSettings,
        ["Height", "height"],
        0,
      );
      const stretch = readBooleanField(layerRecord, ["stretch"], false);
      const scaleX = readNumberField(layerRecord, ["scaleX"], 1);
      const scaleY = readNumberField(layerRecord, ["scaleY"], 1);
      const colorValue = readNumberField(
        layerRecord,
        ["colour", "color"],
        0xffffffff,
      );
      const alpha = Math.max(
        0,
        Math.min(255, Math.floor(colorValue / 0x1000000)),
      );
      const layerId = generateLayerId();
      imageLayers.push({
        id: layerId,
        mapId,
        name: layerName,
        type: "image",
        visible: readBooleanField(layerRecord, ["visible"], true),
        locked: false,
        assetId: importedImage.assetId,
        x: readNumberField(layerRecord, ["x"], 0),
        y: readNumberField(layerRecord, ["y"], 0),
        width: stretch
          ? roomWidthPixels || importedImage.width
          : Math.max(1, Math.round(importedImage.width * scaleX)),
        height: stretch
          ? roomHeightPixels || importedImage.height
          : Math.max(1, Math.round(importedImage.height * scaleY)),
        opacity: Math.round((alpha / 255) * 100),
      });
      layerOrder.push(layerId);
      continue;
    }

    if (isInstanceLayer(layerRecord)) {
      const instances = Array.isArray(layerRecord.instances)
        ? layerRecord.instances
        : Array.isArray(layerRecord.instancesData)
          ? layerRecord.instancesData
          : [];
      const layerId = generateLayerId();
      const objectOrder: ObjectLayer["objectOrder"] = [];

      for (const instance of instances) {
        if (!instance || typeof instance !== "object") {
          continue;
        }

        const instanceRecord = instance as Record<string, unknown>;
        const creationCodePath = readStringField(instanceRecord, [
          "creationCodeFile",
          "code",
        ]);
        const objectId = generateObjectId();
        const objectRef = readObjectRef(instanceRecord);
        objectOrder.push(objectId);
        objects.push({
          id: objectId,
          layerId,
          name:
            readStringField(instanceRecord, ["name"]) ??
            objectRef?.name ??
            "Instance",
          type: "point",
          x: readNumberField(instanceRecord, ["x"], 0),
          y: readNumberField(instanceRecord, ["y"], 0),
          width: 0,
          height: 0,
          rotation: readNumberField(
            instanceRecord,
            ["rotation", "imageAngle"],
            0,
          ),
          points: [],
          visible: readBooleanField(instanceRecord, ["visible"], true),
          locked: false,
          properties: {
            [GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY]: createProperty(
              objectRef?.name ?? "Instance",
              "string",
            ),
            [GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY]: createProperty(
              String(readNumberField(instanceRecord, ["scaleX"], 1)),
              "float",
            ),
            [GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY]: createProperty(
              String(readNumberField(instanceRecord, ["scaleY"], 1)),
              "float",
            ),
            ...(objectRef?.path
              ? {
                  [GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY]: createProperty(
                    normalizeGameMakerPath(rootPath, objectRef.path),
                    "file",
                  ),
                }
              : {}),
            ...(creationCodePath
              ? {
                  [GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY]:
                    createProperty(creationCodePath, "file"),
                }
              : {}),
          },
        });
      }

      objectLayers.push({
        id: layerId,
        mapId,
        name: layerName,
        type: "object",
        visible: readBooleanField(layerRecord, ["visible"], true),
        locked: false,
        objectOrder,
      });
      layerOrder.push(layerId);
    }
  }

  const roomWidthPixels = readNumberField(roomSettings, ["Width", "width"], 0);
  const roomHeightPixels = readNumberField(
    roomSettings,
    ["Height", "height"],
    0,
  );
  const tileSize = inferredTileSize ?? DEFAULT_GAMEMAKER_TILE_SIZE;
  if (roomWidthPixels > 0) {
    widthInTiles = Math.max(
      widthInTiles,
      Math.ceil(roomWidthPixels / tileSize),
    );
  }
  if (roomHeightPixels > 0) {
    heightInTiles = Math.max(
      heightInTiles,
      Math.ceil(roomHeightPixels / tileSize),
    );
  }

  return {
    map: {
      id: mapId,
      name: readStringField(room, ["name"]) ?? stripExtension(rootPath),
      groupId: "gamemaker-import" as TileMapData["groupId"],
      orientation: "orthogonal",
      widthInTiles: Math.max(1, widthInTiles),
      heightInTiles: Math.max(1, heightInTiles),
      tileSize,
      properties: buildRoomMetadataProperties(room, roomSettings),
      layerOrder,
      createdAt: Date.now(),
    },
    layers,
    tilesets: [...tilesetsByPath.values()],
    imageLayers,
    layerGroups: [],
    objectLayers,
    objects,
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
