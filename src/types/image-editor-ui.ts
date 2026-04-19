import type {
  Color,
  Frame,
  FrameId,
  ImageEditorTool,
  Palette,
  PaletteId,
  PixelSelection,
} from "./image-editor";
import type { PaletteExportFormat, PngSwatchSize } from "./image-editor-hook";

export interface ToolSidebarProps {
  currentTool: ImageEditorTool;
  brushSize: number;
  blurSize: number;
  onSelectTool: (tool: ImageEditorTool) => void;
  onBrushSize: (size: number) => void;
  onBlurSize: (size: number) => void;
}

export interface TimelinePanelProps {
  frames: Frame[];
  currentFrameIndex: number;
  isPlaying: boolean;
  fps: number;
  onionSkin: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: () => void;
  onDeleteFrame: () => void;
  onMoveFrame: (direction: "left" | "right") => void;
  onPlay: () => void;
  onStop: () => void;
  onSetFps: (fps: number) => void;
  onSetOnionSkin: (on: boolean) => void;
}

export interface EditorToolbarProps {
  zoom: number;
  tool: ImageEditorTool;
  blurIntensity: number;
  canApplyCrop: boolean;
  canSave: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onZoom: (z: number) => void;
  onBlurIntensity: (i: number) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onNew: () => void;
  onResize: () => void;
  onSave: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export type SaveFormat = "png" | "gif" | "spritesheet";

export interface SaveFormatDialogProps {
  open: boolean;
  totalFrames: number;
  onClose: () => void;
  onSavePng: () => Promise<boolean> | boolean;
  onSaveGif: () => Promise<boolean> | boolean;
  onSaveSpriteSheet: (columns: number) => Promise<boolean> | boolean;
}

export interface ImageEditorProps {
  onRequestClose?: () => void;
}

export interface NewImageDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number) => void;
  initialWidth?: number;
  initialHeight?: number;
}

export type ImageCanvasResizeHandle = "e" | "s" | "se" | null;

export interface ImageCanvasResizeAction {
  handle: Exclude<ImageCanvasResizeHandle, null>;
  startClientX: number;
  startClientY: number;
  origWidth: number;
  origHeight: number;
  nextWidth: number;
  nextHeight: number;
}

export interface ImageCanvasResizePreview {
  width: number;
  height: number;
}

export interface ImageCanvasProps {
  width: number;
  height: number;
  zoom: number;
  tool: ImageEditorTool;
  primaryColor: Color;
  secondaryColor: Color;
  brushSize: number;
  blurSize: number;
  blurIntensity: number;
  currentFrameId: FrameId | null;
  activeLayerData: ImageData | null;
  belowComposite: ImageData | null;
  aboveComposite: ImageData | null;
  previousFrameData: ImageData | null;
  onionSkin: boolean;
  selection: PixelSelection | null;
  isLayerLocked: boolean;
  onZoom: (zoom: number) => void;
  onPushUndo: () => void;
  onSelectionChange: (sel: PixelSelection | null) => void;
  onFrameDataChange: (frameId: FrameId, data: ImageData) => void;
  onResizeCanvas: (width: number, height: number) => void;
}

export interface PalettePanelProps {
  palettes: Palette[];
  activePaletteId: PaletteId;
  onSwitchPalette: (id: PaletteId) => void;
  onRenamePalette: (id: PaletteId, name: string) => void;
  onDeletePalette: (id: PaletteId) => void;
  onDuplicatePalette: (id: PaletteId) => void;
  colors: Color[];
  primaryColor: Color;
  secondaryColor: Color;
  onSelectPrimary: (color: Color) => void;
  onSelectSecondary: (color: Color) => void;
  onAddColor: (color: Color) => void;
  onRemoveColor: (index: number) => void;
  onUpdateColor: (index: number, color: Color) => void;
  onReorderColors: (fromIndex: number, toIndex: number) => void;
  onImport: (file: File) => void;
  onExport: (format: PaletteExportFormat, swatchSize?: PngSwatchSize) => void;
  onReset: () => void;
}

export interface FramesPanelProps {
  frames: Frame[];
  currentFrameIndex: number;
  isPlaying: boolean;
  fps: number;
  onionSkin: boolean;
  canvasWidth: number;
  canvasHeight: number;
  getFrameData: (frameId: FrameId) => ImageData | null;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: () => void;
  onDeleteFrame: () => void;
  onPlay: () => void;
  onStop: () => void;
  onSetFps: (fps: number) => void;
  onSetOnionSkin: (on: boolean) => void;
}

export interface ExportDialogProps {
  open: boolean;
  totalFrames: number;
  onClose: () => void;
  onExportSpriteSheet: (columns: number) => void;
}
