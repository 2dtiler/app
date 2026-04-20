import type { Color } from "@/types/image-editor";
import type { StrokeState } from "@/types/image-editor-internals";

/** Bresenham line: returns every pixel along (x0,y0)->(x1,y1). */
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

/** Blend a single pixel into an ImageData buffer using source-over alpha. */
export function setPixel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Color,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;

  const index = (y * width + x) * 4;
  if (color.a <= 0) return;

  if (color.a >= 255) {
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = 255;
    return;
  }

  const destinationRed = data[index]!;
  const destinationGreen = data[index + 1]!;
  const destinationBlue = data[index + 2]!;
  const destinationAlpha = data[index + 3]! / 255;
  const sourceAlpha = color.a / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  if (outputAlpha <= 0) {
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
    return;
  }

  const sourceWeight = sourceAlpha / outputAlpha;
  const destinationWeight =
    (destinationAlpha * (1 - sourceAlpha)) / outputAlpha;

  data[index] = Math.round(
    color.r * sourceWeight + destinationRed * destinationWeight,
  );
  data[index + 1] = Math.round(
    color.g * sourceWeight + destinationGreen * destinationWeight,
  );
  data[index + 2] = Math.round(
    color.b * sourceWeight + destinationBlue * destinationWeight,
  );
  data[index + 3] = Math.round(outputAlpha * 255);
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

  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    a: data[index + 3],
  };
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
  const radiusSquared = radius * radius;
  const startX = Math.floor(cx - radius + 0.5);
  const startY = Math.floor(cy - radius + 0.5);
  const endX = Math.ceil(cx + radius - 0.5);
  const endY = Math.ceil(cy + radius - 0.5);

  for (let py = startY; py <= endY; py += 1) {
    for (let px = startX; px <= endX; px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= radiusSquared) {
        setPixel(data, width, height, px, py, color);
      }
    }
  }
}

export function drawSquareBrush(
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

  const radius = Math.floor(size / 2);
  for (let py = cy - radius; py <= cy + radius; py += 1) {
    for (let px = cx - radius; px <= cx + radius; px += 1) {
      setPixel(data, width, height, px, py, color);
    }
  }
}

export function createStrokeState(): StrokeState {
  return {
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    snapshot: null,
    path: [],
    moveOffsetX: 0,
    moveOffsetY: 0,
    active: false,
  };
}

/**
 * Snap the endpoint to the nearest 45 degree angle increment from the start point.
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
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return [ex, ey];

  const angle = Math.atan2(dy, dx);
  const snap = Math.PI / 4;
  const snapped = Math.round(angle / snap) * snap;

  return [
    sx + Math.round(distance * Math.cos(snapped)),
    sy + Math.round(distance * Math.sin(snapped)),
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