import { beforeEach, assert, test, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  exportSelectedDefoldTilesets,
  isDefoldTilesetOption,
} from "@/features/import-export/lib/defold-tileset-action-utils";
import type { Tileset } from "@/types";
import {
  createProjectFixture,
  createSaveStrategy,
  encodeText,
  expectToThrow,
} from "./action-utils-test-support";

const { exportDefoldTilesourceBundleMock } = vi.hoisted(() => ({
  exportDefoldTilesourceBundleMock: vi.fn(),
}));

vi.mock("@/features/import-export/lib/import-export-defold", () => ({
  exportDefoldTilesourceBundle: exportDefoldTilesourceBundleMock,
}));

beforeEach(() => {
  exportDefoldTilesourceBundleMock.mockReset();
});

test("isDefoldTilesetOption matches only the Defold tileset option", () => {
  assert.strictEqual(isDefoldTilesetOption("tileset-defold"), true);
  assert.strictEqual(isDefoldTilesetOption("tileset-tiled"), false);
});

test("exportSelectedDefoldTilesets handles invalid input and grouped archives", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  exportDefoldTilesourceBundleMock.mockImplementation(
    async (tileset: Tileset) => [
      { path: `${tileset.name}.tilesource`, data: encodeText(tileset.name) },
    ],
  );

  assert.strictEqual(
    await exportSelectedDefoldTilesets(null, [], "tileset-defold"),
    false,
  );
  assert.strictEqual(
    await exportSelectedDefoldTilesets(project, ["missing"], "tileset-defold"),
    false,
  );
  await expectToThrow(
    () =>
      exportSelectedDefoldTilesets(
        project,
        [project.tilesets[0]!.id],
        "tileset-tiled",
        saveStrategy,
      ),
    /Unsupported Defold tileset export option/,
  );

  assert.strictEqual(
    await exportSelectedDefoldTilesets(
      project,
      [project.tilesets[0]!.id],
      "tileset-defold",
      saveStrategy,
    ),
    true,
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Tileset A.tilesource.zip",
  );

  assert.strictEqual(
    await exportSelectedDefoldTilesets(
      project,
      project.tilesets.map((tileset) => tileset.id),
      "tileset-defold",
      saveStrategy,
    ),
    true,
  );
  const tilesetArchive = unzipSync(
    saveStrategy.saveByteArray.mock.calls[1]![0],
  );
  assert.ok(
    Object.keys(tilesetArchive).some((path) =>
      path.includes("A Group/Tileset A/"),
    ),
  );
  assert.ok(
    Object.keys(tilesetArchive).some((path) =>
      path.includes("B Group/Tileset-B/"),
    ),
  );
});
