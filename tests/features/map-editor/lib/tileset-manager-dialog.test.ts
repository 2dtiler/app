import { expect, test } from "vitest";
import { shouldAutoCreateTilesetImport } from "@/features/map-editor/lib/tileset-manager-dialog";
import type { TilesetGroupId, TilesetId } from "@/types";

test("auto-creates a tileset when a target group is preselected", () => {
  expect(
    shouldAutoCreateTilesetImport(
      "tileset-1" as TilesetId,
      "tileset-group-2" as TilesetGroupId,
    ),
  ).toBe(true);
});

test("keeps the choice dialog when an active tileset exists and no target group is set", () => {
  expect(shouldAutoCreateTilesetImport("tileset-1" as TilesetId, null)).toBe(
    false,
  );
});

test("auto-creates a tileset when there is no active tileset", () => {
  expect(shouldAutoCreateTilesetImport(null, null)).toBe(true);
});
