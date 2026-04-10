export const RESIZE_CURSORS: Record<string, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

export function computeResize(
  handle: string,
  origX: number,
  origY: number,
  origW: number,
  origH: number,
  deltaX: number,
  deltaY: number,
  shiftKey: boolean,
): { x: number; y: number; width: number; height: number } {
  let left = origX;
  let top = origY;
  let right = origX + origW;
  let bottom = origY + origH;

  const movesLeft = handle === "nw" || handle === "w" || handle === "sw";
  const movesTop = handle === "nw" || handle === "n" || handle === "ne";
  const movesRight = handle === "ne" || handle === "e" || handle === "se";
  const movesBottom = handle === "sw" || handle === "s" || handle === "se";

  if (movesLeft) left += deltaX;
  if (movesTop) top += deltaY;
  if (movesRight) right += deltaX;
  if (movesBottom) bottom += deltaY;

  let w = right - left;
  let h = bottom - top;

  const minSize = 4;
  if (w < minSize) {
    if (movesLeft) left = right - minSize;
    else right = left + minSize;
    w = right - left;
  }
  if (h < minSize) {
    if (movesTop) top = bottom - minSize;
    else bottom = top + minSize;
    h = bottom - top;
  }

  const isCorner = (movesLeft || movesRight) && (movesTop || movesBottom);
  if (shiftKey && isCorner && origW > 0 && origH > 0) {
    const aspect = origW / origH;
    if (Math.abs(w - origW) / origW >= Math.abs(h - origH) / origH) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
    if (movesLeft) left = right - w;
    else right = left + w;
    if (movesTop) top = bottom - h;
    else bottom = top + h;
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(minSize, Math.round(right - left)),
    height: Math.max(minSize, Math.round(bottom - top)),
  };
}
