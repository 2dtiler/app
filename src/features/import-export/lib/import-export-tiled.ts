import { buildDownloadFilename } from "@/utils/format";
import {
  getTextObjectSettings,
  isReservedTextObjectPropertyKey,
} from "@/features/map-editor/lib/text-objects";
import {
  createXmlDocument,
  encodeXmlDocument,
  getTileColumns,
  getTileCount,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  buildTiledTilesetLookups,
  createRelativeAssetPath,
  encodeLayerData,
  EXPANDED_PROPERTY_KEY,
  getLayerDenseCsvIds,
  getLayerDenseGids,
  IMAGE_FLIP_X_PROPERTY_KEY,
  IMAGE_FLIP_Y_PROPERTY_KEY,
  IMAGE_HEIGHT_PROPERTY_KEY,
  IMAGE_ROTATION_PROPERTY_KEY,
  IMAGE_WIDTH_PROPERTY_KEY,
  LOCKED_PROPERTY_KEY,
  MAP_NAME_PROPERTY_KEY,
  prepareTiledMapBundleData,
  TILED_FORMAT_VERSION,
} from "@/features/import-export/lib/import-export-tiled-shared";
import { appendTiledXmlWangSets } from "@/features/import-export/lib/tiled-wang";
import { appendXmlTilesetAnimationData } from "@/features/import-export/lib/tiled-animation-conversion";
import type {
  ImportExportArchiveEntry,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TileLayer,
  TileMapData,
  Tileset,
  TiledXmlExportOptions,
} from "@/types";

export {
  exportTiledMapJsBundle,
  exportTiledMapJsonBundle,
} from "@/features/import-export/lib/import-export-tiled-json";

export { exportTiledMapLuaBundle } from "@/features/import-export/lib/import-export-tiled-lua";

function encodeTiledCsvLayer(
  tileIds: readonly (number | null)[],
  widthInTiles: number,
) {
  const rows: string[] = [];

  for (let rowIndex = 0; rowIndex < tileIds.length; rowIndex += widthInTiles) {
    const row = tileIds
      .slice(rowIndex, rowIndex + widthInTiles)
      .map((tileId) => (tileId === null ? "-1" : String(tileId)));
    rows.push(row.join(","));
  }

  return new TextEncoder().encode(`${rows.join("\n")}\n`);
}

export async function exportTiledMapCsvBundle(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
): Promise<ImportExportArchiveEntry[]> {
  if (layers.length === 0) {
    throw new Error("Tiled CSV export requires at least one tile layer.");
  }

  const { tilesetMap } = buildTiledTilesetLookups(layers, tilesets);

  return layers.map((layer, index) => {
    const tileIds = getLayerDenseCsvIds(map, layer, tilesetMap);
    const path =
      layers.length === 1
        ? buildDownloadFilename(map.name, ".csv")
        : buildDownloadFilename(
            `${map.name}_${layer.name || index + 1}`,
            ".csv",
          );

    return {
      path,
      data: encodeTiledCsvLayer(tileIds, map.widthInTiles),
    };
  });
}

function appendProperties(
  document: XMLDocument,
  parent: Element,
  properties: Record<string, PropertyValue> | undefined,
  objectIdMap?: ReadonlyMap<string, number>,
) {
  const propertyEntries = Object.entries(properties ?? {});
  if (propertyEntries.length === 0) return;

  const propertiesElement = document.createElement("properties");

  for (const [key, property] of propertyEntries) {
    const propertyElement = document.createElement("property");
    propertyElement.setAttribute("name", key);
    if (property.type !== "string") {
      propertyElement.setAttribute("type", property.type);
    }

    const value =
      property.type === "object" && objectIdMap
        ? String(objectIdMap.get(property.value) ?? 0)
        : property.value;

    if (property.type === "string" && value.includes("\n")) {
      propertyElement.textContent = value;
    } else {
      propertyElement.setAttribute("value", value);
    }

    propertiesElement.append(propertyElement);
  }

  parent.append(propertiesElement);
}

function appendTileLayer(
  document: XMLDocument,
  parent: Element,
  map: TileMapData,
  layer: TileLayer,
  nextLayerId: () => number,
  tilesetFirstGids: ReadonlyMap<string, number>,
  tilesetMap: ReadonlyMap<string, Tileset>,
  options: TiledXmlExportOptions,
) {
  const layerElement = document.createElement("layer");
  layerElement.setAttribute("id", String(nextLayerId()));
  layerElement.setAttribute("name", layer.name);
  layerElement.setAttribute("width", String(map.widthInTiles));
  layerElement.setAttribute("height", String(map.heightInTiles));
  if (!layer.visible) {
    layerElement.setAttribute("visible", "0");
  }

  const layerProperties: Record<string, PropertyValue> = {};
  if (layer.locked) {
    layerProperties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  appendProperties(document, layerElement, layerProperties);

  const gids = getLayerDenseGids(map, layer, tilesetFirstGids, tilesetMap);
  const dataElement = document.createElement("data");
  dataElement.setAttribute("encoding", options.encoding);
  if (options.encoding === "base64" && options.compression !== "none") {
    dataElement.setAttribute("compression", options.compression);
  }
  dataElement.textContent = encodeLayerData(gids, options);
  layerElement.append(dataElement);
  parent.append(layerElement);
}

function appendImageLayer(
  document: XMLDocument,
  parent: Element,
  layer: ImageLayer,
  imageSource: string,
  nextLayerId: () => number,
) {
  const layerElement = document.createElement("imagelayer");
  layerElement.setAttribute("id", String(nextLayerId()));
  layerElement.setAttribute("name", layer.name);
  layerElement.setAttribute("offsetx", String(layer.x));
  layerElement.setAttribute("offsety", String(layer.y));
  layerElement.setAttribute("opacity", String((layer.opacity ?? 100) / 100));
  if (!layer.visible) {
    layerElement.setAttribute("visible", "0");
  }

  const properties: Record<string, PropertyValue> = {};
  if (layer.locked) {
    properties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  properties[IMAGE_WIDTH_PROPERTY_KEY] = {
    value: String(layer.width),
    type: "int",
  };
  properties[IMAGE_HEIGHT_PROPERTY_KEY] = {
    value: String(layer.height),
    type: "int",
  };
  properties[IMAGE_ROTATION_PROPERTY_KEY] = {
    value: String(layer.rotation ?? 0),
    type: "float",
  };
  properties[IMAGE_FLIP_X_PROPERTY_KEY] = {
    value: layer.flipX ? "true" : "false",
    type: "bool",
  };
  properties[IMAGE_FLIP_Y_PROPERTY_KEY] = {
    value: layer.flipY ? "true" : "false",
    type: "bool",
  };
  appendProperties(document, layerElement, properties);

  const imageElement = document.createElement("image");
  imageElement.setAttribute("source", imageSource);
  layerElement.append(imageElement);
  parent.append(layerElement);
}

function appendObjectLayer(
  document: XMLDocument,
  parent: Element,
  layer: ObjectLayer,
  objectMap: ReadonlyMap<string, MapObject>,
  objectIdMap: ReadonlyMap<string, number>,
  nextLayerId: () => number,
) {
  const layerElement = document.createElement("objectgroup");
  layerElement.setAttribute("id", String(nextLayerId()));
  layerElement.setAttribute("name", layer.name);
  layerElement.setAttribute("draworder", "index");
  if (!layer.visible) {
    layerElement.setAttribute("visible", "0");
  }

  const layerProperties: Record<string, PropertyValue> = {};
  if (layer.locked) {
    layerProperties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  appendProperties(document, layerElement, layerProperties);

  for (const objectId of layer.objectOrder) {
    const object = objectMap.get(objectId as string);
    const tiledObjectId = objectIdMap.get(objectId as string);
    if (!object || !tiledObjectId) continue;

    const objectElement = document.createElement("object");
    objectElement.setAttribute("id", String(tiledObjectId));
    objectElement.setAttribute("name", object.name);
    objectElement.setAttribute("x", String(object.x));
    objectElement.setAttribute("y", String(object.y));
    objectElement.setAttribute("width", String(object.width));
    objectElement.setAttribute("height", String(object.height));
    objectElement.setAttribute("rotation", String(object.rotation));
    if (!object.visible) {
      objectElement.setAttribute("visible", "0");
    }

    const objectProperties = { ...(object.properties ?? {}) };
    if (object.locked) {
      objectProperties[LOCKED_PROPERTY_KEY] = {
        value: "true",
        type: "bool",
      };
    }

    if (object.type === "ellipse") {
      objectElement.append(document.createElement("ellipse"));
    } else if (object.type === "point") {
      objectElement.append(document.createElement("point"));
    } else if (object.type === "polygon") {
      const polygonElement = document.createElement("polygon");
      polygonElement.setAttribute(
        "points",
        object.points.map((point) => `${point.x},${point.y}`).join(" "),
      );
      objectElement.append(polygonElement);
    } else if (object.type === "text") {
      const textSettings = getTextObjectSettings(object);
      const textElement = document.createElement("text");
      textElement.setAttribute("fontfamily", textSettings.font);
      textElement.setAttribute("pixelsize", String(textSettings.size));
      textElement.setAttribute("wrap", textSettings.wordWrap ? "1" : "0");
      textElement.setAttribute("color", textSettings.color);
      textElement.textContent = textSettings.text;
      objectElement.append(textElement);

      for (const key of Object.keys(objectProperties)) {
        if (isReservedTextObjectPropertyKey(key)) {
          delete objectProperties[key];
        }
      }
    }

    appendProperties(document, objectElement, objectProperties, objectIdMap);
    layerElement.append(objectElement);
  }

  parent.append(layerElement);
}

function appendGroupLayer(
  document: XMLDocument,
  parent: Element,
  group: LayerGroup,
  layerMap: ReadonlyMap<string, TileLayer>,
  imageLayerMap: ReadonlyMap<string, ImageLayer>,
  objectLayerMap: ReadonlyMap<string, ObjectLayer>,
  groupMap: ReadonlyMap<string, LayerGroup>,
  imageSources: ReadonlyMap<string, string>,
  objectMap: ReadonlyMap<string, MapObject>,
  objectIdMap: ReadonlyMap<string, number>,
  nextLayerId: () => number,
  tilesetFirstGids: ReadonlyMap<string, number>,
  tilesetMap: ReadonlyMap<string, Tileset>,
  map: TileMapData,
  options: TiledXmlExportOptions,
) {
  const groupElement = document.createElement("group");
  groupElement.setAttribute("id", String(nextLayerId()));
  groupElement.setAttribute("name", group.name);
  if (!group.visible) {
    groupElement.setAttribute("visible", "0");
  }

  const groupProperties: Record<string, PropertyValue> = {};
  if (group.locked) {
    groupProperties[LOCKED_PROPERTY_KEY] = { value: "true", type: "bool" };
  }
  groupProperties[EXPANDED_PROPERTY_KEY] = {
    value: group.expanded ? "true" : "false",
    type: "bool",
  };
  appendProperties(document, groupElement, groupProperties);

  for (const childId of group.childOrder) {
    const childGroup = groupMap.get(childId as string);
    if (childGroup) {
      appendGroupLayer(
        document,
        groupElement,
        childGroup,
        layerMap,
        imageLayerMap,
        objectLayerMap,
        groupMap,
        imageSources,
        objectMap,
        objectIdMap,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        map,
        options,
      );
      continue;
    }

    const tileLayer = layerMap.get(childId as string);
    if (tileLayer) {
      appendTileLayer(
        document,
        groupElement,
        map,
        tileLayer,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        options,
      );
      continue;
    }

    const imageLayer = imageLayerMap.get(childId as string);
    if (imageLayer) {
      const imageSource = imageSources.get(imageLayer.id as string);
      if (imageSource) {
        appendImageLayer(
          document,
          groupElement,
          imageLayer,
          imageSource,
          nextLayerId,
        );
      }
      continue;
    }

    const objectLayer = objectLayerMap.get(childId as string);
    if (objectLayer) {
      appendObjectLayer(
        document,
        groupElement,
        objectLayer,
        objectMap,
        objectIdMap,
        nextLayerId,
      );
    }
  }

  parent.append(groupElement);
}

export async function exportTiledMapBundle(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[] = [],
  layerGroups: LayerGroup[] = [],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
  options: TiledXmlExportOptions,
): Promise<ImportExportArchiveEntry[]> {
  const {
    entries,
    exportedTilesets,
    groupMap,
    imageLayerMap,
    imagePathsByAssetId,
    imageSourcesByLayerId,
    layerMap,
    objectIdMap,
    objectLayerMap,
    objectMap,
    tilesetFirstGids,
    tilesetMap,
    usedPaths,
  } = await prepareTiledMapBundleData(
    map,
    layers,
    tilesets,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
  );

  const document = createXmlDocument("map");
  const mapElement = document.documentElement;
  mapElement.setAttribute("version", TILED_FORMAT_VERSION);
  mapElement.setAttribute("orientation", map.orientation);
  mapElement.setAttribute("width", String(map.widthInTiles));
  mapElement.setAttribute("height", String(map.heightInTiles));
  mapElement.setAttribute("tilewidth", String(map.tileSize));
  mapElement.setAttribute("tileheight", String(map.tileSize));
  mapElement.setAttribute("infinite", "0");
  mapElement.setAttribute("nextobjectid", String(objectIdMap.size + 1));

  if (options.encoding === "base64" && options.compression !== "none") {
    mapElement.setAttribute(
      "compressionlevel",
      String(options.compressionLevel),
    );
  }
  if (map.orientation === "orthogonal") {
    mapElement.setAttribute("renderorder", options.renderOrder);
  }
  if (map.orientation === "hexagonal") {
    mapElement.setAttribute(
      "hexsidelength",
      String(Math.round(map.tileSize / 2)),
    );
  }
  if (map.orientation === "hexagonal" || map.orientation === "staggered") {
    mapElement.setAttribute("staggeraxis", map.staggerAxis ?? "x");
    mapElement.setAttribute("staggerindex", map.staggerIndex ?? "odd");
  }

  const mapProperties = {
    ...(map.properties ?? {}),
    [MAP_NAME_PROPERTY_KEY]: { value: map.name, type: "string" as const },
  };
  appendProperties(document, mapElement, mapProperties, objectIdMap);

  for (const tileset of exportedTilesets) {
    const firstGid = tilesetFirstGids.get(tileset.id as string);
    const imagePath = imagePathsByAssetId.get(tileset.assetId as string);
    if (!firstGid || !imagePath) continue;

    if (options.tilesetMode === "external") {
      const tsxPath = createRelativeAssetPath(
        "tilesets",
        tileset.name,
        ".tsx",
        usedPaths,
      );
      const tilesetElement = document.createElement("tileset");
      tilesetElement.setAttribute("firstgid", String(firstGid));
      tilesetElement.setAttribute("source", tsxPath);
      mapElement.append(tilesetElement);

      const tsxDocument = createXmlDocument("tileset");
      const tsxElement = tsxDocument.documentElement;
      tsxElement.setAttribute("version", TILED_FORMAT_VERSION);
      tsxElement.setAttribute("name", tileset.name);
      tsxElement.setAttribute("tilewidth", String(tileset.tileSize));
      tsxElement.setAttribute("tileheight", String(tileset.tileSize));
      tsxElement.setAttribute("tilecount", String(getTileCount(tileset)));
      tsxElement.setAttribute("columns", String(getTileColumns(tileset)));
      tsxElement.setAttribute("margin", "0");
      tsxElement.setAttribute("spacing", "0");

      const imageElement = tsxDocument.createElement("image");
      imageElement.setAttribute("source", `../${imagePath}`);
      imageElement.setAttribute("width", String(tileset.imageWidth));
      imageElement.setAttribute("height", String(tileset.imageHeight));
      tsxElement.append(imageElement);
      appendXmlTilesetAnimationData(tsxDocument, tsxElement, tileset);
      appendTiledXmlWangSets(tsxDocument, tsxElement, tileset);

      entries.push({
        path: tsxPath,
        data: encodeXmlDocument(tsxDocument),
      });
      continue;
    }

    const tilesetElement = document.createElement("tileset");
    tilesetElement.setAttribute("firstgid", String(firstGid));
    tilesetElement.setAttribute("name", tileset.name);
    tilesetElement.setAttribute("tilewidth", String(tileset.tileSize));
    tilesetElement.setAttribute("tileheight", String(tileset.tileSize));
    tilesetElement.setAttribute("tilecount", String(getTileCount(tileset)));
    tilesetElement.setAttribute("columns", String(getTileColumns(tileset)));
    tilesetElement.setAttribute("margin", "0");
    tilesetElement.setAttribute("spacing", "0");
    const imageElement = document.createElement("image");
    imageElement.setAttribute("source", imagePath);
    imageElement.setAttribute("width", String(tileset.imageWidth));
    imageElement.setAttribute("height", String(tileset.imageHeight));
    tilesetElement.append(imageElement);
    appendXmlTilesetAnimationData(document, tilesetElement, tileset);
    appendTiledXmlWangSets(document, tilesetElement, tileset);
    mapElement.append(tilesetElement);
  }

  let nextLayerIdValue = 1;
  const nextLayerId = () => {
    const currentValue = nextLayerIdValue;
    nextLayerIdValue += 1;
    return currentValue;
  };

  mapElement.setAttribute(
    "nextlayerid",
    String(
      nextLayerIdValue +
        layers.length +
        imageLayers.length +
        objectLayers.length +
        layerGroups.length,
    ),
  );

  for (const entryId of map.layerOrder) {
    const group = groupMap.get(entryId as string);
    if (group) {
      appendGroupLayer(
        document,
        mapElement,
        group,
        layerMap,
        imageLayerMap,
        objectLayerMap,
        groupMap,
        imageSourcesByLayerId,
        objectMap,
        objectIdMap,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        map,
        options,
      );
      continue;
    }

    const tileLayer = layerMap.get(entryId as string);
    if (tileLayer) {
      appendTileLayer(
        document,
        mapElement,
        map,
        tileLayer,
        nextLayerId,
        tilesetFirstGids,
        tilesetMap,
        options,
      );
      continue;
    }

    const imageLayer = imageLayerMap.get(entryId as string);
    if (imageLayer) {
      const imageSource = imageSourcesByLayerId.get(imageLayer.id as string);
      if (imageSource) {
        appendImageLayer(
          document,
          mapElement,
          imageLayer,
          imageSource,
          nextLayerId,
        );
      }
      continue;
    }

    const objectLayer = objectLayerMap.get(entryId as string);
    if (objectLayer) {
      appendObjectLayer(
        document,
        mapElement,
        objectLayer,
        objectMap,
        objectIdMap,
        nextLayerId,
      );
    }
  }

  entries.push({
    path: buildDownloadFilename(map.name, ".tmx"),
    data: encodeXmlDocument(document),
  });

  return entries;
}
