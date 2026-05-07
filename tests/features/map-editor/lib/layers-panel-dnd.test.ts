import { assert, test } from "vitest";
import {
  applyLayerDrop,
  getLayerDropPosition,
} from "@/features/map-editor/lib/layers-panel-dnd";
import type { LayerGroup, TileLayer, TileMapData } from "@/types";

function createLayerGroupFixtures() {
  const mapId = "map" as TileMapData["id"];
  const layerA = "layer-a" as TileLayer["id"];
  const layerB = "layer-b" as TileLayer["id"];
  const layerC = "layer-c" as TileLayer["id"];
  const groupId = "group-1" as LayerGroup["id"];
  const layerOrder = [layerA, groupId, layerC] as TileMapData["layerOrder"];
  const groups = [
    {
      id: groupId,
      mapId,
      name: "Group",
      visible: true,
      locked: false,
      expanded: false,
      childOrder: [layerB],
    } as LayerGroup,
  ];

  return {
    layerA,
    layerB,
    layerC,
    groupId,
    layerOrder,
    groups,
  };
}

test("getLayerDropPosition uses group and layer thresholds", () => {
  assert.strictEqual(getLayerDropPosition(true, 2, 20), "above");
  assert.strictEqual(getLayerDropPosition(true, 10, 20), "inside");
  assert.strictEqual(getLayerDropPosition(true, 18, 20), "below");
  assert.strictEqual(getLayerDropPosition(false, 4, 20), "above");
  assert.strictEqual(getLayerDropPosition(false, 14, 20), "below");
});

test("applyLayerDrop inserts items into groups and expands them", () => {
  const fixtures = createLayerGroupFixtures();

  applyLayerDrop(
    fixtures.layerOrder,
    fixtures.groups,
    fixtures.layerC,
    fixtures.groupId,
    "inside",
  );

  assert.deepEqual(fixtures.layerOrder, [fixtures.layerA, fixtures.groupId]);
  assert.deepEqual(fixtures.groups[0]?.childOrder, [fixtures.layerB, fixtures.layerC]);
  assert.strictEqual(fixtures.groups[0]?.expanded, true);
});

test("applyLayerDrop reorders items relative to the visible target", () => {
  const fixtures = createLayerGroupFixtures();

  applyLayerDrop(
    fixtures.layerOrder,
    fixtures.groups,
    fixtures.layerA,
    fixtures.layerC,
    "below",
  );

  assert.deepEqual(fixtures.layerOrder, [fixtures.groupId, fixtures.layerA, fixtures.layerC]);
});