import type { ImageLayer } from "@/types";
import type { ResizeHandle } from "@/types/map-canvas";

const MIN_IMAGE_LAYER_SIZE = 4;
const HANDLE_ORDER: ResizeHandle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

const OPPOSITE_HANDLE: Record<ResizeHandle, ResizeHandle> = {
  nw: "se",
  n: "s",
  ne: "sw",
  w: "e",
  e: "w",
  sw: "ne",
  s: "n",
  se: "nw",
};

function getRotationMatrix(layer: Pick<ImageLayer, "rotation" | "flipX" | "flipY">) {
  const rotation = ((layer.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const scaleX = layer.flipX ? -1 : 1;
  const scaleY = layer.flipY ? -1 : 1;

  return {
    a: cos * scaleX,
    b: sin * scaleX,
    c: -sin * scaleY,
    d: cos * scaleY,
  };
}

function transformVector(
  x: number,
  y: number,
  layer: Pick<ImageLayer, "rotation" | "flipX" | "flipY">,
) {
  const { a, b, c, d } = getRotationMatrix(layer);
  return {
    x: a * x + c * y,
    y: b * x + d * y,
  };
}

function inverseTransformVector(
  x: number,
  y: number,
  layer: Pick<ImageLayer, "rotation" | "flipX" | "flipY">,
) {
  const { a, b, c, d } = getRotationMatrix(layer);
  return {
    x: a * x + b * y,
    y: c * x + d * y,
  };
}

export function getImageLayerCenter(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height">,
) {
  return {
    x: layer.x + layer.width / 2,
    y: layer.y + layer.height / 2,
  };
}

function getLocalHandlePoint(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height">,
  handle: ResizeHandle,
) {
  const center = getImageLayerCenter(layer);
  const left = layer.x;
  const top = layer.y;
  const right = layer.x + layer.width;
  const bottom = layer.y + layer.height;

  switch (handle) {
    case "nw":
      return { x: left, y: top };
    case "n":
      return { x: center.x, y: top };
    case "ne":
      return { x: right, y: top };
    case "w":
      return { x: left, y: center.y };
    case "e":
      return { x: right, y: center.y };
    case "sw":
      return { x: left, y: bottom };
    case "s":
      return { x: center.x, y: bottom };
    case "se":
      return { x: right, y: bottom };
  }
}

export function transformImageLayerPoint(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
  point: { x: number; y: number },
) {
  const center = getImageLayerCenter(layer);
  const vector = transformVector(point.x - center.x, point.y - center.y, layer);
  return {
    x: center.x + vector.x,
    y: center.y + vector.y,
  };
}

export function getImageLayerPolygon(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
) {
  return [
    transformImageLayerPoint(layer, { x: layer.x, y: layer.y }),
    transformImageLayerPoint(layer, {
      x: layer.x + layer.width,
      y: layer.y,
    }),
    transformImageLayerPoint(layer, {
      x: layer.x + layer.width,
      y: layer.y + layer.height,
    }),
    transformImageLayerPoint(layer, {
      x: layer.x,
      y: layer.y + layer.height,
    }),
  ];
}

export function getImageLayerHandlePosition(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
  handle: ResizeHandle,
) {
  return transformImageLayerPoint(layer, getLocalHandlePoint(layer, handle));
}

export function getImageLayerHandlePositions(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
): [ResizeHandle, number, number][] {
  return HANDLE_ORDER.map((handle) => {
    const point = getImageLayerHandlePosition(layer, handle);
    return [handle, point.x, point.y];
  });
}

export function pointInImageLayer(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
  point: { x: number; y: number },
) {
  const polygon = getImageLayerPolygon(layer);
  let sign = 0;

  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const cross =
      (next.x - current.x) * (point.y - current.y) -
      (next.y - current.y) * (point.x - current.x);

    if (Math.abs(cross) < 0.001) continue;

    const nextSign = cross > 0 ? 1 : -1;
    if (sign === 0) {
      sign = nextSign;
      continue;
    }
    if (sign !== nextSign) {
      return false;
    }
  }

  return true;
}

export function getImageLayerResizeCursor(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
  handle: ResizeHandle,
) {
  const center = getImageLayerCenter(layer);
  const point = getImageLayerHandlePosition(layer, handle);
  const angle =
    ((Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI +
      360) %
    180;

  if (handle === "e" || handle === "w") {
    return angle < 45 || angle >= 135 ? "ew-resize" : "ns-resize";
  }

  if (handle === "n" || handle === "s") {
    return angle < 45 || angle >= 135 ? "ns-resize" : "ew-resize";
  }

  return angle < 90 ? "nwse-resize" : "nesw-resize";
}

export function resizeImageLayerFromHandle(
  layer: Pick<ImageLayer, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
  handle: ResizeHandle,
  pointer: { x: number; y: number },
  shiftKey: boolean,
) {
  const oppositeHandle = OPPOSITE_HANDLE[handle];
  const anchor = getImageLayerHandlePosition(layer, oppositeHandle);
  const center = {
    x: (anchor.x + pointer.x) / 2,
    y: (anchor.y + pointer.y) / 2,
  };
  const localDelta = inverseTransformVector(
    pointer.x - anchor.x,
    pointer.y - anchor.y,
    layer,
  );
  const anchorLocal = {
    x: center.x - localDelta.x / 2,
    y: center.y - localDelta.y / 2,
  };
  const pointerLocal = {
    x: center.x + localDelta.x / 2,
    y: center.y + localDelta.y / 2,
  };
  const originalCenter = getImageLayerCenter(layer);

  const movesLeft = handle === "nw" || handle === "w" || handle === "sw";
  const movesTop = handle === "nw" || handle === "n" || handle === "ne";
  const movesRight = handle === "ne" || handle === "e" || handle === "se";
  const movesBottom = handle === "sw" || handle === "s" || handle === "se";
  const isCorner = (movesLeft || movesRight) && (movesTop || movesBottom);

  let left = originalCenter.x - layer.width / 2;
  let top = originalCenter.y - layer.height / 2;
  let right = originalCenter.x + layer.width / 2;
  let bottom = originalCenter.y + layer.height / 2;

  if (isCorner) {
    left = movesLeft ? pointerLocal.x : anchorLocal.x;
    top = movesTop ? pointerLocal.y : anchorLocal.y;
    right = movesRight ? pointerLocal.x : anchorLocal.x;
    bottom = movesBottom ? pointerLocal.y : anchorLocal.y;
  } else if (handle === "e" || handle === "w") {
    left = handle === "w" ? pointerLocal.x : anchorLocal.x;
    right = handle === "e" ? pointerLocal.x : anchorLocal.x;
    top = originalCenter.y - layer.height / 2;
    bottom = originalCenter.y + layer.height / 2;
  } else {
    left = originalCenter.x - layer.width / 2;
    right = originalCenter.x + layer.width / 2;
    top = handle === "n" ? pointerLocal.y : anchorLocal.y;
    bottom = handle === "s" ? pointerLocal.y : anchorLocal.y;
  }

  let width = right - left;
  let height = bottom - top;

  if (width < MIN_IMAGE_LAYER_SIZE) {
    if (movesLeft) left = right - MIN_IMAGE_LAYER_SIZE;
    else right = left + MIN_IMAGE_LAYER_SIZE;
    width = right - left;
  }
  if (height < MIN_IMAGE_LAYER_SIZE) {
    if (movesTop) top = bottom - MIN_IMAGE_LAYER_SIZE;
    else bottom = top + MIN_IMAGE_LAYER_SIZE;
    height = bottom - top;
  }

  if (shiftKey && isCorner && layer.width > 0 && layer.height > 0) {
    const aspect = layer.width / layer.height;
    if (Math.abs(width - layer.width) / layer.width >= Math.abs(height - layer.height) / layer.height) {
      height = width / aspect;
    } else {
      width = height * aspect;
    }
    if (movesLeft) left = right - width;
    else right = left + width;
    if (movesTop) top = bottom - height;
    else bottom = top + height;
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(MIN_IMAGE_LAYER_SIZE, Math.round(right - left)),
    height: Math.max(MIN_IMAGE_LAYER_SIZE, Math.round(bottom - top)),
  };
}