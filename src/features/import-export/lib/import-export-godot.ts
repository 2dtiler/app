import { getTextObjectSettings } from "@/features/map-editor/lib/text-objects";
import { createRelativeAssetPath } from "@/features/import-export/lib/import-export-tiled-shared";
import {
  getFileExtensionFromMimeType,
  getTileColumns,
} from "@/features/import-export/lib/tiled-xml-utils";
import { getAsset } from "@/services/db";
import type {
  GodotMapExportOptions,
  ImageLayer,
  ImportExportArchiveEntry,
  LayerGroup,
  LayerGroupId,
  LayerId,
  MapObject,
  ObjectLayer,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";
import {
  DEFAULT_GODOT_MAP_EXPORT_OPTIONS,
  encodeGodotAlternativeTile,
  escapeGodotString,
  formatGodotColorRgba,
  formatGodotVector2,
  formatGodotVector2i,
  resolveGodotSceneRootName,
} from "@/features/import-export/lib/godot-scene-utils";

interface GodotExtResource {
  id: string;
  type: string;
  path: string;
}

interface GodotTilesetSourceDescriptor {
  resourceId: string;
  sourceId: number;
  textureResourceId: string;
  textureResourcePath: string;
  tileset: Tileset;
}

interface GodotTilesetBundle {
  sourceIdByTilesetId: Map<string, number>;
  sceneExtResources: GodotExtResource[];
  sceneTileSetValue: string;
  sceneSubResources: string[];
  externalEntries: ImportExportArchiveEntry[];
}

interface GodotNodeDescriptor {
  name: string;
  type: string;
  parentPath: string[];
  properties: Array<[string, string]>;
}

function normalizeNodeName(baseName: string, fallback: string) {
  const trimmed = baseName.trim();
  const candidate = (trimmed || fallback).replace(/[\\/:"]+/g, " ").trim();
  return candidate.length > 0 ? candidate : fallback;
}

function createNodeNameAllocator() {
  const counts = new Map<string, number>();

  return (
    parentPath: readonly string[],
    baseName: string,
    fallback: string,
  ) => {
    const normalizedBaseName = normalizeNodeName(baseName, fallback);
    const parentKey = parentPath.join("/");
    const key = `${parentKey}::${normalizedBaseName}`;
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
    return count === 0
      ? normalizedBaseName
      : `${normalizedBaseName} ${count + 1}`;
  };
}

function radiansFromDegrees(degrees: number | undefined) {
  return ((degrees ?? 0) * Math.PI) / 180;
}

function appendMetadata(
  properties: Array<[string, string]>,
  metadata: Record<string, string | number | boolean | undefined>,
) {
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) {
      continue;
    }

    let serializedValue: string;
    if (typeof value === "string") {
      serializedValue = escapeGodotString(value);
    } else if (typeof value === "boolean") {
      serializedValue = value ? "true" : "false";
    } else {
      serializedValue = String(value);
    }

    properties.push([`metadata/${key}`, serializedValue]);
  }
}

function buildGodotTileMapData(
  layer: TileLayer,
  sourceIdByTilesetId: ReadonlyMap<string, number>,
  tilesetById: ReadonlyMap<string, Tileset>,
) {
  const cells = Object.entries(layer.tiles)
    .map(([coordinate, ref]) => {
      const [x, y] = coordinate.split(",").map((value) => Number(value));
      const sourceId = sourceIdByTilesetId.get(ref.tilesetId as string);
      const tileset = tilesetById.get(ref.tilesetId as string);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        sourceId === undefined ||
        !tileset
      ) {
        return null;
      }

      return {
        x,
        y,
        sourceId,
        atlasX: Math.floor(ref.sx / tileset.tileSize),
        atlasY: Math.floor(ref.sy / tileset.tileSize),
        alternativeTile: encodeGodotAlternativeTile(ref),
      };
    })
    .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
    .sort((left, right) => left.y - right.y || left.x - right.x);

  if (cells.length === 0) {
    return "PackedByteArray()";
  }

  const bytes = new Uint8Array(cells.length * 20);
  const view = new DataView(bytes.buffer);

  cells.forEach((cell, index) => {
    const offset = index * 20;
    view.setInt32(offset, cell.x, true);
    view.setInt32(offset + 4, cell.y, true);
    view.setInt32(offset + 8, cell.sourceId, true);
    view.setInt16(offset + 12, cell.atlasX, true);
    view.setInt16(offset + 14, cell.atlasY, true);
    view.setInt32(offset + 16, cell.alternativeTile, true);
  });

  return `PackedByteArray(${Array.from(bytes).join(", ")})`;
}

function getTilesetOrientationProperties(map: TileMapData) {
  if (map.orientation === "isometric") {
    return [["tile_shape", "1"]] as Array<[string, string]>;
  }

  if (map.orientation === "staggered" || map.orientation === "hexagonal") {
    return [
      ["tile_shape", map.orientation === "hexagonal" ? "3" : "2"],
      ["tile_offset_axis", map.staggerAxis === "y" ? "1" : "0"],
      ["tile_layout", map.staggerIndex === "even" ? "1" : "0"],
    ] as Array<[string, string]>;
  }

  return [] as Array<[string, string]>;
}

function buildAtlasSourceLines(descriptor: GodotTilesetSourceDescriptor) {
  const rows = Math.max(
    1,
    Math.floor(descriptor.tileset.imageHeight / descriptor.tileset.tileSize),
  );
  const columns = getTileColumns(descriptor.tileset);
  const lines = [
    `[sub_resource type="TileSetAtlasSource" id="${descriptor.resourceId}"]`,
    `texture = ExtResource("${descriptor.textureResourceId}")`,
    `texture_region_size = ${formatGodotVector2i(
      descriptor.tileset.tileSize,
      descriptor.tileset.tileSize,
    )}`,
  ];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      lines.push(`${x}:${y}/0 = 0`);
    }
  }

  return lines.join("\n");
}

function buildEmbeddedTilesetBundle(
  map: TileMapData,
  referencedTilesets: Tileset[],
  imagePathByAssetId: ReadonlyMap<string, string>,
) {
  const descriptors = referencedTilesets.map((tileset, index) => ({
    resourceId: `TileSetAtlasSource_${index + 1}`,
    sourceId: index + 1,
    textureResourceId: `texture_${index + 1}`,
    textureResourcePath:
      imagePathByAssetId.get(tileset.assetId as string) ?? "",
    tileset,
  }));

  const sceneExtResources = descriptors.map((descriptor) => ({
    id: descriptor.textureResourceId,
    type: "Texture2D",
    path: descriptor.textureResourcePath,
  }));

  const tileSetLines = [
    `[sub_resource type="TileSet" id="TileSet_1"]`,
    `tile_size = ${formatGodotVector2i(map.tileSize, map.tileSize)}`,
    ...getTilesetOrientationProperties(map).map(
      ([key, value]) => `${key} = ${value}`,
    ),
    ...descriptors.map(
      (descriptor) =>
        `sources/${descriptor.sourceId} = SubResource("${descriptor.resourceId}")`,
    ),
  ];

  return {
    sourceIdByTilesetId: new Map(
      descriptors.map((descriptor) => [
        descriptor.tileset.id as string,
        descriptor.sourceId,
      ]),
    ),
    sceneExtResources,
    sceneTileSetValue: 'SubResource("TileSet_1")',
    sceneSubResources: [
      ...descriptors.map((descriptor) => buildAtlasSourceLines(descriptor)),
      tileSetLines.join("\n"),
    ],
    externalEntries: [],
  } satisfies GodotTilesetBundle;
}

function buildExternalTilesetBundle(
  map: TileMapData,
  referencedTilesets: Tileset[],
  imagePathByAssetId: ReadonlyMap<string, string>,
  usedPaths: Set<string>,
) {
  const tilesetPath = createRelativeAssetPath(
    "tilesets",
    `${map.name} tileset`,
    ".tres",
    usedPaths,
  );
  const descriptors = referencedTilesets.map((tileset, index) => ({
    resourceId: `TileSetAtlasSource_${index + 1}`,
    sourceId: index + 1,
    textureResourceId: `texture_${index + 1}`,
    textureResourcePath:
      imagePathByAssetId.get(tileset.assetId as string) ?? "",
    tileset,
  }));

  const extResourceLines = descriptors.map(
    (descriptor) =>
      `[ext_resource type="Texture2D" path="res://${descriptor.textureResourcePath}" id="${descriptor.textureResourceId}"]`,
  );
  const tileSetLines = [
    `[gd_resource type="TileSet" load_steps=${extResourceLines.length + descriptors.length + 1} format=3]`,
    "",
    ...extResourceLines,
    "",
    ...descriptors.flatMap((descriptor, index) => [
      buildAtlasSourceLines(descriptor),
      index === descriptors.length - 1 ? "" : "",
    ]),
    "[resource]",
    `tile_size = ${formatGodotVector2i(map.tileSize, map.tileSize)}`,
    ...getTilesetOrientationProperties(map).map(
      ([key, value]) => `${key} = ${value}`,
    ),
    ...descriptors.map(
      (descriptor) =>
        `sources/${descriptor.sourceId} = SubResource("${descriptor.resourceId}")`,
    ),
    "",
  ];

  return {
    sourceIdByTilesetId: new Map(
      descriptors.map((descriptor) => [
        descriptor.tileset.id as string,
        descriptor.sourceId,
      ]),
    ),
    sceneExtResources: [
      {
        id: "tileset_1",
        type: "TileSet",
        path: tilesetPath,
      },
    ],
    sceneTileSetValue: 'ExtResource("tileset_1")',
    sceneSubResources: [],
    externalEntries: [
      {
        path: tilesetPath,
        data: new TextEncoder().encode(tileSetLines.join("\n")),
      },
    ],
  } satisfies GodotTilesetBundle;
}

async function buildImageEntries(
  referencedTilesets: Tileset[],
  imageLayers: readonly ImageLayer[],
  usedPaths: Set<string>,
) {
  const imagePathByAssetId = new Map<string, string>();
  const entries: ImportExportArchiveEntry[] = [];
  const allAssets = [
    ...referencedTilesets.map((tileset) => ({
      assetId: tileset.assetId,
      name: tileset.name,
      folder: "images/tilesets",
    })),
    ...imageLayers.map((layer) => ({
      assetId: layer.assetId,
      name: layer.name,
      folder: "images/layers",
    })),
  ];

  for (const asset of allAssets) {
    const assetKey = asset.assetId as string;
    if (imagePathByAssetId.has(assetKey)) {
      continue;
    }

    const record = await getAsset(asset.assetId);
    if (!record) {
      throw new Error(`Missing image asset for Godot export: ${asset.name}.`);
    }

    const extension = getFileExtensionFromMimeType(record.mimeType);
    const path = createRelativeAssetPath(
      asset.folder,
      asset.name,
      extension,
      usedPaths,
    );
    imagePathByAssetId.set(assetKey, path);
    entries.push({
      path,
      data: new Uint8Array(record.data),
    });
  }

  return {
    entries,
    imagePathByAssetId,
  };
}

function createSceneNode(
  name: string,
  type: string,
  parentPath: readonly string[],
  properties: Array<[string, string]>,
) {
  return {
    name,
    type,
    parentPath: [...parentPath],
    properties,
  } satisfies GodotNodeDescriptor;
}

function buildNodeText(node: GodotNodeDescriptor) {
  const header =
    node.parentPath.length === 0
      ? `[node name=${escapeGodotString(node.name)} type=${escapeGodotString(node.type)}]`
      : `[node name=${escapeGodotString(node.name)} type=${escapeGodotString(
          node.type,
        )} parent=${escapeGodotString(
          node.parentPath.length === 1 ? "." : node.parentPath.join("/"),
        )}]`;

  const propertyLines = node.properties.map(
    ([key, value]) => `${key} = ${value}`,
  );
  return [header, ...propertyLines].join("\n");
}

function buildSceneNodes(
  map: TileMapData,
  layers: readonly TileLayer[],
  imageLayers: readonly ImageLayer[],
  layerGroups: readonly LayerGroup[],
  objectLayers: readonly ObjectLayer[],
  objects: readonly MapObject[],
  imagePathByAssetId: ReadonlyMap<string, string>,
  sourceIdByTilesetId: ReadonlyMap<string, number>,
  tilesetById: ReadonlyMap<string, Tileset>,
  options: GodotMapExportOptions,
) {
  const groupMap = new Map(
    layerGroups.map((group) => [group.id as string, group]),
  );
  const layerMap = new Map(layers.map((layer) => [layer.id as string, layer]));
  const imageLayerMap = new Map(
    imageLayers.map((imageLayer) => [imageLayer.id as string, imageLayer]),
  );
  const objectLayerMap = new Map(
    objectLayers.map((objectLayer) => [objectLayer.id as string, objectLayer]),
  );
  const objectMap = new Map(
    objects.map((object) => [object.id as string, object]),
  );
  const nodes: GodotNodeDescriptor[] = [];
  const allocateNodeName = createNodeNameAllocator();
  const rootName = allocateNodeName(
    [],
    resolveGodotSceneRootName(map.name, options),
    "Map",
  );
  const rootProperties: Array<[string, string]> = [];
  appendMetadata(rootProperties, {
    "2dtiler_kind": "map",
    "2dtiler_id": map.id as string,
    "2dtiler_orientation": map.orientation,
    "2dtiler_stagger_axis": map.staggerAxis,
    "2dtiler_stagger_index": map.staggerIndex,
    "2dtiler_tile_size": map.tileSize,
    "2dtiler_width_in_tiles": map.widthInTiles,
    "2dtiler_height_in_tiles": map.heightInTiles,
    "2dtiler_properties": JSON.stringify(map.properties ?? {}),
  });
  nodes.push(createSceneNode(rootName, "Node2D", [], rootProperties));

  function appendObjectNode(
    object: MapObject,
    parentPath: readonly string[],
    parentVisible: boolean,
    parentLocked: boolean,
  ) {
    const nodeName = allocateNodeName(parentPath, object.name, object.type);
    const properties: Array<[string, string]> = [];
    const effectiveVisible = parentVisible && object.visible;
    const effectiveLocked = parentLocked || object.locked;

    if (!effectiveVisible) {
      properties.push(["visible", "false"]);
    }

    if (object.type === "point") {
      properties.push(["position", formatGodotVector2(object.x, object.y)]);
      appendMetadata(properties, {
        "2dtiler_kind": "object",
        "2dtiler_id": object.id as string,
        "2dtiler_object_type": object.type,
        "2dtiler_locked": effectiveLocked,
        "2dtiler_properties": JSON.stringify(object.properties ?? {}),
      });
      nodes.push(createSceneNode(nodeName, "Marker2D", parentPath, properties));
      return;
    }

    if (object.type === "text") {
      const settings = getTextObjectSettings(object);
      properties.push(["offset_left", `${object.x}`]);
      properties.push(["offset_top", `${object.y}`]);
      properties.push(["offset_right", `${object.x + object.width}`]);
      properties.push(["offset_bottom", `${object.y + object.height}`]);
      if (object.rotation) {
        properties.push(["rotation", `${radiansFromDegrees(object.rotation)}`]);
      }
      properties.push(["text", escapeGodotString(settings.text)]);
      appendMetadata(properties, {
        "2dtiler_kind": "object",
        "2dtiler_id": object.id as string,
        "2dtiler_object_type": object.type,
        "2dtiler_locked": effectiveLocked,
        "2dtiler_properties": JSON.stringify(object.properties ?? {}),
      });
      nodes.push(createSceneNode(nodeName, "Label", parentPath, properties));
      return;
    }

    properties.push(["position", formatGodotVector2(object.x, object.y)]);
    if (object.rotation) {
      properties.push(["rotation", `${radiansFromDegrees(object.rotation)}`]);
    }

    const polygonNumbers =
      object.type === "rectangle"
        ? [0, 0, object.width, 0, object.width, object.height, 0, object.height]
        : object.type === "ellipse"
          ? Array.from({ length: 16 }, (_, index) => {
              const angle = (index / 16) * Math.PI * 2;
              return [
                object.width / 2 + Math.cos(angle) * (object.width / 2),
                object.height / 2 + Math.sin(angle) * (object.height / 2),
              ];
            }).flat()
          : object.points.flatMap((point) => [point.x, point.y]);
    properties.push([
      "polygon",
      `PackedVector2Array(${polygonNumbers.join(", ")})`,
    ]);
    appendMetadata(properties, {
      "2dtiler_kind": "object",
      "2dtiler_id": object.id as string,
      "2dtiler_object_type": object.type,
      "2dtiler_locked": effectiveLocked,
      "2dtiler_width": object.width,
      "2dtiler_height": object.height,
      "2dtiler_properties": JSON.stringify(object.properties ?? {}),
    });
    nodes.push(createSceneNode(nodeName, "Polygon2D", parentPath, properties));
  }

  function appendTree(
    layerOrder: readonly (LayerId | LayerGroupId)[],
    parentPath: readonly string[],
    parentVisible: boolean,
    parentLocked: boolean,
  ) {
    for (const id of layerOrder) {
      const group = groupMap.get(id as string);
      if (group) {
        const nodeName = allocateNodeName(parentPath, group.name, "Group");
        const properties: Array<[string, string]> = [];
        const effectiveVisible = parentVisible && group.visible;
        const effectiveLocked = parentLocked || group.locked;
        if (!effectiveVisible) {
          properties.push(["visible", "false"]);
        }
        appendMetadata(properties, {
          "2dtiler_kind": "layer-group",
          "2dtiler_id": group.id as string,
          "2dtiler_locked": effectiveLocked,
          "2dtiler_expanded": group.expanded,
        });
        nodes.push(createSceneNode(nodeName, "Node2D", parentPath, properties));
        appendTree(
          group.childOrder,
          [...parentPath, nodeName],
          effectiveVisible,
          effectiveLocked,
        );
        continue;
      }

      const layer = layerMap.get(id as string);
      if (layer) {
        const nodeName = allocateNodeName(parentPath, layer.name, "Tile Layer");
        const properties: Array<[string, string]> = [];
        const effectiveVisible = parentVisible && layer.visible;
        const effectiveLocked = parentLocked || layer.locked;
        if (!effectiveVisible) {
          properties.push(["visible", "false"]);
        }
        properties.push([
          "tile_map_data",
          buildGodotTileMapData(layer, sourceIdByTilesetId, tilesetById),
        ]);
        properties.push([
          "tile_set",
          options.tilesetMode === "external"
            ? 'ExtResource("tileset_1")'
            : 'SubResource("TileSet_1")',
        ]);
        appendMetadata(properties, {
          "2dtiler_kind": "tile-layer",
          "2dtiler_id": layer.id as string,
          "2dtiler_locked": effectiveLocked,
        });
        nodes.push(
          createSceneNode(nodeName, "TileMapLayer", parentPath, properties),
        );
        continue;
      }

      const imageLayer = imageLayerMap.get(id as string);
      if (imageLayer) {
        const nodeName = allocateNodeName(
          parentPath,
          imageLayer.name,
          "Image Layer",
        );
        const properties: Array<[string, string]> = [];
        const effectiveVisible = parentVisible && imageLayer.visible;
        const effectiveLocked = parentLocked || imageLayer.locked;
        const texturePath = imagePathByAssetId.get(
          imageLayer.assetId as string,
        );

        if (!texturePath) {
          throw new Error(
            `Missing image path for image layer: ${imageLayer.name}.`,
          );
        }

        if (!effectiveVisible) {
          properties.push(["visible", "false"]);
        }

        properties.push(["centered", "false"]);
        if (imageLayer.opacity !== 100) {
          properties.push([
            "modulate",
            formatGodotColorRgba(1, 1, 1, imageLayer.opacity / 100),
          ]);
        }
        properties.push([
          "position",
          formatGodotVector2(imageLayer.x, imageLayer.y),
        ]);
        if (imageLayer.rotation) {
          properties.push([
            "rotation",
            `${radiansFromDegrees(imageLayer.rotation)}`,
          ]);
        }
        if (imageLayer.flipX) {
          properties.push(["flip_h", "true"]);
        }
        if (imageLayer.flipY) {
          properties.push(["flip_v", "true"]);
        }
        const textureEntryIndex =
          Array.from(imagePathByAssetId.values()).indexOf(texturePath) + 1;
        properties.push(["scale", formatGodotVector2(1, 1)]);
        properties.push([
          "texture",
          `ExtResource("texture_image_${textureEntryIndex}")`,
        ]);
        appendMetadata(properties, {
          "2dtiler_kind": "image-layer",
          "2dtiler_id": imageLayer.id as string,
          "2dtiler_locked": effectiveLocked,
          "2dtiler_width": imageLayer.width,
          "2dtiler_height": imageLayer.height,
        });
        nodes.push(
          createSceneNode(nodeName, "Sprite2D", parentPath, properties),
        );
        continue;
      }

      const objectLayer = objectLayerMap.get(id as string);
      if (objectLayer) {
        const nodeName = allocateNodeName(
          parentPath,
          objectLayer.name,
          "Object Layer",
        );
        const properties: Array<[string, string]> = [];
        const effectiveVisible = parentVisible && objectLayer.visible;
        const effectiveLocked = parentLocked || objectLayer.locked;

        if (!effectiveVisible) {
          properties.push(["visible", "false"]);
        }
        appendMetadata(properties, {
          "2dtiler_kind": "object-layer",
          "2dtiler_id": objectLayer.id as string,
          "2dtiler_locked": effectiveLocked,
        });
        nodes.push(createSceneNode(nodeName, "Node2D", parentPath, properties));
        const objectParentPath = [...parentPath, nodeName];
        for (const objectId of objectLayer.objectOrder) {
          const object = objectMap.get(objectId as string);
          if (object) {
            appendObjectNode(
              object,
              objectParentPath,
              effectiveVisible,
              effectiveLocked,
            );
          }
        }
      }
    }
  }

  appendTree(map.layerOrder, [rootName], true, false);
  return nodes;
}

export async function exportGodotMapBundle(
  map: TileMapData,
  layers: TileLayer[],
  tilesets: Tileset[],
  imageLayers: ImageLayer[],
  layerGroups: LayerGroup[],
  objectLayers: ObjectLayer[],
  objects: MapObject[],
  options?: GodotMapExportOptions,
): Promise<ImportExportArchiveEntry[]> {
  const exportOptions = {
    ...DEFAULT_GODOT_MAP_EXPORT_OPTIONS,
    ...(options ?? {}),
  } satisfies GodotMapExportOptions;
  const referencedTilesetIds = new Set<string>();

  for (const layer of layers) {
    for (const ref of Object.values(layer.tiles)) {
      referencedTilesetIds.add(ref.tilesetId as string);
    }
  }

  const referencedTilesets = tilesets.filter((tileset) =>
    referencedTilesetIds.has(tileset.id as string),
  );
  const usedPaths = new Set<string>();
  const { entries: imageEntries, imagePathByAssetId } = await buildImageEntries(
    referencedTilesets,
    imageLayers,
    usedPaths,
  );

  const imageExtResources = imageEntries.map((entry, index) => ({
    id: `texture_image_${index + 1}`,
    type: "Texture2D",
    path: entry.path,
  }));
  const tilesetBundle =
    exportOptions.tilesetMode === "external"
      ? buildExternalTilesetBundle(
          map,
          referencedTilesets,
          imagePathByAssetId,
          usedPaths,
        )
      : buildEmbeddedTilesetBundle(map, referencedTilesets, imagePathByAssetId);
  const tilesetById = new Map(
    referencedTilesets.map((tileset) => [tileset.id as string, tileset]),
  );
  const nodes = buildSceneNodes(
    map,
    layers,
    imageLayers,
    layerGroups,
    objectLayers,
    objects,
    imagePathByAssetId,
    tilesetBundle.sourceIdByTilesetId,
    tilesetById,
    exportOptions,
  );
  const extResources = [
    ...imageExtResources.map((resource) => ({
      ...resource,
      path: `res://${resource.path}`,
    })),
    ...tilesetBundle.sceneExtResources.map((resource) => ({
      ...resource,
      path: `res://${resource.path}`,
    })),
  ];
  const sceneLines = [
    `[gd_scene load_steps=${extResources.length + tilesetBundle.sceneSubResources.length + 1} format=3]`,
    "",
    ...extResources.map(
      (resource) =>
        `[ext_resource type=${escapeGodotString(resource.type)} path=${escapeGodotString(
          resource.path,
        )} id=${escapeGodotString(resource.id)}]`,
    ),
    extResources.length > 0 ? "" : "",
    ...tilesetBundle.sceneSubResources.flatMap((resourceText) => [
      resourceText,
      "",
    ]),
    ...nodes.flatMap((node) => [buildNodeText(node), ""]),
  ];

  return [
    {
      path: `${map.name}.tscn`,
      data: new TextEncoder().encode(sceneLines.join("\n")),
    },
    ...tilesetBundle.externalEntries,
    ...imageEntries,
  ];
}
