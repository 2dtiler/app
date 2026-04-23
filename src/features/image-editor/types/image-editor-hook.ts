import type { Frame, FrameId, Palette, PaletteId } from "./index";

export type PaletteExportFormat =
  | "ase"
  | "aseprite"
  | "gpl"
  | "pal"
  | "txt"
  | "hex"
  | "png";

export type PngSwatchSize = 1 | 8 | 16 | 32;

export interface FrameOperation {
  type: "add" | "delete" | "duplicate";
  frameId: FrameId;
  frame: Frame;
  index: number;
  layerData: Map<string, ImageData>;
  prevFrameIndex: number;
}

export interface PaletteLibrarySnapshot {
  palettes: Palette[];
  activePaletteId: PaletteId;
}

export interface ResizeSnapshot {
  width: number;
  height: number;
  layerData: Map<string, ImageData>;
}

export interface ResizeOperation {
  before: ResizeSnapshot;
  after: ResizeSnapshot;
}

export type UndoableActionType = "pixel" | "frame" | "palette" | "resize";
