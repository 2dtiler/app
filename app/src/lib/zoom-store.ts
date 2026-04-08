/**
 * Lightweight zoom store that lives outside the travels undo/redo history.
 * Zoom levels are intentionally ephemeral — they reset to 1 on page reload.
 */

import type { ZoomState } from "@/types/editor-store";

let state: ZoomState = { mapZoom: 1, tilesetZoom: 1 };

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export const zoomStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  getSnapshot(): ZoomState {
    return state;
  },

  setMapZoom(zoom: number) {
    const clamped = Math.max(0.5, Math.min(4, zoom));
    if (state.mapZoom === clamped) return;
    state = { ...state, mapZoom: clamped };
    notify();
  },

  setTilesetZoom(zoom: number) {
    const clamped = Math.max(0.5, Math.min(4, zoom));
    if (state.tilesetZoom === clamped) return;
    state = { ...state, tilesetZoom: clamped };
    notify();
  },
};
