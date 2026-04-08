import type { Travels } from "travels";
import type { EditorState } from "./schema";

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
}
