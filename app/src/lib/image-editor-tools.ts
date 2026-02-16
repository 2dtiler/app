/**
 * Drawing tool implementations for the pixel-art image editor.
 *
 * Each tool exports onDown / onMove / onUp handlers that operate on
 * raw ImageData pixels via getImageData / putImageData.
 *
 * Coordinate space: all x,y are in *pixel* coordinates (NOT zoomed).
 */

import type { Color, ImageEditorTool } from "@/types/image-editor";

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

/** Bresenham line: returns every pixel along (x0,y0)→(x1,y1). */
export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const points: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;

  while (true) {
    points.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return points;
}

/** Set a single pixel in an ImageData buffer. Bounds-checked. */
export function setPixel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Color,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  data[i] = color.r;
  data[i + 1] = color.g;
  data[i + 2] = color.b;
  data[i + 3] = color.a;
}

/** Get pixel color from ImageData. Returns transparent black if out of bounds. */
export function getPixel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): Color {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/** Draw a filled circle at (cx,cy) with given brush radius. */
export function drawBrush(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  color: Color,
): void {
  if (size <= 1) {
    setPixel(data, width, height, cx, cy, color);
    return;
  }
  const radius = size / 2;
  const r2 = radius * radius;
  const startX = Math.floor(cx - radius + 0.5);
  const startY = Math.floor(cy - radius + 0.5);
  const endX = Math.ceil(cx + radius - 0.5);
  const endY = Math.ceil(cy + radius - 0.5);
  for (let py = startY; py <= endY; py++) {
    for (let px = startX; px <= endX; px++) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(data, width, height, px, py, color);
      }
    }
  }
}

/** Check if two colors match exactly. */
function colorsEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

// ---------------------------------------------------------------------------
// Tool state — persisted across onDown / onMove / onUp calls
// ---------------------------------------------------------------------------

export interface ToolContext {
  /** The main canvas 2d context */
  ctx: CanvasRenderingContext2D;
  /** The overlay canvas 2d context (for previews) */
  overlayCtx: CanvasRenderingContext2D;
  /** Canvas dimensions */
  width: number;
  height: number;
  /** Current tool configuration */
  color: Color;
  brushSize: number;
  tool: ImageEditorTool;
  /** Whether the shift key is currently held */
  shiftKey: boolean;
  /** Blur kernel radius (1–8) */
  blurSize: number;
  /** Blur intensity (1–100) */
  blurIntensity: number;
}

/**
 * Mutable state for the currently active tool stroke.
 * Created in onDown, mutated in onMove, consumed in onUp.
 */
export interface StrokeState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Snapshot of image before stroke began (for previewing line/rect/etc.) */
  snapshot: ImageData | null;
  /** For move tool: the offset being dragged */
  moveOffsetX: number;
  moveOffsetY: number;
  /** Whether a stroke is actively occurring */
  active: boolean;
}

export function createStrokeState(): StrokeState {
  return {
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    snapshot: null,
    moveOffsetX: 0,
    moveOffsetY: 0,
    active: false,
  };
}

// ---------------------------------------------------------------------------
// Shift-constraint helpers
// ---------------------------------------------------------------------------

/**
 * Snap the endpoint to the nearest 45° angle increment from the start point.
 * Used by the line tool when shift is held.
 */
export function constrainAngle(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): [number, number] {
  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return [ex, ey];

  const angle = Math.atan2(dy, dx);
  const snap = Math.PI / 4; // 45°
  const snapped = Math.round(angle / snap) * snap;

  return [
    sx + Math.round(dist * Math.cos(snapped)),
    sy + Math.round(dist * Math.sin(snapped)),
  ];
}

/**
 * Constrain a rectangle to a square by using the larger dimension.
 * Used by rectangle/contour tools when shift is held.
 */
export function constrainSquare(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): [number, number] {
  const dx = ex - sx;
  const dy = ey - sy;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return [sx + size * Math.sign(dx || 1), sy + size * Math.sign(dy || 1)];
}

// ---------------------------------------------------------------------------
// Pencil tool
// ---------------------------------------------------------------------------

export function pencilDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.lastX = x;
  ss.lastY = y;
  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawBrush(imgData.data, tc.width, tc.height, x, y, tc.brushSize, tc.color);
  tc.ctx.putImageData(imgData, 0, 0);
}

export function pencilMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;
  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const points = bresenhamLine(ss.lastX, ss.lastY, x, y);
  for (const [px, py] of points) {
    drawBrush(
      imgData.data,
      tc.width,
      tc.height,
      px,
      py,
      tc.brushSize,
      tc.color,
    );
  }
  tc.ctx.putImageData(imgData, 0, 0);
  ss.lastX = x;
  ss.lastY = y;
}

export function pencilUp(
  _tc: ToolContext,
  _x: number,
  _y: number,
  ss: StrokeState,
): void {
  ss.active = false;
}

// ---------------------------------------------------------------------------
// Eraser tool
// ---------------------------------------------------------------------------

const TRANSPARENT: Color = { r: 0, g: 0, b: 0, a: 0 };

export function eraserDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.lastX = x;
  ss.lastY = y;
  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawBrush(imgData.data, tc.width, tc.height, x, y, tc.brushSize, TRANSPARENT);
  tc.ctx.putImageData(imgData, 0, 0);
}

export function eraserMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;
  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const points = bresenhamLine(ss.lastX, ss.lastY, x, y);
  for (const [px, py] of points) {
    drawBrush(
      imgData.data,
      tc.width,
      tc.height,
      px,
      py,
      tc.brushSize,
      TRANSPARENT,
    );
  }
  tc.ctx.putImageData(imgData, 0, 0);
  ss.lastX = x;
  ss.lastY = y;
}

export function eraserUp(
  _tc: ToolContext,
  _x: number,
  _y: number,
  ss: StrokeState,
): void {
  ss.active = false;
}

// ---------------------------------------------------------------------------
// Selection tool
// ---------------------------------------------------------------------------

/**
 * Extended stroke state for the selection tool.
 * Stored in a module-level variable so it persists across stroke cycles.
 */
export type ResizeHandle =
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
  /** The pixel data that has been "lifted" from the canvas */
  floatingPixels: ImageData | null;
  /** Current position of the floating selection */
  floatingX: number;
  floatingY: number;
  /** Current display width/height (may differ from floatingPixels dimensions during resize) */
  displayWidth: number;
  displayHeight: number;
  /** The original area that was cleared when lifting */
  sourceRect: { x: number; y: number; width: number; height: number } | null;
  /** Whether we are currently dragging the floating selection vs drawing a new selection */
  draggingFloating: boolean;
  /** Whether we are currently resizing the floating selection */
  resizingHandle: ResizeHandle;
  /** Starting point for resize operation */
  resizeStartX: number;
  resizeStartY: number;
  /** Bounds at the start of resize */
  resizeStartBounds: { x: number; y: number; w: number; h: number };
  /** Snapshot before any modification (for undo) */
  canvasSnapshot: ImageData | null;
  /** The drag offset from the pointer to the floating top-left */
  dragOffsetX: number;
  dragOffsetY: number;
  /** Whether the floating selection has been committed already */
  committed: boolean;
}

let selectionState: SelectionState = {
  floatingPixels: null,
  floatingX: 0,
  floatingY: 0,
  displayWidth: 0,
  displayHeight: 0,
  sourceRect: null,
  draggingFloating: false,
  resizingHandle: null,
  resizeStartX: 0,
  resizeStartY: 0,
  resizeStartBounds: { x: 0, y: 0, w: 0, h: 0 },
  canvasSnapshot: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  committed: false,
};

export function getSelectionState(): SelectionState {
  return selectionState;
}

export function resetSelectionState(): void {
  selectionState = {
    floatingPixels: null,
    floatingX: 0,
    floatingY: 0,
    displayWidth: 0,
    displayHeight: 0,
    sourceRect: null,
    draggingFloating: false,
    resizingHandle: null,
    resizeStartX: 0,
    resizeStartY: 0,
    resizeStartBounds: { x: 0, y: 0, w: 0, h: 0 },
    canvasSnapshot: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    committed: false,
  };
}

/** Get the scaled floating selection as an ImageData at display dimensions. */
function getScaledFloating(): ImageData | null {
  const ss = selectionState;
  if (!ss.floatingPixels) return null;

  const dw = Math.max(1, Math.round(ss.displayWidth));
  const dh = Math.max(1, Math.round(ss.displayHeight));

  // If no resize needed, return original
  if (dw === ss.floatingPixels.width && dh === ss.floatingPixels.height) {
    return ss.floatingPixels;
  }

  // Nearest-neighbor scale using offscreen canvas
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = ss.floatingPixels.width;
  srcCanvas.height = ss.floatingPixels.height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.putImageData(ss.floatingPixels, 0, 0);

  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = dw;
  dstCanvas.height = dh;
  const dstCtx = dstCanvas.getContext("2d")!;
  dstCtx.imageSmoothingEnabled = false;
  dstCtx.drawImage(srcCanvas, 0, 0, dw, dh);

  return dstCtx.getImageData(0, 0, dw, dh);
}

/** Commit the floating selection onto the main canvas. */
export function commitFloatingSelection(tc: ToolContext): void {
  const ss = selectionState;
  if (!ss.floatingPixels) return;

  const scaled = getScaledFloating();
  if (!scaled) return;

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const fx = Math.round(ss.floatingX);
  const fy = Math.round(ss.floatingY);

  for (let py = 0; py < scaled.height; py++) {
    for (let px = 0; px < scaled.width; px++) {
      const si = (py * scaled.width + px) * 4;
      const a = scaled.data[si + 3];
      if (a === 0) continue;
      const tx = fx + px;
      const ty = fy + py;
      if (tx < 0 || ty < 0 || tx >= tc.width || ty >= tc.height) continue;
      const di = (ty * tc.width + tx) * 4;
      imgData.data[di] = scaled.data[si];
      imgData.data[di + 1] = scaled.data[si + 1];
      imgData.data[di + 2] = scaled.data[si + 2];
      imgData.data[di + 3] = scaled.data[si + 3];
    }
  }

  tc.ctx.putImageData(imgData, 0, 0);
  ss.committed = true;
}

/** Check if a point is inside the floating selection bounds */
function isInsideFloating(x: number, y: number): boolean {
  const ss = selectionState;
  if (!ss.floatingPixels) return false;
  const dw = ss.displayWidth;
  const dh = ss.displayHeight;
  return (
    x >= ss.floatingX &&
    y >= ss.floatingY &&
    x < ss.floatingX + dw &&
    y < ss.floatingY + dh
  );
}

/** Detect which resize handle (if any) is under the given point. */
const HANDLE_SIZE = 2; // pixels in canvas space

export function hitTestResizeHandle(x: number, y: number): ResizeHandle {
  const ss = selectionState;
  if (!ss.floatingPixels) return null;

  const fx = ss.floatingX;
  const fy = ss.floatingY;
  const dw = ss.displayWidth;
  const dh = ss.displayHeight;
  const hs = HANDLE_SIZE;

  // Corners first (higher priority)
  if (Math.abs(x - fx) <= hs && Math.abs(y - fy) <= hs) return "nw";
  if (Math.abs(x - (fx + dw)) <= hs && Math.abs(y - fy) <= hs) return "ne";
  if (Math.abs(x - fx) <= hs && Math.abs(y - (fy + dh)) <= hs) return "sw";
  if (Math.abs(x - (fx + dw)) <= hs && Math.abs(y - (fy + dh)) <= hs)
    return "se";

  // Edges
  if (Math.abs(y - fy) <= hs && x > fx + hs && x < fx + dw - hs) return "n";
  if (Math.abs(y - (fy + dh)) <= hs && x > fx + hs && x < fx + dw - hs)
    return "s";
  if (Math.abs(x - fx) <= hs && y > fy + hs && y < fy + dh - hs) return "w";
  if (Math.abs(x - (fx + dw)) <= hs && y > fy + hs && y < fy + dh - hs)
    return "e";

  return null;
}

/** Get cursor CSS name for a resize handle */
export function getResizeHandleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    default:
      return "";
  }
}

/** Draw the floating selection (scaled) on the overlay canvas with resize handles */
export function drawFloatingOnOverlay(tc: ToolContext): void {
  const ss = selectionState;
  if (!ss.floatingPixels) return;

  const dw = Math.max(1, Math.round(ss.displayWidth));
  const dh = Math.max(1, Math.round(ss.displayHeight));
  const fx = Math.round(ss.floatingX);
  const fy = Math.round(ss.floatingY);

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  // Draw scaled floating pixels
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = ss.floatingPixels.width;
  srcCanvas.height = ss.floatingPixels.height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.putImageData(ss.floatingPixels, 0, 0);

  tc.overlayCtx.imageSmoothingEnabled = false;
  tc.overlayCtx.drawImage(srcCanvas, fx, fy, dw, dh);

  // NOTE: Marching ants border and resize handles are drawn by the
  // screen-resolution selection canvas in ImageCanvas.tsx for crisp rendering.
}

export function selectionDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;

  if (selectionState.floatingPixels) {
    // Check for resize handle first
    const handle = hitTestResizeHandle(x, y);
    if (handle) {
      selectionState.resizingHandle = handle;
      selectionState.resizeStartX = x;
      selectionState.resizeStartY = y;
      selectionState.resizeStartBounds = {
        x: selectionState.floatingX,
        y: selectionState.floatingY,
        w: selectionState.displayWidth,
        h: selectionState.displayHeight,
      };
      selectionState.canvasSnapshot = tc.ctx.getImageData(
        0,
        0,
        tc.width,
        tc.height,
      );
      return;
    }

    // Click inside floating selection — start dragging
    if (isInsideFloating(x, y)) {
      selectionState.draggingFloating = true;
      selectionState.dragOffsetX = x - selectionState.floatingX;
      selectionState.dragOffsetY = y - selectionState.floatingY;
      selectionState.canvasSnapshot = tc.ctx.getImageData(
        0,
        0,
        tc.width,
        tc.height,
      );
      return;
    }

    // Click outside — commit floating selection
    commitFloatingSelection(tc);
    resetSelectionState();
  }

  // Start drawing a new selection rectangle
  ss.startX = x;
  ss.startY = y;
  selectionState.draggingFloating = false;
  selectionState.resizingHandle = null;
}

export function selectionMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  if (!ss.active) return null;

  // Resizing the floating selection
  if (selectionState.resizingHandle && selectionState.floatingPixels) {
    const dx = x - selectionState.resizeStartX;
    const dy = y - selectionState.resizeStartY;
    const b = selectionState.resizeStartBounds;
    const handle = selectionState.resizingHandle;

    let nx = b.x,
      ny = b.y,
      nw = b.w,
      nh = b.h;

    if (handle.includes("w")) {
      nx = b.x + dx;
      nw = b.w - dx;
    }
    if (handle.includes("e")) {
      nw = b.w + dx;
    }
    if (handle.includes("n")) {
      ny = b.y + dy;
      nh = b.h - dy;
    }
    if (handle.includes("s")) {
      nh = b.h + dy;
    }

    // Shift-constrain: preserve original aspect ratio on corner handles
    if (
      tc.shiftKey &&
      selectionState.floatingPixels &&
      (handle === "nw" ||
        handle === "ne" ||
        handle === "sw" ||
        handle === "se")
    ) {
      const ar =
        selectionState.floatingPixels.width /
        selectionState.floatingPixels.height;
      if (nw / ar > nh) {
        nh = Math.round(nw / ar);
      } else {
        nw = Math.round(nh * ar);
      }
      if (handle.includes("n")) {
        ny = b.y + b.h - nh;
      }
      if (handle.includes("w")) {
        nx = b.x + b.w - nw;
      }
    }

    // Enforce minimum size
    if (nw < 1) {
      nw = 1;
      if (handle.includes("w")) nx = b.x + b.w - 1;
    }
    if (nh < 1) {
      nh = 1;
      if (handle.includes("n")) ny = b.y + b.h - 1;
    }

    selectionState.floatingX = nx;
    selectionState.floatingY = ny;
    selectionState.displayWidth = nw;
    selectionState.displayHeight = nh;

    if (selectionState.canvasSnapshot) {
      tc.ctx.putImageData(selectionState.canvasSnapshot, 0, 0);
    }

    drawFloatingOnOverlay(tc);

    return { x: nx, y: ny, width: nw, height: nh };
  }

  // Dragging the floating selection
  if (selectionState.draggingFloating && selectionState.floatingPixels) {
    selectionState.floatingX = x - selectionState.dragOffsetX;
    selectionState.floatingY = y - selectionState.dragOffsetY;

    if (selectionState.canvasSnapshot) {
      tc.ctx.putImageData(selectionState.canvasSnapshot, 0, 0);
    }

    drawFloatingOnOverlay(tc);

    return {
      x: selectionState.floatingX,
      y: selectionState.floatingY,
      width: selectionState.displayWidth,
      height: selectionState.displayHeight,
    };
  }

  // Drawing a new selection rectangle
  // NOTE: marching ants drawn by screen-resolution canvas in ImageCanvas.tsx
  const minX = Math.min(ss.startX, x);
  const minY = Math.min(ss.startY, y);
  const maxX = Math.max(ss.startX, x);
  const maxY = Math.max(ss.startY, y);
  const selW = maxX - minX;
  const selH = maxY - minY;

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  return { x: minX, y: minY, width: selW, height: selH };
}

export function selectionUp(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  if (!ss.active) return null;
  ss.active = false;

  // Finished resizing
  if (selectionState.resizingHandle && selectionState.floatingPixels) {
    selectionState.resizingHandle = null;
    if (selectionState.canvasSnapshot) {
      tc.ctx.putImageData(selectionState.canvasSnapshot, 0, 0);
    }
    drawFloatingOnOverlay(tc);
    return {
      x: selectionState.floatingX,
      y: selectionState.floatingY,
      width: selectionState.displayWidth,
      height: selectionState.displayHeight,
    };
  }

  // Finished dragging floating selection
  if (selectionState.draggingFloating && selectionState.floatingPixels) {
    selectionState.draggingFloating = false;
    if (selectionState.canvasSnapshot) {
      tc.ctx.putImageData(selectionState.canvasSnapshot, 0, 0);
    }
    drawFloatingOnOverlay(tc);
    return {
      x: selectionState.floatingX,
      y: selectionState.floatingY,
      width: selectionState.displayWidth,
      height: selectionState.displayHeight,
    };
  }

  // Finished drawing a new selection rectangle
  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const minX = Math.min(ss.startX, x);
  const minY = Math.min(ss.startY, y);
  const maxX = Math.max(ss.startX, x);
  const maxY = Math.max(ss.startY, y);
  const selW = maxX - minX;
  const selH = maxY - minY;

  if (selW < 1 || selH < 1) return null;

  // "Lift" the selected pixels into a floating selection
  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const floatingPixels = new ImageData(selW, selH);

  for (let py = 0; py < selH; py++) {
    for (let px = 0; px < selW; px++) {
      const sx = minX + px;
      const sy = minY + py;
      if (sx < 0 || sy < 0 || sx >= tc.width || sy >= tc.height) continue;
      const si = (sy * tc.width + sx) * 4;
      const di = (py * selW + px) * 4;
      floatingPixels.data[di] = imgData.data[si];
      floatingPixels.data[di + 1] = imgData.data[si + 1];
      floatingPixels.data[di + 2] = imgData.data[si + 2];
      floatingPixels.data[di + 3] = imgData.data[si + 3];

      // Clear the source area
      imgData.data[si] = 0;
      imgData.data[si + 1] = 0;
      imgData.data[si + 2] = 0;
      imgData.data[si + 3] = 0;
    }
  }

  tc.ctx.putImageData(imgData, 0, 0);

  selectionState.floatingPixels = floatingPixels;
  selectionState.floatingX = minX;
  selectionState.floatingY = minY;
  selectionState.displayWidth = selW;
  selectionState.displayHeight = selH;
  selectionState.sourceRect = { x: minX, y: minY, width: selW, height: selH };
  selectionState.committed = false;

  // Show floating on overlay with handles
  drawFloatingOnOverlay(tc);

  return { x: minX, y: minY, width: selW, height: selH };
}

/** Copy the current floating selection to a buffer (for Ctrl+C). Returns a scaled copy or null. */
export function copySelectionPixels(): ImageData | null {
  const scaled = getScaledFloating();
  if (!scaled) return null;
  return new ImageData(
    new Uint8ClampedArray(scaled.data),
    scaled.width,
    scaled.height,
  );
}

/** Paste pixels as a new floating selection (for Ctrl+V). */
export function pasteSelectionPixels(
  tc: ToolContext,
  pixels: ImageData,
): { x: number; y: number; width: number; height: number } {
  // If there's an existing floating selection, commit it first
  if (selectionState.floatingPixels) {
    commitFloatingSelection(tc);
    resetSelectionState();
  }

  selectionState.floatingPixels = new ImageData(
    new Uint8ClampedArray(pixels.data),
    pixels.width,
    pixels.height,
  );
  selectionState.floatingX = 0;
  selectionState.floatingY = 0;
  selectionState.displayWidth = pixels.width;
  selectionState.displayHeight = pixels.height;
  selectionState.committed = false;

  // Show on overlay with handles
  drawFloatingOnOverlay(tc);

  return { x: 0, y: 0, width: pixels.width, height: pixels.height };
}

// ---------------------------------------------------------------------------
// Move tool
// ---------------------------------------------------------------------------

export function moveDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.startX = x;
  ss.startY = y;
  ss.moveOffsetX = 0;
  ss.moveOffsetY = 0;
  ss.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function moveMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active || !ss.snapshot) return;
  const dx = x - ss.startX;
  const dy = y - ss.startY;
  ss.moveOffsetX = dx;
  ss.moveOffsetY = dy;

  // Clear and redraw offset
  tc.ctx.clearRect(0, 0, tc.width, tc.height);
  tc.ctx.putImageData(ss.snapshot, dx, dy);
}

export function moveUp(
  _tc: ToolContext,
  _x: number,
  _y: number,
  ss: StrokeState,
): void {
  ss.active = false;
  ss.snapshot = null;
}

// ---------------------------------------------------------------------------
// Paint bucket (flood fill)
// ---------------------------------------------------------------------------

export function paintBucketDown(tc: ToolContext, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= tc.width || y >= tc.height) return;

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const data = imgData.data;
  const w = tc.width;
  const h = tc.height;

  const targetColor = getPixel(data, w, h, x, y);
  const fillColor = tc.color;

  if (colorsEqual(targetColor, fillColor)) return;

  // Scanline flood fill
  const stack: [number, number][] = [[x, y]];
  const visited = new Uint8Array(w * h);

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const idx = cy * w + cx;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const c = getPixel(data, w, h, cx, cy);
    if (!colorsEqual(c, targetColor)) continue;

    setPixel(data, w, h, cx, cy, fillColor);

    stack.push([cx + 1, cy]);
    stack.push([cx - 1, cy]);
    stack.push([cx, cy + 1]);
    stack.push([cx, cy - 1]);
  }

  tc.ctx.putImageData(imgData, 0, 0);
}

// ---------------------------------------------------------------------------
// Line tool
// ---------------------------------------------------------------------------

export function lineDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.startX = x;
  ss.startY = y;
  ss.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function lineMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active || !ss.snapshot) return;

  let endX = x,
    endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainAngle(ss.startX, ss.startY, x, y);
  }

  // Restore snapshot, then draw preview line on overlay
  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImgData = tc.overlayCtx.createImageData(tc.width, tc.height);

  const points = bresenhamLine(ss.startX, ss.startY, endX, endY);
  for (const [px, py] of points) {
    drawBrush(
      overlayImgData.data,
      tc.width,
      tc.height,
      px,
      py,
      tc.brushSize,
      tc.color,
    );
  }
  tc.overlayCtx.putImageData(overlayImgData, 0, 0);
}

export function lineUp(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;

  let endX = x,
    endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainAngle(ss.startX, ss.startY, x, y);
  }

  // Commit line to the main canvas
  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const points = bresenhamLine(ss.startX, ss.startY, endX, endY);
  for (const [px, py] of points) {
    drawBrush(
      imgData.data,
      tc.width,
      tc.height,
      px,
      py,
      tc.brushSize,
      tc.color,
    );
  }
  tc.ctx.putImageData(imgData, 0, 0);

  ss.active = false;
  ss.snapshot = null;
}

// ---------------------------------------------------------------------------
// Rectangle tool (filled)
// ---------------------------------------------------------------------------

function drawFilledRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Color,
): void {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      setPixel(data, width, height, px, py, color);
    }
  }
}

export function rectangleDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.startX = x;
  ss.startY = y;
  ss.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function rectangleMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;

  let endX = x,
    endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(ss.startX, ss.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImgData = tc.overlayCtx.createImageData(tc.width, tc.height);
  drawFilledRect(
    overlayImgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    endX,
    endY,
    tc.color,
  );
  tc.overlayCtx.putImageData(overlayImgData, 0, 0);
}

export function rectangleUp(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;

  let endX = x,
    endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(ss.startX, ss.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawFilledRect(
    imgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    endX,
    endY,
    tc.color,
  );
  tc.ctx.putImageData(imgData, 0, 0);

  ss.active = false;
  ss.snapshot = null;
}

// ---------------------------------------------------------------------------
// Contour tool (outline rectangle)
// ---------------------------------------------------------------------------

function drawRectOutline(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Color,
): void {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  // Top and bottom edges
  for (let px = minX; px <= maxX; px++) {
    setPixel(data, width, height, px, minY, color);
    setPixel(data, width, height, px, maxY, color);
  }
  // Left and right edges
  for (let py = minY; py <= maxY; py++) {
    setPixel(data, width, height, minX, py, color);
    setPixel(data, width, height, maxX, py, color);
  }
}

export function contourDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.startX = x;
  ss.startY = y;
  ss.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function contourMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;

  let endX = x,
    endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(ss.startX, ss.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImgData = tc.overlayCtx.createImageData(tc.width, tc.height);
  drawRectOutline(
    overlayImgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    endX,
    endY,
    tc.color,
  );
  tc.overlayCtx.putImageData(overlayImgData, 0, 0);
}

export function contourUp(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;

  let endX = x,
    endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(ss.startX, ss.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawRectOutline(
    imgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    endX,
    endY,
    tc.color,
  );
  tc.ctx.putImageData(imgData, 0, 0);

  ss.active = false;
  ss.snapshot = null;
}

// ---------------------------------------------------------------------------
// Blur tool
// ---------------------------------------------------------------------------

export function blurDown(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.lastX = x;
  ss.lastY = y;
  applyBlurAt(tc, x, y);
}

export function blurMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  if (!ss.active) return;
  const points = bresenhamLine(ss.lastX, ss.lastY, x, y);
  for (const [px, py] of points) {
    applyBlurAt(tc, px, py);
  }
  ss.lastX = x;
  ss.lastY = y;
}

export function blurUp(
  _tc: ToolContext,
  _x: number,
  _y: number,
  ss: StrokeState,
): void {
  ss.active = false;
}

function applyBlurAt(tc: ToolContext, cx: number, cy: number): void {
  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const data = imgData.data;
  const w = tc.width;
  const h = tc.height;

  const brushRadius = Math.max(1, Math.floor(tc.brushSize / 2));
  const kernelRadius = Math.max(1, tc.blurSize);
  const intensity = Math.max(1, Math.min(100, tc.blurIntensity)) / 100;

  // Copy original data for reading
  const orig = new Uint8ClampedArray(data);

  for (let dy = -brushRadius; dy <= brushRadius; dy++) {
    for (let dx = -brushRadius; dx <= brushRadius; dx++) {
      if (dx * dx + dy * dy > brushRadius * brushRadius) continue;

      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;

      // Variable-size box blur kernel around (px, py)
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;
      for (let ky = -kernelRadius; ky <= kernelRadius; ky++) {
        for (let kx = -kernelRadius; kx <= kernelRadius; kx++) {
          const nx = px + kx;
          const ny = py + ky;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = (ny * w + nx) * 4;
          r += orig[ni];
          g += orig[ni + 1];
          b += orig[ni + 2];
          a += orig[ni + 3];
          count++;
        }
      }

      const i = (py * w + px) * 4;
      // Blend between original and blurred by intensity
      data[i] = Math.round(orig[i] * (1 - intensity) + (r / count) * intensity);
      data[i + 1] = Math.round(
        orig[i + 1] * (1 - intensity) + (g / count) * intensity,
      );
      data[i + 2] = Math.round(
        orig[i + 2] * (1 - intensity) + (b / count) * intensity,
      );
      data[i + 3] = Math.round(
        orig[i + 3] * (1 - intensity) + (a / count) * intensity,
      );
    }
  }

  tc.ctx.putImageData(imgData, 0, 0);
}

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

export function dispatchDown(
  tool: ImageEditorTool,
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): null {
  switch (tool) {
    case "selection":
      selectionDown(tc, x, y, ss);
      return null;
    case "pencil":
      pencilDown(tc, x, y, ss);
      return null;
    case "eraser":
      eraserDown(tc, x, y, ss);
      return null;
    case "move":
      moveDown(tc, x, y, ss);
      return null;
    case "paint-bucket":
      paintBucketDown(tc, x, y);
      return null;
    case "line":
      lineDown(tc, x, y, ss);
      return null;
    case "rectangle":
      rectangleDown(tc, x, y, ss);
      return null;
    case "contour":
      contourDown(tc, x, y, ss);
      return null;
    case "blur":
      blurDown(tc, x, y, ss);
      return null;
  }
}

export function dispatchMove(
  tool: ImageEditorTool,
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  switch (tool) {
    case "selection":
      return selectionMove(tc, x, y, ss);
    case "pencil":
      pencilMove(tc, x, y, ss);
      return null;
    case "eraser":
      eraserMove(tc, x, y, ss);
      return null;
    case "move":
      moveMove(tc, x, y, ss);
      return null;
    case "line":
      lineMove(tc, x, y, ss);
      return null;
    case "rectangle":
      rectangleMove(tc, x, y, ss);
      return null;
    case "contour":
      contourMove(tc, x, y, ss);
      return null;
    case "blur":
      blurMove(tc, x, y, ss);
      return null;
    default:
      return null;
  }
}

export function dispatchUp(
  tool: ImageEditorTool,
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  switch (tool) {
    case "selection":
      return selectionUp(tc, x, y, ss);
    case "pencil":
      pencilUp(tc, x, y, ss);
      return null;
    case "eraser":
      eraserUp(tc, x, y, ss);
      return null;
    case "move":
      moveUp(tc, x, y, ss);
      return null;
    case "paint-bucket":
      return null;
    case "line":
      lineUp(tc, x, y, ss);
      return null;
    case "rectangle":
      rectangleUp(tc, x, y, ss);
      return null;
    case "contour":
      contourUp(tc, x, y, ss);
      return null;
    case "blur":
      blurUp(tc, x, y, ss);
      return null;
    default:
      return null;
  }
}
