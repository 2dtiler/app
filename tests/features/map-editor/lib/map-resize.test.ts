import { assert, test } from "vitest";
import { applyMapResizeToProject } from "@/features/map-editor/lib/map-resize";
import type {
  ImageLayer,
  LayerId,
  MapGroupId,
  MapId,
  MapObject,
  ObjectLayer,
  ObjectId,
  Project,
  ProjectId,
  TileLayer,
  TileRef,
} from "@/types";

function asProjectId(value: string) {
  return value as ProjectId;
}

function asMapId(value: string) {
  return value as MapId;
}

function asMapGroupId(value: string) {
  return value as MapGroupId;
}

function asLayerId(value: string) {
  return value as LayerId;
}

function asObjectId(value: string) {
  return value as ObjectId;
}

function createTileRef(sx: number, sy: number): TileRef {
  return {
    tilesetId: "tileset-1" as TileRef["tilesetId"],
    sx,
    sy,
    sw: 16,
    sh: 16,
  };
}

function createProject(): {
  project: Project;
  mapId: MapId;
  imageLayerId: LayerId;
  objectId: ObjectId;
  otherMapId: MapId;
} {
  const mapId = asMapId("map-1");
  const otherMapId = asMapId("map-2");
  const imageLayerId = asLayerId("image-layer-1");
  const objectLayerId = asLayerId("object-layer-1");
  const objectId = asObjectId("object-1");
  const tileLayer: TileLayer = {
    id: asLayerId("tile-layer-1"),
    mapId,
    name: "Ground",
    visible: true,
    locked: false,
    tiles: {
      "0,0": createTileRef(0, 0),
      "2,1": createTileRef(16, 0),
      "3,2": createTileRef(32, 0),
    },
  };
  const otherTileLayer: TileLayer = {
    id: asLayerId("tile-layer-2"),
    mapId: otherMapId,
    name: "Other",
    visible: true,
    locked: false,
    tiles: {
      "0,0": createTileRef(48, 0),
    },
  };
  const imageLayer: ImageLayer = {
    id: imageLayerId,
    mapId,
    name: "Backdrop",
    type: "image",
    visible: true,
    locked: false,
    assetId: "asset-1" as ImageLayer["assetId"],
    x: 10,
    y: 20,
    width: 128,
    height: 64,
    opacity: 100,
  };
  const objectLayer: ObjectLayer = {
    id: objectLayerId,
    mapId,
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: [objectId],
  };
  const object: MapObject = {
    id: objectId,
    layerId: objectLayerId,
    name: "Spawn",
    type: "polygon",
    x: 32,
    y: 48,
    width: 0,
    height: 0,
    rotation: 0,
    points: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 8 },
    ],
    visible: true,
    locked: false,
    properties: {},
  };

  return {
    mapId,
    otherMapId,
    imageLayerId,
    objectId,
    project: {
      id: asProjectId("project-1"),
      name: "Test Project",
      createdAt: 0,
      updatedAt: 0,
      tileSize: 16,
      tilesetGroups: [],
      tilesets: [],
      mapGroups: [{ id: asMapGroupId("group-1"), name: "Maps", order: 0 }],
      maps: [
        {
          id: mapId,
          name: "Main",
          groupId: asMapGroupId("group-1"),
          orientation: "orthogonal",
          widthInTiles: 4,
          heightInTiles: 3,
          tileSize: 16,
          layerOrder: [tileLayer.id, imageLayerId, objectLayer.id],
          createdAt: 0,
        },
        {
          id: otherMapId,
          name: "Other",
          groupId: asMapGroupId("group-1"),
          orientation: "orthogonal",
          widthInTiles: 2,
          heightInTiles: 2,
          tileSize: 16,
          layerOrder: [otherTileLayer.id],
          createdAt: 0,
        },
      ],
      layers: [tileLayer, otherTileLayer],
      imageLayers: [imageLayer],
      layerGroups: [],
      terrains: [],
      objectLayers: [objectLayer],
      objects: [object],
      overrideTilesets: [],
    },
  };
}

test("applyMapResizeToProject grows from the top-left and shifts map content", () => {
  const { project, mapId } = createProject();

  const changed = applyMapResizeToProject(project, {
    mapId,
    width: 6,
    height: 4,
    originOffsetXInTiles: 2,
    originOffsetYInTiles: 1,
  });

  assert.strictEqual(changed, true);
  assert.strictEqual(project.maps[0]?.widthInTiles, 6);
  assert.strictEqual(project.maps[0]?.heightInTiles, 4);
  assert.deepEqual(Object.keys(project.layers[0]?.tiles ?? {}).sort(), [
    "2,1",
    "4,2",
    "5,3",
  ]);
  assert.deepEqual(project.imageLayers[0], {
    ...project.imageLayers[0],
    x: 42,
    y: 36,
  });
  assert.strictEqual(project.objects[0]?.x, 64);
  assert.strictEqual(project.objects[0]?.y, 64);
  assert.deepEqual(project.objects[0]?.points, [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 8 },
  ]);
});

test("applyMapResizeToProject shrinks from the top-left and crops shifted tiles", () => {
  const { project, mapId } = createProject();

  applyMapResizeToProject(project, {
    mapId,
    width: 3,
    height: 2,
    originOffsetXInTiles: -1,
    originOffsetYInTiles: -1,
  });

  assert.deepEqual(Object.keys(project.layers[0]?.tiles ?? {}).sort(), [
    "1,0",
    "2,1",
  ]);
  assert.strictEqual(project.imageLayers[0]?.x, -6);
  assert.strictEqual(project.imageLayers[0]?.y, 4);
  assert.strictEqual(project.objects[0]?.x, 16);
  assert.strictEqual(project.objects[0]?.y, 32);
});

test("applyMapResizeToProject leaves unrelated map content untouched", () => {
  const { project, mapId, otherMapId } = createProject();

  applyMapResizeToProject(project, {
    mapId,
    width: 5,
    height: 3,
    originOffsetXInTiles: 1,
  });

  const otherMap = project.maps.find((map) => map.id === otherMapId);
  const otherLayer = project.layers.find((layer) => layer.mapId === otherMapId);
  assert.strictEqual(otherMap?.widthInTiles, 2);
  assert.strictEqual(otherMap?.heightInTiles, 2);
  assert.deepEqual(Object.keys(otherLayer?.tiles ?? {}), ["0,0"]);
});
