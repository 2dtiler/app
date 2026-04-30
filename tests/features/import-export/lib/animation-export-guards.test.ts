import { assert, test } from "vitest";
import {
  assertMapsHaveNoAnimations,
  assertTilesetsHaveNoAnimations,
} from "@/features/import-export/lib/animation-export-guards";
import {
  createTestAnimationConfig,
  createTestMap,
  createTestProject,
  createTestTileset,
} from "./tiled-test-support";

test("assertTilesetsHaveNoAnimations rejects tilesets with animation definitions", () => {
  const tileset = createTestTileset();
  assertTilesetsHaveNoAnimations([tileset], "Raster tileset");

  tileset.animations = createTestAnimationConfig();

  assert.throws(
    () => assertTilesetsHaveNoAnimations([tileset], "Raster tileset"),
    /Raster tileset export does not support 2D Tiler animations/,
  );
});

test("assertMapsHaveNoAnimations rejects placed animation refs", () => {
  const tileset = createTestTileset();
  const { map, layer } = createTestMap(tileset);
  const project = createTestProject(tileset);
  project.maps = [map];
  project.layers = [layer];
  assertMapsHaveNoAnimations(project, [map], "Raster map");

  layer.tiles["0,0"]!.animationId =
    createTestAnimationConfig().animations[0]!.id;

  assert.throws(
    () => assertMapsHaveNoAnimations(project, [map], "Raster map"),
    /Raster map export does not support 2D Tiler animations/,
  );
});

test("assertMapsHaveNoAnimations rejects referenced animation tilesets", () => {
  const tileset = createTestTileset();
  const { map, layer } = createTestMap(tileset);
  const project = createTestProject(tileset);
  project.maps = [map];
  project.layers = [layer];
  tileset.animations = createTestAnimationConfig();

  assert.throws(
    () => assertMapsHaveNoAnimations(project, [map], "Godot"),
    /Godot export does not support 2D Tiler animations/,
  );
});
