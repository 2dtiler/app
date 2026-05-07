import {
  GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY,
  GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY,
  GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY,
  GAMEMAKER_ROOM_SPEED_PROPERTY_KEY,
} from "@/features/import-export/lib/gamemaker-property-keys";
import {
  decodeText,
  normalizeBundlePath,
  resolveBundlePath,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  getProvidedEntry,
  importImageAsset,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import type {
  GameMakerImportedImageRecord,
  LegacyBackgroundDescriptor,
  LegacyTilesetDescriptor,
  ParsedModernTileData,
} from "@/features/import-export/types";
import type {
  GameMakerImportMissingResource,
  PropertyValue,
  TileSize,
} from "@/types";

const DEFAULT_ROOM_SPEED = 60;

export function normalizeGameMakerPath(fromPath: string, candidatePath: string) {
  if (candidatePath.startsWith("./") || candidatePath.startsWith("../")) {
    return resolveBundlePath(fromPath, candidatePath);
  }

  return normalizeBundlePath(candidatePath);
}

export function addMissingResource(
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

export function readNumberField(
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

export function readBooleanField(
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

export function readStringField(
  value: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }

  return null;
}

export function parseJsonEntry(
  providedEntries: ReadonlyMap<string, Uint8Array>,
  path: string,
) {
  return JSON.parse(
    decodeText(requireProvidedEntry(providedEntries, path)),
  ) as Record<string, unknown>;
}

export function toTileSize(value: number): TileSize {
  if (value <= 0 || value !== Math.floor(value)) {
    throw new Error(`Unsupported GameMaker tile size: ${value}.`);
  }

  return value as TileSize;
}

export function createProperty(
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

export function isTileLayer(layer: Record<string, unknown>) {
  return Boolean(readLayerType(layer)?.includes("TileLayer"));
}

export function isBackgroundLayer(layer: Record<string, unknown>) {
  return Boolean(readLayerType(layer)?.includes("BackgroundLayer"));
}

export function isInstanceLayer(layer: Record<string, unknown>) {
  return Boolean(readLayerType(layer)?.includes("InstanceLayer"));
}

export function readTilesetRef(layer: Record<string, unknown>) {
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

export function readObjectRef(record: Record<string, unknown>) {
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

export function resolveImagePathFromRecord(
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

export function collectMissingImageChain(
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
  if (derivedImagePath && !getProvidedEntry(providedEntries, derivedImagePath)) {
    addMissingResource(
      missingResources,
      derivedImagePath,
      "image",
      spritePath,
      label,
    );
  }
}

export async function ensureImportedImage(
  imagePath: string,
  providedEntries: ReadonlyMap<string, Uint8Array>,
  importedImages: Map<string, GameMakerImportedImageRecord>,
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

export function getLegacyTilesetDescriptors(document: XMLDocument) {
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

export function getLegacyBackgroundDescriptors(document: XMLDocument) {
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

export function buildRoomMetadataProperties(
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

export function parseModernTileData(tileData: Record<string, unknown>) {
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