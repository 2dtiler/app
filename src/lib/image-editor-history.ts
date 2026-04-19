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

const MAX_SNAPSHOTS = 50;
import type {
  FrameHistory,
  ImageEditorHistorySnapshot,
} from "@/types/image-editor-internals";

function createSnapshot(imageData: ImageData): ImageEditorHistorySnapshot {
  return {
    pixels: new Uint8ClampedArray(imageData.data),
    width: imageData.width,
    height: imageData.height,
  };
}

/**
 * Key is either a bare FrameId (legacy single-layer) or
 * "${frameId}:${layerId}" for multi-layer editing.
 */
const historyMap = new Map<string, FrameHistory>();

function ensureHistory(key: string): FrameHistory {
  let h = historyMap.get(key);
  if (!h) {
    h = {
      undoStack: [],
      redoStack: [],
    };
    historyMap.set(key, h);
  }
  return h;
}

/**
 * Push a snapshot of the current pixel state *before* an operation.
 * @param key  Either a bare FrameId or "${frameId}:${layerId}" for multi-layer.
 */
export function pushSnapshot(key: string, imageData: ImageData): void {
  const h = ensureHistory(key);

  h.undoStack.push(createSnapshot(imageData));

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
  key: string,
  currentImageData: ImageData,
): ImageData | null {
  const h = historyMap.get(key);
  if (!h || h.undoStack.length === 0) return null;

  // Save current state to redo stack
  h.redoStack.push(createSnapshot(currentImageData));

  const snapshot = h.undoStack.pop()!;
  return new ImageData(
    new Uint8ClampedArray(snapshot.pixels),
    snapshot.width,
    snapshot.height,
  );
}

/**
 * Redo: pops the most recent redo snapshot.
 *
 * @param currentImageData The canvas state *right now* (before redo).
 */
export function redo(
  key: string,
  currentImageData: ImageData,
): ImageData | null {
  const h = historyMap.get(key);
  if (!h || h.redoStack.length === 0) return null;

  // Save current state to undo stack
  h.undoStack.push(createSnapshot(currentImageData));

  const snapshot = h.redoStack.pop()!;
  return new ImageData(
    new Uint8ClampedArray(snapshot.pixels),
    snapshot.width,
    snapshot.height,
  );
}

/**
 * Check if undo is possible for a key.
 */
export function canUndo(key: string): boolean {
  const h = historyMap.get(key);
  return !!h && h.undoStack.length > 0;
}

/**
 * Check if redo is possible for a key.
 */
export function canRedo(key: string): boolean {
  const h = historyMap.get(key);
  return !!h && h.redoStack.length > 0;
}

/**
 * Clear history for a specific key (frame or frame:layer).
 */
export function clearFrameHistory(key: string): void {
  historyMap.delete(key);
}

/**
 * Clear all history entries whose key starts with "${frameId}:".
 * Call this when deleting a frame in multi-layer mode.
 */
export function clearAllHistoryForFrame(frameId: string): void {
  const prefix = `${frameId}:`;
  for (const key of historyMap.keys()) {
    if (key === frameId || key.startsWith(prefix)) {
      historyMap.delete(key);
    }
  }
}

/**
 * Clear all history (when creating a new project).
 */
export function clearAllHistory(): void {
  historyMap.clear();
}
