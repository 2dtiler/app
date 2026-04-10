import type { Frame, FrameId, Palette, PaletteId } from "./image-editor";

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

export type UndoableActionType = "pixel" | "frame" | "palette";
