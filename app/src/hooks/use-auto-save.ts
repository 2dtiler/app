/**
 * Auto-save hook: periodically persists the current project to IndexedDB.
 * Also runs orphan asset cleanup on each save cycle to reclaim storage
 * from assets orphaned by undo/redo history trimming.
 * Respects the "Save project every minute" toggle from Settings.
 */

import { useEffect, useRef } from "react";
import { getEditorStore, markEditorSaved } from "@/lib/store";
import { saveProject, getSettings, cleanOrphanedAssets } from "@/lib/db";

const AUTO_SAVE_INTERVAL_MS = 60_000; // 1 minute

export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function startAutoSave() {
      const settings = await getSettings();
      if (cancelled) return;

      if (!settings.autoSaveEnabled) {
        return;
      }

      timerRef.current = setInterval(async () => {
        try {
          const store = getEditorStore();
          const state = store.getState();
          if (state.project) {
            await saveProject({
              ...state.project,
              updatedAt: Date.now(),
            });
            markEditorSaved();
            // Clean up any orphaned assets (e.g. from trimmed undo history)
            await cleanOrphanedAssets(state.project);
          }
        } catch (err) {
          console.error("[AutoSave] Failed to save project:", err);
        }
      }, AUTO_SAVE_INTERVAL_MS);
    }

    void startAutoSave();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);
}
