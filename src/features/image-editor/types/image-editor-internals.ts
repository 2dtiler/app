import type { Travels } from "travels";
import type { Color, ImageEditorState, ImageEditorTool } from "./index";

export interface FrameHistory {
  undoStack: ImageEditorHistorySnapshot[];
  redoStack: ImageEditorHistorySnapshot[];
}

export interface ImageEditorHistorySnapshot {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ImageEditorTravels = Travels<
  ImageEditorState,
  false,
  true,
  Record<string, never>
>;

export interface ToolContext {
  ctx: CanvasRenderingContext2D;
  overlayCtx: CanvasRenderingContext2D;
  width: number;
  height: number;
  color: Color;
  brushSize: number;
  tool: ImageEditorTool;
  shiftKey: boolean;
  blurSize: number;
  blurIntensity: number;
}

export interface StrokeState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  snapshot: ImageData | null;
  path: [number, number][];
  moveOffsetX: number;
  moveOffsetY: number;
  active: boolean;
}

export type ImageEditorResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "w"
  | "e"
  | "sw"
  | "s"
  | "se"
  | null;

export interface SelectionState {
  floatingPixels: ImageData | null;
  floatingX: number;
  floatingY: number;
  displayWidth: number;
  displayHeight: number;
  sourceRect: { x: number; y: number; width: number; height: number } | null;
  draggingFloating: boolean;
  resizingHandle: ImageEditorResizeHandle;
  resizeStartX: number;
  resizeStartY: number;
  resizeStartBounds: { x: number; y: number; w: number; h: number };
  canvasSnapshot: ImageData | null;
  dragOffsetX: number;
  dragOffsetY: number;
  committed: boolean;
}
