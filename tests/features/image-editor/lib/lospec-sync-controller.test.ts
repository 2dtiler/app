import { afterEach, assert, test, vi } from "vitest";
import { createLospecPaletteSyncController } from "@/features/image-editor/lib/lospec-sync-controller";
import type {
  LospecPaletteRecord,
  LospecPaletteSyncCheckpoint,
  LospecPaletteSyncDependencies,
  LospecPaletteSyncResult,
} from "@/features/image-editor/types";

function createLospecPaletteFixture(
  overrides: Partial<LospecPaletteRecord>,
): LospecPaletteRecord {
  return {
    id: "palette-base",
    title: "Base Palette",
    slug: "base-palette",
    description: "Fixture palette",
    tags: ["retro"],
    user: "fixture-user",
    colors: [{ r: 0, g: 0, b: 0, a: 255 }],
    colorHexes: ["000000"],
    examples: [],
    publishedAt: "2026-05-01T00:00:00.000Z",
    publishedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
    cachedAt: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

test("Lospec background sync resumes from a persisted page after refresh and cooldown", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);

  const pageZeroPalette = createLospecPaletteFixture({
    id: "page-zero",
    title: "Page Zero",
    slug: "page-zero",
    publishedAt: "2026-05-08T00:00:00.000Z",
    publishedAtMs: Date.parse("2026-05-08T00:00:00.000Z"),
  });
  const pageOnePalette = createLospecPaletteFixture({
    id: "page-one",
    title: "Page One",
    slug: "page-one",
    publishedAt: "2026-05-07T00:00:00.000Z",
    publishedAtMs: Date.parse("2026-05-07T00:00:00.000Z"),
  });
  const pageTwoPalette = createLospecPaletteFixture({
    id: "page-two",
    title: "Page Two",
    slug: "page-two",
    publishedAt: "2026-05-06T00:00:00.000Z",
    publishedAtMs: Date.parse("2026-05-06T00:00:00.000Z"),
  });

  const cachedPalettes: LospecPaletteRecord[] = [];
  let checkpoint: LospecPaletteSyncCheckpoint | null = null;
  const syncCalls: LospecPaletteSyncDependencies[] = [];

  const firstSyncCatalog = vi.fn(
    async (
      dependencies: LospecPaletteSyncDependencies,
    ): Promise<LospecPaletteSyncResult> => {
      syncCalls.push(dependencies);
      cachedPalettes.splice(0, cachedPalettes.length, pageZeroPalette);
      dependencies.onProgress?.({
        palettes: [...cachedPalettes],
        addedCount: 1,
        fetchedPageCount: 1,
        page: 0,
        pageAddedCount: 1,
        isInitialCache: false,
      });

      cachedPalettes.splice(
        0,
        cachedPalettes.length,
        pageZeroPalette,
        pageOnePalette,
      );
      dependencies.onProgress?.({
        palettes: [...cachedPalettes],
        addedCount: 2,
        fetchedPageCount: 2,
        page: 1,
        pageAddedCount: 1,
        isInitialCache: false,
      });

      return {
        palettes: [...cachedPalettes],
        addedCount: 2,
        fetchedPageCount: 2,
        usedCache: true,
        status: "cache-only",
        errorStatus: 429,
        errorMessage: "Lospec palette request failed with 429",
        retryPage: 2,
      };
    },
  );

  const controllerBeforeRefresh = createLospecPaletteSyncController({
    loadCache: async () => [...cachedPalettes],
    loadCheckpoint: () => checkpoint,
    saveCheckpoint: (nextCheckpoint) => {
      checkpoint = nextCheckpoint;
    },
    now: Date.now,
    setTimeoutImpl: setTimeout,
    clearTimeoutImpl: clearTimeout,
    syncCatalog: firstSyncCatalog,
  });

  await controllerBeforeRefresh.start();

  assert.strictEqual(syncCalls[0]?.startPage, 0);
  assert.strictEqual(syncCalls[0]?.stopAtKnownPalette, false);
  assert.strictEqual(checkpoint?.status, "rate-limited");
  assert.strictEqual(checkpoint?.nextPage, 2);
  assert.strictEqual(checkpoint?.retryAtMs, 61_000);

  controllerBeforeRefresh.dispose();

  const resumedSyncCatalog = vi.fn(
    async (
      dependencies: LospecPaletteSyncDependencies,
    ): Promise<LospecPaletteSyncResult> => {
      syncCalls.push(dependencies);
      cachedPalettes.splice(
        0,
        cachedPalettes.length,
        pageZeroPalette,
        pageOnePalette,
        pageTwoPalette,
      );
      dependencies.onProgress?.({
        palettes: [...cachedPalettes],
        addedCount: 1,
        fetchedPageCount: 1,
        page: 2,
        pageAddedCount: 1,
        isInitialCache: false,
      });

      return {
        palettes: [...cachedPalettes],
        addedCount: 1,
        fetchedPageCount: 2,
        usedCache: false,
        status: "synced",
        reachedEnd: true,
      };
    },
  );

  const controllerAfterRefresh = createLospecPaletteSyncController({
    loadCache: async () => [...cachedPalettes],
    loadCheckpoint: () => checkpoint,
    saveCheckpoint: (nextCheckpoint) => {
      checkpoint = nextCheckpoint;
    },
    now: Date.now,
    setTimeoutImpl: setTimeout,
    clearTimeoutImpl: clearTimeout,
    syncCatalog: resumedSyncCatalog,
  });

  await controllerAfterRefresh.start();
  assert.strictEqual(resumedSyncCatalog.mock.calls.length, 0);

  await vi.advanceTimersByTimeAsync(60_000);

  assert.strictEqual(syncCalls[1]?.startPage, 2);
  assert.strictEqual(syncCalls[1]?.stopAtKnownPalette, false);
  assert.strictEqual(checkpoint?.status, "complete");
  assert.strictEqual(checkpoint?.nextPage, 4);
  assert.strictEqual(checkpoint?.addedCount, 3);
  assert.strictEqual(
    controllerAfterRefresh.getSnapshot().palettes.map((palette) => palette.id)
      .length,
    3,
  );

  controllerAfterRefresh.dispose();
});

test("Lospec background sync does not replay expired rate-limit state before retrying", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000);

  const cachedPalette = createLospecPaletteFixture({
    id: "cached-palette",
    title: "Cached Palette",
    slug: "cached-palette",
  });
  let checkpoint: LospecPaletteSyncCheckpoint | null = {
    status: "rate-limited",
    nextPage: 11,
    retryAtMs: 4_000,
    fetchedPageCount: 11,
    addedCount: 22,
    updatedAt: 4_000,
    errorStatus: 429,
    errorMessage: "Lospec palette request failed with 429",
  };
  const syncCatalog = vi.fn(
    async (): Promise<LospecPaletteSyncResult> => ({
      palettes: [cachedPalette],
      addedCount: 0,
      fetchedPageCount: 1,
      usedCache: false,
      status: "synced",
      reachedEnd: true,
    }),
  );

  const controller = createLospecPaletteSyncController({
    loadCache: async () => [cachedPalette],
    loadCheckpoint: () => checkpoint,
    saveCheckpoint: (nextCheckpoint) => {
      checkpoint = nextCheckpoint;
    },
    now: Date.now,
    setTimeoutImpl: setTimeout,
    clearTimeoutImpl: clearTimeout,
    syncCatalog,
  });

  await controller.start();

  assert.strictEqual(syncCatalog.mock.calls.length, 1);
  assert.strictEqual(syncCatalog.mock.calls[0]?.[0].startPage, 11);
  assert.strictEqual(checkpoint?.status, "complete");
  assert.strictEqual(checkpoint?.errorStatus, undefined);

  controller.dispose();
});
