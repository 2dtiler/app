/**
 * Type definitions for the pixel-art Image Editor tool.
 *
 * All types are JSON-serializable so they can be tracked by `travels`
 * for undo/redo. Pixel data (ImageData buffers) lives in-memory only
 * and is managed by the pixel history system.
 */

export * from "./image-editor-controller";
export * from "./image-editor-context";
export * from "./image-editor-hook";
export * from "./image-editor-hook-internals";
export * from "./image-editor-internals";
export * from "./image-editor-layer-tree";
export * from "./image-editor-tools";
export * from "./image-editor-ui";
export * from "./lospec";
export * from "./lospec-sync";

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type ImageEditorProjectId = string & {
  readonly __brand: "ImageEditorProjectId";
};
export type FrameId = string & { readonly __brand: "FrameId" };
export type PaletteId = string & { readonly __brand: "PaletteId" };
export type ImageEditorLayerId = string & {
  readonly __brand: "ImageEditorLayerId";
};
export type ImageEditorGroupId = string & {
  readonly __brand: "ImageEditorGroupId";
};

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/** RGBA color with 0–255 channels */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export interface Palette {
  id: PaletteId;
  name: string;
  colors: Color[];
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export interface Frame {
  id: FrameId;
  name: string;
  /** Duration of this frame in milliseconds (for animation) */
  duration: number;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type ImageEditorTool =
  | "pencil"
  | "eraser"
  | "selection"
  | "crop"
  | "move"
  | "paint-bucket"
  | "line"
  | "rectangle"
  | "contour"
  | "blur";

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** Pixel-space rectangular selection */
export interface PixelSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Image Editor Layer Types
// ---------------------------------------------------------------------------

/** A regular raster (pixel art) drawing layer */
export interface ImageEditorRasterLayer {
  id: ImageEditorLayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Always "tile" — identifies this as a raster drawing layer */
  type: "tile";
}

/** An imported PNG image overlay layer (organisational metadata for now) */
export interface ImageEditorImageLayer {
  id: ImageEditorLayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Always "image" */
  type: "image";
}

/** A group that can contain raster or image layers */
export interface ImageEditorLayerGroup {
  id: ImageEditorGroupId;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Whether the group is expanded in the layers panel */
  expanded: boolean;
  /** Bottom-to-top render order of children */
  childOrder: (ImageEditorLayerId | ImageEditorGroupId)[];
}

// ---------------------------------------------------------------------------
// Editor State  (tracked by travels for undo/redo)
// ---------------------------------------------------------------------------

export interface ImageEditorState {
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;

  /** All frames in order */
  frames: Frame[];
  /** Index of the currently displayed/edited frame */
  currentFrameIndex: number;

  /** All saved palettes */
  palettes: Palette[];
  /** ID of the currently active palette */
  activePaletteId: PaletteId;

  /** Currently selected tool */
  tool: ImageEditorTool;

  /** Primary drawing color */
  primaryColor: Color;
  /** Secondary drawing color (right-click) */
  secondaryColor: Color;

  /** Brush size in pixels (1–16) */
  brushSize: number;

  /** Blur kernel radius (1–8, where 1 = 3×3, 2 = 5×5, etc.) */
  blurSize: number;

  /** Blur intensity / strength (1–100, percentage blend) */
  blurIntensity: number;

  /** Canvas zoom level */
  zoom: number;

  /** Current pixel selection (null if none) */
  selection: PixelSelection | null;

  /** Whether the animation is currently playing */
  isPlaying: boolean;

  /** Animation frames per second */
  fps: number;

  /** Whether to show previous frame as onion skin */
  onionSkin: boolean;

  /** Whether animation should loop */
  loop: boolean;

  /**
   * Monotonically increasing counter bumped after every pixel-data write.
   * Subscribers use this to detect when frame thumbnails should be repainted.
   */
  pixelDataVersion?: number;

  // ---- Layers ----

  /** All raster (pixel art) drawing layers */
  layers: ImageEditorRasterLayer[];
  /** All imported image overlay layers */
  imageLayers: ImageEditorImageLayer[];
  /** All layer groups */
  layerGroups: ImageEditorLayerGroup[];
  /**
   * Top-level layer order (bottom-to-top rendering order).
   * End of array = visually topmost layer.
   */
  layerOrder: (ImageEditorLayerId | ImageEditorGroupId)[];
  /** ID of the currently active/selected layer, or null if none */
  activeLayerId: ImageEditorLayerId | null;
}

// ---------------------------------------------------------------------------
// Default palette (16-color pixel-art palette)
// ---------------------------------------------------------------------------

export const DEFAULT_PALETTE_COLORS: Color[] = [
  { r: 0, g: 0, b: 0, a: 255 },
  { r: 255, g: 255, b: 255, a: 255 },
  { r: 255, g: 0, b: 0, a: 255 },
  { r: 0, g: 255, b: 0, a: 255 },
  { r: 0, g: 0, b: 255, a: 255 },
  { r: 255, g: 255, b: 0, a: 255 },
  { r: 255, g: 0, b: 255, a: 255 },
  { r: 0, g: 255, b: 255, a: 255 },
  { r: 128, g: 128, b: 128, a: 255 },
  { r: 192, g: 192, b: 192, a: 255 },
  { r: 128, g: 0, b: 0, a: 255 },
  { r: 0, g: 128, b: 0, a: 255 },
  { r: 0, g: 0, b: 128, a: 255 },
  { r: 128, g: 128, b: 0, a: 255 },
  { r: 128, g: 0, b: 128, a: 255 },
  { r: 0, g: 128, b: 128, a: 255 },
];

export const DEFAULT_PALETTE: Palette = {
  id: "default-palette" as PaletteId,
  name: "Default",
  colors: DEFAULT_PALETTE_COLORS,
};

export function getActivePalette(state: ImageEditorState): Palette {
  return (
    state.palettes.find((palette) => palette.id === state.activePaletteId) ??
    state.palettes[0]
  );
}

export const DEFAULT_IMAGE_EDITOR_STATE: ImageEditorState = {
  width: 16,
  height: 16,
  frames: [],
  currentFrameIndex: 0,
  palettes: [DEFAULT_PALETTE],
  activePaletteId: "default-palette" as PaletteId,
  tool: "pencil",
  primaryColor: { r: 0, g: 0, b: 0, a: 255 },
  secondaryColor: { r: 255, g: 255, b: 255, a: 255 },
  brushSize: 1,
  blurSize: 1,
  blurIntensity: 100,
  zoom: 8,
  selection: null,
  isPlaying: false,
  fps: 6,
  onionSkin: false,
  loop: true,
  pixelDataVersion: 0,
  layers: [],
  imageLayers: [],
  layerGroups: [],
  layerOrder: [],
  activeLayerId: null,
};
