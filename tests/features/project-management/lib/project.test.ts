import { assert, test } from "vitest";
import {
  createEmptyProject,
  getActiveTilesetTileSize,
  getTilesetTileSize,
  normalizeProject,
  normalizeTileMap,
  normalizeTileset,
} from "@/features/project-management/lib/project";
import type {
  ImageLayer,
  MapObject,
  Project,
  TileMapData,
  Tileset,
} from "@/types";

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

test("createEmptyProject initializes the main groups and requested tile size", () => {
  const project = createEmptyProject("Imported", 16);

  assert.strictEqual(project.name, "Imported");
  assert.strictEqual(project.tileSize, 16);
  assert.strictEqual(project.tilesetGroups.length, 1);
  assert.strictEqual(project.tilesetGroups[0]?.name, "Main");
  assert.strictEqual(project.mapGroups.length, 1);
  assert.strictEqual(project.mapGroups[0]?.name, "Main");
  assert.deepEqual(project.maps, []);
  assert.deepEqual(project.tilesets, []);
});
