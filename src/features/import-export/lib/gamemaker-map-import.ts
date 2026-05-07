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
} from "@/features/import-export/lib/gamemaker-property-keys";
import {
  decodeText,
  normalizeBundlePath,
  parseXmlDocument,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  buildEntryMap,
  getProvidedEntry,
  requireProvidedEntry,
} from "@/features/import-export/lib/tiled-map-import-shared";
import {
  addMissingResource,
  buildRoomMetadataProperties,
  collectMissingImageChain,
  createProperty,
  ensureImportedImage,
  getLegacyBackgroundDescriptors,
  getLegacyTilesetDescriptors,
  isBackgroundLayer,
  isInstanceLayer,
  isTileLayer,
  normalizeGameMakerPath,
  parseJsonEntry,
  parseModernTileData,
  readBooleanField,
  readNumberField,
  readObjectRef,
  readStringField,
  readTilesetRef,
  resolveImagePathFromRecord,
  toTileSize,
} from "@/features/import-export/lib/gamemaker-import-helpers";
import type {
  GameMakerImportedImageRecord,
  ModernTilesetDescriptor,
} from "@/features/import-export/types";
import type {
  GameMakerImportMissingResource,
  GameMakerMapFormat,
  GameMakerMapImportPreparationResult,
  GameMakerMapImportResult,
  ImageLayer,
  ImportExportArchiveEntry,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  TileSize,
  Tileset,
} from "@/types";

const DEFAULT_GAMEMAKER_TILE_SIZE = 32 as TileSize;

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
  const importedImages = new Map<string, GameMakerImportedImageRecord>();
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
  const importedImages = new Map<string, GameMakerImportedImageRecord>();
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
