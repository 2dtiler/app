import type { MapObject } from "@/types";
import type { ResizeHandle } from "@/types/map-canvas";

const BOX_OBJECT_TYPES = new Set(["rectangle", "ellipse", "text"]);

export function isBoxObjectType(object: MapObject): boolean {
  return BOX_OBJECT_TYPES.has(object.type);
}

export function getObjectDisplayBounds(
  object: MapObject,
  zoom: number,
  overrides?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  },
) {
  return {
    x: (overrides?.x ?? object.x) * zoom,
    y: (overrides?.y ?? object.y) * zoom,
    width: (overrides?.width ?? object.width) * zoom,
    height: (overrides?.height ?? object.height) * zoom,
  };
}

export function getBoxObjectHandlePositions(
  object: MapObject,
  zoom: number,
  overrides?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  },
): [ResizeHandle, number, number][] {
  const bounds = getObjectDisplayBounds(object, zoom, overrides);
  const { x, y, width, height } = bounds;
  return [
    ["nw", x, y],
    ["n", x + width / 2, y],
    ["ne", x + width, y],
    ["w", x, y + height / 2],
    ["e", x + width, y + height / 2],
    ["sw", x, y + height],
    ["s", x + width / 2, y + height],
    ["se", x + width, y + height],
  ];
}

export function pointHitsObjectBody(
  object: MapObject,
  x: number,
  y: number,
  zoom: number,
): boolean {
  const ox = object.x * zoom;
  const oy = object.y * zoom;
  const ow = object.width * zoom;
  const oh = object.height * zoom;

  if (isBoxObjectType(object)) {
    return x >= ox && x <= ox + ow && y >= oy && y <= oy + oh;
  }

  if (object.type === "point") {
    const ps = 8 * zoom;
    return Math.abs(x - ox) <= ps && Math.abs(y - oy) <= ps;
  }

  if (object.type === "polygon" && object.points.length >= 3) {
    const minX = Math.min(...object.points.map((point) => point.x)) * zoom + ox;
    const maxX = Math.max(...object.points.map((point) => point.x)) * zoom + ox;
    const minY = Math.min(...object.points.map((point) => point.y)) * zoom + oy;
    const maxY = Math.max(...object.points.map((point) => point.y)) * zoom + oy;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  return false;
}
