import { assert, test } from "vitest";
import {
  getAdjacentGroupedItemId,
  getAssetManagerGroupDropPosition,
  getAssetManagerItemDropPosition,
  moveGroupedItem,
  moveOrderedGroup,
  reindexOrderedGroups,
} from "@/features/map-editor/lib/asset-manager";

test("group drop position uses move-inside for dragged items and thresholds for groups", () => {
  assert.strictEqual(getAssetManagerGroupDropPosition("item", 1, 20), "inside");
  assert.strictEqual(getAssetManagerGroupDropPosition("group", 2, 20), "above");
  assert.strictEqual(
    getAssetManagerGroupDropPosition("group", 10, 20),
    "inside",
  );
  assert.strictEqual(
    getAssetManagerGroupDropPosition("group", 18, 20),
    "below",
  );
});

test("item drop position splits rows in half", () => {
  assert.strictEqual(getAssetManagerItemDropPosition(2, 20), "above");
  assert.strictEqual(getAssetManagerItemDropPosition(12, 20), "below");
});

test("moveOrderedGroup reorders groups and reindexes order", () => {
  const groups = [
    { id: "group-a", name: "A", order: 0 },
    { id: "group-b", name: "B", order: 1 },
    { id: "group-c", name: "C", order: 2 },
  ];

  const moved = moveOrderedGroup(groups, "group-a", "group-c", "below");

  assert.strictEqual(moved, true);
  assert.deepEqual(
    groups.map((group) => ({ id: group.id, order: group.order })),
    [
      { id: "group-b", order: 0 },
      { id: "group-c", order: 1 },
      { id: "group-a", order: 2 },
    ],
  );
});

test("reindexOrderedGroups normalizes explicit order values", () => {
  const groups = [
    { id: "group-a", name: "A", order: 9 },
    { id: "group-b", name: "B", order: 4 },
  ];

  reindexOrderedGroups(groups);

  assert.deepEqual(
    groups.map((group) => group.order),
    [0, 1],
  );
});

test("moveGroupedItem reorders items within the same group", () => {
  const items = [
    { id: "map-a", name: "A", groupId: "maps" },
    { id: "map-b", name: "B", groupId: "maps" },
    { id: "map-c", name: "C", groupId: "maps" },
    { id: "map-d", name: "D", groupId: "other" },
  ];

  const moved = moveGroupedItem(items, "map-c", {
    targetGroupId: "maps",
    targetItemId: "map-a",
    position: "above",
  });

  assert.strictEqual(moved, true);
  assert.deepEqual(
    items.map((item) => item.id),
    ["map-c", "map-a", "map-b", "map-d"],
  );
});

test("moveGroupedItem moves items between groups and appends to the target group", () => {
  const items = [
    { id: "tileset-a", name: "A", groupId: "group-a" },
    { id: "tileset-b", name: "B", groupId: "group-a" },
    { id: "tileset-c", name: "C", groupId: "group-b" },
  ];

  const moved = moveGroupedItem(items, "tileset-a", {
    targetGroupId: "group-b",
  });

  assert.strictEqual(moved, true);
  assert.deepEqual(
    items.map((item) => ({ id: item.id, groupId: item.groupId })),
    [
      { id: "tileset-b", groupId: "group-a" },
      { id: "tileset-c", groupId: "group-b" },
      { id: "tileset-a", groupId: "group-b" },
    ],
  );
});

test("getAdjacentGroupedItemId returns a neighboring item in the same group", () => {
  const items = [
    { id: "map-a", name: "A", groupId: "maps" },
    { id: "map-b", name: "B", groupId: "maps" },
    { id: "map-c", name: "C", groupId: "other" },
  ];

  assert.strictEqual(getAdjacentGroupedItemId(items, "map-a"), "map-b");
  assert.strictEqual(getAdjacentGroupedItemId(items, "map-b"), "map-a");
  assert.strictEqual(getAdjacentGroupedItemId(items, "missing"), null);
});
