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

function createFetchErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
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

test("normalizeLospecPaletteRecord strips HTML from descriptions while preserving paragraph breaks", () => {
  const palette = normalizeLospecPaletteRecord({
    id: "html-description",
    title: "HTML Description",
    slug: "html-description",
    description:
      "<p>First <strong>paragraph</strong> &amp; intro.</p><p>Second <a href=\"#\">paragraph</a>.</p>",
    tags: ["retro"],
    user: "user",
    colors: ["abcdef"],
    examples: [],
    published_at: "2026-05-02T00:00:00.000Z",
  });

  assert.ok(palette);
  assert.strictEqual(
    palette?.description,
    "First paragraph & intro.\n\nSecond paragraph.",
  );
});

test("normalizeLospecPaletteRecord strips decoded script tags from descriptions", () => {
  const palette = normalizeLospecPaletteRecord({
    id: "decoded-script-description",
    title: "Decoded Script Description",
    slug: "decoded-script-description",
    description: "Before &lt;script&gt;alert(1)&lt;/script&gt; after",
    tags: ["retro"],
    user: "user",
    colors: ["abcdef"],
    examples: [],
    published_at: "2026-05-02T00:00:00.000Z",
  });

  assert.ok(palette);
  assert.strictEqual(palette?.description, "Before alert(1) after");
  assert.ok(!palette?.description.includes("<script"));
});

test("normalizeLospecPaletteRecord does not double-decode encoded entities", () => {
  const palette = normalizeLospecPaletteRecord({
    id: "double-decode-description",
    title: "Double Decode Description",
    slug: "double-decode-description",
    description: "Escaped &amp;lt;script&amp;gt;safe&amp;lt;/script&amp;gt;",
    tags: ["retro"],
    user: "user",
    colors: ["abcdef"],
    examples: [],
    published_at: "2026-05-02T00:00:00.000Z",
  });

  assert.ok(palette);
  assert.strictEqual(
    palette?.description,
    "Escaped &lt;script&gt;safe&lt;/script&gt;",
  );
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

test("normalizeLospecPalettePage accepts Lospec count and items responses", () => {
  const palettes = normalizeLospecPalettePage(
    {
      count: 1,
      items: [
        {
          id: "object-response-palette",
          title: "Object Response Palette",
          slug: "object-response-palette",
          description: "Current proxy response shape",
          tags: ["proxy"],
          user: "user",
          colors: ["123456"],
          examples: [],
          published_at: "2026-05-02T00:00:00.000Z",
        },
      ],
    },
    321,
  );

  assert.deepEqual(
    palettes.map((palette) => palette.id),
    ["object-response-palette"],
  );
  assert.strictEqual(palettes[0]?.cachedAt, 321);
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
  assert.strictEqual(result.reachedEnd, false);
  assert.strictEqual(result.addedCount, 2);
  assert.deepEqual(
    result.palettes.map((palette) => palette.id),
    ["new-palette-1", "new-palette-2", "known-palette"],
  );
});

test("syncLospecPaletteCatalog emits progress from an empty cache while fetching later pages", async () => {
  const cachedPalettes: LospecPaletteRecord[] = [];
  const progressEvents: string[][] = [];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      createFetchResponse({
        count: 2,
        items: [
          {
            id: "first-page-palette",
            title: "First Page Palette",
            slug: "first-page-palette",
            description: "Initial display",
            tags: ["first"],
            user: "artist-1",
            colors: ["112233"],
            examples: [],
            published_at: "2026-05-07T00:00:00.000Z",
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      createFetchResponse({
        count: 2,
        items: [
          {
            id: "second-page-palette",
            title: "Second Page Palette",
            slug: "second-page-palette",
            description: "Background sync",
            tags: ["second"],
            user: "artist-2",
            colors: ["445566"],
            examples: [],
            published_at: "2026-05-06T00:00:00.000Z",
          },
        ],
      }),
    )
    .mockResolvedValueOnce(createFetchResponse({ count: 2, items: [] }));

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
    onProgress: (progress) => {
      progressEvents.push(progress.palettes.map((palette) => palette.id));
    },
    now: () => 999,
  });

  assert.strictEqual(result.status, "synced");
  assert.strictEqual(result.reachedEnd, true);
  assert.strictEqual(result.addedCount, 2);
  assert.strictEqual(result.fetchedPageCount, 3);
  assert.deepEqual(progressEvents, [
    ["first-page-palette"],
    ["first-page-palette", "second-page-palette"],
  ]);
  assert.deepEqual(
    result.palettes.map((palette) => palette.id),
    ["first-page-palette", "second-page-palette"],
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

test("syncLospecPaletteCatalog exposes Lospec request status codes", async () => {
  const cachedPalettes = [
    createLospecPaletteFixture({
      id: "cached-rate-limited",
      title: "Cached Rate Limited",
      slug: "cached-rate-limited",
      publishedAt: "2026-05-04T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-04T00:00:00.000Z"),
    }),
  ];

  const result = await syncLospecPaletteCatalog({
    fetchImpl: vi
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchErrorResponse(429)),
    loadCache: async () => cachedPalettes,
    loadCacheIds: async () => cachedPalettes.map((palette) => palette.id),
    saveCache: async () => undefined,
  });

  assert.strictEqual(result.status, "cache-only");
  assert.strictEqual(result.errorStatus, 429);
  assert.strictEqual(result.retryPage, 0);
  assert.strictEqual(
    result.errorMessage,
    "Lospec palette request failed with 429",
  );
});

test("syncLospecPaletteCatalog resumes from the provided start page after rate limiting", async () => {
  const cachedPalettes = [
    createLospecPaletteFixture({
      id: "cached-rate-limited",
      title: "Cached Rate Limited",
      slug: "cached-rate-limited",
      publishedAt: "2026-05-04T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-04T00:00:00.000Z"),
    }),
  ];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(createFetchErrorResponse(429))
    .mockResolvedValueOnce(
      createFetchResponse({
        count: 1,
        items: [
          {
            id: "resumed-palette",
            title: "Resumed Palette",
            slug: "resumed-palette",
            description: "Loaded after cooldown",
            tags: ["resume"],
            user: "artist",
            colors: ["112233"],
            examples: [],
            published_at: "2026-05-08T00:00:00.000Z",
          },
        ],
      }),
    )
    .mockResolvedValueOnce(createFetchResponse({ count: 1, items: [] }));

  const firstResult = await syncLospecPaletteCatalog({
    fetchImpl,
    loadCache: async () =>
      [...cachedPalettes].sort(
        (left, right) => right.publishedAtMs - left.publishedAtMs,
      ),
    loadCacheIds: async () => cachedPalettes.map((palette) => palette.id),
    saveCache: async (palettes) => {
      cachedPalettes.push(...palettes);
    },
    startPage: 11,
    now: () => 999,
  });

  assert.strictEqual(firstResult.status, "cache-only");
  assert.strictEqual(firstResult.errorStatus, 429);
  assert.strictEqual(firstResult.retryPage, 11);
  assert.strictEqual(
    new URL(fetchImpl.mock.calls[0]?.[0] as string).searchParams.get("page"),
    "11",
  );

  const resumedResult = await syncLospecPaletteCatalog({
    fetchImpl,
    loadCache: async () =>
      [...cachedPalettes].sort(
        (left, right) => right.publishedAtMs - left.publishedAtMs,
      ),
    loadCacheIds: async () => cachedPalettes.map((palette) => palette.id),
    saveCache: async (palettes) => {
      cachedPalettes.push(...palettes);
    },
    startPage: firstResult.retryPage,
    now: () => 999,
  });

  assert.strictEqual(resumedResult.status, "synced");
  assert.strictEqual(
    new URL(fetchImpl.mock.calls[1]?.[0] as string).searchParams.get("page"),
    "11",
  );
  assert.strictEqual(
    new URL(fetchImpl.mock.calls[2]?.[0] as string).searchParams.get("page"),
    "12",
  );
  assert.deepEqual(
    resumedResult.palettes.map((palette) => palette.id),
    ["resumed-palette", "cached-rate-limited"],
  );
  assert.strictEqual(resumedResult.reachedEnd, true);
});

test("syncLospecPaletteCatalog can continue through known palettes until an empty page is found", async () => {
  const cachedPalettes = [
    createLospecPaletteFixture({
      id: "known-page-zero",
      title: "Known Page Zero",
      slug: "known-page-zero",
      publishedAt: "2026-05-07T00:00:00.000Z",
      publishedAtMs: Date.parse("2026-05-07T00:00:00.000Z"),
    }),
  ];
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      createFetchResponse({
        count: 2,
        items: [
          {
            id: "known-page-zero",
            title: "Known Page Zero",
            slug: "known-page-zero",
            description: "Existing page zero palette",
            tags: ["known"],
            user: "artist-0",
            colors: ["112233"],
            examples: [],
            published_at: "2026-05-07T00:00:00.000Z",
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      createFetchResponse({
        count: 2,
        items: [
          {
            id: "missing-page-one",
            title: "Missing Page One",
            slug: "missing-page-one",
            description: "Recovered historical palette",
            tags: ["history"],
            user: "artist-1",
            colors: ["445566"],
            examples: [],
            published_at: "2026-05-06T00:00:00.000Z",
          },
        ],
      }),
    )
    .mockResolvedValueOnce(createFetchResponse({ count: 2, items: [] }));

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
    stopAtKnownPalette: false,
    now: () => 999,
  });

  assert.strictEqual(result.status, "synced");
  assert.strictEqual(result.reachedEnd, true);
  assert.strictEqual(fetchImpl.mock.calls.length, 3);
  assert.deepEqual(
    result.palettes.map((palette) => palette.id),
    ["known-page-zero", "missing-page-one"],
  );
});

test("syncLospecPaletteCatalog returns partial status when request cap is reached", async () => {
  const cachedPalettes: LospecPaletteRecord[] = [];
  let index = 0;
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
    createFetchResponse([
      {
        id: `new-palette-${index++}`,
        title: "New Palette",
        slug: "new-palette",
        description: "Desc",
        tags: ["fresh"],
        user: "artist",
        colors: ["112233"],
        examples: [],
        published_at: "2026-05-07T00:00:00.000Z",
      },
    ]),
  );

  const result = await syncLospecPaletteCatalog({
    fetchImpl,
    loadCache: async () => cachedPalettes,
    loadCacheIds: async () => cachedPalettes.map((palette) => palette.id),
    saveCache: async (palettes) => {
      cachedPalettes.push(...palettes);
    },
    now: () => 999,
  });

  assert.strictEqual(result.status, "partial");
  assert.ok(result.errorMessage);
  assert.strictEqual(fetchImpl.mock.calls.length, 200);
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
