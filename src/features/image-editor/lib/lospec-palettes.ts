import {
  loadLospecPaletteCache,
  loadLospecPaletteCacheIds,
  saveLospecPaletteCache,
} from "@/services/db";
import type {
  Color,
  LospecPaletteExample,
  LospecPaletteFilterOptions,
  LospecPaletteRecord,
  LospecPaletteSyncDependencies,
  LospecPaletteSyncResult,
} from "@/features/image-editor/types";

export const LOSPEC_PALETTES_ENDPOINT =
  "https://api.2dtiler.com/lospec_palettes";

class LospecPaletteRequestError extends Error {
  status: number;

  constructor(status: number) {
    super(`Lospec palette request failed with ${status}`);
    this.name = "LospecPaletteRequestError";
    this.status = status;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLospecColorHex(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function parseLospecColorHex(value: string): Color {
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: 255,
  };
}

function normalizeLospecTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }

    const normalized = entry.trim();
    const normalizedKey = normalized.toLowerCase();

    if (!normalized || seen.has(normalizedKey)) {
      return [];
    }

    seen.add(normalizedKey);
    return [normalized];
  });
}

function normalizeLospecExamples(value: unknown): LospecPaletteExample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isObjectRecord(entry) || typeof entry.image !== "string") {
      return [];
    }

    return [
      {
        image: entry.image,
        description:
          typeof entry.description === "string" ? entry.description : "",
      },
    ];
  });
}

function decodeLospecHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeLospecDescription(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return decodeLospecHtmlEntities(
    value
      .replace(/<\s*\/p\s*>\s*<\s*p\b[^>]*>/gi, "\n\n")
      .replace(/<\s*p\b[^>]*>/gi, "")
      .replace(/<\s*\/p\s*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

function getLospecErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Lospec palettes could not be loaded.";
}

function getLospecErrorStatus(error: unknown): number | undefined {
  return error instanceof LospecPaletteRequestError
    ? error.status
    : undefined;
}

function buildLospecPaletteSearchHaystack(
  palette: LospecPaletteRecord,
): string {
  return [
    palette.title,
    palette.slug,
    palette.description,
    palette.user,
    ...palette.tags,
  ]
    .join("\n")
    .toLowerCase();
}

async function fetchLospecPalettePage(
  page: number,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<LospecPaletteRecord[]> {
  const url = new URL(LOSPEC_PALETTES_ENDPOINT);
  url.searchParams.set("page", String(page));

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new LospecPaletteRequestError(response.status);
  }

  return normalizeLospecPalettePage(await response.json(), now());
}

export function normalizeLospecPaletteRecord(
  value: unknown,
  cachedAt: number = Date.now(),
): LospecPaletteRecord | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const slug = typeof value.slug === "string" ? value.slug.trim() : "";
  const description = normalizeLospecDescription(value.description);
  const user = typeof value.user === "string" ? value.user.trim() : "";
  const publishedAt =
    typeof value.published_at === "string" ? value.published_at : "";
  const publishedAtMs = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  const colorHexes = Array.isArray(value.colors)
    ? value.colors.flatMap((entry) => {
        const normalized = normalizeLospecColorHex(entry);
        return normalized ? [normalized] : [];
      })
    : [];

  if (
    !id ||
    !title ||
    !slug ||
    colorHexes.length === 0 ||
    !Number.isFinite(publishedAtMs)
  ) {
    return null;
  }

  return {
    id,
    title,
    slug,
    description,
    tags: normalizeLospecTags(value.tags),
    user,
    colors: colorHexes.map((hex) => parseLospecColorHex(hex)),
    colorHexes,
    examples: normalizeLospecExamples(value.examples),
    publishedAt,
    publishedAtMs,
    cachedAt,
  };
}

export function normalizeLospecPalettePage(
  value: unknown,
  cachedAt: number = Date.now(),
): LospecPaletteRecord[] {
  const records = isObjectRecord(value) && Array.isArray(value.items)
    ? value.items
    : value;

  if (!Array.isArray(records)) {
    return [];
  }

  return records.flatMap((entry) => {
    const palette = normalizeLospecPaletteRecord(entry, cachedAt);
    return palette ? [palette] : [];
  });
}

export function filterAndSortLospecPalettes(
  palettes: LospecPaletteRecord[],
  options: LospecPaletteFilterOptions,
): LospecPaletteRecord[] {
  const queryTerms = options.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const filtered = queryTerms.length
    ? palettes.filter((palette) => {
        const haystack = buildLospecPaletteSearchHaystack(palette);
        return queryTerms.every((term) => haystack.includes(term));
      })
    : [...palettes];

  filtered.sort((left, right) => {
    if (options.sortOrder === "alphabetical") {
      return (
        left.title.localeCompare(right.title, undefined, {
          sensitivity: "base",
        }) || right.publishedAtMs - left.publishedAtMs
      );
    }

    return (
      right.publishedAtMs - left.publishedAtMs ||
      left.title.localeCompare(right.title, undefined, {
        sensitivity: "base",
      })
    );
  });

  return filtered;
}

const LOSPEC_SYNC_MAX_PAGES = 200;

export async function syncLospecPaletteCatalog(
  dependencies: LospecPaletteSyncDependencies = {},
): Promise<LospecPaletteSyncResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const loadCache = dependencies.loadCache ?? loadLospecPaletteCache;
  const loadCacheIds = dependencies.loadCacheIds ?? loadLospecPaletteCacheIds;
  const saveCache = dependencies.saveCache ?? saveLospecPaletteCache;
  const onProgress = dependencies.onProgress;
  const now = dependencies.now ?? Date.now;
  const startPage = Math.max(0, Math.floor(dependencies.startPage ?? 0));
  const stopAtKnownPalette = dependencies.stopAtKnownPalette ?? true;
  const knownIds = new Set(await loadCacheIds());
  const cachedPalettes = await loadCache();
  let page = startPage;
  let addedCount = 0;
  let fetchedPageCount = 0;
  let reachedEnd = false;

  if (cachedPalettes.length > 0) {
    onProgress?.({
      palettes: cachedPalettes,
      addedCount,
      fetchedPageCount,
      page: null,
      pageAddedCount: 0,
      isInitialCache: true,
    });
  }

  try {
    while (page < LOSPEC_SYNC_MAX_PAGES) {
      const pagePalettes = await fetchLospecPalettePage(page, fetchImpl, now);
      fetchedPageCount += 1;
      if (pagePalettes.length === 0) {
        reachedEnd = true;
        break;
      }

      const firstKnownIndex = stopAtKnownPalette
        ? pagePalettes.findIndex((palette) => knownIds.has(palette.id))
        : -1;
      const palettesToSave =
        firstKnownIndex >= 0
          ? pagePalettes.slice(0, firstKnownIndex)
          : pagePalettes.filter((palette) => !knownIds.has(palette.id));

      if (palettesToSave.length > 0) {
        await saveCache(palettesToSave);
        addedCount += palettesToSave.length;
        for (const palette of palettesToSave) {
          knownIds.add(palette.id);
        }
      }

      onProgress?.({
        palettes: await loadCache(),
        addedCount,
        fetchedPageCount,
        page,
        pageAddedCount: palettesToSave.length,
        isInitialCache: false,
      });

      if (firstKnownIndex >= 0) {
        break;
      }

      page += 1;
    }

    if (page >= LOSPEC_SYNC_MAX_PAGES) {
      return {
        palettes: await loadCache(),
        addedCount,
        fetchedPageCount,
        usedCache: false,
        status: "partial",
        reachedEnd: false,
        errorMessage: `Reached Lospec sync cap (${LOSPEC_SYNC_MAX_PAGES} pages). Imported a partial catalog.`,
      };
    }

    return {
      palettes: await loadCache(),
      addedCount,
      fetchedPageCount,
      usedCache: false,
      status: "synced",
      reachedEnd,
    };
  } catch (error) {
    const palettes = await loadCache();
    const errorMessage = getLospecErrorMessage(error);
    const errorStatus = getLospecErrorStatus(error);

    if (palettes.length > 0) {
      return {
        palettes,
        addedCount,
        fetchedPageCount,
        usedCache: true,
        status: "cache-only",
        retryPage: errorStatus === 429 ? page : undefined,
        errorStatus,
        errorMessage,
      };
    }

    return {
      palettes: [],
      addedCount,
      fetchedPageCount,
      usedCache: false,
      status: "error",
      retryPage: errorStatus === 429 ? page : undefined,
      errorStatus,
      errorMessage,
    };
  }
}
