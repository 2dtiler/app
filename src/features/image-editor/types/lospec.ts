import type { Color } from "./index";

export interface LospecPaletteApiExample {
  image: string;
  description: string;
}

export interface LospecPaletteApiRecord {
  id: string;
  title: string;
  slug: string;
  description: string;
  tags: string[];
  user: string;
  colors: string[];
  examples: LospecPaletteApiExample[];
  published_at: string;
}

export interface LospecPaletteExample {
  image: string;
  description: string;
}

export interface LospecPaletteRecord {
  id: string;
  title: string;
  slug: string;
  description: string;
  tags: string[];
  user: string;
  colors: Color[];
  colorHexes: string[];
  examples: LospecPaletteExample[];
  publishedAt: string;
  publishedAtMs: number;
  cachedAt: number;
}

export type LospecPaletteSortOrder = "newest" | "alphabetical";

export type LospecPaletteSyncStatus =
  | "synced"
  | "partial"
  | "cache-only"
  | "error";

export interface LospecPaletteSyncResult {
  palettes: LospecPaletteRecord[];
  addedCount: number;
  usedCache: boolean;
  status: LospecPaletteSyncStatus;
  errorMessage?: string;
}

export interface LospecPaletteFilterOptions {
  query: string;
  sortOrder: LospecPaletteSortOrder;
}

export interface LospecPaletteSyncDependencies {
  fetchImpl?: typeof fetch;
  loadCache?: () => Promise<LospecPaletteRecord[]>;
  loadCacheIds?: () => Promise<string[]>;
  saveCache?: (palettes: LospecPaletteRecord[]) => Promise<void>;
  now?: () => number;
}
