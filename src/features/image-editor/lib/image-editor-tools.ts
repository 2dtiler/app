/**
 * Drawing tool implementations for the pixel-art image editor.
 *
 * Public API remains stable from this module; larger tool families live in
 * focused peer modules and are re-exported here.
 */

import type { Color, ImageEditorTool } from "@/features/image-editor/types";
import type {
  StrokeState,
  ToolContext,
} from "@/features/image-editor/types/image-editor-internals";
import { bresenhamLine, getPixel, setPixel } from "./image-editor-tools-shared";
import {
  selectionDown,
  selectionMove,
  selectionUp,
} from "./image-editor-selection-tools";
import { cropDown, cropMove, cropUp } from "./image-editor-crop-tools";
import {
  contourDown,
  contourMove,
  contourUp,
  lineDown,
  lineMove,
  lineUp,
  rectangleDown,
  rectangleMove,
  rectangleUp,
} from "./image-editor-shape-tools";

export {
  bresenhamLine,
  constrainAngle,
  constrainSquare,
  createStrokeState,
  drawBrush,
  drawSquareBrush,
  getPixel,
  setPixel,
} from "./image-editor-tools-shared";
export {
  commitFloatingSelection,
  copySelectionPixels,
  drawFloatingOnOverlay,
  getResizeHandleCursor,
  getSelectionState,
  hitTestResizeHandle,
  pasteSelectionPixels,
  resetSelectionState,
  selectionDown,
  selectionMove,
  selectionUp,
} from "./image-editor-selection-tools";
export {
  cropDown,
  cropMove,
  cropUp,
  getCropState,
  hitTestCropHandle,
  resetCropState,
} from "./image-editor-crop-tools";
export {
  contourDown,
  contourMove,
  contourUp,
  lineDown,
  lineMove,
  lineUp,
  rectangleDown,
  rectangleMove,
  rectangleUp,
} from "./image-editor-shape-tools";

function clearPixel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;

  const index = (y * width + x) * 4;
  data[index] = 0;
  data[index + 1] = 0;
  data[index + 2] = 0;
  data[index + 3] = 0;
}

function clearSquareBrush(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
): void {
  if (size <= 1) {
    clearPixel(data, width, height, cx, cy);
    return;
  }

  const radius = Math.floor(size / 2);
  for (let py = cy - radius; py <= cy + radius; py += 1) {
    for (let px = cx - radius; px <= cx + radius; px += 1) {
      clearPixel(data, width, height, px, py);
    }
  }
}

function colorsEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function drawSquareBrushOnce(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  color: Color,
  visited: Set<number>,
): void {
  if (size <= 1) {
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return;

    const index = cy * width + cx;
    if (visited.has(index)) return;
    visited.add(index);
    setPixel(data, width, height, cx, cy, color);
    return;
  }

  const radius = Math.floor(size / 2);
  for (let py = cy - radius; py <= cy + radius; py += 1) {
    for (let px = cx - radius; px <= cx + radius; px += 1) {
      if (px < 0 || py < 0 || px >= width || py >= height) continue;

      const index = py * width + px;
      if (visited.has(index)) continue;
      visited.add(index);
      setPixel(data, width, height, px, py, color);
    }
  }
}

function renderPencilStroke(tc: ToolContext, strokeState: StrokeState): void {
  if (!strokeState.snapshot || strokeState.path.length === 0) return;

  const imageData = tc.ctx.createImageData(tc.width, tc.height);
  imageData.data.set(strokeState.snapshot.data);

  const visited = new Set<number>();

  for (let pathIndex = 0; pathIndex < strokeState.path.length; pathIndex += 1) {
    const [startX, startY] = strokeState.path[pathIndex]!;
    const [endX, endY] =
      strokeState.path[pathIndex + 1] ?? strokeState.path[pathIndex]!;
    const points = bresenhamLine(startX, startY, endX, endY);

    for (const [px, py] of points) {
      drawSquareBrushOnce(
        imageData.data,
        tc.width,
        tc.height,
        px,
        py,
        tc.brushSize,
        tc.color,
        visited,
      );
    }
  }

  tc.ctx.putImageData(imageData, 0, 0);
}

export function pencilDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;
  strokeState.startX = x;
  strokeState.startY = y;
  strokeState.lastX = x;
  strokeState.lastY = y;
  strokeState.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  strokeState.path = [[x, y]];
  renderPencilStroke(tc, strokeState);
}

export function pencilMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active || !strokeState.snapshot) return;

  if (strokeState.lastX !== x || strokeState.lastY !== y) {
    strokeState.path.push([x, y]);
  }
  renderPencilStroke(tc, strokeState);
  strokeState.lastX = x;
  strokeState.lastY = y;
}

export function pencilUp(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (strokeState.active && strokeState.snapshot) {
    if (strokeState.lastX !== x || strokeState.lastY !== y) {
      strokeState.path.push([x, y]);
      strokeState.lastX = x;
      strokeState.lastY = y;
    }
    renderPencilStroke(tc, strokeState);
  }

  strokeState.active = false;
  strokeState.snapshot = null;
  strokeState.path = [];
}

export function eraserDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;
  strokeState.lastX = x;
  strokeState.lastY = y;

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  clearSquareBrush(imageData.data, tc.width, tc.height, x, y, tc.brushSize);
  tc.ctx.putImageData(imageData, 0, 0);
}

export function eraserMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active) return;

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const points = bresenhamLine(strokeState.lastX, strokeState.lastY, x, y);
  for (const [px, py] of points) {
    clearSquareBrush(imageData.data, tc.width, tc.height, px, py, tc.brushSize);
  }
  tc.ctx.putImageData(imageData, 0, 0);

  strokeState.lastX = x;
  strokeState.lastY = y;
}

export function eraserUp(
  _tc: ToolContext,
  _x: number,
  _y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = false;
}

export function moveDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;
  strokeState.startX = x;
  strokeState.startY = y;
  strokeState.moveOffsetX = 0;
  strokeState.moveOffsetY = 0;
  strokeState.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function moveMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active || !strokeState.snapshot) return;

  const dx = x - strokeState.startX;
  const dy = y - strokeState.startY;
  strokeState.moveOffsetX = dx;
  strokeState.moveOffsetY = dy;

  tc.ctx.clearRect(0, 0, tc.width, tc.height);
  tc.ctx.putImageData(strokeState.snapshot, dx, dy);
}

export function moveUp(
  _tc: ToolContext,
  _x: number,
  _y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = false;
  strokeState.snapshot = null;
}

export function paintBucketDown(tc: ToolContext, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= tc.width || y >= tc.height) return;

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const data = imageData.data;
  const targetColor = getPixel(data, tc.width, tc.height, x, y);
  const fillColor = tc.color;

  if (fillColor.a <= 0) return;
  if (fillColor.a >= 255 && colorsEqual(targetColor, fillColor)) return;

  const stack: [number, number][] = [[x, y]];
  const visited = new Uint8Array(tc.width * tc.height);

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= tc.width || cy >= tc.height) continue;

    const index = cy * tc.width + cx;
    if (visited[index]) continue;
    visited[index] = 1;

    const currentColor = getPixel(data, tc.width, tc.height, cx, cy);
    if (!colorsEqual(currentColor, targetColor)) continue;

    setPixel(data, tc.width, tc.height, cx, cy, fillColor);
    stack.push([cx + 1, cy]);
    stack.push([cx - 1, cy]);
    stack.push([cx, cy + 1]);
    stack.push([cx, cy - 1]);
  }

  tc.ctx.putImageData(imageData, 0, 0);
}

export function blurDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;
  strokeState.lastX = x;
  strokeState.lastY = y;
  applyBlurAt(tc, x, y);
}

export function blurMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active) return;

  const points = bresenhamLine(strokeState.lastX, strokeState.lastY, x, y);
  for (const [px, py] of points) {
    applyBlurAt(tc, px, py);
  }

  strokeState.lastX = x;
  strokeState.lastY = y;
}

export function blurUp(
  _tc: ToolContext,
  _x: number,
  _y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = false;
}

function applyBlurAt(tc: ToolContext, cx: number, cy: number): void {
  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const data = imageData.data;
  const brushRadius = Math.max(0, tc.blurSize - 1);
  const kernelRadius = Math.max(1, tc.blurSize);
  const intensity = Math.max(1, Math.min(100, tc.blurIntensity)) / 100;
  const original = new Uint8ClampedArray(data);

  for (let dy = -brushRadius; dy <= brushRadius; dy += 1) {
    for (let dx = -brushRadius; dx <= brushRadius; dx += 1) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= tc.width || py >= tc.height) continue;

      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;

      for (let ky = -kernelRadius; ky <= kernelRadius; ky += 1) {
        for (let kx = -kernelRadius; kx <= kernelRadius; kx += 1) {
          const nx = px + kx;
          const ny = py + ky;
          if (nx < 0 || ny < 0 || nx >= tc.width || ny >= tc.height) continue;

          const neighborIndex = (ny * tc.width + nx) * 4;
          red += original[neighborIndex];
          green += original[neighborIndex + 1];
          blue += original[neighborIndex + 2];
          alpha += original[neighborIndex + 3];
          count += 1;
        }
      }

      const index = (py * tc.width + px) * 4;
      data[index] = Math.round(
        original[index] * (1 - intensity) + (red / count) * intensity,
      );
      data[index + 1] = Math.round(
        original[index + 1] * (1 - intensity) + (green / count) * intensity,
      );
      data[index + 2] = Math.round(
        original[index + 2] * (1 - intensity) + (blue / count) * intensity,
      );
      data[index + 3] = Math.round(
        original[index + 3] * (1 - intensity) + (alpha / count) * intensity,
      );
    }
  }

  tc.ctx.putImageData(imageData, 0, 0);
}

export function dispatchDown(
  tool: ImageEditorTool,
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): null {
  switch (tool) {
    case "selection":
      selectionDown(tc, x, y, strokeState);
      return null;
    case "crop":
      cropDown(tc, x, y, strokeState);
      return null;
    case "pencil":
      pencilDown(tc, x, y, strokeState);
      return null;
    case "eraser":
      eraserDown(tc, x, y, strokeState);
      return null;
    case "move":
      moveDown(tc, x, y, strokeState);
      return null;
    case "paint-bucket":
      paintBucketDown(tc, x, y);
      return null;
    case "line":
      lineDown(tc, x, y, strokeState);
      return null;
    case "rectangle":
      rectangleDown(tc, x, y, strokeState);
      return null;
    case "contour":
      contourDown(tc, x, y, strokeState);
      return null;
    case "blur":
      blurDown(tc, x, y, strokeState);
      return null;
  }
}

export function dispatchMove(
  tool: ImageEditorTool,
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  switch (tool) {
    case "selection":
      return selectionMove(tc, x, y, strokeState);
    case "crop":
      return cropMove(tc, x, y, strokeState);
    case "pencil":
      pencilMove(tc, x, y, strokeState);
      return null;
    case "eraser":
      eraserMove(tc, x, y, strokeState);
      return null;
    case "move":
      moveMove(tc, x, y, strokeState);
      return null;
    case "line":
      lineMove(tc, x, y, strokeState);
      return null;
    case "rectangle":
      rectangleMove(tc, x, y, strokeState);
      return null;
    case "contour":
      contourMove(tc, x, y, strokeState);
      return null;
    case "blur":
      blurMove(tc, x, y, strokeState);
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
  strokeState: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  switch (tool) {
    case "selection":
      return selectionUp(tc, x, y, strokeState);
    case "crop":
      return cropUp(tc, x, y, strokeState);
    case "pencil":
      pencilUp(tc, x, y, strokeState);
      return null;
    case "eraser":
      eraserUp(tc, x, y, strokeState);
      return null;
    case "move":
      moveUp(tc, x, y, strokeState);
      return null;
    case "paint-bucket":
      return null;
    case "line":
      lineUp(tc, x, y, strokeState);
      return null;
    case "rectangle":
      rectangleUp(tc, x, y, strokeState);
      return null;
    case "contour":
      contourUp(tc, x, y, strokeState);
      return null;
    case "blur":
      blurUp(tc, x, y, strokeState);
      return null;
    default:
      return null;
  }
}
