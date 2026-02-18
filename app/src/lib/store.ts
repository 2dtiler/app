/**
 * Editor state store using `travels` (mutative) for undo/redo.
 *
 * Key design decisions:
 * - State is held in RAM for 60fps painting performance.
 * - `travels` stores only JSON patches (not full snapshots).
 * - Patches are persisted to IndexedDB via travels' persistence API.
 * - Max 50 undo steps to bound memory.
 * - Binary blobs (images) are stored separately in IndexedDB via db.ts;
 *   only their AssetId references live in the undo/redo-tracked state.
 */

import { createTravels, type TravelPatches, type Travels } from "travels";
import { DEFAULT_EDITOR_STATE, type EditorState } from "@/types";
import type { MapObject } from "@/types";
import { db } from "./db";

// ---------------------------------------------------------------------------
// Persistence helpers (IndexedDB-backed via Dexie)
// ---------------------------------------------------------------------------

const HISTORY_STORE_KEY = "editor-history";

interface PersistedHistory {
  id: string;
  state: string;
  patches: string;
  position: number;
}

async function loadPersistedHistory(): Promise<{
  state: EditorState;
  patches: TravelPatches;
  position: number;
} | null> {
  try {
    const stored = (await db.table("history").get(HISTORY_STORE_KEY)) as
      | PersistedHistory
      | undefined;
    if (!stored) return null;
    return {
      state: JSON.parse(stored.state),
      patches: JSON.parse(stored.patches) as TravelPatches,
      position: stored.position,
    };
  } catch {
    return null;
  }
}

async function persistHistory(
  state: EditorState,
  patches: TravelPatches,
  position: number,
): Promise<void> {
  try {
    await db.table("history").put({
      id: HISTORY_STORE_KEY,
      state: JSON.stringify(state),
      patches: JSON.stringify(patches),
      position,
    });
  } catch {
    // Silently fail - we'll recreate on next save
  }
}

// ---------------------------------------------------------------------------
// Dirty (unsaved changes) tracking
// ---------------------------------------------------------------------------

let _isDirty = false;

/** Mark the current project state as saved (clears the unsaved-changes flag). */
export function markEditorSaved(): void {
  _isDirty = false;
}

/** Returns true if there are unsaved changes since the last markEditorSaved() call. */
export function hasUnsavedChanges(): boolean {
  return _isDirty;
}

// ---------------------------------------------------------------------------
// Travels instance
// ---------------------------------------------------------------------------

type EditorTravels = Travels<EditorState, false, true, Record<string, never>>;
let travelsInstance: EditorTravels | null = null;

/**
 * Initialize the editor store. Must be called once at app startup.
 * Attempts to restore history from IndexedDB.
 */
export async function initEditorStore(): Promise<EditorTravels> {
  const persisted = await loadPersistedHistory();

  if (persisted) {
    // Backward-compat: ensure new EditorState fields have defaults
    const restoredState: EditorState = {
      ...DEFAULT_EDITOR_STATE,
      ...persisted.state,
    };
    // Ensure project.terrains exists for older projects
    if (restoredState.project && !restoredState.project.terrains) {
      restoredState.project.terrains = [];
    }
    // Ensure project.imageLayers exists for older projects
    if (restoredState.project && !restoredState.project.imageLayers) {
      restoredState.project.imageLayers = [];
    }
    // Ensure project.objectLayers and objects exist for older projects
    if (restoredState.project && !restoredState.project.objectLayers) {
      restoredState.project.objectLayers = [];
    }
    if (restoredState.project && !restoredState.project.objects) {
      restoredState.project.objects = [];
    }
    // Ensure overrideTilesets exists for older projects
    if (restoredState.project && !restoredState.project.overrideTilesets) {
      restoredState.project.overrideTilesets = [];
    }
    // Migrate old string-only properties to { value, type } format
    if (restoredState.project) {
      for (const obj of restoredState.project.objects) {
        if (obj.properties) {
          const migrated: Record<string, { value: string; type: string }> = {};
          for (const [k, v] of Object.entries(obj.properties)) {
            if (typeof v === "string") {
              migrated[k] = { value: v, type: "string" };
            } else {
              migrated[k] = v as { value: string; type: string };
            }
          }
          (obj as MapObject).properties = migrated as MapObject["properties"];
        }
      }
    }
    travelsInstance = createTravels<EditorState>(restoredState, {
      maxHistory: 50,
      initialPatches: persisted.patches,
      initialPosition: persisted.position,
    });
  } else {
    travelsInstance = createTravels<EditorState>(DEFAULT_EDITOR_STATE, {
      maxHistory: 50,
    });
  }

  // Persist on every change (debounced in the subscribe callback)
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  travelsInstance.subscribe((state, patches, position) => {
    // Mark dirty whenever the project is loaded and state changes
    if (state.project) {
      _isDirty = true;
    }
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void persistHistory(state, patches as TravelPatches, position);
    }, 500);
  });

  return travelsInstance;
}

/**
 * Get the current travels instance. Throws if not initialized.
 */
export function getEditorStore(): EditorTravels {
  if (!travelsInstance) {
    throw new Error(
      "Editor store not initialized. Call initEditorStore() first.",
    );
  }
  return travelsInstance;
}
