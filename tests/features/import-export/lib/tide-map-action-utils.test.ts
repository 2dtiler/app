import { beforeEach, assert, test, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  exportSelectedTideMaps,
  isTideMapOption,
} from "@/features/import-export/lib/tide-map-action-utils";
import type { TileMapData } from "@/types";
import {
  createProjectFixture,
  createSaveStrategy,
  encodeText,
} from "./action-utils-test-support";

const { exportTideMapBundleMock } = vi.hoisted(() => ({
  exportTideMapBundleMock: vi.fn(),
}));

vi.mock("@/features/import-export/lib/import-export-tide", () => ({
  exportTideMapBundle: exportTideMapBundleMock,
}));

beforeEach(() => {
  exportTideMapBundleMock.mockReset();
});

test("isTideMapOption matches only the unified tIDE map option", () => {
  assert.strictEqual(isTideMapOption("map-tide"), true);
  assert.strictEqual(isTideMapOption("map-defold"), false);
});

test("exportSelectedTideMaps exports single files and grouped archives", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  exportTideMapBundleMock.mockImplementation(async (map: TileMapData) => [
    { path: `${map.name}.tide`, data: encodeText(map.name) },
  ]);

  assert.strictEqual(
    await exportSelectedTideMaps(null, [project.maps[0]!.id], "map-tide"),
    false,
  );

  assert.strictEqual(
    await exportSelectedTideMaps(
      project,
      [project.maps[0]!.id],
      "map-tide",
      saveStrategy,
    ),
    true,
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Map-One.tide.zip",
  );

  assert.strictEqual(
    await exportSelectedTideMaps(
      project,
      project.maps.map((map) => map.id),
      "map-tide",
      saveStrategy,
    ),
    true,
  );
  const tideArchive = unzipSync(saveStrategy.saveByteArray.mock.calls[1]![0]);
  assert.ok(
    Object.keys(tideArchive).some((path) => path.includes("Alpha/Map-One/")),
  );
  assert.ok(
    Object.keys(tideArchive).some((path) => path.includes("Bravo/Map-Two/")),
  );
});
