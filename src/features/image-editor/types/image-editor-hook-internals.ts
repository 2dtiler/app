import type { ImageEditorState } from "./index";

export type ImageEditorStateUpdater = (draft: ImageEditorState) => void;

export type ImageEditorSetState = (updater: ImageEditorStateUpdater) => void;

export type FrameMoveDirection = "left" | "right";

export type LayerMoveDirection = "up" | "down";

export type LayerDropPosition = "above" | "below" | "inside";

export interface ImageEditorFrameActionsParams {
  state: ImageEditorState | null;
  setState: ImageEditorSetState;
}

export interface ImageEditorPaletteActionsParams {
  state: ImageEditorState | null;
  setState: ImageEditorSetState;
}

export interface ImageEditorLayerActionsParams {
  state: ImageEditorState | null;
  setState: ImageEditorSetState;
}
