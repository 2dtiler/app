import type {
  ImageCanvasResizeAction,
  ImageCanvasResizeHandle,
  ImageCanvasResizePreview,
} from "@/features/image-editor/types/image-editor-ui";

export function clampCanvasDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1024, Math.max(1, Math.round(value)));
}

export function getResizeDeltaInPixels(delta: number, zoom: number): number {
  if (zoom <= 0) {
    return 0;
  }

  if (delta >= 0) {
    return Math.floor(delta / zoom);
  }

  return Math.ceil(delta / zoom);
}

export function beginCanvasResizeAction(
  handle: Exclude<ImageCanvasResizeHandle, null>,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): ImageCanvasResizeAction {
  return {
    handle,
    startClientX: clientX,
    startClientY: clientY,
    origWidth: width,
    origHeight: height,
    nextWidth: width,
    nextHeight: height,
  };
}

export function updateCanvasResizeAction(
  action: ImageCanvasResizeAction,
  clientX: number,
  clientY: number,
  zoom: number,
): ImageCanvasResizePreview {
  const deltaX = getResizeDeltaInPixels(clientX - action.startClientX, zoom);
  const deltaY = getResizeDeltaInPixels(clientY - action.startClientY, zoom);
  const nextWidth = clampCanvasDimension(
    action.origWidth +
      (action.handle === "e" || action.handle === "se" ? deltaX : 0),
    action.origWidth,
  );
  const nextHeight = clampCanvasDimension(
    action.origHeight +
      (action.handle === "s" || action.handle === "se" ? deltaY : 0),
    action.origHeight,
  );

  action.nextWidth = nextWidth;
  action.nextHeight = nextHeight;

  return {
    width: nextWidth,
    height: nextHeight,
  };
}

export function getCanvasResizeCommit(
  action: ImageCanvasResizeAction | null,
  commit: boolean,
): ImageCanvasResizePreview | null {
  if (!action || !commit) {
    return null;
  }

  if (
    action.nextWidth === action.origWidth &&
    action.nextHeight === action.origHeight
  ) {
    return null;
  }

  return {
    width: action.nextWidth,
    height: action.nextHeight,
  };
}
