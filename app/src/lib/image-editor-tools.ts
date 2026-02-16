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
// Eyedropper tool
// ---------------------------------------------------------------------------

export function eyedropperDown(
  tc: ToolContext,
  x: number,
  y: number,
): Color | null {
  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const c = getPixel(imgData.data, tc.width, tc.height, x, y);
  return c;
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

  // Restore snapshot, then draw preview line on overlay
  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImgData = tc.overlayCtx.createImageData(tc.width, tc.height);

  const points = bresenhamLine(ss.startX, ss.startY, x, y);
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

  // Commit line to the main canvas
  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const points = bresenhamLine(ss.startX, ss.startY, x, y);
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

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImgData = tc.overlayCtx.createImageData(tc.width, tc.height);
  drawFilledRect(
    overlayImgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    x,
    y,
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

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawFilledRect(
    imgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    x,
    y,
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

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImgData = tc.overlayCtx.createImageData(tc.width, tc.height);
  drawRectOutline(
    overlayImgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    x,
    y,
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

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imgData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawRectOutline(
    imgData.data,
    tc.width,
    tc.height,
    ss.startX,
    ss.startY,
    x,
    y,
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

  const radius = Math.max(1, Math.floor(tc.brushSize / 2));

  // Copy original data for reading
  const orig = new Uint8ClampedArray(data);

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;

      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;

      // 3x3 box blur kernel around (px, py)
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        count = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
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
      data[i] = Math.round(r / count);
      data[i + 1] = Math.round(g / count);
      data[i + 2] = Math.round(b / count);
      data[i + 3] = Math.round(a / count);
    }
  }

  tc.ctx.putImageData(imgData, 0, 0);
}

// ---------------------------------------------------------------------------
// Marquee tool
// ---------------------------------------------------------------------------

export function marqueeDown(
  _tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): void {
  ss.active = true;
  ss.startX = x;
  ss.startY = y;
}

export function marqueeMove(
  tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  if (!ss.active) return null;

  const minX = Math.min(ss.startX, x);
  const minY = Math.min(ss.startY, y);
  const maxX = Math.max(ss.startX, x);
  const maxY = Math.max(ss.startY, y);
  const selW = maxX - minX;
  const selH = maxY - minY;

  // Draw marching ants on overlay
  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  tc.overlayCtx.setLineDash([2, 2]);
  tc.overlayCtx.strokeStyle = "#000";
  tc.overlayCtx.lineWidth = 1;
  tc.overlayCtx.strokeRect(minX + 0.5, minY + 0.5, selW, selH);
  tc.overlayCtx.strokeStyle = "#fff";
  tc.overlayCtx.lineDashOffset = 2;
  tc.overlayCtx.strokeRect(minX + 0.5, minY + 0.5, selW, selH);
  tc.overlayCtx.setLineDash([]);
  tc.overlayCtx.lineDashOffset = 0;

  return { x: minX, y: minY, width: selW, height: selH };
}

export function marqueeUp(
  _tc: ToolContext,
  x: number,
  y: number,
  ss: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  if (!ss.active) return null;
  ss.active = false;

  const minX = Math.min(ss.startX, x);
  const minY = Math.min(ss.startY, y);
  const maxX = Math.max(ss.startX, x);
  const maxY = Math.max(ss.startY, y);

  const selW = maxX - minX;
  const selH = maxY - minY;

  if (selW < 1 || selH < 1) return null;

  return { x: minX, y: minY, width: selW, height: selH };
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
): Color | null {
  switch (tool) {
    case "pencil":
      pencilDown(tc, x, y, ss);
      return null;
    case "eraser":
      eraserDown(tc, x, y, ss);
      return null;
    case "eyedropper":
      return eyedropperDown(tc, x, y);
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
    case "marquee":
      marqueeDown(tc, x, y, ss);
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
    case "marquee":
      return marqueeMove(tc, x, y, ss);
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
    case "marquee":
      return marqueeUp(tc, x, y, ss);
    default:
      return null;
  }
}
