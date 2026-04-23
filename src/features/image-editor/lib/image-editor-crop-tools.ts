import type {
  ImageEditorResizeHandle as ResizeHandle,
  StrokeState,
  ToolContext,
} from "@/types/image-editor/image-editor-internals";
import type {
  CropRect,
  CropState,
} from "@/types/image-editor/image-editor-tools";

function createCropState(): CropState {
  return {
    rect: null,
    dragging: false,
    resizingHandle: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    resizeStartX: 0,
    resizeStartY: 0,
    resizeStartRect: null,
  };
}

let cropState: CropState = createCropState();

export function getCropState(): CropState {
  return cropState;
}

export function resetCropState(): void {
  cropState = createCropState();
}

function clampCropRect(tc: ToolContext, rect: CropRect): CropRect {
  const x = Math.max(0, Math.min(tc.width - 1, rect.x));
  const y = Math.max(0, Math.min(tc.height - 1, rect.y));
  const width = Math.max(1, Math.min(rect.width, tc.width - x));
  const height = Math.max(1, Math.min(rect.height, tc.height - y));
  return { x, y, width, height };
}

function isInsideCropRect(x: number, y: number, rect: CropRect): boolean {
  return (
    x >= rect.x &&
    y >= rect.y &&
    x < rect.x + rect.width &&
    y < rect.y + rect.height
  );
}

const HANDLE_SIZE = 2;

export function hitTestCropHandle(x: number, y: number): ResizeHandle {
  const rect = cropState.rect;
  if (!rect) return null;

  const handleSize = HANDLE_SIZE;
  const rectX = rect.x;
  const rectY = rect.y;
  const rectWidth = rect.width;
  const rectHeight = rect.height;

  if (Math.abs(x - rectX) <= handleSize && Math.abs(y - rectY) <= handleSize) {
    return "nw";
  }
  if (
    Math.abs(x - (rectX + rectWidth)) <= handleSize &&
    Math.abs(y - rectY) <= handleSize
  ) {
    return "ne";
  }
  if (
    Math.abs(x - rectX) <= handleSize &&
    Math.abs(y - (rectY + rectHeight)) <= handleSize
  ) {
    return "sw";
  }
  if (
    Math.abs(x - (rectX + rectWidth)) <= handleSize &&
    Math.abs(y - (rectY + rectHeight)) <= handleSize
  ) {
    return "se";
  }
  if (
    Math.abs(y - rectY) <= handleSize &&
    x > rectX + handleSize &&
    x < rectX + rectWidth - handleSize
  ) {
    return "n";
  }
  if (
    Math.abs(y - (rectY + rectHeight)) <= handleSize &&
    x > rectX + handleSize &&
    x < rectX + rectWidth - handleSize
  ) {
    return "s";
  }
  if (
    Math.abs(x - rectX) <= handleSize &&
    y > rectY + handleSize &&
    y < rectY + rectHeight - handleSize
  ) {
    return "w";
  }
  if (
    Math.abs(x - (rectX + rectWidth)) <= handleSize &&
    y > rectY + handleSize &&
    y < rectY + rectHeight - handleSize
  ) {
    return "e";
  }

  return null;
}

export function cropDown(
  _tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;

  if (cropState.rect) {
    const handle = hitTestCropHandle(x, y);
    if (handle) {
      cropState.resizingHandle = handle;
      cropState.resizeStartX = x;
      cropState.resizeStartY = y;
      cropState.resizeStartRect = { ...cropState.rect };
      return;
    }

    if (isInsideCropRect(x, y, cropState.rect)) {
      cropState.dragging = true;
      cropState.dragOffsetX = x - cropState.rect.x;
      cropState.dragOffsetY = y - cropState.rect.y;
      return;
    }
  }

  strokeState.startX = x;
  strokeState.startY = y;
  cropState.rect = null;
  cropState.dragging = false;
  cropState.resizingHandle = null;
}

export function cropMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): CropRect | null {
  if (!strokeState.active) return cropState.rect;

  if (cropState.resizingHandle && cropState.resizeStartRect) {
    const handle = cropState.resizingHandle;
    const startRect = cropState.resizeStartRect;
    const dx = x - cropState.resizeStartX;
    const dy = y - cropState.resizeStartY;

    let nextX = startRect.x;
    let nextY = startRect.y;
    let nextWidth = startRect.width;
    let nextHeight = startRect.height;

    if (handle.includes("w")) {
      nextX = startRect.x + dx;
      nextWidth = startRect.width - dx;
    }
    if (handle.includes("e")) {
      nextWidth = startRect.width + dx;
    }
    if (handle.includes("n")) {
      nextY = startRect.y + dy;
      nextHeight = startRect.height - dy;
    }
    if (handle.includes("s")) {
      nextHeight = startRect.height + dy;
    }

    if (nextWidth < 1) {
      nextWidth = 1;
      if (handle.includes("w")) {
        nextX = startRect.x + startRect.width - 1;
      }
    }
    if (nextHeight < 1) {
      nextHeight = 1;
      if (handle.includes("n")) {
        nextY = startRect.y + startRect.height - 1;
      }
    }

    cropState.rect = clampCropRect(tc, {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    });
    return cropState.rect;
  }

  if (cropState.dragging && cropState.rect) {
    cropState.rect = clampCropRect(tc, {
      x: x - cropState.dragOffsetX,
      y: y - cropState.dragOffsetY,
      width: cropState.rect.width,
      height: cropState.rect.height,
    });
    return cropState.rect;
  }

  const minX = Math.min(strokeState.startX, x);
  const minY = Math.min(strokeState.startY, y);
  const maxX = Math.max(strokeState.startX, x);
  const maxY = Math.max(strokeState.startY, y);

  cropState.rect = clampCropRect(tc, {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  });

  return cropState.rect;
}

export function cropUp(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): CropRect | null {
  if (!strokeState.active) return cropState.rect;
  strokeState.active = false;

  const rect = cropMove(tc, x, y, {
    ...strokeState,
    active: true,
  });

  cropState.dragging = false;
  cropState.resizingHandle = null;
  cropState.resizeStartRect = null;

  if (!rect || rect.width < 1 || rect.height < 1) {
    cropState.rect = null;
    return null;
  }

  return rect;
}
