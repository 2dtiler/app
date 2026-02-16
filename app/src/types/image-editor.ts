/**
 * Type definitions for the pixel-art Image Editor tool.
 *
 * All types are JSON-serializable so they can be tracked by `travels`
 * for undo/redo. Pixel data (ImageData buffers) lives in-memory only
 * and is managed by the pixel history system.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type ImageEditorProjectId = string & {
  readonly __brand: "ImageEditorProjectId";
};
export type FrameId = string & { readonly __brand: "FrameId" };
export type PaletteId = string & { readonly __brand: "PaletteId" };

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
  | "eyedropper"
  | "move"
  | "paint-bucket"
  | "line"
  | "rectangle"
  | "contour"
  | "blur"
  | "marquee";

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

  /** Active color palette */
  palette: Palette;

  /** Currently selected tool */
  tool: ImageEditorTool;

  /** Primary drawing color */
  primaryColor: Color;
  /** Secondary drawing color (right-click) */
  secondaryColor: Color;

  /** Brush size in pixels (1–16) */
  brushSize: number;

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
}

// ---------------------------------------------------------------------------
// Default palette (16-color pixel-art palette)
// ---------------------------------------------------------------------------

export const DEFAULT_PALETTE_COLORS: Color[] = [
  { r: 0, g: 0, b: 0, a: 255 }, // black
  { r: 255, g: 255, b: 255, a: 255 }, // white
  { r: 255, g: 0, b: 0, a: 255 }, // red
  { r: 0, g: 255, b: 0, a: 255 }, // green
  { r: 0, g: 0, b: 255, a: 255 }, // blue
  { r: 255, g: 255, b: 0, a: 255 }, // yellow
  { r: 255, g: 0, b: 255, a: 255 }, // magenta
  { r: 0, g: 255, b: 255, a: 255 }, // cyan
  { r: 128, g: 128, b: 128, a: 255 }, // gray
  { r: 192, g: 192, b: 192, a: 255 }, // light gray
  { r: 128, g: 0, b: 0, a: 255 }, // dark red
  { r: 0, g: 128, b: 0, a: 255 }, // dark green
  { r: 0, g: 0, b: 128, a: 255 }, // dark blue
  { r: 128, g: 128, b: 0, a: 255 }, // olive
  { r: 128, g: 0, b: 128, a: 255 }, // purple
  { r: 0, g: 128, b: 128, a: 255 }, // teal
];

export const DEFAULT_IMAGE_EDITOR_STATE: ImageEditorState = {
  width: 32,
  height: 32,
  frames: [],
  currentFrameIndex: 0,
  palette: {
    id: "default-palette" as PaletteId,
    name: "Default",
    colors: DEFAULT_PALETTE_COLORS,
  },
  tool: "pencil",
  primaryColor: { r: 0, g: 0, b: 0, a: 255 },
  secondaryColor: { r: 255, g: 255, b: 255, a: 255 },
  brushSize: 1,
  zoom: 8,
  selection: null,
  isPlaying: false,
  fps: 12,
  onionSkin: false,
  loop: true,
};
