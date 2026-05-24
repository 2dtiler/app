import type { LospecPaletteRecord } from "./lospec";

export type LospecPaletteBackgroundSyncStatus =
  | "idle"
  | "syncing"
  | "rate-limited"
  | "complete"
  | "error";

export interface LospecPaletteSyncCheckpoint {
  status: LospecPaletteBackgroundSyncStatus;
  nextPage: number;
  retryAtMs: number | null;
  fetchedPageCount: number;
  addedCount: number;
  updatedAt: number;
  errorStatus?: number;
  errorMessage?: string;
}

export interface LospecPaletteSyncSnapshot
  extends LospecPaletteSyncCheckpoint {
  palettes: LospecPaletteRecord[];
  hasLoaded: boolean;
}
