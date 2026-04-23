import type { ImageEditorResizeHandle } from "./image-editor-internals";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropState {
  rect: CropRect | null;
  dragging: boolean;
  resizingHandle: ImageEditorResizeHandle;
  dragOffsetX: number;
  dragOffsetY: number;
  resizeStartX: number;
  resizeStartY: number;
  resizeStartRect: CropRect | null;
}