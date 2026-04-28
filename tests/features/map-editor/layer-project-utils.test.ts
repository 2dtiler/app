import { assert, test } from "vitest";
import {
  buildDisplayTree,
  buildImageEditorDisplayTree,
  findLastLayerId,
  findParentGroupId,
  flattenImageLayers,
  flattenLayerTree,
  flattenObjectLayers,
  getAllGroupIds,
  getAllLayerIds,
  isAncestorOf,
  isImageEditorAncestorOf,
  isLayerEffectivelyLocked,
} from "@/features/map-editor/lib/layers";
import {
  buildTextObjectPatch,
  clampTextObjectBounds,
  getTextObjectEditableFields,
  getTextObjectSettings,
  isReservedTextObjectPropertyKey,
  isTextObject,
  normalizeTextObject,
} from "@/features/map-editor/lib/text-objects";
import {
  getImageLayerCenter,
  getImageLayerHandlePosition,
  getImageLayerHandlePositions,
  getImageLayerPolygon,
  getImageLayerResizeCursor,
  pointInImageLayer,
  resizeImageLayerFromHandle,
  transformImageLayerPoint,
} from "@/features/map-editor/components/MapCanvas/image-layer-transform";
import {
  getActiveTilesetTileSize,
  getTilesetTileSize,
  normalizeProject,
  normalizeTileMap,
  normalizeTileset,
} from "@/features/project-management/lib/project";
import type {
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";
import type {
  ImageEditorImageLayer,
  ImageEditorLayerGroup,
  ImageEditorRasterLayer,
} from "@/features/image-editor/types";

function createLayerFixtures() {
  const mapId = "map" as TileMapData["id"];
  const baseLayer = {
    id: "layer-base" as TileLayer["id"],
    mapId,
    name: "Base",
    type: "tile",
    visible: true,
    locked: false,
    tiles: {},
  } as TileLayer;
  const detailLayer = {
    id: "layer-detail" as TileLayer["id"],
    mapId,
    name: "Detail",
    type: "tile",
    visible: true,
    locked: false,
    tiles: {},
  } as TileLayer;
  const nestedLayer = {
    id: "layer-nested" as TileLayer["id"],
    mapId,
    name: "Nested",
    type: "tile",
    visible: true,
    locked: false,
    tiles: {},
  } as TileLayer;
  const imageLayer = {
    id: "layer-image" as ImageLayer["id"],
    mapId,
    name: "Overlay",
    type: "image",
    visible: true,
    locked: false,
    assetId: "asset-image" as ImageLayer["assetId"],
    x: 0,
    y: 0,
    width: 32,
    height: 16,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 100,
  } as ImageLayer;
  const objectLayer = {
    id: "layer-objects" as ObjectLayer["id"],
    mapId,
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: [],
  } as ObjectLayer;
  const nestedGroup = {
    id: "group-nested" as LayerGroup["id"],
    mapId,
    name: "Nested Group",
    visible: true,
    locked: false,
    expanded: false,
    childOrder: [nestedLayer.id],
  } as LayerGroup;
  const parentGroup = {
    id: "group-parent" as LayerGroup["id"],
    mapId,
    name: "Parent Group",
    visible: false,
    locked: true,
    expanded: true,
    childOrder: [detailLayer.id, imageLayer.id, objectLayer.id, nestedGroup.id],
  } as LayerGroup;

  return {
    layerOrder: [baseLayer.id, parentGroup.id] as Array<
      TileLayer["id"] | LayerGroup["id"]
    >,
    layers: [baseLayer, detailLayer, nestedLayer],
    imageLayers: [imageLayer],
    objectLayers: [objectLayer],
    groups: [parentGroup, nestedGroup],
  };
}

test("layer tree helpers flatten nested map layers and build display trees", () => {
  const fixtures = createLayerFixtures();

  assert.deepEqual(getAllLayerIds(fixtures.layerOrder, fixtures.groups), [
    fixtures.layers[0].id,
    fixtures.layers[1].id,
    fixtures.imageLayers[0].id,
    fixtures.objectLayers[0].id,
    fixtures.layers[2].id,
  ]);
  assert.deepEqual(getAllGroupIds(fixtures.layerOrder, fixtures.groups), [
    fixtures.groups[0].id,
    fixtures.groups[1].id,
  ]);

  const flattenedLayers = flattenLayerTree(
    fixtures.layerOrder,
    fixtures.layers,
    fixtures.groups,
  );
  assert.deepEqual(
    flattenedLayers.map((layer) => [layer.name, layer.visible, layer.locked]),
    [
      ["Base", true, false],
      ["Detail", false, true],
      ["Nested", false, true],
    ],
  );

  const flattenedImageLayers = flattenImageLayers(
    fixtures.layerOrder,
    fixtures.imageLayers,
    fixtures.groups,
  );
  assert.deepEqual(
    flattenedImageLayers.map((layer) => layer.name),
    ["Overlay"],
  );
  assert.strictEqual(flattenedImageLayers[0]?.visible, false);
  assert.strictEqual(flattenedImageLayers[0]?.locked, true);

  const flattenedObjectLayers = flattenObjectLayers(
    fixtures.layerOrder,
    fixtures.objectLayers,
    fixtures.groups,
  );
  assert.deepEqual(
    flattenedObjectLayers.map((layer) => layer.name),
    ["Objects"],
  );
  assert.strictEqual(flattenedObjectLayers[0]?.visible, false);
  assert.strictEqual(flattenedObjectLayers[0]?.locked, true);

  assert.strictEqual(
    findLastLayerId(
      fixtures.layerOrder,
      fixtures.layers,
      fixtures.groups,
      fixtures.imageLayers,
      fixtures.objectLayers,
    ),
    fixtures.layers[2]?.id,
  );
  assert.strictEqual(
    findParentGroupId(
      fixtures.layers[2]!.id,
      fixtures.layerOrder,
      fixtures.groups,
    ),
    fixtures.groups[1]?.id,
  );
  assert.strictEqual(
    findParentGroupId(
      fixtures.layers[0]!.id,
      fixtures.layerOrder,
      fixtures.groups,
    ),
    null,
  );
  assert.strictEqual(
    isLayerEffectivelyLocked(
      fixtures.layers[1]!.id,
      fixtures.layerOrder,
      fixtures.layers,
      fixtures.groups,
      fixtures.imageLayers,
      fixtures.objectLayers,
    ),
    true,
  );
  assert.strictEqual(
    isLayerEffectivelyLocked(
      "missing" as TileLayer["id"],
      fixtures.layerOrder,
      fixtures.layers,
      fixtures.groups,
      fixtures.imageLayers,
      fixtures.objectLayers,
    ),
    true,
  );
  assert.strictEqual(
    isAncestorOf(
      fixtures.groups[0]!.id,
      fixtures.layers[2]!.id,
      fixtures.groups,
    ),
    true,
  );
  assert.strictEqual(
    isAncestorOf(
      fixtures.groups[1]!.id,
      fixtures.layers[0]!.id,
      fixtures.groups,
    ),
    false,
  );

  const displayTree = buildDisplayTree(
    fixtures.layerOrder,
    fixtures.layers,
    fixtures.groups,
    0,
    null,
    fixtures.imageLayers,
    fixtures.objectLayers,
  );
  assert.deepEqual(
    displayTree.map((node) => node.type),
    ["group", "group", "objectLayer", "imageLayer", "layer", "layer"],
  );
  assert.deepEqual(
    displayTree.map((node) => node.depth),
    [0, 1, 1, 1, 1, 0],
  );
});

test("image editor layer tree helpers respect group ancestry and display order", () => {
  const rasterLayer = {
    id: "raster-1" as ImageEditorRasterLayer["id"],
    name: "Pixels",
    visible: true,
    locked: false,
    type: "tile",
  } as ImageEditorRasterLayer;
  const imageLayer = {
    id: "image-1" as ImageEditorImageLayer["id"],
    name: "Reference",
    visible: true,
    locked: false,
    type: "image",
  } as ImageEditorImageLayer;
  const childGroup = {
    id: "ig-child" as ImageEditorLayerGroup["id"],
    name: "Child",
    visible: true,
    locked: false,
    expanded: true,
    childOrder: [imageLayer.id],
  } as ImageEditorLayerGroup;
  const parentGroup = {
    id: "ig-parent" as ImageEditorLayerGroup["id"],
    name: "Parent",
    visible: true,
    locked: false,
    expanded: true,
    childOrder: [childGroup.id],
  } as ImageEditorLayerGroup;

  assert.strictEqual(
    isImageEditorAncestorOf(parentGroup.id, imageLayer.id, [
      parentGroup,
      childGroup,
    ]),
    true,
  );
  assert.strictEqual(
    isImageEditorAncestorOf(childGroup.id, rasterLayer.id, [
      parentGroup,
      childGroup,
    ]),
    false,
  );

  const displayTree = buildImageEditorDisplayTree(
    [rasterLayer.id, parentGroup.id],
    [rasterLayer],
    [imageLayer],
    [parentGroup, childGroup],
  );
  assert.deepEqual(
    displayTree.map((node) => node.type),
    ["group", "group", "imageLayer", "rasterLayer"],
  );
  assert.deepEqual(
    displayTree.map((node) => node.depth),
    [0, 1, 2, 0],
  );
});

test("text object helpers parse settings, build patches, and normalize bounds", () => {
  const textObject = {
    id: "object-text" as MapObject["id"],
    layerId: "layer-objects" as MapObject["layerId"],
    name: "Label",
    type: "text",
    x: 8,
    y: 12,
    width: 0,
    height: Number.NaN,
    rotation: 15,
    points: [],
    visible: true,
    locked: false,
    properties: {
      Text: { value: " Hello ", type: "string" },
      Size: { value: "18.2", type: "float" },
      Rotation: { value: "45", type: "float" },
      Font: { value: "  Space Grotesk  ", type: "string" },
      "Word wrap": { value: "off", type: "bool" },
      Color: { value: "  #abcdef  ", type: "color" },
    },
  } as MapObject;

  assert.strictEqual(isTextObject(textObject), true);
  assert.strictEqual(isTextObject(null), false);
  assert.strictEqual(isReservedTextObjectPropertyKey("Text"), true);
  assert.strictEqual(isReservedTextObjectPropertyKey("custom"), false);

  const settings = getTextObjectSettings(textObject);
  assert.deepEqual(settings, {
    text: " Hello ",
    size: 18,
    rotation: 45,
    font: "Space Grotesk",
    wordWrap: false,
    color: "#abcdef",
  });
  assert.deepEqual(getTextObjectEditableFields(textObject), {
    text: " Hello ",
    size: "18",
    rotation: "45",
    font: "Space Grotesk",
    wordWrap: false,
    color: "#abcdef",
  });

  const patch = buildTextObjectPatch(textObject, {
    text: "Updated",
    size: "not-a-number",
    rotation: "invalid",
    font: "  ",
    wordWrap: true,
    color: "  ",
  });
  assert.strictEqual(patch.rotation, 15);
  assert.strictEqual(patch.properties?.Text?.value, "Updated");
  assert.strictEqual(patch.properties?.Size?.value, "11");
  assert.strictEqual(patch.properties?.Font?.value, "sans-serif");
  assert.strictEqual(patch.properties?.["Word wrap"]?.value, "true");
  assert.strictEqual(patch.properties?.Color?.value, "#000000");

  normalizeTextObject(textObject);
  assert.strictEqual(textObject.width, 96);
  assert.strictEqual(textObject.height, 32);
  assert.strictEqual(textObject.rotation, 45);
  assert.strictEqual(textObject.properties.Text?.value, " Hello ");
  assert.deepEqual(clampTextObjectBounds(-1, Number.NaN), {
    width: 96,
    height: 32,
  });
});

test("project normalization fills defaults and preserves active tileset sizes", () => {
  const textObject = {
    id: "object-text" as MapObject["id"],
    layerId: "layer-objects" as MapObject["layerId"],
    name: "Label",
    type: "text",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    points: [],
    visible: true,
    locked: false,
    properties: {
      Text: { value: "Map note", type: "string" },
      Size: { value: "12", type: "int" },
      Rotation: { value: "30", type: "float" },
      Font: { value: "", type: "string" },
      "Word wrap": { value: "yes", type: "bool" },
      Color: { value: "", type: "color" },
    },
  } as MapObject;

  const project = {
    id: "project-1" as Project["id"],
    name: "Demo",
    createdAt: 1,
    updatedAt: 2,
    tileSize: undefined,
    tilesetGroups: [],
    tilesets: [
      {
        id: "tileset-1" as Tileset["id"],
        name: "Main",
        groupId: "group-1" as Tileset["groupId"],
        tileSize: 0 as Tileset["tileSize"],
        assetId: "asset-1" as Tileset["assetId"],
        imageWidth: 64,
        imageHeight: 64,
        createdAt: 1,
      } as Tileset,
    ],
    mapGroups: [],
    maps: [
      {
        id: "map-orthogonal" as TileMapData["id"],
        name: "Orthogonal",
        groupId: "group-1" as TileMapData["groupId"],
        orientation: undefined,
        staggerAxis: "y",
        staggerIndex: "even",
        widthInTiles: 4,
        heightInTiles: 4,
        tileSize: 16,
        layerOrder: [],
        createdAt: 1,
      } as TileMapData,
      {
        id: "map-hex" as TileMapData["id"],
        name: "Hex",
        groupId: "group-1" as TileMapData["groupId"],
        orientation: "hexagonal",
        widthInTiles: 4,
        heightInTiles: 4,
        tileSize: 16,
        layerOrder: [],
        createdAt: 1,
      } as TileMapData,
    ],
    layers: [],
    imageLayers: [
      {
        id: "image-1" as ImageLayer["id"],
        mapId: "map-orthogonal" as ImageLayer["mapId"],
        name: "Backdrop",
        type: "image",
        visible: true,
        locked: false,
        assetId: "asset-2" as ImageLayer["assetId"],
        x: 0,
        y: 0,
        width: 32,
        height: 16,
        rotation: 45 as ImageLayer["rotation"],
        flipX: 1 as unknown as boolean,
        flipY: 0 as unknown as boolean,
        opacity: 140.6,
      } as ImageLayer,
    ],
    layerGroups: [],
    terrains: undefined,
    objectLayers: undefined,
    objects: [textObject],
    overrideTilesets: undefined,
  } as unknown as Project;

  normalizeTileset(project.tilesets[0]!);
  normalizeTileMap(project.maps[0]!);
  assert.strictEqual(getTilesetTileSize(project.tilesets[0], 24), 32);

  const normalized = normalizeProject(project);
  assert.strictEqual(normalized.tileSize, 32);
  assert.deepEqual(normalized.terrains, []);
  assert.deepEqual(normalized.objectLayers, []);
  assert.deepEqual(normalized.overrideTilesets, []);
  assert.strictEqual(normalized.tilesets[0]?.tileSize, 32);
  assert.strictEqual(normalized.maps[0]?.orientation, "orthogonal");
  assert.strictEqual(normalized.maps[0]?.staggerAxis, undefined);
  assert.strictEqual(normalized.maps[0]?.staggerIndex, undefined);
  assert.strictEqual(normalized.maps[1]?.staggerAxis, "x");
  assert.strictEqual(normalized.maps[1]?.staggerIndex, "odd");
  assert.strictEqual(normalized.imageLayers[0]?.opacity, 100);
  assert.strictEqual(normalized.imageLayers[0]?.rotation, 0);
  assert.strictEqual(normalized.imageLayers[0]?.flipX, true);
  assert.strictEqual(normalized.imageLayers[0]?.flipY, false);
  assert.strictEqual(normalized.objects[0]?.width, 96);
  assert.strictEqual(normalized.objects[0]?.height, 32);
  assert.strictEqual(
    getActiveTilesetTileSize(normalized, normalized.tilesets[0]!.id),
    32,
  );
  assert.strictEqual(
    getActiveTilesetTileSize(normalized, "missing" as Tileset["id"]),
    32,
  );
});

test("image layer transform helpers compute rotated points, handles, cursors, and resize bounds", () => {
  const rotatedLayer = {
    x: 10,
    y: 20,
    width: 20,
    height: 10,
    rotation: 90,
    flipX: false,
    flipY: false,
  };
  const axisAlignedLayer = {
    x: 10,
    y: 20,
    width: 20,
    height: 10,
    rotation: 0,
    flipX: false,
    flipY: false,
  };

  assert.deepEqual(getImageLayerCenter(axisAlignedLayer), { x: 20, y: 25 });
  assert.deepEqual(transformImageLayerPoint(rotatedLayer, { x: 10, y: 20 }), {
    x: 25,
    y: 15,
  });
  assert.deepEqual(getImageLayerPolygon(axisAlignedLayer), [
    { x: 10, y: 20 },
    { x: 30, y: 20 },
    { x: 30, y: 30 },
    { x: 10, y: 30 },
  ]);
  assert.deepEqual(getImageLayerHandlePosition(axisAlignedLayer, "se"), {
    x: 30,
    y: 30,
  });
  assert.strictEqual(getImageLayerHandlePositions(axisAlignedLayer).length, 8);
  assert.strictEqual(
    pointInImageLayer(axisAlignedLayer, { x: 15, y: 25 }),
    true,
  );
  assert.strictEqual(
    pointInImageLayer(axisAlignedLayer, { x: 5, y: 5 }),
    false,
  );
  assert.strictEqual(
    getImageLayerResizeCursor(axisAlignedLayer, "e"),
    "ew-resize",
  );
  assert.strictEqual(
    getImageLayerResizeCursor(axisAlignedLayer, "n"),
    "ew-resize",
  );

  assert.deepEqual(
    resizeImageLayerFromHandle(axisAlignedLayer, "se", { x: 40, y: 40 }, false),
    { x: 10, y: 20, width: 30, height: 20 },
  );
  assert.deepEqual(
    resizeImageLayerFromHandle(axisAlignedLayer, "se", { x: 40, y: 40 }, true),
    { x: 10, y: 20, width: 40, height: 20 },
  );
  assert.deepEqual(
    resizeImageLayerFromHandle(axisAlignedLayer, "nw", { x: 29, y: 29 }, false),
    { x: 26, y: 26, width: 4, height: 4 },
  );
});
