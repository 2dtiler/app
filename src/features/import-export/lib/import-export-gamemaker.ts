import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
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
  createXmlDocument,
  encodeXmlDocument,
  getFileExtensionFromMimeType,
  getTileColumns,
  getTileCount,
} from "@/features/import-export/lib/tiled-xml-utils";
import { getAsset } from "@/services/db";
import type {
  GameMakerMapExportOptions,
  ImageLayer,
  ImportExportArchiveEntry,
  LayerGroup,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

interface TilesetResourceRecord {
  tileset: Tileset;
  imagePath: string;
  spritePath: string;
  spriteName: string;
}

interface BackgroundResourceRecord {
  layer: ImageLayer;
  imagePath: string;
  spritePath: string;
  spriteName: string;
}

interface GameMakerTileLayerExport {
  layerId: string;
  name: string;
  depth: number;
  tileset: Tileset;
  tiles: {
    x: number;
    y: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  }[];
}

interface GameMakerBackgroundLayerExport {
  layer: ImageLayer;
  depth: number;
}

interface GameMakerInstanceLayerExport {
  layer: ObjectLayer;
  depth: number;
  objects: MapObject[];
}

const DEFAULT_GAMEMAKER_LAYER_GAP = 1000;
const DEFAULT_ROOM_SPEED = 60;

function toGameMakerResourceName(name: string, fallback: string) {
  const normalized = name
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function readStringProperty(
  properties: Record<string, PropertyValue> | undefined,
  key: string,
) {
  const property = properties?.[key];
  return property?.value?.trim() ? property.value : null;
}

function readBooleanProperty(
  properties: Record<string, PropertyValue> | undefined,
  key: string,
  fallback = false,
) {
  const property = properties?.[key];
  if (!property) {
    return fallback;
  }

  return property.value === "true";
}

function readNumberProperty(
  properties: Record<string, PropertyValue> | undefined,
  key: string,
  fallback = 0,
) {
  const property = properties?.[key];
  if (!property) {
    return fallback;
  }

  const parsed = Number(property.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getLayerBaseDepth(
  map: TileMapData,
  layerId: string,
  fallbackIndex: number,
  fallbackTotal: number,
) {
  const orderedIds = map.layerOrder.map((entry) => entry as string);
  const orderIndex = orderedIds.indexOf(layerId);
  const total = orderedIds.length > 0 ? orderedIds.length : fallbackTotal;
  const index = orderIndex >= 0 ? orderIndex : fallbackIndex;
  return Math.max(1, total - index) * DEFAULT_GAMEMAKER_LAYER_GAP;
}

function buildSpriteBundleEntries(
  baseName: string,
  bytes: Uint8Array,
  mimeType: string,
  folderPrefix: string,
  usedPaths: Set<string>,
) {
  const resourceName = toGameMakerResourceName(baseName, "resource");
  const spriteFolder = `${folderPrefix}/${resourceName}`;
  const extension = getFileExtensionFromMimeType(mimeType);
  const imagePath = createRelativeAssetPath(
    spriteFolder,
    resourceName,
    extension,
    usedPaths,
  );
  const spritePath = createRelativeAssetPath(
    spriteFolder,
    resourceName,
    ".yy",
    usedPaths,
  );
  const spriteName =
    spritePath.split("/").pop()?.replace(/\.yy$/i, "") ?? resourceName;
  const frameName =
    imagePath
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/i, "") ?? `${spriteName}_frame`;

  return {
    spriteName,
    spritePath,
    imagePath,
    entries: [
      {
        path: imagePath,
        data: bytes,
      },
      {
        path: spritePath,
        data: new TextEncoder().encode(
          JSON.stringify(
            {
              resourceType: "GMSprite",
              resourceVersion: "1.0",
              name: spriteName,
              width: 0,
              height: 0,
              imagePath,
              frames: [{ name: frameName }],
            },
            null,
            2,
          ),
        ),
      },
    ] satisfies ImportExportArchiveEntry[],
  };
}

function assertGameMakerExportSupported(
  map: TileMapData,
  layerGroups: readonly LayerGroup[],
) {
  if (map.orientation !== "orthogonal") {
    throw new Error(
      "GameMaker export currently supports orthogonal maps only.",
    );
  }

  if (layerGroups.length > 0) {
    throw new Error(
      "GameMaker export does not include layer groups yet. Flatten the map layers before exporting.",
    );
  }
}

function getReferencedTilesets(
  layers: readonly TileLayer[],
  tilesets: readonly Tileset[],
) {
  const referencedIds = new Set<string>();

  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedIds.add(ref.tilesetId as string);
    }
  }

  return tilesets.filter((tileset) => referencedIds.has(tileset.id as string));
}

async function buildTilesetResourceEntries(
  referencedTilesets: readonly Tileset[],
  usedPaths: Set<string>,
) {
  const entries: ImportExportArchiveEntry[] = [];
  const records = new Map<string, TilesetResourceRecord>();

  for (const tileset of referencedTilesets) {
    const record = await getAsset(tileset.assetId);
    if (!record) {
      throw new Error(
        `Missing image asset for GameMaker export: ${tileset.name}.`,
      );
    }

    const spriteBundle = buildSpriteBundleEntries(
      tileset.name,
      new Uint8Array(record.data),
      record.mimeType,
      "sprites/tilesets",
      usedPaths,
    );
    entries.push(...spriteBundle.entries);

    records.set(tileset.id as string, {
      tileset,
      imagePath: spriteBundle.imagePath,
      spritePath: spriteBundle.spritePath,
      spriteName: spriteBundle.spriteName,
    });
  }

  return { entries, records };
}

async function buildBackgroundResourceEntries(
  imageLayers: readonly ImageLayer[],
  usedPaths: Set<string>,
) {
  const entries: ImportExportArchiveEntry[] = [];
  const records = new Map<string, BackgroundResourceRecord>();

  for (const layer of imageLayers) {
    const record = await getAsset(layer.assetId);
    if (!record) {
      throw new Error(
        `Missing image asset for GameMaker export: ${layer.name}.`,
      );
    }

    const spriteBundle = buildSpriteBundleEntries(
      layer.name,
      new Uint8Array(record.data),
      record.mimeType,
      "sprites/backgrounds",
      usedPaths,
    );
    entries.push(...spriteBundle.entries);

    records.set(layer.id as string, {
      layer,
      imagePath: spriteBundle.imagePath,
      spritePath: spriteBundle.spritePath,
      spriteName: spriteBundle.spriteName,
    });
  }

  return { entries, records };
}

function buildTileLayerExports(
  map: TileMapData,
  layers: readonly TileLayer[],
  referencedTilesets: readonly Tileset[],
) {
  const exports: GameMakerTileLayerExport[] = [];

  layers.forEach((layer, layerIndex) => {
    const tilesByTileset = new Map<string, GameMakerTileLayerExport["tiles"]>();

    for (const [coordinate, ref] of Object.entries(layer.tiles)) {
      const [x, y] = coordinate.split(",").map((value) => Number(value));
      const bucket = tilesByTileset.get(ref.tilesetId as string) ?? [];
      bucket.push({
        x,
        y,
        sx: ref.sx,
        sy: ref.sy,
        sw: ref.sw,
        sh: ref.sh,
      });
      tilesByTileset.set(ref.tilesetId as string, bucket);
    }

    Array.from(tilesByTileset.entries()).forEach(
      ([tilesetId, tiles], tilesetIndex) => {
        const tileset = referencedTilesets.find(
          (candidate) => candidate.id === tilesetId,
        );
        if (!tileset) {
          return;
        }

        const baseDepth = getLayerBaseDepth(
          map,
          layer.id as string,
          layerIndex,
          layers.length,
        );
        exports.push({
          layerId: layer.id,
          name:
            tilesByTileset.size > 1
              ? `${layer.name} (${tileset.name})`
              : layer.name,
          depth: baseDepth + tilesetIndex,
          tileset,
          tiles,
        });
      },
    );
  });

  return exports;
}

function buildBackgroundLayerExports(
  map: TileMapData,
  imageLayers: readonly ImageLayer[],
) {
  return imageLayers.map((layer, index) => ({
    layer,
    depth: getLayerBaseDepth(
      map,
      layer.id as string,
      index,
      imageLayers.length,
    ),
  }));
}

function buildInstanceLayerExports(
  map: TileMapData,
  objectLayers: readonly ObjectLayer[],
  objects: readonly MapObject[],
) {
  const objectMap = new Map(
    objects.map((object) => [object.id as string, object]),
  );

  return objectLayers.map((layer, index) => ({
    layer,
    depth: getLayerBaseDepth(
      map,
      layer.id as string,
      index,
      objectLayers.length,
    ),
    objects: layer.objectOrder
      .map((objectId) => objectMap.get(objectId as string))
      .filter((object): object is MapObject => Boolean(object)),
  }));
}

function buildLegacyRoomEntry(
  map: TileMapData,
  tileLayers: readonly GameMakerTileLayerExport[],
  backgroundLayers: readonly GameMakerBackgroundLayerExport[],
  instanceLayers: readonly GameMakerInstanceLayerExport[],
  tilesetRecords: ReadonlyMap<string, TilesetResourceRecord>,
  backgroundRecords: ReadonlyMap<string, BackgroundResourceRecord>,
) {
  const document = createXmlDocument("room");
  const root = document.documentElement;
  const appendTextElement = (name: string, value: string) => {
    const element = document.createElement(name);
    element.textContent = value;
    root.append(element);
  };

  appendTextElement("name", map.name);
  appendTextElement("width", String(map.widthInTiles * map.tileSize));
  appendTextElement("height", String(map.heightInTiles * map.tileSize));
  appendTextElement("tilewidth", String(map.tileSize));
  appendTextElement("tileheight", String(map.tileSize));

  const caption = readStringProperty(
    map.properties,
    GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY,
  );
  if (caption) {
    appendTextElement("caption", caption);
  }
  appendTextElement(
    "persistent",
    readBooleanProperty(
      map.properties,
      GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY,
      false,
    )
      ? "1"
      : "0",
  );
  appendTextElement(
    "speed",
    String(
      readNumberProperty(
        map.properties,
        GAMEMAKER_ROOM_SPEED_PROPERTY_KEY,
        DEFAULT_ROOM_SPEED,
      ),
    ),
  );
  const creationCodePath = readStringProperty(
    map.properties,
    GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY,
  );
  if (creationCodePath) {
    appendTextElement("creationCodeFile", creationCodePath);
  }

  const tilesetResourcesElement = document.createElement("tilesetResources");
  for (const tilesetRecord of tilesetRecords.values()) {
    const tilesetElement = document.createElement("tileset");
    tilesetElement.setAttribute("name", tilesetRecord.tileset.name);
    tilesetElement.setAttribute("image", tilesetRecord.imagePath);
    tilesetElement.setAttribute(
      "tileSize",
      String(tilesetRecord.tileset.tileSize),
    );
    tilesetElement.setAttribute("sprite", tilesetRecord.spritePath);
    tilesetResourcesElement.append(tilesetElement);
  }
  root.append(tilesetResourcesElement);

  if (backgroundRecords.size > 0) {
    const backgroundResourcesElement = document.createElement(
      "backgroundResources",
    );
    for (const backgroundRecord of backgroundRecords.values()) {
      const backgroundElement = document.createElement("background");
      backgroundElement.setAttribute("name", backgroundRecord.spriteName);
      backgroundElement.setAttribute("image", backgroundRecord.imagePath);
      backgroundElement.setAttribute("sprite", backgroundRecord.spritePath);
      backgroundResourcesElement.append(backgroundElement);
    }
    root.append(backgroundResourcesElement);
  }

  const backgroundsElement = document.createElement("backgrounds");
  for (const backgroundLayer of backgroundLayers) {
    const backgroundRecord = backgroundRecords.get(
      backgroundLayer.layer.id as string,
    );
    if (!backgroundRecord) {
      continue;
    }

    const backgroundElement = document.createElement("background");
    backgroundElement.setAttribute("name", backgroundLayer.layer.name);
    backgroundElement.setAttribute(
      "backgroundName",
      backgroundRecord.spriteName,
    );
    backgroundElement.setAttribute(
      "backgroundPath",
      backgroundRecord.imagePath,
    );
    backgroundElement.setAttribute("x", String(backgroundLayer.layer.x));
    backgroundElement.setAttribute("y", String(backgroundLayer.layer.y));
    backgroundElement.setAttribute("w", String(backgroundLayer.layer.width));
    backgroundElement.setAttribute("h", String(backgroundLayer.layer.height));
    backgroundElement.setAttribute(
      "visible",
      backgroundLayer.layer.visible ? "1" : "0",
    );
    backgroundElement.setAttribute("depth", String(backgroundLayer.depth));
    backgroundElement.setAttribute("htiled", "0");
    backgroundElement.setAttribute("vtiled", "0");
    backgroundElement.setAttribute("stretch", "0");
    backgroundsElement.append(backgroundElement);
  }
  if (backgroundsElement.children.length > 0) {
    root.append(backgroundsElement);
  }

  const tilesElement = document.createElement("tiles");
  let nextTileId = 1;

  for (const tileLayer of tileLayers) {
    const tilesetRecord = tilesetRecords.get(tileLayer.tileset.id as string);
    if (!tilesetRecord) {
      throw new Error(
        "GameMaker export could not resolve a referenced tileset.",
      );
    }

    for (const tile of tileLayer.tiles) {
      const tileElement = document.createElement("tile");
      tileElement.setAttribute("bgName", tilesetRecord.tileset.name);
      tileElement.setAttribute("bgPath", tilesetRecord.imagePath);
      tileElement.setAttribute("x", String(tile.x * map.tileSize));
      tileElement.setAttribute("y", String(tile.y * map.tileSize));
      tileElement.setAttribute("w", String(tile.sw));
      tileElement.setAttribute("h", String(tile.sh));
      tileElement.setAttribute("xo", String(tile.sx));
      tileElement.setAttribute("yo", String(tile.sy));
      tileElement.setAttribute("id", String(nextTileId));
      tileElement.setAttribute("name", tileLayer.name);
      tileElement.setAttribute("depth", String(tileLayer.depth));
      tileElement.setAttribute("locked", "0");
      tilesElement.append(tileElement);
      nextTileId += 1;
    }
  }
  if (tilesElement.children.length > 0) {
    root.append(tilesElement);
  }

  const instancesElement = document.createElement("instances");
  for (const instanceLayer of instanceLayers) {
    for (const object of instanceLayer.objects) {
      const instanceElement = document.createElement("instance");
      instanceElement.setAttribute(
        "name",
        object.name ||
          readStringProperty(
            object.properties,
            GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY,
          ) ||
          "instance",
      );
      instanceElement.setAttribute(
        "objName",
        readStringProperty(
          object.properties,
          GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY,
        ) ?? object.name,
      );
      const objectPath = readStringProperty(
        object.properties,
        GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY,
      );
      if (objectPath) {
        instanceElement.setAttribute("objPath", objectPath);
      }
      const creationCode = readStringProperty(
        object.properties,
        GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY,
      );
      if (creationCode) {
        instanceElement.setAttribute("code", creationCode);
      }
      instanceElement.setAttribute("x", String(object.x));
      instanceElement.setAttribute("y", String(object.y));
      instanceElement.setAttribute("rotation", String(object.rotation));
      instanceElement.setAttribute(
        "scaleX",
        String(
          readNumberProperty(
            object.properties,
            GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY,
            1,
          ),
        ),
      );
      instanceElement.setAttribute(
        "scaleY",
        String(
          readNumberProperty(
            object.properties,
            GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY,
            1,
          ),
        ),
      );
      instanceElement.setAttribute("depth", String(instanceLayer.depth));
      instanceElement.setAttribute("visible", object.visible ? "1" : "0");
      instancesElement.append(instanceElement);
    }
  }
  if (instancesElement.children.length > 0) {
    root.append(instancesElement);
  }

  return {
    path: `${map.name}.room.gmx`,
    data: encodeXmlDocument(document),
  } satisfies ImportExportArchiveEntry;
}

function buildModernTilesetEntries(
  referencedTilesets: readonly Tileset[],
  tilesetRecords: ReadonlyMap<string, TilesetResourceRecord>,
) {
  return referencedTilesets.map((tileset) => {
    const tilesetRecord = tilesetRecords.get(tileset.id as string);
    if (!tilesetRecord) {
      throw new Error(
        "GameMaker export could not resolve a referenced tileset.",
      );
    }

    const path = `tilesets/${tileset.name}/${tileset.name}.yy`;
    return {
      path,
      data: new TextEncoder().encode(
        JSON.stringify(
          {
            resourceType: "GMTileSet",
            resourceVersion: "1.0",
            name: tileset.name,
            tilewidth: tileset.tileSize,
            tileheight: tileset.tileSize,
            tilexoff: 0,
            tileyoff: 0,
            tilesep: 0,
            out_columns: getTileColumns(tileset),
            tile_count: getTileCount(tileset),
            texturePath: tilesetRecord.imagePath,
            spriteId: {
              name: tilesetRecord.spriteName,
              path: tilesetRecord.spritePath,
            },
          },
          null,
          2,
        ),
      ),
    } satisfies ImportExportArchiveEntry;
  });
}

function buildModernRoomEntry(
  map: TileMapData,
  tileLayers: readonly GameMakerTileLayerExport[],
  backgroundLayers: readonly GameMakerBackgroundLayerExport[],
  instanceLayers: readonly GameMakerInstanceLayerExport[],
  tilesetRecords: ReadonlyMap<string, TilesetResourceRecord>,
  backgroundRecords: ReadonlyMap<string, BackgroundResourceRecord>,
) {
  const encodedLayers: Array<{
    depth: number;
    value: Record<string, unknown>;
  }> = [];

  for (const backgroundLayer of backgroundLayers) {
    const backgroundRecord = backgroundRecords.get(
      backgroundLayer.layer.id as string,
    );
    if (!backgroundRecord) {
      continue;
    }

    encodedLayers.push({
      depth: backgroundLayer.depth,
      value: {
        resourceType: "GMRBackgroundLayer",
        resourceVersion: "1.0",
        name: backgroundLayer.layer.name,
        depth: backgroundLayer.depth,
        visible: backgroundLayer.layer.visible,
        x: backgroundLayer.layer.x,
        y: backgroundLayer.layer.y,
        htiled: false,
        vtiled: false,
        stretch: false,
        spriteId: {
          name: backgroundRecord.spriteName,
          path: backgroundRecord.spritePath,
        },
      },
    });
  }

  for (const tileLayer of tileLayers) {
    const tilesetRecord = tilesetRecords.get(tileLayer.tileset.id as string);
    if (!tilesetRecord) {
      throw new Error(
        "GameMaker export could not resolve a referenced tileset.",
      );
    }

    const denseTiles = new Array<number>(
      map.widthInTiles * map.heightInTiles,
    ).fill(-1);
    const columns = getTileColumns(tilesetRecord.tileset);

    for (const tile of tileLayer.tiles) {
      const tileIndex = tile.y * map.widthInTiles + tile.x;
      const localTileId =
        Math.floor(tile.sy / tilesetRecord.tileset.tileSize) * columns +
        Math.floor(tile.sx / tilesetRecord.tileset.tileSize);
      denseTiles[tileIndex] = localTileId;
    }

    encodedLayers.push({
      depth: tileLayer.depth,
      value: {
        resourceType: "GMRTileLayer",
        resourceVersion: "1.0",
        name: tileLayer.name,
        depth: tileLayer.depth,
        visible: true,
        tilesetId: {
          name: tilesetRecord.tileset.name,
          path: `tilesets/${tilesetRecord.tileset.name}/${tilesetRecord.tileset.name}.yy`,
        },
        tiles: {
          SerialiseWidth: map.widthInTiles,
          SerialiseHeight: map.heightInTiles,
          TileSerialiseData: denseTiles,
        },
      },
    });
  }

  for (const instanceLayer of instanceLayers) {
    encodedLayers.push({
      depth: instanceLayer.depth,
      value: {
        resourceType: "GMRInstanceLayer",
        resourceVersion: "1.0",
        name: instanceLayer.layer.name,
        depth: instanceLayer.depth,
        visible: instanceLayer.layer.visible,
        instances: instanceLayer.objects.map((object) => ({
          resourceType: "GMRInstance",
          resourceVersion: "1.0",
          name: object.name,
          x: object.x,
          y: object.y,
          rotation: object.rotation,
          scaleX: readNumberProperty(
            object.properties,
            GAMEMAKER_INSTANCE_SCALE_X_PROPERTY_KEY,
            1,
          ),
          scaleY: readNumberProperty(
            object.properties,
            GAMEMAKER_INSTANCE_SCALE_Y_PROPERTY_KEY,
            1,
          ),
          objectId: {
            name:
              readStringProperty(
                object.properties,
                GAMEMAKER_INSTANCE_OBJECT_NAME_PROPERTY_KEY,
              ) ?? object.name,
            path:
              readStringProperty(
                object.properties,
                GAMEMAKER_INSTANCE_OBJECT_PATH_PROPERTY_KEY,
              ) ??
              `objects/${toGameMakerResourceName(object.name, "object")}/${toGameMakerResourceName(object.name, "object")}.yy`,
          },
          creationCodeFile: readStringProperty(
            object.properties,
            GAMEMAKER_INSTANCE_CREATION_CODE_PATH_PROPERTY_KEY,
          ),
        })),
      },
    });
  }

  encodedLayers.sort((left, right) => right.depth - left.depth);

  return {
    path: `${map.name}.yy`,
    data: new TextEncoder().encode(
      JSON.stringify(
        {
          resourceType: "GMRoom",
          resourceVersion: "1.0",
          name: map.name,
          roomSettings: {
            Width: map.widthInTiles * map.tileSize,
            Height: map.heightInTiles * map.tileSize,
            persistent: readBooleanProperty(
              map.properties,
              GAMEMAKER_ROOM_PERSISTENT_PROPERTY_KEY,
              false,
            ),
          },
          caption: readStringProperty(
            map.properties,
            GAMEMAKER_ROOM_CAPTION_PROPERTY_KEY,
          ),
          roomSpeed: readNumberProperty(
            map.properties,
            GAMEMAKER_ROOM_SPEED_PROPERTY_KEY,
            DEFAULT_ROOM_SPEED,
          ),
          roomCreationCodeFile: readStringProperty(
            map.properties,
            GAMEMAKER_ROOM_CREATION_CODE_PATH_PROPERTY_KEY,
          ),
          layers: encodedLayers.map((layer) => layer.value),
        },
        null,
        2,
      ),
    ),
  } satisfies ImportExportArchiveEntry;
}

export async function exportGameMakerMapBundle(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[] = [],
  layerGroups: LayerGroup[] = [],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
  options?: GameMakerMapExportOptions,
) {
  assertGameMakerExportSupported(map, layerGroups);

  const usedPaths = new Set<string>();
  const referencedTilesets = getReferencedTilesets(layers, tilesets);
  const { entries: tilesetEntries, records: tilesetRecords } =
    await buildTilesetResourceEntries(referencedTilesets, usedPaths);
  const { entries: backgroundEntries, records: backgroundRecords } =
    await buildBackgroundResourceEntries(imageLayers, usedPaths);
  const tileLayerExports = buildTileLayerExports(
    map,
    layers,
    referencedTilesets,
  );
  const backgroundLayerExports = buildBackgroundLayerExports(map, imageLayers);
  const instanceLayerExports = buildInstanceLayerExports(
    map,
    objectLayers,
    objects,
  );

  if (options?.format === "gmx") {
    return [
      buildLegacyRoomEntry(
        map,
        tileLayerExports,
        backgroundLayerExports,
        instanceLayerExports,
        tilesetRecords,
        backgroundRecords,
      ),
      ...tilesetEntries,
      ...backgroundEntries,
    ];
  }

  return [
    buildModernRoomEntry(
      map,
      tileLayerExports,
      backgroundLayerExports,
      instanceLayerExports,
      tilesetRecords,
      backgroundRecords,
    ),
    ...buildModernTilesetEntries(referencedTilesets, tilesetRecords),
    ...tilesetEntries,
    ...backgroundEntries,
  ];
}
