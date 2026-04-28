import { beforeEach, assert, test, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  exportSelectedMappyMaps,
  isMappyMapOption,
} from "@/features/import-export/lib/mappy-map-action-utils";
import type { TileMapData } from "@/types";
import {
  createProjectFixture,
  createSaveStrategy,
  encodeText,
} from "./action-utils-test-support";

const { exportMappyMapMock } = vi.hoisted(() => ({
  exportMappyMapMock: vi.fn(),
}));

vi.mock("@/features/import-export/lib/import-export-mappy", () => ({
  exportMappyMap: exportMappyMapMock,
}));

beforeEach(() => {
  exportMappyMapMock.mockReset();
});

test("isMappyMapOption matches only the Mappy map option", () => {
  assert.strictEqual(isMappyMapOption("map-mappy-fmp"), true);
  assert.strictEqual(isMappyMapOption("map-tide"), false);
});

test("exportSelectedMappyMaps exports single files and grouped archives", async () => {
  const project = createProjectFixture();
  const saveStrategy = createSaveStrategy();
  exportMappyMapMock.mockImplementation(async (map: TileMapData) =>
    encodeText(`mappy:${map.name}`),
  );

  assert.strictEqual(
    await exportSelectedMappyMaps(null, [project.maps[0]!.id], "map-mappy-fmp"),
    false,
  );

  assert.strictEqual(
    await exportSelectedMappyMaps(
      project,
      [project.maps[0]!.id],
      "map-mappy-fmp",
      saveStrategy,
    ),
    true,
  );
  assert.strictEqual(
    saveStrategy.saveByteArray.mock.calls[0]?.[1],
    "Map-One.fmp",
  );

  assert.strictEqual(
    await exportSelectedMappyMaps(
      project,
      project.maps.map((map) => map.id),
      "map-mappy-fmp",
      saveStrategy,
    ),
    true,
  );
  const mappyArchive = unzipSync(saveStrategy.saveByteArray.mock.calls[1]![0]);
  assert.ok(
    Object.keys(mappyArchive).some((path) =>
      path.includes("Alpha/Map-One.fmp"),
    ),
  );
  assert.ok(
    Object.keys(mappyArchive).some((path) =>
      path.includes("Bravo/Map-Two.fmp"),
    ),
  );
});
