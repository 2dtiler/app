import { assert, vi } from "vitest";
import type {
  ExportSaveStrategy,
  ImageLayer,
  LayerGroup,
  MapObject,
  ObjectLayer,
  Project,
  TileLayer,
  TileMapData,
  Tileset,
} from "@/types";

export function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

export async function expectToThrow(
  action: () => Promise<unknown>,
  matcher: RegExp,
) {
  try {
    await action();
    assert.fail("Expected action to throw.");
  } catch (error) {
    assert.match(String(error), matcher);
  }
}

export function createSaveStrategy() {
  return {
    saveBlob: vi.fn(async () => true),
    saveByteArray: vi.fn(async () => true),
  } satisfies ExportSaveStrategy;
}

export function createProjectFixture() {
  const mapA = {
    id: "map-a" as TileMapData["id"],
    name: "Map:One",
    groupId: "group-a" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 2,
    heightInTiles: 2,
    tileSize: 16,
    layerOrder: ["layer-group-a" as LayerGroup["id"]],
    createdAt: 1,
  } as TileMapData;
  const mapB = {
    id: "map-b" as TileMapData["id"],
    name: "Map/Two",
    groupId: "group-b" as TileMapData["groupId"],
    orientation: "orthogonal",
    widthInTiles: 1,
    heightInTiles: 1,
    tileSize: 16,
    layerOrder: ["layer-b" as TileLayer["id"]],
    createdAt: 2,
  } as TileMapData;
  const layerA = {
    id: "layer-a" as TileLayer["id"],
    mapId: mapA.id,
    name: "Ground A",
    type: "tile",
    visible: true,
    locked: false,
    tiles: {
      "0,0": {
        tilesetId: "tileset-a" as Tileset["id"],
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
      },
    },
  } as TileLayer;
  const layerB = {
    id: "layer-b" as TileLayer["id"],
    mapId: mapB.id,
    name: "Ground B",
    type: "tile",
    visible: false,
    locked: true,
    tiles: {
      "0,0": {
        tilesetId: "tileset-b" as Tileset["id"],
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
      },
    },
  } as TileLayer;
  const imageLayer = {
    id: "image-a" as ImageLayer["id"],
    mapId: mapA.id,
    name: "Overlay",
    type: "image",
    visible: true,
    locked: false,
    assetId: "asset-image" as ImageLayer["assetId"],
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 100,
  } as ImageLayer;
  const objectLayer = {
    id: "object-layer-a" as ObjectLayer["id"],
    mapId: mapA.id,
    name: "Objects",
    type: "object",
    visible: true,
    locked: false,
    objectOrder: ["object-a" as MapObject["id"]],
  } as ObjectLayer;
  const layerGroup = {
    id: "layer-group-a" as LayerGroup["id"],
    mapId: mapA.id,
    name: "Top Group",
    visible: true,
    locked: false,
    expanded: true,
    childOrder: [layerA.id, imageLayer.id, objectLayer.id],
  } as LayerGroup;
  const objectA = {
    id: "object-a" as MapObject["id"],
    layerId: objectLayer.id,
    name: "Marker",
    type: "point",
    x: 1,
    y: 1,
    width: 0,
    height: 0,
    rotation: 0,
    points: [],
    visible: true,
    locked: false,
    properties: {},
  } as MapObject;
  const tilesetA = {
    id: "tileset-a" as Tileset["id"],
    name: "Tileset A",
    groupId: "tileset-group-a" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-a" as Tileset["assetId"],
    imageWidth: 32,
    imageHeight: 16,
    createdAt: 1,
  } as Tileset;
  const tilesetB = {
    id: "tileset-b" as Tileset["id"],
    name: "Tileset/B",
    groupId: "tileset-group-b" as Tileset["groupId"],
    tileSize: 16,
    assetId: "asset-b" as Tileset["assetId"],
    imageWidth: 16,
    imageHeight: 16,
    createdAt: 2,
  } as Tileset;

  return {
    id: "project-1" as Project["id"],
    name: "Project Root",
    createdAt: 1,
    updatedAt: 2,
    tileSize: 16,
    tilesetGroups: [
      { id: "tileset-group-b", name: "B Group", order: 1 },
      { id: "tileset-group-a", name: "A Group", order: 2 },
    ],
    tilesets: [tilesetA, tilesetB],
    mapGroups: [
      { id: "group-b", name: "Bravo", order: 1 },
      { id: "group-a", name: "Alpha", order: 2 },
    ],
    maps: [mapA, mapB],
    layers: [layerA, layerB],
    imageLayers: [imageLayer],
    layerGroups: [layerGroup],
    terrains: [],
    objectLayers: [objectLayer],
    objects: [objectA],
    overrideTilesets: [],
  } as unknown as Project;
}
