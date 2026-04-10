/**
 * Lightweight zoom store that lives outside the travels undo/redo history.
 * Zoom stays out of patches/history, but is persisted separately in project
 * preferences so map and tileset views restore cleanly after reload.
 */

import type { ZoomState, ZoomStoreHydration } from "@/types/editor-store";
import type { PersistedZoomMap } from "@/types/persistence";

export const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function sanitizeZoomMap(zoomMap?: PersistedZoomMap): PersistedZoomMap {
  if (!zoomMap) return {};

  const sanitized: PersistedZoomMap = {};
  for (const [id, zoom] of Object.entries(zoomMap)) {
    if (!Number.isFinite(zoom)) continue;
    const clamped = clampZoom(zoom);
    if (clamped === DEFAULT_ZOOM) continue;
    sanitized[id] = clamped;
  }
  return sanitized;
}

function getZoomForId(zoomMap: PersistedZoomMap, id: string | null): number {
  if (!id) return DEFAULT_ZOOM;
  return zoomMap[id] ?? DEFAULT_ZOOM;
}

let state: ZoomState = {
  mapZoom: DEFAULT_ZOOM,
  tilesetZoom: DEFAULT_ZOOM,
  activeMapId: null,
  activeTilesetId: null,
  mapZooms: {},
  tilesetZooms: {},
};

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

  reset() {
    const nextState: ZoomState = {
      mapZoom: DEFAULT_ZOOM,
      tilesetZoom: DEFAULT_ZOOM,
      activeMapId: null,
      activeTilesetId: null,
      mapZooms: {},
      tilesetZooms: {},
    };
    const unchanged =
      state.mapZoom === nextState.mapZoom &&
      state.tilesetZoom === nextState.tilesetZoom &&
      state.activeMapId === nextState.activeMapId &&
      state.activeTilesetId === nextState.activeTilesetId &&
      Object.keys(state.mapZooms).length === 0 &&
      Object.keys(state.tilesetZooms).length === 0;
    if (unchanged) return;
    state = nextState;
    notify();
  },

  hydrate(hydration: ZoomStoreHydration) {
    const mapZooms = sanitizeZoomMap(hydration.mapZooms);
    const tilesetZooms = sanitizeZoomMap(hydration.tilesetZooms);
    state = {
      mapZoom: getZoomForId(mapZooms, hydration.activeMapId),
      tilesetZoom: getZoomForId(tilesetZooms, hydration.activeTilesetId),
      activeMapId: hydration.activeMapId,
      activeTilesetId: hydration.activeTilesetId,
      mapZooms,
      tilesetZooms,
    };
    notify();
  },

  setActiveMap(mapId: string | null) {
    const nextZoom = getZoomForId(state.mapZooms, mapId);
    if (state.activeMapId === mapId && state.mapZoom === nextZoom) return;
    state = {
      ...state,
      activeMapId: mapId,
      mapZoom: nextZoom,
    };
    notify();
  },

  setActiveTileset(tilesetId: string | null) {
    const nextZoom = getZoomForId(state.tilesetZooms, tilesetId);
    if (state.activeTilesetId === tilesetId && state.tilesetZoom === nextZoom) {
      return;
    }
    state = {
      ...state,
      activeTilesetId: tilesetId,
      tilesetZoom: nextZoom,
    };
    notify();
  },

  setMapZoom(zoom: number) {
    const clamped = clampZoom(zoom);
    if (state.mapZoom === clamped) {
      const currentStoredZoom = getZoomForId(state.mapZooms, state.activeMapId);
      if (currentStoredZoom === clamped) return;
    }

    const nextMapZooms = { ...state.mapZooms };
    if (state.activeMapId) {
      if (clamped === DEFAULT_ZOOM) {
        delete nextMapZooms[state.activeMapId];
      } else {
        nextMapZooms[state.activeMapId] = clamped;
      }
    }

    state = { ...state, mapZoom: clamped, mapZooms: nextMapZooms };
    notify();
  },

  setTilesetZoom(zoom: number) {
    const clamped = clampZoom(zoom);
    if (state.tilesetZoom === clamped) {
      const currentStoredZoom = getZoomForId(
        state.tilesetZooms,
        state.activeTilesetId,
      );
      if (currentStoredZoom === clamped) return;
    }

    const nextTilesetZooms = { ...state.tilesetZooms };
    if (state.activeTilesetId) {
      if (clamped === DEFAULT_ZOOM) {
        delete nextTilesetZooms[state.activeTilesetId];
      } else {
        nextTilesetZooms[state.activeTilesetId] = clamped;
      }
    }

    state = {
      ...state,
      tilesetZoom: clamped,
      tilesetZooms: nextTilesetZooms,
    };
    notify();
  },
};
