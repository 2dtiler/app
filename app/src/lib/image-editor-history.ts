/**
 * Pixel-data undo/redo history for the image editor.
 *
 * travels (mutative) is great for JSON-serializable state, but ImageData
 * objects are binary and huge. This module keeps a separate per-frame
 * snapshot stack of full ImageData buffers.
 *
 * To save memory on large canvases, we store the raw Uint8ClampedArray
 * rather than full ImageData (which can't be structured-cloned cheaply).
 */

import type { FrameId } from "@/types/image-editor";

const MAX_SNAPSHOTS = 50;

interface FrameHistory {
  /** Undo stack (most recent at end) */
  undoStack: Uint8ClampedArray[];
  /** Redo stack (most recent at end) */
  redoStack: Uint8ClampedArray[];
  /** Canvas dimensions at time of snapshot */
  width: number;
  height: number;
}

const historyMap = new Map<FrameId, FrameHistory>();

function ensureHistory(
  frameId: FrameId,
  width: number,
  height: number,
): FrameHistory {
  let h = historyMap.get(frameId);
  if (!h) {
    h = { undoStack: [], redoStack: [], width, height };
    historyMap.set(frameId, h);
  }
  return h;
}

/**
 * Push a snapshot of the current pixel state *before* an operation.
 * Call this before the tool modifies the canvas.
 */
export function pushSnapshot(frameId: FrameId, imageData: ImageData): void {
  const h = ensureHistory(frameId, imageData.width, imageData.height);

  // Deep-copy the pixel buffer
  const copy = new Uint8ClampedArray(imageData.data);
  h.undoStack.push(copy);

  // Trim to max
  if (h.undoStack.length > MAX_SNAPSHOTS) {
    h.undoStack.shift();
  }

  // Any new edit invalidates the redo stack
  h.redoStack.length = 0;
}

/**
 * Undo: pops the most recent snapshot and returns it as ImageData.
 * Also pushes the *current* state onto the redo stack so we can redo later.
 *
 * @param currentImageData The canvas state *right now* (before undo).
 */
export function undo(
  frameId: FrameId,
  currentImageData: ImageData,
): ImageData | null {
  const h = historyMap.get(frameId);
  if (!h || h.undoStack.length === 0) return null;

  // Save current state to redo stack
  h.redoStack.push(new Uint8ClampedArray(currentImageData.data));

  const pixels = h.undoStack.pop()!;
  return new ImageData(new Uint8ClampedArray(pixels), h.width, h.height);
}

/**
 * Redo: pops the most recent redo snapshot.
 *
 * @param currentImageData The canvas state *right now* (before redo).
 */
export function redo(
  frameId: FrameId,
  currentImageData: ImageData,
): ImageData | null {
  const h = historyMap.get(frameId);
  if (!h || h.redoStack.length === 0) return null;

  // Save current state to undo stack
  h.undoStack.push(new Uint8ClampedArray(currentImageData.data));

  const pixels = h.redoStack.pop()!;
  return new ImageData(new Uint8ClampedArray(pixels), h.width, h.height);
}

/**
 * Check if undo is possible for a frame.
 */
export function canUndo(frameId: FrameId): boolean {
  const h = historyMap.get(frameId);
  return !!h && h.undoStack.length > 0;
}

/**
 * Check if redo is possible for a frame.
 */
export function canRedo(frameId: FrameId): boolean {
  const h = historyMap.get(frameId);
  return !!h && h.redoStack.length > 0;
}

/**
 * Clear history for a specific frame.
 */
export function clearFrameHistory(frameId: FrameId): void {
  historyMap.delete(frameId);
}

/**
 * Clear all history (when creating a new project).
 */
export function clearAllHistory(): void {
  historyMap.clear();
}
