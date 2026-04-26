import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
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
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

interface SourceTilesetRecord {
  tileset: Tileset;
  imagePath: string;
}

interface GameMakerExportLayer {
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

function assertGameMakerExportSupported(
  map: TileMapData,
  imageLayers: readonly ImageLayer[],
  layerGroups: readonly LayerGroup[],
  objectLayers: readonly ObjectLayer[],
  objects: readonly MapObject[],
) {
  if (map.orientation !== "orthogonal") {
    throw new Error(
      "GameMaker export currently supports orthogonal maps only.",
    );
  }

  if (imageLayers.length > 0) {
    throw new Error(
      "GameMaker export does not include image layers yet. Remove image layers or use another export format.",
    );
  }

  if (layerGroups.length > 0) {
    throw new Error(
      "GameMaker export does not include layer groups yet. Flatten the map layers before exporting.",
    );
  }

  if (objectLayers.length > 0 || objects.length > 0) {
    throw new Error(
      "GameMaker export does not include object layers yet. Remove object layers or use another export format.",
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

async function buildSourceTilesetEntries(
  referencedTilesets: readonly Tileset[],
) {
  const usedPaths = new Set<string>();
  const entries: ImportExportArchiveEntry[] = [];
  const records = new Map<string, SourceTilesetRecord>();

  for (const tileset of referencedTilesets) {
    const record = await getAsset(tileset.assetId);
    if (!record) {
      throw new Error(
        `Missing image asset for GameMaker export: ${tileset.name}.`,
      );
    }

    const extension = getFileExtensionFromMimeType(record.mimeType);
    const imagePath = createRelativeAssetPath(
      "images",
      tileset.name,
      extension,
      usedPaths,
    );

    entries.push({
      path: imagePath,
      data: new Uint8Array(record.data),
    });
    records.set(tileset.id as string, {
      tileset,
      imagePath,
    });
  }

  return { entries, records };
}

function buildExportLayers(layers: readonly TileLayer[]) {
  const exportLayers: GameMakerExportLayer[] = [];

  layers.forEach((layer, layerIndex) => {
    const tilesByTileset = new Map<string, GameMakerExportLayer["tiles"]>();

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
        exportLayers.push({
          name:
            tilesByTileset.size > 1
              ? `${layer.name} (${tilesetId})`
              : layer.name,
          depth: (layers.length - layerIndex) * 1000 + tilesetIndex,
          tileset: { id: tilesetId } as Tileset,
          tiles,
        });
      },
    );
  });

  return exportLayers;
}

function buildLegacyRoomEntry(
  map: TileMapData,
  exportLayers: readonly GameMakerExportLayer[],
  sourceTilesetRecords: ReadonlyMap<string, SourceTilesetRecord>,
) {
  const document = createXmlDocument("room");
  const root = document.documentElement;

  const nameElement = document.createElement("name");
  nameElement.textContent = map.name;
  root.append(nameElement);

  const widthElement = document.createElement("width");
  widthElement.textContent = String(map.widthInTiles * map.tileSize);
  root.append(widthElement);

  const heightElement = document.createElement("height");
  heightElement.textContent = String(map.heightInTiles * map.tileSize);
  root.append(heightElement);

  const tileWidthElement = document.createElement("tilewidth");
  tileWidthElement.textContent = String(map.tileSize);
  root.append(tileWidthElement);

  const tileHeightElement = document.createElement("tileheight");
  tileHeightElement.textContent = String(map.tileSize);
  root.append(tileHeightElement);

  const resourcesElement = document.createElement("tilesetResources");
  for (const sourceTilesetRecord of sourceTilesetRecords.values()) {
    const tilesetElement = document.createElement("tileset");
    tilesetElement.setAttribute("name", sourceTilesetRecord.tileset.name);
    tilesetElement.setAttribute("image", sourceTilesetRecord.imagePath);
    tilesetElement.setAttribute(
      "tileSize",
      String(sourceTilesetRecord.tileset.tileSize),
    );
    resourcesElement.append(tilesetElement);
  }
  root.append(resourcesElement);

  const tilesElement = document.createElement("tiles");
  let nextTileId = 1;

  for (const exportLayer of exportLayers) {
    const sourceTilesetRecord = sourceTilesetRecords.get(
      exportLayer.tileset.id as string,
    );
    if (!sourceTilesetRecord) {
      throw new Error(
        "GameMaker export could not resolve a referenced tileset.",
      );
    }

    for (const tile of exportLayer.tiles) {
      const tileElement = document.createElement("tile");
      tileElement.setAttribute("bgName", sourceTilesetRecord.tileset.name);
      tileElement.setAttribute("bgPath", sourceTilesetRecord.imagePath);
      tileElement.setAttribute("x", String(tile.x * map.tileSize));
      tileElement.setAttribute("y", String(tile.y * map.tileSize));
      tileElement.setAttribute("w", String(tile.sw));
      tileElement.setAttribute("h", String(tile.sh));
      tileElement.setAttribute("xo", String(tile.sx));
      tileElement.setAttribute("yo", String(tile.sy));
      tileElement.setAttribute("id", String(nextTileId));
      tileElement.setAttribute("name", exportLayer.name);
      tileElement.setAttribute("depth", String(exportLayer.depth));
      tileElement.setAttribute("locked", "0");
      tilesElement.append(tileElement);
      nextTileId += 1;
    }
  }

  root.append(tilesElement);

  return {
    path: `${map.name}.room.gmx`,
    data: encodeXmlDocument(document),
  } satisfies ImportExportArchiveEntry;
}

function buildModernTilesetEntries(
  referencedTilesets: readonly Tileset[],
  sourceTilesetRecords: ReadonlyMap<string, SourceTilesetRecord>,
) {
  return referencedTilesets.map((tileset) => {
    const sourceTilesetRecord = sourceTilesetRecords.get(tileset.id as string);
    if (!sourceTilesetRecord) {
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
            texturePath: sourceTilesetRecord.imagePath,
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
  exportLayers: readonly GameMakerExportLayer[],
  sourceTilesetRecords: ReadonlyMap<string, SourceTilesetRecord>,
) {
  const layers = exportLayers.map((exportLayer) => {
    const sourceTilesetRecord = sourceTilesetRecords.get(
      exportLayer.tileset.id as string,
    );
    if (!sourceTilesetRecord) {
      throw new Error(
        "GameMaker export could not resolve a referenced tileset.",
      );
    }

    const denseTiles = new Array<number>(
      map.widthInTiles * map.heightInTiles,
    ).fill(-1);
    const columns = getTileColumns(sourceTilesetRecord.tileset);

    for (const tile of exportLayer.tiles) {
      const tileIndex = tile.y * map.widthInTiles + tile.x;
      const localTileId =
        Math.floor(tile.sy / sourceTilesetRecord.tileset.tileSize) * columns +
        Math.floor(tile.sx / sourceTilesetRecord.tileset.tileSize);
      denseTiles[tileIndex] = localTileId;
    }

    return {
      resourceType: "GMRTileLayer",
      resourceVersion: "1.0",
      name: exportLayer.name,
      depth: exportLayer.depth,
      visible: true,
      tilesetId: {
        name: sourceTilesetRecord.tileset.name,
        path: `tilesets/${sourceTilesetRecord.tileset.name}/${sourceTilesetRecord.tileset.name}.yy`,
      },
      tiles: {
        SerialiseWidth: map.widthInTiles,
        SerialiseHeight: map.heightInTiles,
        TileSerialiseData: denseTiles,
      },
    };
  });

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
          },
          layers,
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
  assertGameMakerExportSupported(
    map,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
  );

  const referencedTilesets = getReferencedTilesets(layers, tilesets);
  const { entries: sourceEntries, records } =
    await buildSourceTilesetEntries(referencedTilesets);
  const rawExportLayers = buildExportLayers(layers);
  const exportLayers = rawExportLayers.map((exportLayer) => ({
    ...exportLayer,
    tileset:
      referencedTilesets.find(
        (tileset) => tileset.id === exportLayer.tileset.id,
      ) ?? exportLayer.tileset,
  }));

  if (options?.format === "gmx") {
    return [buildLegacyRoomEntry(map, exportLayers, records), ...sourceEntries];
  }

  return [
    buildModernRoomEntry(map, exportLayers, records),
    ...buildModernTilesetEntries(referencedTilesets, records),
    ...sourceEntries,
  ];
}
