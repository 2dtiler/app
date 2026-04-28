import { beforeEach, assert, test, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  exportSelectedDefoldMaps,
  isDefoldMapOption,
} from "@/features/import-export/lib/defold-map-action-utils";
import type { TileMapData } from "@/types";
import {
  createProjectFixture,
  createSaveStrategy,
  encodeText,
  expectToThrow,
} from "./action-utils-test-support";

const { exportDefoldMapBundleMock } = vi.hoisted(() => ({
  exportDefoldMapBundleMock: vi.fn(),
}));

vi.mock("@/features/import-export/lib/import-export-defold", () => ({
  exportDefoldMapBundle: exportDefoldMapBundleMock,
}));

beforeEach(() => {
  exportDefoldMapBundleMock.mockReset();
});

test("isDefoldMapOption matches only the Defold map option", () => {
  assert.strictEqual(isDefoldMapOption("map-defold"), true);
  assert.strictEqual(isDefoldMapOption("map-godot"), false);
});

test("exportSelectedDefoldMaps handles unsupported options, single exports, and grouped archives", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  exportDefoldMapBundleMock.mockImplementation(async (map: TileMapData) => [
    { path: `${map.name}.collection`, data: encodeText(map.name) },
    { path: "shared/resource.txt", data: encodeText(map.id) },
  ]);

  assert.strictEqual(
    await exportSelectedDefoldMaps(null, [], "map-defold"),
    false,
  );
  assert.strictEqual(
    await exportSelectedDefoldMaps(project, ["missing-map"], "map-defold"),
    false,
  );
  await expectToThrow(
    () =>
      exportSelectedDefoldMaps(
        project,
        [project.maps[0]!.id],
        "map-tide",
        undefined,
        saveStrategy,
      ),
    /Unsupported Defold export option/,
  );

  assert.strictEqual(
    await exportSelectedDefoldMaps(
      project,
      [project.maps[0]!.id],
      "map-defold",
      { format: "tilemap" },
      saveStrategy,
    ),
    true,
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Map-One.tilemap.zip",
  );

  assert.strictEqual(
    await exportSelectedDefoldMaps(
      project,
      project.maps.map((map) => map.id),
      "map-defold",
      { format: "collection" },
      saveStrategy,
    ),
    true,
  );
  const multiMapArchive = unzipSync(
    saveStrategy.saveByteArray.mock.calls[1]![0],
  );
  assert.ok(
    Object.keys(multiMapArchive).some((path) =>
      path.includes("Alpha/Map-One/"),
    ),
  );
  assert.ok(
    Object.keys(multiMapArchive).some((path) =>
      path.includes("Bravo/Map-Two/"),
    ),
  );
});
