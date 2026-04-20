import type {
  ImageEditorResizeHandle as ResizeHandle,
  SelectionState,
  StrokeState,
  ToolContext,
} from "@/types/image-editor-internals";

function createSelectionState(): SelectionState {
  return {
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

let selectionState: SelectionState = createSelectionState();

export function getSelectionState(): SelectionState {
  return selectionState;
}

export function resetSelectionState(): void {
  selectionState = createSelectionState();
}

function getScaledFloating(): ImageData | null {
  const state = selectionState;
  if (!state.floatingPixels) return null;

  const displayWidth = Math.max(1, Math.round(state.displayWidth));
  const displayHeight = Math.max(1, Math.round(state.displayHeight));

  if (
    displayWidth === state.floatingPixels.width &&
    displayHeight === state.floatingPixels.height
  ) {
    return state.floatingPixels;
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = state.floatingPixels.width;
  sourceCanvas.height = state.floatingPixels.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return null;
  sourceContext.putImageData(state.floatingPixels, 0, 0);

  const destinationCanvas = document.createElement("canvas");
  destinationCanvas.width = displayWidth;
  destinationCanvas.height = displayHeight;
  const destinationContext = destinationCanvas.getContext("2d");
  if (!destinationContext) return null;
  destinationContext.imageSmoothingEnabled = false;
  destinationContext.drawImage(sourceCanvas, 0, 0, displayWidth, displayHeight);

  return destinationContext.getImageData(0, 0, displayWidth, displayHeight);
}

export function commitFloatingSelection(tc: ToolContext): void {
  const state = selectionState;
  if (!state.floatingPixels) return;

  const scaled = getScaledFloating();
  if (!scaled) return;

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const floatingX = Math.round(state.floatingX);
  const floatingY = Math.round(state.floatingY);

  for (let py = 0; py < scaled.height; py += 1) {
    for (let px = 0; px < scaled.width; px += 1) {
      const sourceIndex = (py * scaled.width + px) * 4;
      const alpha = scaled.data[sourceIndex + 3];
      if (alpha === 0) continue;

      const targetX = floatingX + px;
      const targetY = floatingY + py;
      if (
        targetX < 0 ||
        targetY < 0 ||
        targetX >= tc.width ||
        targetY >= tc.height
      ) {
        continue;
      }

      const destinationIndex = (targetY * tc.width + targetX) * 4;
      imageData.data[destinationIndex] = scaled.data[sourceIndex];
      imageData.data[destinationIndex + 1] = scaled.data[sourceIndex + 1];
      imageData.data[destinationIndex + 2] = scaled.data[sourceIndex + 2];
      imageData.data[destinationIndex + 3] = scaled.data[sourceIndex + 3];
    }
  }

  tc.ctx.putImageData(imageData, 0, 0);
  state.committed = true;
}

function isInsideFloating(x: number, y: number): boolean {
  const state = selectionState;
  if (!state.floatingPixels) return false;

  return (
    x >= state.floatingX &&
    y >= state.floatingY &&
    x < state.floatingX + state.displayWidth &&
    y < state.floatingY + state.displayHeight
  );
}

const HANDLE_SIZE = 2;

export function hitTestResizeHandle(x: number, y: number): ResizeHandle {
  const state = selectionState;
  if (!state.floatingPixels) return null;

  const floatingX = state.floatingX;
  const floatingY = state.floatingY;
  const displayWidth = state.displayWidth;
  const displayHeight = state.displayHeight;
  const handleSize = HANDLE_SIZE;

  if (Math.abs(x - floatingX) <= handleSize && Math.abs(y - floatingY) <= handleSize) {
    return "nw";
  }
  if (
    Math.abs(x - (floatingX + displayWidth)) <= handleSize &&
    Math.abs(y - floatingY) <= handleSize
  ) {
    return "ne";
  }
  if (
    Math.abs(x - floatingX) <= handleSize &&
    Math.abs(y - (floatingY + displayHeight)) <= handleSize
  ) {
    return "sw";
  }
  if (
    Math.abs(x - (floatingX + displayWidth)) <= handleSize &&
    Math.abs(y - (floatingY + displayHeight)) <= handleSize
  ) {
    return "se";
  }

  if (
    Math.abs(y - floatingY) <= handleSize &&
    x > floatingX + handleSize &&
    x < floatingX + displayWidth - handleSize
  ) {
    return "n";
  }
  if (
    Math.abs(y - (floatingY + displayHeight)) <= handleSize &&
    x > floatingX + handleSize &&
    x < floatingX + displayWidth - handleSize
  ) {
    return "s";
  }
  if (
    Math.abs(x - floatingX) <= handleSize &&
    y > floatingY + handleSize &&
    y < floatingY + displayHeight - handleSize
  ) {
    return "w";
  }
  if (
    Math.abs(x - (floatingX + displayWidth)) <= handleSize &&
    y > floatingY + handleSize &&
    y < floatingY + displayHeight - handleSize
  ) {
    return "e";
  }

  return null;
}

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

export function drawFloatingOnOverlay(tc: ToolContext): void {
  const state = selectionState;
  if (!state.floatingPixels) return;

  const displayWidth = Math.max(1, Math.round(state.displayWidth));
  const displayHeight = Math.max(1, Math.round(state.displayHeight));
  const floatingX = Math.round(state.floatingX);
  const floatingY = Math.round(state.floatingY);

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = state.floatingPixels.width;
  sourceCanvas.height = state.floatingPixels.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return;
  sourceContext.putImageData(state.floatingPixels, 0, 0);

  tc.overlayCtx.imageSmoothingEnabled = false;
  tc.overlayCtx.drawImage(sourceCanvas, floatingX, floatingY, displayWidth, displayHeight);
}

export function selectionDown(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): void {
  strokeState.active = true;

  if (selectionState.floatingPixels) {
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
      selectionState.canvasSnapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
      return;
    }

    if (isInsideFloating(x, y)) {
      selectionState.draggingFloating = true;
      selectionState.dragOffsetX = x - selectionState.floatingX;
      selectionState.dragOffsetY = y - selectionState.floatingY;
      selectionState.canvasSnapshot = tc.ctx.getImageData(0, 0, tc.width, tc.height);
      return;
    }

    commitFloatingSelection(tc);
    resetSelectionState();
  }

  strokeState.startX = x;
  strokeState.startY = y;
  selectionState.draggingFloating = false;
  selectionState.resizingHandle = null;
}

export function selectionMove(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  if (!strokeState.active) return null;

  if (selectionState.resizingHandle && selectionState.floatingPixels) {
    const dx = x - selectionState.resizeStartX;
    const dy = y - selectionState.resizeStartY;
    const bounds = selectionState.resizeStartBounds;
    const handle = selectionState.resizingHandle;

    let nextX = bounds.x;
    let nextY = bounds.y;
    let nextWidth = bounds.w;
    let nextHeight = bounds.h;

    if (handle.includes("w")) {
      nextX = bounds.x + dx;
      nextWidth = bounds.w - dx;
    }
    if (handle.includes("e")) {
      nextWidth = bounds.w + dx;
    }
    if (handle.includes("n")) {
      nextY = bounds.y + dy;
      nextHeight = bounds.h - dy;
    }
    if (handle.includes("s")) {
      nextHeight = bounds.h + dy;
    }

    if (
      tc.shiftKey &&
      (handle === "nw" || handle === "ne" || handle === "sw" || handle === "se")
    ) {
      const aspectRatio =
        selectionState.floatingPixels.width / selectionState.floatingPixels.height;
      if (nextWidth / aspectRatio > nextHeight) {
        nextHeight = Math.round(nextWidth / aspectRatio);
      } else {
        nextWidth = Math.round(nextHeight * aspectRatio);
      }
      if (handle.includes("n")) {
        nextY = bounds.y + bounds.h - nextHeight;
      }
      if (handle.includes("w")) {
        nextX = bounds.x + bounds.w - nextWidth;
      }
    }

    if (nextWidth < 1) {
      nextWidth = 1;
      if (handle.includes("w")) {
        nextX = bounds.x + bounds.w - 1;
      }
    }
    if (nextHeight < 1) {
      nextHeight = 1;
      if (handle.includes("n")) {
        nextY = bounds.y + bounds.h - 1;
      }
    }

    selectionState.floatingX = nextX;
    selectionState.floatingY = nextY;
    selectionState.displayWidth = nextWidth;
    selectionState.displayHeight = nextHeight;

    if (selectionState.canvasSnapshot) {
      tc.ctx.putImageData(selectionState.canvasSnapshot, 0, 0);
    }
    drawFloatingOnOverlay(tc);

    return {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    };
  }

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

  const minX = Math.min(strokeState.startX, x);
  const minY = Math.min(strokeState.startY, y);
  const maxX = Math.max(strokeState.startX, x);
  const maxY = Math.max(strokeState.startY, y);

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function selectionUp(
  tc: ToolContext,
  x: number,
  y: number,
  strokeState: StrokeState,
): { x: number; y: number; width: number; height: number } | null {
  if (!strokeState.active) return null;
  strokeState.active = false;

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

  tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);

  const minX = Math.min(strokeState.startX, x);
  const minY = Math.min(strokeState.startY, y);
  const maxX = Math.max(strokeState.startX, x);
  const maxY = Math.max(strokeState.startY, y);
  const selectionWidth = maxX - minX;
  const selectionHeight = maxY - minY;

  if (selectionWidth < 1 || selectionHeight < 1) return null;

  const imageData = tc.ctx.getImageData(0, 0, tc.width, tc.height);
  const floatingPixels = new ImageData(selectionWidth, selectionHeight);

  for (let py = 0; py < selectionHeight; py += 1) {
    for (let px = 0; px < selectionWidth; px += 1) {
      const sourceX = minX + px;
      const sourceY = minY + py;
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= tc.width ||
        sourceY >= tc.height
      ) {
        continue;
      }

      const sourceIndex = (sourceY * tc.width + sourceX) * 4;
      const destinationIndex = (py * selectionWidth + px) * 4;
      floatingPixels.data[destinationIndex] = imageData.data[sourceIndex];
      floatingPixels.data[destinationIndex + 1] = imageData.data[sourceIndex + 1];
      floatingPixels.data[destinationIndex + 2] = imageData.data[sourceIndex + 2];
      floatingPixels.data[destinationIndex + 3] = imageData.data[sourceIndex + 3];

      imageData.data[sourceIndex] = 0;
      imageData.data[sourceIndex + 1] = 0;
      imageData.data[sourceIndex + 2] = 0;
      imageData.data[sourceIndex + 3] = 0;
    }
  }

  tc.ctx.putImageData(imageData, 0, 0);

  selectionState.floatingPixels = floatingPixels;
  selectionState.floatingX = minX;
  selectionState.floatingY = minY;
  selectionState.displayWidth = selectionWidth;
  selectionState.displayHeight = selectionHeight;
  selectionState.sourceRect = {
    x: minX,
    y: minY,
    width: selectionWidth,
    height: selectionHeight,
  };
  selectionState.committed = false;

  drawFloatingOnOverlay(tc);

  return {
    x: minX,
    y: minY,
    width: selectionWidth,
    height: selectionHeight,
  };
}

export function copySelectionPixels(): ImageData | null {
  const scaled = getScaledFloating();
  if (!scaled) return null;

  return new ImageData(
    new Uint8ClampedArray(scaled.data),
    scaled.width,
    scaled.height,
  );
}

export function pasteSelectionPixels(
  tc: ToolContext,
  pixels: ImageData,
  fitTo?: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
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

  let displayWidth = pixels.width;
  let displayHeight = pixels.height;
  if (fitTo && (pixels.width > fitTo.width || pixels.height > fitTo.height)) {
    const scale = Math.min(
      fitTo.width / pixels.width,
      fitTo.height / pixels.height,
    );
    displayWidth = Math.max(1, Math.round(pixels.width * scale));
    displayHeight = Math.max(1, Math.round(pixels.height * scale));
  }

  selectionState.displayWidth = displayWidth;
  selectionState.displayHeight = displayHeight;
  selectionState.committed = false;

  drawFloatingOnOverlay(tc);

  return { x: 0, y: 0, width: displayWidth, height: displayHeight };
}