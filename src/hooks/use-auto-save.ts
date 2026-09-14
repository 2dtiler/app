/**
 * Auto-save hook: periodically persists the current project to IndexedDB.
 * Also runs orphan asset cleanup on each save cycle to reclaim storage
 * from assets orphaned by undo/redo history trimming.
 * Respects the "Save project every minute" toggle from Settings.
 */

import { useEffect, useRef } from "react";
import { getEditorStore, markEditorSaved } from "@/store/editor-store";
import { saveProject, getSettings, cleanOrphanedAssets } from "@/services/db";
import { sanitizeProjectForPersistence } from "@/features/project-management/lib/project-serialization";

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
          if (!state.project) {
            return;
          }

          const { project: plainProject, badPath } =
            sanitizeProjectForPersistence(state.project);
          if (badPath) {
            console.error(
              "[AutoSave] Sanitized non-serializable project data at",
              badPath,
            );
            store.setState((draft) => {
              if (draft.project?.id === plainProject.id) {
                draft.project = plainProject;
              }
            });
          }

          await saveProject(
            { ...plainProject, updatedAt: Date.now() },
            { silent: true },
          );
          markEditorSaved();
          await cleanOrphanedAssets(plainProject);
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
