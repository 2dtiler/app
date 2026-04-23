import type { Travels } from "travels";
import type { EditorState } from "../map/schema";
import type { PersistedZoomMap } from "@/features/import-export/types";

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
