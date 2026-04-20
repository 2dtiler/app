import type { Color } from "@/types/image-editor";
import type { StrokeState, ToolContext } from "@/types/image-editor-internals";
import {
  bresenhamLine,
  constrainAngle,
  constrainSquare,
  drawBrush,
  setPixel,
} from "./image-editor-tools-shared";

export function lineDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;
  strokeState.startX = x;
  strokeState.startY = y;
  strokeState.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function lineMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active || !strokeState.snapshot) return;

  let endX = x;
  let endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainAngle(strokeState.startX, strokeState.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImageData = tc.overlayCtx.createImageData(tc.width, tc.height);

  const points = bresenhamLine(strokeState.startX, strokeState.startY, endX, endY);
  for (const [px, py] of points) {
    drawBrush(
      overlayImageData.data,
      tc.width,
      tc.height,
      px,
      py,
      tc.brushSize,
      tc.color,
    );
  }

  tc.overlayCtx.putImageData(overlayImageData, 0, 0);
}

export function lineUp(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active) return;

  let endX = x;
  let endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainAngle(strokeState.startX, strokeState.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const points = bresenhamLine(strokeState.startX, strokeState.startY, endX, endY);
  for (const [px, py] of points) {
    drawBrush(
      imageData.data,
      tc.width,
      tc.height,
      px,
      py,
      tc.brushSize,
      tc.color,
    );
  }

  tc.ctx.putImageData(imageData, 0, 0);
  strokeState.active = false;
  strokeState.snapshot = null;
}

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

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      setPixel(data, width, height, px, py, color);
    }
  }
}

export function rectangleDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;
  strokeState.startX = x;
  strokeState.startY = y;
  strokeState.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function rectangleMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active) return;

  let endX = x;
  let endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(strokeState.startX, strokeState.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImageData = tc.overlayCtx.createImageData(tc.width, tc.height);
  drawFilledRect(
    overlayImageData.data,
    tc.width,
    tc.height,
    strokeState.startX,
    strokeState.startY,
    endX,
    endY,
    tc.color,
  );
  tc.overlayCtx.putImageData(overlayImageData, 0, 0);
}

export function rectangleUp(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active) return;

  let endX = x;
  let endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(strokeState.startX, strokeState.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawFilledRect(
    imageData.data,
    tc.width,
    tc.height,
    strokeState.startX,
    strokeState.startY,
    endX,
    endY,
    tc.color,
  );
  tc.ctx.putImageData(imageData, 0, 0);

  strokeState.active = false;
  strokeState.snapshot = null;
}

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

  for (let px = minX; px <= maxX; px += 1) {
    setPixel(data, width, height, px, minY, color);
    setPixel(data, width, height, px, maxY, color);
  }
  for (let py = minY; py <= maxY; py += 1) {
    setPixel(data, width, height, minX, py, color);
    setPixel(data, width, height, maxX, py, color);
  }
}

export function contourDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;
  strokeState.startX = x;
  strokeState.startY = y;
  strokeState.snapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
}

export function contourMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active) return;

  let endX = x;
  let endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(strokeState.startX, strokeState.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
  const overlayImageData = tc.overlayCtx.createImageData(tc.width, tc.height);
  drawRectOutline(
    overlayImageData.data,
    tc.width,
    tc.height,
    strokeState.startX,
    strokeState.startY,
    endX,
    endY,
    tc.color,
  );
  tc.overlayCtx.putImageData(overlayImageData, 0, 0);
}

export function contourUp(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  if (!strokeState.active) return;

  let endX = x;
  let endY = y;
  if (tc.shiftKey) {
    [endX, endY] = constrainSquare(strokeState.startX, strokeState.startY, x, y);
  }

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  drawRectOutline(
    imageData.data,
    tc.width,
    tc.height,
    strokeState.startX,
    strokeState.startY,
    endX,
    endY,
    tc.color,
  );
  tc.ctx.putImageData(imageData, 0, 0);

  strokeState.active = false;
  strokeState.snapshot = null;
}