import type { Travels } from "travels";
import type { PersistedZoomMap } from "@/features/import-export/types";
import type { EditorState } from "@/types/map/schema";

export interface PersistedHistory {
  id: string;
  state: string;
  patches: string;
  position: number;
}

export type EditorTravels = Travels<
  EditorState,
  false,
  true,
  Record<string, never>
>;

export interface ZoomState {
  mapZoom: number;
  tilesetZoom: number;
  activeMapId: string | null;
  activeTilesetId: string | null;
  mapZooms: PersistedZoomMap;
  tilesetZooms: PersistedZoomMap;
}

export interface ZoomStoreHydration {
  activeMapId: string | null;
  activeTilesetId: string | null;
  mapZooms?: PersistedZoomMap;
  tilesetZooms?: PersistedZoomMap;
}