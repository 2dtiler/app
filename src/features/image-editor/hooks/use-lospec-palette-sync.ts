import { useSyncExternalStore } from "react";
import {
  getLospecPaletteSyncSnapshot,
  subscribeToLospecPaletteSync,
} from "@/features/image-editor/lib/lospec-sync-controller";
import type { LospecPaletteSyncSnapshot } from "@/features/image-editor/types";

export function useLospecPaletteSync(): LospecPaletteSyncSnapshot {
  return useSyncExternalStore(
    subscribeToLospecPaletteSync,
    getLospecPaletteSyncSnapshot,
    getLospecPaletteSyncSnapshot,
  );
}
