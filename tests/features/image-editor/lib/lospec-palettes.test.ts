import { assert, test, vi } from "vitest";
import {
  filterAndSortLospecPalettes,
  normalizeLospecPalettePage,
  normalizeLospecPaletteRecord,
  syncLospecPaletteCatalog,
} from "@/features/image-editor/lib/lospec-palettes";
import type { LospecPaletteRecord } from "@/features/image-editor/types";

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

function createFetchResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

test("normalizeLospecPaletteRecord converts Lospec API data into cache records", () => {
  const palette = normalizeLospecPaletteRecord(
    {
      id: "69f906e6528567ca5afeb349",
      title: "101 Tilez!",
      slug: "101-tilez",
      description: "Vibrant starter palette",
      tags: ["101tilez", "beginner", "vivid"],
      user: "Neal_Gaming",
      colors: ["48cffd", "94d32c", "fbe734", "ffffff"],
      examples: [
        {
          image:
            "https://cdn.lospec.com/palette-examples/101-tilez-example.png",
          description: "Preview image",
        },
      ],
      published_at: "2026-05-05T13:35:00.202Z",
    },
    123,
  );

  assert.ok(palette);
  assert.deepEqual(palette?.colorHexes, [
    "48cffd",
    "94d32c",
    "fbe734",
    "ffffff",
  ]);
  assert.deepEqual(palette?.colors[0], { r: 72, g: 207, b: 253, a: 255 });
  assert.strictEqual(
    palette?.publishedAtMs,
    Date.parse("2026-05-05T13:35:00.202Z"),
  );
  assert.strictEqual(palette?.cachedAt, 123);
});

test("normalizeLospecPalettePage drops invalid records", () => {
  const palettes = normalizeLospecPalettePage([
    {
      id: "valid-palette",
      title: "Valid",
      slug: "valid",
      description: "Good",
      tags: ["tag"],
      user: "user",
      colors: ["abcdef"],
      examples: [],
      published_at: "2026-05-02T00:00:00.000Z",
    },
    {
      id: "invalid-palette",
      title: "",
      slug: "invalid",
      colors: [],
      published_at: "not-a-date",
    },
  ]);

  assert.deepEqual(
    palettes.map((palette) => palette.id),
    ["valid-palette"],
  );
});

test("normalizeLospecPaletteRecord deduplicates repeated tags", () => {
  const palette = normalizeLospecPaletteRecord({
    id: "duplicate-tags",
    title: "Duplicate Tags",
    slug: "duplicate-tags",
    description: "Tag cleanup",
    tags: ["3bit", "retro", "3bit", "Retro", ""],
    user: "user",
    colors: ["abcdef"],
    examples: [],
    published_at: "2026-05-02T00:00:00.000Z",
  });

  assert.ok(palette);
  assert.deepEqual(palette?.tags, ["3bit", "retro"]);
});

test("syncLospecPaletteCatalog saves new pages until it reaches a known palette id", async () => {
  const cachedPalettes = [
    createLospecPaletteFixture({
      id: "known-palette",
      title: "Known Palette",
      slug: "known-palette",
      publishedAt: "2026-05-03T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-03T00:00:00.000Z"),
      cachedAt: 10,
    }),
  ];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      createFetchResponse([
        {
          id: "new-palette-1",
          title: "New Palette 1",
          slug: "new-palette-1",
          description: "Newest",
          tags: ["fresh"],
          user: "artist-1",
          colors: ["112233"],
          examples: [],
          published_at: "2026-05-07T00:00:00.000Z",
        },
      ]),
    )
    .mockResolvedValueOnce(
      createFetchResponse([
        {
          id: "new-palette-2",
          title: "New Palette 2",
          slug: "new-palette-2",
          description: "Still new",
          tags: ["fresh"],
          user: "artist-2",
          colors: ["445566"],
          examples: [],
          published_at: "2026-05-06T00:00:00.000Z",
        },
        {
          id: "known-palette",
          title: "Known Palette",
          slug: "known-palette",
          description: "Existing",
          tags: ["retro"],
          user: "artist-known",
          colors: ["778899"],
          examples: [],
          published_at: "2026-05-03T00:00:00.000Z",
        },
      ]),
    );

  const result = await syncLospecPaletteCatalog({
    fetchImpl,
    loadCache: async () =>
      [...cachedPalettes].sort(
        (left, right) => right.publishedAtMs - left.publishedAtMs,
      ),
    loadCacheIds: async () => cachedPalettes.map((palette) => palette.id),
    saveCache: async (palettes) => {
      cachedPalettes.push(...palettes);
    },
    now: () => 999,
  });

  assert.strictEqual(fetchImpl.mock.calls.length, 2);
  assert.strictEqual(result.status, "synced");
  assert.strictEqual(result.addedCount, 2);
  assert.deepEqual(
    result.palettes.map((palette) => palette.id),
    ["new-palette-1", "new-palette-2", "known-palette"],
  );
});

test("syncLospecPaletteCatalog returns cached palettes when the network fails", async () => {
  const cachedPalettes = [
    createLospecPaletteFixture({
      id: "cached-only",
      title: "Cached Only",
      slug: "cached-only",
      publishedAt: "2026-05-04T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-04T00:00:00.000Z"),
    }),
  ];

  const result = await syncLospecPaletteCatalog({
    fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
    loadCache: async () => cachedPalettes,
    loadCacheIds: async () => cachedPalettes.map((palette) => palette.id),
    saveCache: async () => undefined,
  });

  assert.strictEqual(result.status, "cache-only");
  assert.strictEqual(result.usedCache, true);
  assert.strictEqual(result.errorMessage, "offline");
  assert.deepEqual(result.palettes, cachedPalettes);
});

test("filterAndSortLospecPalettes matches tag queries and supports alphabetical sorting", () => {
  const palettes = [
    createLospecPaletteFixture({
      id: "forest-night",
      title: "Forest Night",
      slug: "forest-night",
      tags: ["forest", "green", "night"],
      publishedAt: "2026-05-06T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-06T00:00:00.000Z"),
    }),
    createLospecPaletteFixture({
      id: "alpha-forest",
      title: "Alpha Forest",
      slug: "alpha-forest",
      tags: ["forest", "blue"],
      publishedAt: "2026-05-05T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-05T00:00:00.000Z"),
    }),
    createLospecPaletteFixture({
      id: "desert-sun",
      title: "Desert Sun",
      slug: "desert-sun",
      tags: ["sand", "warm"],
      publishedAt: "2026-05-07T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-07T00:00:00.000Z"),
    }),
  ];

  const filtered = filterAndSortLospecPalettes(palettes, {
    query: "forest",
    sortOrder: "alphabetical",
  });

  assert.deepEqual(
    filtered.map((palette) => palette.id),
    ["alpha-forest", "forest-night"],
  );
});
