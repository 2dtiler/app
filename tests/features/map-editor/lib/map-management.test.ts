import { assert, test } from "vitest";
import { deleteMapFromProject } from "@/features/map-editor/lib/map-management";
import type {
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
} from "@/types";

function createProject(): Project {
  const mapId = "map-a" as TileMapData["id"];
  const otherMapId = "map-b" as TileMapData["id"];
  const objectLayerId = "object-layer-a" as ObjectLayer["id"];
  const otherObjectLayerId = "object-layer-b" as ObjectLayer["id"];

  return {
    id: "project-1" as Project["id"],
    name: "Project",
    createdAt: 0,
    updatedAt: 0,
    tileSize: 16,
    tilesetGroups: [
      {
        id: "tileset-group" as Project["tilesetGroups"][number]["id"],
        name: "Tilesets",
        order: 0,
      },
    ],
    tilesets: [],
    mapGroups: [
      {
        id: "map-group" as Project["mapGroups"][number]["id"],
        name: "Maps",
        order: 0,
      },
    ],
    maps: [
      {
        id: mapId,
        name: "Map A",
        groupId: "map-group" as TileMapData["groupId"],
        orientation: "orthogonal",
        widthInTiles: 10,
        heightInTiles: 10,
        tileSize: 16,
        layerOrder: ["tile-layer-a" as TileLayer["id"]],
        createdAt: 0,
      },
      {
        id: otherMapId,
        name: "Map B",
        groupId: "map-group" as TileMapData["groupId"],
        orientation: "orthogonal",
        widthInTiles: 10,
        heightInTiles: 10,
        tileSize: 16,
        layerOrder: ["tile-layer-b" as TileLayer["id"]],
        createdAt: 0,
      },
    ],
    layers: [
      {
        id: "tile-layer-a" as TileLayer["id"],
        mapId,
        name: "Layer A",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {},
      },
      {
        id: "tile-layer-b" as TileLayer["id"],
        mapId: otherMapId,
        name: "Layer B",
        type: "tile",
        visible: true,
        locked: false,
        tiles: {},
      },
    ],
    imageLayers: [
      {
        id: "image-layer-a" as ImageLayer["id"],
        mapId,
        name: "Image A",
        type: "image",
        visible: true,
        locked: false,
        assetId: "asset-a" as ImageLayer["assetId"],
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        opacity: 100,
      },
    ],
    layerGroups: [
      {
        id: "layer-group-a" as LayerGroup["id"],
        mapId,
        name: "Group A",
        visible: true,
        locked: false,
        expanded: true,
        childOrder: ["tile-layer-a" as TileLayer["id"]],
      },
    ],
    terrains: [],
    objectLayers: [
      {
        id: objectLayerId,
        mapId,
        name: "Objects A",
        type: "object",
        visible: true,
        locked: false,
        objectOrder: ["object-a" as MapObject["id"]],
      },
      {
        id: otherObjectLayerId,
        mapId: otherMapId,
        name: "Objects B",
        type: "object",
        visible: true,
        locked: false,
        objectOrder: ["object-b" as MapObject["id"]],
      },
    ],
    objects: [
      {
        id: "object-a" as MapObject["id"],
        layerId: objectLayerId,
        name: "Object A",
        type: "point",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        points: [],
        visible: true,
        locked: false,
        properties: {},
      },
      {
        id: "object-b" as MapObject["id"],
        layerId: otherObjectLayerId,
        name: "Object B",
        type: "point",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        points: [],
        visible: true,
        locked: false,
        properties: {},
      },
    ],
    overrideTilesets: [],
  };
}

test("deleteMapFromProject removes map-owned layers, groups, object layers, and objects", () => {
  const project = createProject();

  const removed = deleteMapFromProject(project, "map-a" as TileMapData["id"]);

  assert.deepEqual(
    project.maps.map((map) => map.id),
    ["map-b"],
  );
  assert.deepEqual(
    project.layers.map((layer) => layer.id),
    ["tile-layer-b"],
  );
  assert.deepEqual(
    project.imageLayers.map((layer) => layer.id),
    [],
  );
  assert.deepEqual(
    project.layerGroups.map((group) => group.id),
    [],
  );
  assert.deepEqual(
    project.objectLayers.map((layer) => layer.id),
    ["object-layer-b"],
  );
  assert.deepEqual(
    project.objects.map((object) => object.id),
    ["object-b"],
  );
  assert.deepEqual(removed, {
    layerIds: ["tile-layer-a"],
    layerGroupIds: ["layer-group-a"],
    objectLayerIds: ["object-layer-a"],
    objectIds: ["object-a"],
  });
});
