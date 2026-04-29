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
import type {
  ImageLayer,
  LayerGroup,
  ObjectLayer,
  TileLayer,
  TileMapData,
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