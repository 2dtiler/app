import { buildDownloadFilename } from "@/utils/format";
import {
  getTextObjectSettings,
  isReservedTextObjectPropertyKey,
} from "@/features/map-editor/lib/text-objects";
import {
  getTileColumns,
  getTileCount,
  stripExtension,
} from "@/features/import-export/lib/tiled-xml-utils";
import {
  buildJsonProperties,
  createRelativeAssetPath,
  encodeJsonDocument,
  encodeLayerData,
  EXPANDED_PROPERTY_KEY,
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
import { buildTiledJsonWangSets } from "@/features/import-export/lib/tiled-wang";
import { buildTiledJsonAnimationFields } from "@/features/import-export/lib/tiled-animation-conversion";
import type {
  ImageLayer,
  ImportExportArchiveEntry,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapObject,
  ObjectLayer,
  PropertyValue,
  TiledJsonMap,
  TileLayer,
  TileMapData,
  Tileset,
  TiledXmlExportOptions,
} from "@/types";

export async function buildTiledMapJsonBundleData(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[] = [],
  layerGroups: LayerGroup[] = [],
  objectLayers: ObjectLayer[] = [],
  objects: MapObject[] = [],
  options: TiledXmlExportOptions,
) {
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

  const mapProperties = {
    ...(map.properties ?? {}),
    [MAP_NAME_PROPERTY_KEY]: { value: map.name, type: "string" as const },
  };
  const mapJsonProperties = buildJsonProperties(mapProperties, objectIdMap);

  function buildJsonLayerData(layer: TileLayer) {
    const gids = getLayerDenseGids(map, layer, tilesetFirstGids, tilesetMap);
    return options.encoding === "base64"
      ? {
          data: encodeLayerData(gids, options),
          encoding: "base64" as const,
          ...(options.compression !== "none"
            ? { compression: options.compression }
            : {}),
        }
      : {
          data: Array.from(gids),
        };
  }

  function buildJsonObjectEntry(object: MapObject) {
    const tiledObjectId = objectIdMap.get(object.id as string);
    if (!tiledObjectId) {
      return null;
    }

    const objectProperties = { ...(object.properties ?? {}) };
    if (object.locked) {
      objectProperties[LOCKED_PROPERTY_KEY] = {
        value: "true",
        type: "bool",
      };
    }

    const jsonObject: Record<string, unknown> = {
      id: tiledObjectId,
      name: object.name,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation,
      visible: object.visible,
    };

    if (object.type === "ellipse") {
      jsonObject.ellipse = true;
    } else if (object.type === "point") {
      jsonObject.point = true;
    } else if (object.type === "polygon") {
      jsonObject.polygon = object.points.map((point) => ({
        x: point.x,
        y: point.y,
      }));
    } else if (object.type === "text") {
      const textSettings = getTextObjectSettings(object);
      jsonObject.text = {
        fontfamily: textSettings.font,
        pixelsize: textSettings.size,
        wrap: textSettings.wordWrap,
        color: textSettings.color,
        text: textSettings.text,
      };

      for (const key of Object.keys(objectProperties)) {
        if (isReservedTextObjectPropertyKey(key)) {
          delete objectProperties[key];
        }
      }
    }

    const properties = buildJsonProperties(objectProperties, objectIdMap);
    if (properties) {
      jsonObject.properties = properties;
    }

    return jsonObject;
  }

  let nextLayerIdValue = 1;
  const nextLayerId = () => {
    const currentValue = nextLayerIdValue;
    nextLayerIdValue += 1;
    return currentValue;
  };

  function buildJsonLayerTree(
    entriesToRender: readonly (LayerId | LayerGroupId)[],
  ) {
    return entriesToRender.flatMap((entryId) => {
      const group = groupMap.get(entryId as string);
      if (group) {
        const groupProperties: Record<string, PropertyValue> = {};
        if (group.locked) {
          groupProperties[LOCKED_PROPERTY_KEY] = {
            value: "true",
            type: "bool",
          };
        }
        groupProperties[EXPANDED_PROPERTY_KEY] = {
          value: group.expanded ? "true" : "false",
          type: "bool",
        };

        const groupLayer: Record<string, unknown> = {
          id: nextLayerId(),
          name: group.name,
          type: "group",
          visible: group.visible,
          opacity: 1,
          layers: buildJsonLayerTree(group.childOrder),
        };
        const properties = buildJsonProperties(groupProperties, objectIdMap);
        if (properties) {
          groupLayer.properties = properties;
        }
        return [groupLayer];
      }

      const tileLayer = layerMap.get(entryId as string);
      if (tileLayer) {
        const layerProperties: Record<string, PropertyValue> = {};
        if (tileLayer.locked) {
          layerProperties[LOCKED_PROPERTY_KEY] = {
            value: "true",
            type: "bool",
          };
        }

        const jsonLayer: Record<string, unknown> = {
          id: nextLayerId(),
          name: tileLayer.name,
          type: "tilelayer",
          width: map.widthInTiles,
          height: map.heightInTiles,
          x: 0,
          y: 0,
          visible: tileLayer.visible,
          opacity: 1,
          ...buildJsonLayerData(tileLayer),
        };
        const properties = buildJsonProperties(layerProperties, objectIdMap);
        if (properties) {
          jsonLayer.properties = properties;
        }
        return [jsonLayer];
      }

      const imageLayer = imageLayerMap.get(entryId as string);
      if (imageLayer) {
        const imageSource = imageSourcesByLayerId.get(imageLayer.id as string);
        if (!imageSource) {
          return [];
        }

        const layerProperties: Record<string, PropertyValue> = {};
        if (imageLayer.locked) {
          layerProperties[LOCKED_PROPERTY_KEY] = {
            value: "true",
            type: "bool",
          };
        }
        layerProperties[IMAGE_WIDTH_PROPERTY_KEY] = {
          value: String(imageLayer.width),
          type: "int",
        };
        layerProperties[IMAGE_HEIGHT_PROPERTY_KEY] = {
          value: String(imageLayer.height),
          type: "int",
        };
        layerProperties[IMAGE_ROTATION_PROPERTY_KEY] = {
          value: String(imageLayer.rotation ?? 0),
          type: "float",
        };
        layerProperties[IMAGE_FLIP_X_PROPERTY_KEY] = {
          value: imageLayer.flipX ? "true" : "false",
          type: "bool",
        };
        layerProperties[IMAGE_FLIP_Y_PROPERTY_KEY] = {
          value: imageLayer.flipY ? "true" : "false",
          type: "bool",
        };

        const jsonLayer: Record<string, unknown> = {
          id: nextLayerId(),
          name: imageLayer.name,
          type: "imagelayer",
          image: imageSource,
          offsetx: imageLayer.x,
          offsety: imageLayer.y,
          opacity: (imageLayer.opacity ?? 100) / 100,
          visible: imageLayer.visible,
        };
        const properties = buildJsonProperties(layerProperties, objectIdMap);
        if (properties) {
          jsonLayer.properties = properties;
        }
        return [jsonLayer];
      }

      const objectLayer = objectLayerMap.get(entryId as string);
      if (!objectLayer) {
        return [];
      }

      const layerProperties: Record<string, PropertyValue> = {};
      if (objectLayer.locked) {
        layerProperties[LOCKED_PROPERTY_KEY] = {
          value: "true",
          type: "bool",
        };
      }

      const jsonLayer: Record<string, unknown> = {
        id: nextLayerId(),
        name: objectLayer.name,
        type: "objectgroup",
        draworder: "index",
        visible: objectLayer.visible,
        opacity: 1,
        objects: objectLayer.objectOrder.flatMap((objectId) => {
          const object = objectMap.get(objectId as string);
          return object ? [buildJsonObjectEntry(object)].filter(Boolean) : [];
        }),
      };
      const properties = buildJsonProperties(layerProperties, objectIdMap);
      if (properties) {
        jsonLayer.properties = properties;
      }
      return [jsonLayer];
    });
  }

  const tilesetsJson = [];

  for (const tileset of exportedTilesets) {
    const firstGid = tilesetFirstGids.get(tileset.id as string);
    const imagePath = imagePathsByAssetId.get(tileset.assetId as string);
    if (!firstGid || !imagePath) {
      continue;
    }

    const wangsets = buildTiledJsonWangSets(tileset);
    const animationFields = buildTiledJsonAnimationFields(tileset);

    if (options.tilesetMode === "external") {
      const tsjPath = createRelativeAssetPath(
        "tilesets",
        tileset.name,
        ".tsj",
        usedPaths,
      );
      entries.push({
        path: tsjPath,
        data: encodeJsonDocument({
          type: "tileset",
          version: TILED_FORMAT_VERSION,
          tiledversion: TILED_FORMAT_VERSION,
          name: tileset.name,
          tilewidth: tileset.tileSize,
          tileheight: tileset.tileSize,
          tilecount: getTileCount(tileset),
          columns: getTileColumns(tileset),
          margin: 0,
          spacing: 0,
          image: `../${imagePath}`,
          imagewidth: tileset.imageWidth,
          imageheight: tileset.imageHeight,
          ...(wangsets ? { wangsets } : {}),
          ...(wangsets ? { wangsets } : {}),
          ...animationFields,
        }),
      });
      tilesetsJson.push({ firstgid: firstGid, source: tsjPath });
      continue;
    }

    tilesetsJson.push({
      firstgid: firstGid,
      name: tileset.name,
      tilewidth: tileset.tileSize,
      tileheight: tileset.tileSize,
      tilecount: getTileCount(tileset),
      columns: getTileColumns(tileset),
      margin: 0,
      spacing: 0,
      image: imagePath,
      imagewidth: tileset.imageWidth,
      imageheight: tileset.imageHeight,
      ...(wangsets ? { wangsets } : {}),
      ...(wangsets ? { wangsets } : {}),
      ...animationFields,
    });
  }

  const rootDocument: TiledJsonMap = {
    type: "map",
    version: TILED_FORMAT_VERSION,
    tiledversion: TILED_FORMAT_VERSION,
    orientation: map.orientation,
    width: map.widthInTiles,
    height: map.heightInTiles,
    tilewidth: map.tileSize,
    tileheight: map.tileSize,
    infinite: false,
    nextlayerid:
      nextLayerIdValue +
      layers.length +
      imageLayers.length +
      objectLayers.length +
      layerGroups.length,
    nextobjectid: objectIdMap.size + 1,
    ...(options.encoding === "base64" && options.compression !== "none"
      ? { compressionlevel: options.compressionLevel }
      : {}),
    ...(map.orientation === "orthogonal"
      ? { renderorder: options.renderOrder }
      : {}),
    ...(map.orientation === "hexagonal"
      ? { hexsidelength: Math.round(map.tileSize / 2) }
      : {}),
    ...(map.orientation === "hexagonal" || map.orientation === "staggered"
      ? {
          staggeraxis: map.staggerAxis ?? "x",
          staggerindex: map.staggerIndex ?? "odd",
        }
      : {}),
    ...(mapJsonProperties ? { properties: mapJsonProperties } : {}),
    layers: buildJsonLayerTree(map.layerOrder),
    tilesets: tilesetsJson,
  };

  return {
    entries,
    rootDocument,
  };
}

export async function exportTiledMapJsonBundle(
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

  entries.push({
    path: buildDownloadFilename(map.name, ".tmj"),
    data: encodeJsonDocument(rootDocument),
  });

  return entries;
}

function encodeTiledJavaScriptMapDocument(
  rootPath: string,
  rootDocument: TiledJsonMap,
) {
  const fileName = rootPath.split("/").pop() ?? rootPath;
  const mapName = stripExtension(fileName);
  const jsonDocument = JSON.stringify(rootDocument, null, 2);

  return new TextEncoder().encode(
    `(function(name,data){\n` +
      ` if(typeof onTileMapLoaded === 'undefined') {\n` +
      `  if(typeof TileMaps === 'undefined') TileMaps = {};\n` +
      `  TileMaps[name] = data;\n` +
      ` } else {\n` +
      `  onTileMapLoaded(name,data);\n` +
      ` }\n` +
      ` if(typeof module === 'object' && module && module.exports) {\n` +
      `  module.exports = data;\n` +
      ` }})(${JSON.stringify(mapName)},\n` +
      `${jsonDocument}\n` +
      `);\n`,
  );
}

export async function exportTiledMapJsBundle(
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
  const rootPath = buildDownloadFilename(map.name, ".js");

  entries.push({
    path: rootPath,
    data: encodeTiledJavaScriptMapDocument(rootPath, rootDocument),
  });

  return entries;
}
