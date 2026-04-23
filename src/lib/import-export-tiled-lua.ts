import { gunzipSync, unzlibSync } from "fflate";
import { buildDownloadFilename } from "@/utils/format";
import { buildTiledMapJsonBundleData } from "@/lib/import-export-tiled-json";
import {
  MAP_NAME_PROPERTY_KEY,
  TILED_FORMAT_VERSION,
} from "@/lib/import-export-tiled-shared";
import { buildTiledLuaMapDocument } from "@/lib/tiled-lua-format";
import { encodeTiledLuaDocument } from "@/lib/tiled-lua";
import {
  base64ToBytes,
  createXmlDocument,
  decodeText,
  encodeXmlDocument,
} from "@/lib/tiled-xml-utils";
import type {
  ImageLayer,
  ImportExportArchiveEntry,
  LayerGroup,
  MapObject,
  ObjectLayer,
  TiledJsonGroupLayer,
  TiledJsonLayer,
  TiledJsonMap,
  TiledJsonProperty,
  TiledJsonTileLayer,
  TiledJsonTileset,
  TileLayer,
  TileMapData,
  Tileset,
  TiledXmlExportOptions,
} from "@/types";

function replaceJsonExtensionWithTsx(path: string) {
  return path.replace(/\.tsj$/i, ".tsx");
}

function decodeLayerData(layer: TiledJsonTileLayer) {
  if (!layer.data || Array.isArray(layer.data)) {
    return layer.data;
  }

  const decoded = base64ToBytes(layer.data);
  const raw =
    layer.compression === "gzip"
      ? gunzipSync(decoded)
      : layer.compression === "zlib"
        ? unzlibSync(decoded)
        : decoded;

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const gids: number[] = [];

  for (let offset = 0; offset + 4 <= raw.byteLength; offset += 4) {
    gids.push(view.getUint32(offset, true));
  }

  return gids;
}

function normalizeLuaLayer(layer: TiledJsonLayer): TiledJsonLayer {
  if (layer.type === "group") {
    const { layers, ...groupLayer } = layer as TiledJsonGroupLayer;
    return {
      ...groupLayer,
      type: "group",
      layers: (layers ?? []).map((child) => normalizeLuaLayer(child)),
    };
  }

  if (layer.type !== "tilelayer") {
    return layer;
  }

  const { compression, data, encoding, ...tileLayer } =
    layer as TiledJsonTileLayer;
  return {
    ...tileLayer,
    type: "tilelayer",
    data: decodeLayerData({
      ...tileLayer,
      type: "tilelayer",
      data,
      encoding,
      compression,
    }),
  };
}

function filterLuaRootProperties(
  properties: readonly TiledJsonProperty[] | undefined,
) {
  const filtered = (properties ?? []).filter(
    (property) => property.name !== MAP_NAME_PROPERTY_KEY,
  );
  return filtered.length > 0 ? filtered : undefined;
}

function createLuaRootDocument(rootDocument: TiledJsonMap): TiledJsonMap {
  return {
    ...rootDocument,
    infinite: rootDocument.infinite ? true : undefined,
    compressionlevel: undefined,
    properties: filterLuaRootProperties(rootDocument.properties),
    layers: (rootDocument.layers ?? []).map((layer) =>
      normalizeLuaLayer(layer),
    ),
    tilesets: (rootDocument.tilesets ?? []).map((tileset) =>
      tileset.source
        ? {
            ...tileset,
            source: replaceJsonExtensionWithTsx(tileset.source),
          }
        : tileset,
    ),
  };
}

function convertJsonTilesetEntryToTsx(entry: ImportExportArchiveEntry) {
  const tileset = JSON.parse(decodeText(entry.data)) as TiledJsonTileset;
  const document = createXmlDocument("tileset");
  const tilesetElement = document.documentElement;

  tilesetElement.setAttribute(
    "version",
    String(tileset.version ?? TILED_FORMAT_VERSION),
  );
  if (tileset.name) {
    tilesetElement.setAttribute("name", tileset.name);
  }
  if (tileset.tilewidth !== undefined) {
    tilesetElement.setAttribute("tilewidth", String(tileset.tilewidth));
  }
  if (tileset.tileheight !== undefined) {
    tilesetElement.setAttribute("tileheight", String(tileset.tileheight));
  }
  if (tileset.tilecount !== undefined) {
    tilesetElement.setAttribute("tilecount", String(tileset.tilecount));
  }
  if (tileset.columns !== undefined) {
    tilesetElement.setAttribute("columns", String(tileset.columns));
  }
  if (tileset.margin !== undefined) {
    tilesetElement.setAttribute("margin", String(tileset.margin));
  }
  if (tileset.spacing !== undefined) {
    tilesetElement.setAttribute("spacing", String(tileset.spacing));
  }

  if (tileset.image) {
    const imageElement = document.createElement("image");
    imageElement.setAttribute("source", tileset.image);
    if (tileset.imagewidth !== undefined) {
      imageElement.setAttribute("width", String(tileset.imagewidth));
    }
    if (tileset.imageheight !== undefined) {
      imageElement.setAttribute("height", String(tileset.imageheight));
    }
    tilesetElement.append(imageElement);
  }

  return {
    path: replaceJsonExtensionWithTsx(entry.path),
    data: encodeXmlDocument(document),
  } satisfies ImportExportArchiveEntry;
}

export async function exportTiledMapLuaBundle(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[] = [],
  layerGroups: LayerGroup[] = [],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
  options: TiledXmlExportOptions,
): Promise<ImportExportArchiveEntry[]> {
  const { entries, rootDocument } = await buildTiledMapJsonBundleData(
    map,
    layers,
    tilesets,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
    options,
  );
  const luaRootDocument = createLuaRootDocument(rootDocument);
  const luaEntries = entries.map((entry) =>
    entry.path.toLowerCase().endsWith(".tsj")
      ? convertJsonTilesetEntryToTsx(entry)
      : entry,
  );

  luaEntries.push({
    path: buildDownloadFilename(map.name, ".lua"),
    data: encodeTiledLuaDocument(buildTiledLuaMapDocument(luaRootDocument)),
  });

  return luaEntries;
}
