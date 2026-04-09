/**
 * Central React hook for the pixel-art image editor.
 *
 * Combines the travels metadata store, the pixel history manager,
 * frame pixel data management, animation playback, and import/export.
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  initImageEditorStore,
  getImageEditorStore,
  isImageEditorStoreReady,
  destroyImageEditorStore,
  subscribeToImageEditorStoreInstance,
} from "@/lib/image-editor-store";
import { getPendingImageLayerEditorRequest } from "@/lib/image-layer-editor-context";
import { getPendingTileEditorRequest } from "@/lib/tile-editor-context";
import * as pixelHistory from "@/lib/image-editor-history";
import { parseAsePalette, writeAsePalette } from "@/lib/ase-palette";
import { parsePhotoshopAse, writePhotoshopAse } from "@/lib/photoshop-ase";
import {
  parseGpl,
  parseJascPal,
  parsePaintNetTxt,
  parseHex,
  parsePng,
  writeGpl,
  writeJascPal,
  writePaintNetTxt,
  writeHex,
  writePng,
} from "@/lib/palette-formats";
import type {
  Frame,
  FrameId,
  Color,
  Palette,
  ImageEditorTool,
  ImageEditorState,
  PaletteId,
  PixelSelection,
  ImageEditorLayerId,
  ImageEditorGroupId,
  ImageEditorRasterLayer,
  ImageEditorImageLayer,
  ImageEditorLayerGroup,
} from "@/types/image-editor";
import { DEFAULT_PALETTE_COLORS, getActivePalette } from "@/types/image-editor";
import type {
  FrameOperation,
  PaletteExportFormat,
  PaletteLibrarySnapshot,
  PngSwatchSize,
  UndoableActionType,
} from "@/types/image-editor-hook";

// ---------------------------------------------------------------------------
// Module-level per-layer pixel data — survives component unmount/remount.
// Key format: "${frameId}:${layerId}"
// ---------------------------------------------------------------------------

const moduleLayerFrameData: Map<string, ImageData> = new Map();
let savedDocumentFingerprint: string | null = null;

function hashPixelBuffer(data: Uint8ClampedArray): string {
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index]!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildSaveFingerprint(state: ImageEditorState | null): string | null {
  if (!state) return null;

  const allLayerIds = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
    true,
  );

  const parts: string[] = [
    `size:${state.width}x${state.height}`,
    `fps:${state.fps}`,
    `frames:${state.frames
      .map((frame) => `${frame.id}:${frame.duration}`)
      .join(",")}`,
    `layers:${state.layers
      .map((layer) => `${layer.id}:${layer.visible ? 1 : 0}`)
      .join(",")}`,
    `images:${state.imageLayers
      .map((layer) => `${layer.id}:${layer.visible ? 1 : 0}`)
      .join(",")}`,
    `groups:${state.layerGroups
      .map(
        (group) =>
          `${group.id}:${group.visible ? 1 : 0}:${group.childOrder.join(".")}`,
      )
      .join(",")}`,
    `order:${state.layerOrder.join(",")}`,
  ];

  for (const frame of state.frames) {
    for (const layerId of allLayerIds) {
      const imageData = moduleLayerFrameData.get(layerDataKey(frame.id, layerId));
      parts.push(
        `${frame.id}:${layerId}:${imageData ? hashPixelBuffer(imageData.data) : "empty"}`,
      );
    }
  }

  return parts.join("|");
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Build the map key for a frame + layer combination. */
function layerDataKey(frameId: string, layerId: string): string {
  return `${frameId}:${layerId}`;
}

/**
 * Return all leaf (non-group) layer IDs in bottom-to-top render order,
 * respecting group visibility. Pass `ignoreVisibility = true` to include
 * hidden layers (needed for resize, delete, etc.).
 */
function getLeafLayerIds(
  order: readonly (ImageEditorLayerId | ImageEditorGroupId)[],
  layers: readonly ImageEditorRasterLayer[],
  imageLayers: readonly ImageEditorImageLayer[],
  groups: readonly ImageEditorLayerGroup[],
  ignoreVisibility = false,
  parentVisible = true,
): string[] {
  const result: string[] = [];
  for (const id of order) {
    const group = groups.find((g) => (g.id as string) === (id as string));
    if (group) {
      const childVis = ignoreVisibility || (parentVisible && group.visible);
      result.push(
        ...getLeafLayerIds(
          group.childOrder,
          layers,
          imageLayers,
          groups,
          ignoreVisibility,
          childVis,
        ),
      );
    } else {
      const layer =
        layers.find((l) => (l.id as string) === (id as string)) ??
        imageLayers.find((l) => (l.id as string) === (id as string));
      if (layer) {
        if (ignoreVisibility || (parentVisible && layer.visible)) {
          result.push(id as string);
        }
      }
    }
  }
  return result;
}

/**
 * Composite all visible layers for the given frame into a single ImageData.
 * Layers are blended bottom-to-top (index 0 = bottom, last = top).
 */
function computeComposite(frameId: string, state: ImageEditorState): ImageData {
  const { width, height } = state;
  const visibleIds = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  for (const layerId of visibleIds) {
    const data = moduleLayerFrameData.get(layerDataKey(frameId, layerId));
    if (!data) continue;
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tCtx = tmp.getContext("2d")!;
    tCtx.putImageData(data, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }

  return ctx.getImageData(0, 0, width, height);
}

/**
 * Composite all visible layers BELOW `activeLayerId` into one ImageData.
 * Used to render the background reference canvas in the image editor.
 */
function computeCompositeBelowLayer(
  frameId: string,
  activeLayerId: string,
  state: ImageEditorState,
): ImageData {
  const { width, height } = state;
  const allVisible = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
  );
  const activeIdx = allVisible.indexOf(activeLayerId);
  const belowIds = activeIdx > 0 ? allVisible.slice(0, activeIdx) : [];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  for (const layerId of belowIds) {
    const data = moduleLayerFrameData.get(layerDataKey(frameId, layerId));
    if (!data) continue;
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tCtx = tmp.getContext("2d")!;
    tCtx.putImageData(data, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }

  return ctx.getImageData(0, 0, width, height);
}

/**
 * Composite all visible layers ABOVE `activeLayerId` into one ImageData.
 * Used to render the foreground overlay canvas in the image editor.
 */
function computeCompositeAboveLayer(
  frameId: string,
  activeLayerId: string,
  state: ImageEditorState,
): ImageData {
  const { width, height } = state;
  const allVisible = getLeafLayerIds(
    state.layerOrder,
    state.layers,
    state.imageLayers,
    state.layerGroups,
  );
  const activeIdx = allVisible.indexOf(activeLayerId);
  const aboveIds =
    activeIdx >= 0 && activeIdx < allVisible.length - 1
      ? allVisible.slice(activeIdx + 1)
      : [];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  for (const layerId of aboveIds) {
    const data = moduleLayerFrameData.get(layerDataKey(frameId, layerId));
    if (!data) continue;
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tCtx = tmp.getContext("2d")!;
    tCtx.putImageData(data, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }

  return ctx.getImageData(0, 0, width, height);
}

// ---------------------------------------------------------------------------
// Frame operation undo/redo stacks
// ---------------------------------------------------------------------------

const frameOpUndoStack: FrameOperation[] = [];
const frameOpRedoStack: FrameOperation[] = [];

// ---------------------------------------------------------------------------
// Palette undo/redo history
// ---------------------------------------------------------------------------

const paletteUndoStack: PaletteLibrarySnapshot[] = [];
const paletteRedoStack: PaletteLibrarySnapshot[] = [];

function snapshotPaletteLibrary(s: ImageEditorState): PaletteLibrarySnapshot {
  return {
    palettes: s.palettes.map((p) => ({
      ...p,
      colors: p.colors.map((c) => ({ ...c })),
    })),
    activePaletteId: s.activePaletteId,
  };
}

function getActivePaletteIndex(s: ImageEditorState): number {
  const idx = s.palettes.findIndex((p) => p.id === s.activePaletteId);
  return idx >= 0 ? idx : 0;
}

// ---------------------------------------------------------------------------
// Unified action ordering log (maintains chronological undo/redo order)
// ---------------------------------------------------------------------------

const actionLog: UndoableActionType[] = [];
const redoLog: UndoableActionType[] = [];

// ---------------------------------------------------------------------------
// Layer helper
// ---------------------------------------------------------------------------

/**
 * Insert newId immediately after refId in whichever order array contains refId.
 * Falls back to appending at the top level if refId is not found.
 */
function insertAfterInOrder(
  refId: string,
  newId: ImageEditorLayerId | ImageEditorGroupId,
  topOrder: (ImageEditorLayerId | ImageEditorGroupId)[],
  groups: ImageEditorLayerGroup[],
) {
  const topIdx = (topOrder as string[]).indexOf(refId);
  if (topIdx !== -1) {
    topOrder.splice(topIdx + 1, 0, newId);
    return;
  }
  for (const g of groups) {
    const idx = (g.childOrder as string[]).indexOf(refId);
    if (idx !== -1) {
      g.childOrder.splice(idx + 1, 0, newId);
      return;
    }
  }
  topOrder.push(newId);
}

/**
 * Ensure the image editor store is initialized.
 * If it's already ready, this is a no-op.
 * Otherwise creates a default 16×16 canvas.
 */
function ensureStoreReady() {
  if (isImageEditorStoreReady()) return;

  const pendingTileRequest = getPendingTileEditorRequest();
  const pendingImageLayerRequest = getPendingImageLayerEditorRequest();
  const w = pendingTileRequest?.context.sw
    ? pendingTileRequest.context.sw
    : pendingImageLayerRequest?.context.width &&
        pendingImageLayerRequest.context.width > 0
      ? pendingImageLayerRequest.context.width
      : 16;
  const h = pendingTileRequest?.context.sh
    ? pendingTileRequest.context.sh
    : pendingImageLayerRequest?.context.height &&
        pendingImageLayerRequest.context.height > 0
      ? pendingImageLayerRequest.context.height
      : 16;
  initImageEditorStore(w, h);

  const store = getImageEditorStore();
  const s = store.getState();
  // Initialize blank pixel data for the first layer of the first frame
  if (s.frames.length > 0 && s.layers.length > 0) {
    const key = layerDataKey(s.frames[0].id, s.layers[0].id);
    if (!moduleLayerFrameData.has(key)) {
      moduleLayerFrameData.set(key, new ImageData(w, h));
    }
  }

  if (savedDocumentFingerprint === null) {
    savedDocumentFingerprint = buildSaveFingerprint(s);
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useImageEditor() {
  // Ensure there's always a store ready (persists across open/close)
  ensureStoreReady();

  // Animation timer ref
  const animTimerRef = useRef<number | null>(null);
  const animStartTimeRef = useRef<number>(0);

  // -----------------------------------------------------------------------
  // Store binding via useSyncExternalStore
  // -----------------------------------------------------------------------

  const subscribe = useCallback((cb: () => void) => {
    let unsubscribeStore = isImageEditorStoreReady()
      ? getImageEditorStore().subscribe(cb)
      : () => {};

    const unsubscribeInstance = subscribeToImageEditorStoreInstance(() => {
      unsubscribeStore();
      unsubscribeStore = isImageEditorStoreReady()
        ? getImageEditorStore().subscribe(cb)
        : () => {};
      cb();
    });

    return () => {
      unsubscribeInstance();
      unsubscribeStore();
    };
  }, []);

  const getSnapshot = useCallback((): ImageEditorState | null => {
    if (!isImageEditorStoreReady()) return null;
    return getImageEditorStore().getState();
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot);

  // Incremented whenever undo/redo stacks change to ensure canUndo/canRedo
  // are recomputed on the next render without storing the value itself.
  const [, forceHistoryUpdate] = useReducer((n: number) => n + 1, 0);

  const setState = useCallback((updater: (draft: ImageEditorState) => void) => {
    if (!isImageEditorStoreReady()) return;
    getImageEditorStore().setState(updater);
  }, []);

  // -----------------------------------------------------------------------
  // Initialize
  // -----------------------------------------------------------------------

  const initProject = useCallback(
    (width: number, height: number, initialPalettes?: Palette[]) => {
      // Tear down any previous instance
      destroyImageEditorStore();
      pixelHistory.clearAllHistory();
      moduleLayerFrameData.clear();
      paletteUndoStack.length = 0;
      paletteRedoStack.length = 0;
      frameOpUndoStack.length = 0;
      frameOpRedoStack.length = 0;
      actionLog.length = 0;
      redoLog.length = 0;
      savedDocumentFingerprint = null;

      initImageEditorStore(width, height, initialPalettes);

      // Create initial blank ImageData for the first layer of frame 1
      const store = getImageEditorStore();
      const s = store.getState();
      if (s.frames.length > 0 && s.layers.length > 0) {
        const key = layerDataKey(s.frames[0].id, s.layers[0].id as string);
        moduleLayerFrameData.set(key, new ImageData(width, height));
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Resize canvas (preserving existing pixel data, cropping or padding)
  // -----------------------------------------------------------------------

  const resizeCanvas = useCallback((newWidth: number, newHeight: number) => {
    if (!isImageEditorStoreReady()) return;
    const store = getImageEditorStore();
    const s = store.getState();
    const oldW = s.width;
    const oldH = s.height;
    if (newWidth === oldW && newHeight === oldH) return;

    // Resize each layer's pixel data for every frame (top-left aligned copy)
    const allLayerIds = getLeafLayerIds(
      s.layerOrder,
      s.layers,
      s.imageLayers,
      s.layerGroups,
      true, // include all layers regardless of visibility
    );

    for (const frame of s.frames) {
      for (const layerId of allLayerIds) {
        const k = layerDataKey(frame.id, layerId);
        const oldData = moduleLayerFrameData.get(k);
        const newData = new ImageData(newWidth, newHeight);
        if (oldData) {
          const copyW = Math.min(oldW, newWidth);
          const copyH = Math.min(oldH, newHeight);
          for (let y = 0; y < copyH; y++) {
            for (let x = 0; x < copyW; x++) {
              const oldIdx = (y * oldW + x) * 4;
              const newIdx = (y * newWidth + x) * 4;
              newData.data[newIdx] = oldData.data[oldIdx];
              newData.data[newIdx + 1] = oldData.data[oldIdx + 1];
              newData.data[newIdx + 2] = oldData.data[oldIdx + 2];
              newData.data[newIdx + 3] = oldData.data[oldIdx + 3];
            }
          }
        }
        moduleLayerFrameData.set(k, newData);
      }
    }

    // Update store dimensions
    store.setState((draft) => {
      draft.width = newWidth;
      draft.height = newHeight;
    });

    // Clear undo history since frame data shapes changed
    pixelHistory.clearAllHistory();
  }, []);

  // Stop animation on unmount, but do NOT destroy the store
  // so the canvas persists when the drawer is closed and reopened.
  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) {
        cancelAnimationFrame(animTimerRef.current);
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // Frame data access
  // -----------------------------------------------------------------------

  const getCurrentFrameId = useCallback((): FrameId | null => {
    if (!state) return null;
    const frame = state.frames[state.currentFrameIndex];
    return frame?.id ?? null;
  }, [state]);

  const getCurrentFrameData = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    if (!frameId || !state) return null;
    return computeComposite(frameId, state);
  }, [getCurrentFrameId, state]);

  const getFrameData = useCallback(
    (frameId: FrameId): ImageData | null => {
      if (!state) return null;
      return computeComposite(frameId, state);
    },
    [state],
  );

  /** Return the raw pixels for a specific layer + frame (not composited). */
  const getLayerFrameData = useCallback(
    (frameId: FrameId, layerId: string): ImageData | null => {
      return moduleLayerFrameData.get(layerDataKey(frameId, layerId)) ?? null;
    },
    [],
  );

  /**
   * Save `data` as the active layer's pixel data for the given frame.
   * This is called by ImageCanvas after every stroke.
   */
  const setFrameData = useCallback(
    (frameId: FrameId, data: ImageData) => {
      if (!isImageEditorStoreReady()) return;
      const activeLayerId = getImageEditorStore().getState().activeLayerId;
      if (!activeLayerId) return;

      const key = layerDataKey(frameId, activeLayerId as string);
      moduleLayerFrameData.set(key, data);
      // Bump the version counter so all useSyncExternalStore subscribers
      // (including the TimelinePanel) re-render and refresh frame thumbnails.
      setState((d) => {
        d.pixelDataVersion = (d.pixelDataVersion ?? 0) + 1;
      });
    },
    [setState],
  );

  /** Return the raw pixels of the active layer for the current frame. */
  const getActiveLayerData = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    if (!frameId || !state?.activeLayerId) return null;
    return (
      moduleLayerFrameData.get(
        layerDataKey(frameId, state.activeLayerId as string),
      ) ?? null
    );
  }, [getCurrentFrameId, state?.activeLayerId]);

  /**
   * Composite of all visible layers BELOW the active layer
   * (renders behind the drawing canvas).
   */
  const getCompositeBelowActiveLayer = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    if (!frameId || !state?.activeLayerId) return null;
    return computeCompositeBelowLayer(
      frameId,
      state.activeLayerId as string,
      state,
    );
  }, [getCurrentFrameId, state]);

  /**
   * Composite of all visible layers ABOVE the active layer
   * (renders in front of the drawing canvas).
   */
  const getCompositeAboveActiveLayer = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    if (!frameId || !state?.activeLayerId) return null;
    return computeCompositeAboveLayer(
      frameId,
      state.activeLayerId as string,
      state,
    );
  }, [getCurrentFrameId, state]);

  // -----------------------------------------------------------------------
  // Pixel history — undo / redo for the canvas
  // -----------------------------------------------------------------------

  const pushUndoSnapshot = useCallback(() => {
    const frameId = getCurrentFrameId();
    if (!frameId || !state?.activeLayerId) return;
    const key = layerDataKey(frameId, state.activeLayerId as string);
    const data = moduleLayerFrameData.get(key);
    if (data) {
      pixelHistory.pushSnapshot(key, data);
      // Clear all redo history — any new action voids redo
      redoLog.length = 0;
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      actionLog.push("pixel");
      forceHistoryUpdate();
    }
  }, [getCurrentFrameId, state?.activeLayerId, forceHistoryUpdate]);

  const undoPixels = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    if (!frameId || !state?.activeLayerId) return null;
    const key = layerDataKey(frameId, state.activeLayerId as string);
    const data = moduleLayerFrameData.get(key);
    if (!data) return null;
    return pixelHistory.undo(key, data);
  }, [getCurrentFrameId, state?.activeLayerId]);

  const redoPixels = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    if (!frameId || !state?.activeLayerId) return null;
    const key = layerDataKey(frameId, state.activeLayerId as string);
    const data = moduleLayerFrameData.get(key);
    if (!data) return null;
    return pixelHistory.redo(key, data);
  }, [getCurrentFrameId, state?.activeLayerId]);

  // -----------------------------------------------------------------------
  // Frame management
  // -----------------------------------------------------------------------

  const addFrame = useCallback(() => {
    if (!state) return;
    const newId = uuidv4() as FrameId;
    const newFrame: Frame = {
      id: newId,
      name: `Frame ${state.frames.length + 1}`,
      duration: 100,
    };

    // Create blank pixel data for every leaf layer in the new frame
    const allLayerIds = getLeafLayerIds(
      state.layerOrder,
      state.layers,
      state.imageLayers,
      state.layerGroups,
      true,
    );
    const savedLayerData = new Map<string, ImageData>();
    for (const layerId of allLayerIds) {
      const blank = new ImageData(state.width, state.height);
      moduleLayerFrameData.set(layerDataKey(newId, layerId), blank);
      savedLayerData.set(
        layerId,
        new ImageData(
          new Uint8ClampedArray(blank.data),
          blank.width,
          blank.height,
        ),
      );
    }

    // Record for undo
    frameOpUndoStack.push({
      type: "add",
      frameId: newId,
      frame: { ...newFrame },
      index: state.frames.length,
      layerData: savedLayerData,
      prevFrameIndex: state.currentFrameIndex,
    });
    frameOpRedoStack.length = 0;
    redoLog.length = 0;
    paletteRedoStack.length = 0;
    actionLog.push("frame");

    setState((d) => {
      d.frames.push(newFrame);
      d.currentFrameIndex = d.frames.length - 1;
    });
  }, [state, setState]);

  const duplicateFrame = useCallback(() => {
    if (!state) return;
    const srcFrame = state.frames[state.currentFrameIndex];
    if (!srcFrame) return;

    const newId = uuidv4() as FrameId;
    const newFrame: Frame = {
      id: newId,
      name: `${srcFrame.name} copy`,
      duration: srcFrame.duration,
    };

    // Deep copy per-layer pixel data from the source frame
    const allLayerIds = getLeafLayerIds(
      state.layerOrder,
      state.layers,
      state.imageLayers,
      state.layerGroups,
      true,
    );
    const savedLayerData = new Map<string, ImageData>();
    for (const layerId of allLayerIds) {
      const srcData = moduleLayerFrameData.get(
        layerDataKey(srcFrame.id, layerId),
      );
      const copyData = srcData
        ? new ImageData(
            new Uint8ClampedArray(srcData.data),
            srcData.width,
            srcData.height,
          )
        : new ImageData(state.width, state.height);
      moduleLayerFrameData.set(layerDataKey(newId, layerId), copyData);
      savedLayerData.set(
        layerId,
        new ImageData(
          new Uint8ClampedArray(copyData.data),
          copyData.width,
          copyData.height,
        ),
      );
    }

    const insertIndex = state.currentFrameIndex + 1;

    // Record for undo
    frameOpUndoStack.push({
      type: "duplicate",
      frameId: newId,
      frame: { ...newFrame },
      index: insertIndex,
      layerData: savedLayerData,
      prevFrameIndex: state.currentFrameIndex,
    });
    frameOpRedoStack.length = 0;
    redoLog.length = 0;
    paletteRedoStack.length = 0;
    actionLog.push("frame");

    setState((d) => {
      d.frames.splice(d.currentFrameIndex + 1, 0, newFrame);
      d.currentFrameIndex = d.currentFrameIndex + 1;
    });
  }, [state, setState]);

  const deleteFrame = useCallback(() => {
    if (!state || state.frames.length <= 1) return;
    const frameToDelete = state.frames[state.currentFrameIndex];
    if (!frameToDelete) return;

    // Save per-layer pixel data before deleting
    const allLayerIds = getLeafLayerIds(
      state.layerOrder,
      state.layers,
      state.imageLayers,
      state.layerGroups,
      true,
    );
    const savedLayerData = new Map<string, ImageData>();
    for (const layerId of allLayerIds) {
      const data = moduleLayerFrameData.get(
        layerDataKey(frameToDelete.id, layerId),
      );
      if (data) {
        savedLayerData.set(
          layerId,
          new ImageData(
            new Uint8ClampedArray(data.data),
            data.width,
            data.height,
          ),
        );
      } else {
        savedLayerData.set(layerId, new ImageData(state.width, state.height));
      }
    }

    frameOpUndoStack.push({
      type: "delete",
      frameId: frameToDelete.id,
      frame: { ...frameToDelete },
      index: state.currentFrameIndex,
      layerData: savedLayerData,
      prevFrameIndex: state.currentFrameIndex,
    });
    frameOpRedoStack.length = 0;
    redoLog.length = 0;
    paletteRedoStack.length = 0;
    actionLog.push("frame");

    // Delete all layer entries for this frame
    for (const layerId of allLayerIds) {
      moduleLayerFrameData.delete(layerDataKey(frameToDelete.id, layerId));
    }
    pixelHistory.clearAllHistoryForFrame(frameToDelete.id);

    setState((d) => {
      d.frames.splice(d.currentFrameIndex, 1);
      if (d.currentFrameIndex >= d.frames.length) {
        d.currentFrameIndex = d.frames.length - 1;
      }
    });
  }, [state, setState]);

  /**
   * Move the current frame one position left or right in the frames array.
   * The currentFrameIndex follows the moved frame.
   */
  const moveFrame = useCallback(
    (direction: "left" | "right") => {
      if (!state) return;
      const { currentFrameIndex, frames } = state;
      const targetIndex =
        direction === "left" ? currentFrameIndex - 1 : currentFrameIndex + 1;
      if (targetIndex < 0 || targetIndex >= frames.length) return;
      setState((d) => {
        const temp = d.frames[currentFrameIndex];
        d.frames[currentFrameIndex] = d.frames[targetIndex];
        d.frames[targetIndex] = temp;
        d.currentFrameIndex = targetIndex;
      });
    },
    [state, setState],
  );

  const setCurrentFrame = useCallback(
    (index: number) => {
      setState((d) => {
        d.currentFrameIndex = Math.max(0, Math.min(index, d.frames.length - 1));
      });
    },
    [setState],
  );

  const setFrameDuration = useCallback(
    (frameIndex: number, duration: number) => {
      setState((d) => {
        if (d.frames[frameIndex]) {
          d.frames[frameIndex].duration = duration;
        }
      });
    },
    [setState],
  );

  const undoFrameOp = useCallback((): boolean => {
    if (frameOpUndoStack.length === 0) return false;
    const op = frameOpUndoStack.pop()!;

    switch (op.type) {
      case "add":
      case "duplicate": {
        // Undo add/duplicate: capture current layer data then remove the frame
        const savedLayerData = new Map<string, ImageData>();
        for (const [layerId, imgData] of op.layerData) {
          const current = moduleLayerFrameData.get(
            layerDataKey(op.frameId, layerId),
          );
          savedLayerData.set(
            layerId,
            current
              ? new ImageData(
                  new Uint8ClampedArray(current.data),
                  current.width,
                  current.height,
                )
              : imgData,
          );
          moduleLayerFrameData.delete(layerDataKey(op.frameId, layerId));
        }
        frameOpRedoStack.push({ ...op, layerData: savedLayerData });
        pixelHistory.clearAllHistoryForFrame(op.frameId);
        setState((d) => {
          const idx = d.frames.findIndex((f) => f.id === op.frameId);
          if (idx >= 0) d.frames.splice(idx, 1);
          d.currentFrameIndex = Math.min(
            op.prevFrameIndex,
            d.frames.length - 1,
          );
        });
        return true;
      }
      case "delete": {
        // Undo delete: re-insert the frame with its layer data
        for (const [layerId, imgData] of op.layerData) {
          moduleLayerFrameData.set(
            layerDataKey(op.frameId, layerId),
            new ImageData(
              new Uint8ClampedArray(imgData.data),
              imgData.width,
              imgData.height,
            ),
          );
        }
        frameOpRedoStack.push(op);
        setState((d) => {
          const idx = Math.min(op.index, d.frames.length);
          d.frames.splice(idx, 0, op.frame);
          d.currentFrameIndex = idx;
        });
        return true;
      }
    }
  }, [setState]);

  const redoFrameOp = useCallback((): boolean => {
    if (frameOpRedoStack.length === 0) return false;
    const op = frameOpRedoStack.pop()!;

    switch (op.type) {
      case "add":
      case "duplicate": {
        // Redo add/duplicate: re-insert the frame with its layer data
        for (const [layerId, imgData] of op.layerData) {
          moduleLayerFrameData.set(
            layerDataKey(op.frameId, layerId),
            new ImageData(
              new Uint8ClampedArray(imgData.data),
              imgData.width,
              imgData.height,
            ),
          );
        }
        frameOpUndoStack.push(op);
        setState((d) => {
          const idx = Math.min(op.index, d.frames.length);
          d.frames.splice(idx, 0, op.frame);
          d.currentFrameIndex = idx;
        });
        return true;
      }
      case "delete": {
        // Redo delete: re-remove the frame
        const savedLayerData = new Map<string, ImageData>();
        for (const [layerId, imgData] of op.layerData) {
          const current = moduleLayerFrameData.get(
            layerDataKey(op.frameId, layerId),
          );
          savedLayerData.set(
            layerId,
            current
              ? new ImageData(
                  new Uint8ClampedArray(current.data),
                  current.width,
                  current.height,
                )
              : imgData,
          );
          moduleLayerFrameData.delete(layerDataKey(op.frameId, layerId));
        }
        frameOpUndoStack.push({ ...op, layerData: savedLayerData });
        pixelHistory.clearAllHistoryForFrame(op.frameId);
        setState((d) => {
          const idx = d.frames.findIndex((f) => f.id === op.frameId);
          if (idx >= 0) {
            d.frames.splice(idx, 1);
            if (d.currentFrameIndex >= d.frames.length) {
              d.currentFrameIndex = d.frames.length - 1;
            }
          }
        });
        return true;
      }
    }
  }, [setState]);

  // -----------------------------------------------------------------------
  // Unified undo / redo
  // -----------------------------------------------------------------------

  const performUndo = useCallback(() => {
    if (actionLog.length === 0) return;
    const type = actionLog.pop()!;
    redoLog.push(type);

    if (type === "pixel") {
      const frameId = getCurrentFrameId();
      const activeLayerId = isImageEditorStoreReady()
        ? getImageEditorStore().getState().activeLayerId
        : null;
      if (frameId && activeLayerId) {
        const key = layerDataKey(frameId, activeLayerId as string);
        const current = moduleLayerFrameData.get(key);
        if (current) {
          const restored = pixelHistory.undo(key, current);
          if (restored) {
            moduleLayerFrameData.set(key, restored);
            setState((d) => {
              d.pixelDataVersion = (d.pixelDataVersion ?? 0) + 1;
            });
          }
        }
      }
    } else if (type === "frame") {
      undoFrameOp();
    } else if (type === "palette") {
      const snap = paletteUndoStack.pop();
      if (snap && isImageEditorStoreReady()) {
        const s = getImageEditorStore().getState();
        paletteRedoStack.push(snapshotPaletteLibrary(s));
        setState((d) => {
          d.palettes = snap.palettes.map((p) => ({
            ...p,
            colors: p.colors.map((c) => ({ ...c })),
          }));
          d.activePaletteId = snap.activePaletteId;
        });
      }
    }

    forceHistoryUpdate();
  }, [getCurrentFrameId, undoFrameOp, setState, forceHistoryUpdate]);

  const performRedo = useCallback(() => {
    if (redoLog.length === 0) return;
    const type = redoLog.pop()!;
    actionLog.push(type);

    if (type === "pixel") {
      const frameId = getCurrentFrameId();
      const activeLayerId = isImageEditorStoreReady()
        ? getImageEditorStore().getState().activeLayerId
        : null;
      if (frameId && activeLayerId) {
        const key = layerDataKey(frameId, activeLayerId as string);
        const current = moduleLayerFrameData.get(key);
        if (current) {
          const restored = pixelHistory.redo(key, current);
          if (restored) {
            moduleLayerFrameData.set(key, restored);
            setState((d) => {
              d.pixelDataVersion = (d.pixelDataVersion ?? 0) + 1;
            });
          }
        }
      }
    } else if (type === "frame") {
      redoFrameOp();
    } else if (type === "palette") {
      const snap = paletteRedoStack.pop();
      if (snap && isImageEditorStoreReady()) {
        const s = getImageEditorStore().getState();
        paletteUndoStack.push(snapshotPaletteLibrary(s));
        setState((d) => {
          d.palettes = snap.palettes.map((p) => ({
            ...p,
            colors: p.colors.map((c) => ({ ...c })),
          }));
          d.activePaletteId = snap.activePaletteId;
        });
      }
    }

    forceHistoryUpdate();
  }, [getCurrentFrameId, redoFrameOp, setState, forceHistoryUpdate]);

  const canUndo = actionLog.length > 0;
  const canRedo = redoLog.length > 0;

  // -----------------------------------------------------------------------
  // Tool / state setters
  // -----------------------------------------------------------------------

  const setTool = useCallback(
    (tool: ImageEditorTool) =>
      setState((d) => {
        d.tool = tool;
      }),
    [setState],
  );

  const setPrimaryColor = useCallback(
    (c: Color) =>
      setState((d) => {
        d.primaryColor = c;
      }),
    [setState],
  );

  const setSecondaryColor = useCallback(
    (c: Color) =>
      setState((d) => {
        d.secondaryColor = c;
      }),
    [setState],
  );

  const setBrushSize = useCallback(
    (s: number) =>
      setState((d) => {
        d.brushSize = Math.max(1, Math.min(16, s));
      }),
    [setState],
  );

  const setZoom = useCallback(
    (z: number) =>
      setState((d) => {
        d.zoom = Math.max(1, Math.min(64, z));
      }),
    [setState],
  );

  const setSelection = useCallback(
    (sel: PixelSelection | null) =>
      setState((d) => {
        d.selection = sel;
      }),
    [setState],
  );

  const setOnionSkin = useCallback(
    (on: boolean) =>
      setState((d) => {
        d.onionSkin = on;
      }),
    [setState],
  );

  const setBlurSize = useCallback(
    (size: number) =>
      setState((d) => {
        d.blurSize = Math.max(1, Math.min(8, size));
      }),
    [setState],
  );

  const setBlurIntensity = useCallback(
    (intensity: number) =>
      setState((d) => {
        d.blurIntensity = Math.max(1, Math.min(100, intensity));
      }),
    [setState],
  );

  const setFps = useCallback(
    (fps: number) =>
      setState((d) => {
        d.fps = Math.max(1, Math.min(60, fps));
        // Sync all frame durations to match new FPS for consistent export
        const duration = Math.round(1000 / d.fps);
        for (const frame of d.frames) {
          frame.duration = duration;
        }
      }),
    [setState],
  );

  // -----------------------------------------------------------------------
  // Palette management
  // -----------------------------------------------------------------------

  const addPaletteColor = useCallback(
    (color: Color) => {
      if (state) {
        paletteUndoStack.push(snapshotPaletteLibrary(state));
        paletteRedoStack.length = 0;
        frameOpRedoStack.length = 0;
        redoLog.length = 0;
        actionLog.push("palette");
      }
      setState((d) => {
        d.palettes[getActivePaletteIndex(d)].colors.push(color);
      });
    },
    [state, setState],
  );

  const removePaletteColor = useCallback(
    (index: number) => {
      if (state) {
        paletteUndoStack.push(snapshotPaletteLibrary(state));
        paletteRedoStack.length = 0;
        frameOpRedoStack.length = 0;
        redoLog.length = 0;
        actionLog.push("palette");
      }
      setState((d) => {
        d.palettes[getActivePaletteIndex(d)].colors.splice(index, 1);
      });
    },
    [state, setState],
  );

  const updatePaletteColor = useCallback(
    (index: number, color: Color) => {
      setState((d) => {
        const palette = d.palettes[getActivePaletteIndex(d)];
        if (palette.colors[index]) {
          palette.colors[index] = color;
        }
      });
    },
    [setState],
  );

  const resetPalette = useCallback(() => {
    if (state) {
      paletteUndoStack.push(snapshotPaletteLibrary(state));
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      redoLog.length = 0;
      actionLog.push("palette");
    }
    setState((d) => {
      const palette = d.palettes[getActivePaletteIndex(d)];
      palette.colors = [...DEFAULT_PALETTE_COLORS];
    });
  }, [state, setState]);

  const importPalette = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let colors: Color[] = [];

      if (ext === "aseprite") {
        colors = parseAsePalette(await file.arrayBuffer());
      } else if (ext === "ase") {
        // Auto-detect: Adobe ASE starts with "ASEF" (0x41534546);
        // Aseprite files have magic 0xa5e0 at offset 4.
        const buf = await file.arrayBuffer();
        const sig = new DataView(buf).getUint32(0, false);
        if (sig === 0x41534546) {
          colors = parsePhotoshopAse(buf);
        } else {
          colors = parseAsePalette(buf);
        }
      } else if (ext === "gpl") {
        colors = parseGpl(await file.text());
      } else if (ext === "pal") {
        colors = parseJascPal(await file.text());
      } else if (ext === "txt") {
        colors = parsePaintNetTxt(await file.text());
      } else if (ext === "hex") {
        colors = parseHex(await file.text());
      } else if (ext === "png") {
        colors = await parsePng(await file.arrayBuffer());
      }

      if (colors.length === 0) return;

      // Snapshot current palette library before applying import
      if (isImageEditorStoreReady()) {
        const s = getImageEditorStore().getState();
        paletteUndoStack.push(snapshotPaletteLibrary(s));
        paletteRedoStack.length = 0;
        frameOpRedoStack.length = 0;
        redoLog.length = 0;
        actionLog.push("palette");
      }

      const paletteName = file.name.replace(/\.[^.]+$/, "");
      const newId = uuidv4() as PaletteId;
      setState((d) => {
        d.palettes.push({
          id: newId,
          name: paletteName,
          colors,
        });
        d.activePaletteId = newId;
      });
    },
    [setState],
  );

  const exportPalette = useCallback(
    async (
      format: PaletteExportFormat = "ase",
      swatchSize: PngSwatchSize = 16,
    ) => {
      if (!state) return;
      const activePalette = getActivePalette(state);
      const baseName = activePalette.name || "palette";
      const colors = activePalette.colors;

      let blob: Blob;
      let filename: string;

      if (format === "ase") {
        const buffer = writePhotoshopAse(colors);
        blob = new Blob([buffer], { type: "application/octet-stream" });
        filename = `${baseName}.ase`;
      } else if (format === "aseprite") {
        const buffer = writeAsePalette(colors);
        blob = new Blob([buffer], { type: "application/octet-stream" });
        filename = `${baseName}.aseprite`;
      } else if (format === "gpl") {
        blob = new Blob([writeGpl(colors, baseName)], { type: "text/plain" });
        filename = `${baseName}.gpl`;
      } else if (format === "pal") {
        blob = new Blob([writeJascPal(colors)], { type: "text/plain" });
        filename = `${baseName}.pal`;
      } else if (format === "txt") {
        blob = new Blob([writePaintNetTxt(colors, baseName)], {
          type: "text/plain",
        });
        filename = `${baseName}.txt`;
      } else if (format === "hex") {
        blob = new Blob([writeHex(colors)], { type: "text/plain" });
        filename = `${baseName}.hex`;
      } else {
        // png
        blob = await writePng(colors, swatchSize);
        filename = `${baseName}-${swatchSize}px.png`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [state],
  );

  const switchPalette = useCallback(
    (id: PaletteId) => {
      setState((d) => {
        if (d.palettes.some((p) => p.id === id)) {
          d.activePaletteId = id;
        }
      });
    },
    [setState],
  );

  const renamePalette = useCallback(
    (id: PaletteId, name: string) => {
      if (state) {
        paletteUndoStack.push(snapshotPaletteLibrary(state));
        paletteRedoStack.length = 0;
        frameOpRedoStack.length = 0;
        redoLog.length = 0;
        actionLog.push("palette");
      }
      setState((d) => {
        const p = d.palettes.find((p) => p.id === id);
        if (p) p.name = name;
      });
    },
    [state, setState],
  );

  const deletePalette = useCallback(
    (id: PaletteId) => {
      if (!state || state.palettes.length <= 1) return;
      paletteUndoStack.push(snapshotPaletteLibrary(state));
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      redoLog.length = 0;
      actionLog.push("palette");
      setState((d) => {
        const idx = d.palettes.findIndex((p) => p.id === id);
        if (idx < 0) return;
        d.palettes.splice(idx, 1);
        if (d.activePaletteId === id) {
          d.activePaletteId =
            d.palettes[Math.min(idx, d.palettes.length - 1)].id;
        }
      });
    },
    [state, setState],
  );

  const duplicatePalette = useCallback(
    (id: PaletteId) => {
      if (!state) return;
      const src = state.palettes.find((p) => p.id === id);
      if (!src) return;
      paletteUndoStack.push(snapshotPaletteLibrary(state));
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      redoLog.length = 0;
      actionLog.push("palette");
      const newId = uuidv4() as PaletteId;
      const srcName = src.name;
      const srcColors = src.colors.map((c) => ({ ...c }));
      setState((d) => {
        const srcIdx = d.palettes.findIndex((p) => p.id === id);
        const copy = {
          id: newId,
          name: `${srcName} (copy)`,
          colors: srcColors,
        };
        d.palettes.splice(srcIdx + 1, 0, copy);
        d.activePaletteId = newId;
      });
    },
    [state, setState],
  );

  const reorderPaletteColors = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!state || fromIndex === toIndex) return;
      paletteUndoStack.push(snapshotPaletteLibrary(state));
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      redoLog.length = 0;
      actionLog.push("palette");
      setState((d) => {
        const palette = d.palettes[getActivePaletteIndex(d)];
        const colors = palette.colors;
        if (
          fromIndex < 0 ||
          fromIndex >= colors.length ||
          toIndex < 0 ||
          toIndex >= colors.length
        )
          return;
        const [moved] = colors.splice(fromIndex, 1);
        colors.splice(toIndex, 0, moved);
      });
    },
    [state, setState],
  );

  /**
   * Restore the full palette library (e.g. from saved project).
   * Clears palette undo/redo since this is an external load, not a user edit.
   */
  const restorePaletteLibrary = useCallback(
    (palettes: Palette[]) => {
      if (!isImageEditorStoreReady() || palettes.length === 0) return;
      paletteUndoStack.length = 0;
      paletteRedoStack.length = 0;
      setState((d) => {
        d.palettes = palettes.map((p) => ({
          ...p,
          colors: p.colors.map((c) => ({ ...c })),
        }));
        d.activePaletteId = palettes[0].id;
      });
    },
    [setState],
  );

  // -----------------------------------------------------------------------
  // Animation playback
  // -----------------------------------------------------------------------

  const stopAnimation = useCallback(() => {
    if (animTimerRef.current !== null) {
      cancelAnimationFrame(animTimerRef.current);
      animTimerRef.current = null;
    }
    setState((d) => {
      d.isPlaying = false;
    });
  }, [setState]);

  const playAnimation = useCallback(() => {
    if (!state || state.frames.length <= 1) return;

    setState((d) => {
      d.isPlaying = true;
    });
    animStartTimeRef.current = performance.now();

    let frameAccum = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (!isImageEditorStoreReady()) return;
      const s = getImageEditorStore().getState();
      if (!s.isPlaying) return;

      const delta = now - lastTime;
      lastTime = now;
      frameAccum += delta;

      const frameDuration = 1000 / s.fps;

      if (frameAccum >= frameDuration) {
        frameAccum -= frameDuration;
        const nextIndex = s.currentFrameIndex + 1;

        if (nextIndex >= s.frames.length) {
          getImageEditorStore().setState((d) => {
            d.currentFrameIndex = 0;
          });
        } else {
          getImageEditorStore().setState((d) => {
            d.currentFrameIndex = nextIndex;
          });
        }
      }

      animTimerRef.current = requestAnimationFrame(tick);
    };

    animTimerRef.current = requestAnimationFrame(tick);
  }, [state, setState]);

  // -----------------------------------------------------------------------
  // Export PNG (single frame)
  // -----------------------------------------------------------------------

  const exportPng = useCallback(async (): Promise<boolean> => {
    if (!state) return false;
    const frameId = getCurrentFrameId();
    if (!frameId) return false;
    const data = computeComposite(frameId, state);

    const canvas = document.createElement("canvas");
    canvas.width = state.width;
    canvas.height = state.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(data, 0, 0);

    const blob = await canvasToPngBlob(canvas);
    if (!blob) return false;
    downloadBlob(blob, "sprite.png");
    return true;
  }, [state, getCurrentFrameId]);

  // -----------------------------------------------------------------------
  // Export animated GIF
  // -----------------------------------------------------------------------

  const exportGif = useCallback(async (): Promise<boolean> => {
    if (!state || state.frames.length === 0) return false;

    // Dynamic import gifenc
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");

    const gif = GIFEncoder();

    for (const frame of state.frames) {
      const data = computeComposite(frame.id, state);

      // gifenc expects RGBA Uint8Array
      const rgba = new Uint8Array(data.data.buffer);
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);

      gif.writeFrame(index, state.width, state.height, {
        palette,
        delay: frame.duration,
        transparent: true,
      });
    }

    gif.finish();

    const bytes = gif.bytes();
    const blob = new Blob([new Uint8Array(bytes)], { type: "image/gif" });
    downloadBlob(blob, "animation.gif");
    return true;
  }, [state]);

  // -----------------------------------------------------------------------
  // Export sprite sheet
  // -----------------------------------------------------------------------

  const exportSpriteSheet = useCallback(
    async (columns?: number): Promise<boolean> => {
      if (!state || state.frames.length === 0) return false;

      const cols = columns ?? state.frames.length;
      const rows = Math.ceil(state.frames.length / cols);
      const totalW = cols * state.width;
      const totalH = rows * state.height;

      const canvas = document.createElement("canvas");
      canvas.width = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext("2d")!;

      state.frames.forEach((frame, i) => {
        const data = computeComposite(frame.id, state);
        const col = i % cols;
        const row = Math.floor(i / cols);
        ctx.putImageData(data, col * state.width, row * state.height);
      });

      const blob = await canvasToPngBlob(canvas);
      if (!blob) return false;
      downloadBlob(blob, "spritesheet.png");
      return true;
    },
    [state],
  );

  // -----------------------------------------------------------------------
  // Previous frame data (for onion skin)
  // -----------------------------------------------------------------------

  const getPreviousFrameData = useCallback((): ImageData | null => {
    if (!state || state.currentFrameIndex === 0) return null;
    const prevFrame = state.frames[state.currentFrameIndex - 1];
    if (!prevFrame) return null;
    return computeComposite(prevFrame.id, state);
  }, [state]);

  const markSavePoint = useCallback(() => {
    savedDocumentFingerprint = buildSaveFingerprint(state);
  }, [state]);

  const hasUnsavedImageChanges = useCallback((): boolean => {
    const currentFingerprint = buildSaveFingerprint(state);
    if (!currentFingerprint) return false;
    return currentFingerprint !== savedDocumentFingerprint;
  }, [state]);

  // -----------------------------------------------------------------------
  // Layer management
  // -----------------------------------------------------------------------

  const addRasterLayer = useCallback(
    (name?: string) => {
      if (!state) return;
      const newId = uuidv4() as ImageEditorLayerId;
      const layerCount = state.layers.length + state.imageLayers.length;
      const layerName = name ?? `Layer ${layerCount + 1}`;

      // Create blank pixel data for this layer across all existing frames
      for (const frame of state.frames) {
        moduleLayerFrameData.set(
          layerDataKey(frame.id, newId),
          new ImageData(state.width, state.height),
        );
      }

      setState((draft) => {
        const newLayer: ImageEditorRasterLayer = {
          id: newId,
          name: layerName,
          visible: true,
          locked: false,
          type: "tile",
        };
        draft.layers.push(newLayer);
        if (draft.activeLayerId) {
          insertAfterInOrder(
            draft.activeLayerId as string,
            newId,
            draft.layerOrder,
            draft.layerGroups,
          );
        } else {
          draft.layerOrder.push(newId);
        }
        draft.activeLayerId = newId;
      });
    },
    [state, setState],
  );

  const addImageEditorImageLayer = useCallback(
    (name?: string) => {
      if (!state) return;

      // Open file picker — the actual layer creation happens after file load
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";

      fileInput.onchange = () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
          URL.revokeObjectURL(url);

          // Get fresh state in case things changed while file picker was open
          if (!isImageEditorStoreReady()) return;
          const s = getImageEditorStore().getState();

          // Render image at canvas dimensions (scale to fit)
          const canvas = document.createElement("canvas");
          canvas.width = s.width;
          canvas.height = s.height;
          const ctx = canvas.getContext("2d")!;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, s.width, s.height);
          const imageData = ctx.getImageData(0, 0, s.width, s.height);

          const newId = uuidv4() as ImageEditorLayerId;
          const baseName =
            name ?? file.name.replace(/\.[^/.]+$/, "") ?? "Image";

          // Store pixel data for all existing frames
          for (const frame of s.frames) {
            moduleLayerFrameData.set(
              layerDataKey(frame.id, newId),
              new ImageData(
                new Uint8ClampedArray(imageData.data),
                imageData.width,
                imageData.height,
              ),
            );
          }

          getImageEditorStore().setState((draft) => {
            const newLayer: ImageEditorImageLayer = {
              id: newId,
              name: baseName,
              visible: true,
              locked: false,
              type: "image",
            };
            draft.imageLayers.push(newLayer);
            if (draft.activeLayerId) {
              insertAfterInOrder(
                draft.activeLayerId as string,
                newId,
                draft.layerOrder,
                draft.layerGroups,
              );
            } else {
              draft.layerOrder.push(newId);
            }
            draft.activeLayerId = newId;
          });
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
        };

        img.src = url;
      };

      fileInput.click();
    },
    [state],
  );

  const addImageEditorLayerGroup = useCallback(
    (name?: string) => {
      if (!state) return;
      const newId = uuidv4() as ImageEditorGroupId;
      setState((draft) => {
        const newGroup: ImageEditorLayerGroup = {
          id: newId,
          name: name ?? "Group",
          visible: true,
          locked: false,
          expanded: true,
          childOrder: [],
        };
        draft.layerGroups.push(newGroup);
        draft.layerOrder.push(newId);
      });
    },
    [state, setState],
  );

  const deleteImageEditorLayer = useCallback(
    (id: string) => {
      if (!state) return;
      // Clean up pixel data for all frames
      for (const frame of state.frames) {
        moduleLayerFrameData.delete(layerDataKey(frame.id, id));
      }
      pixelHistory.clearAllHistoryForFrame(id);
      setState((draft) => {
        draft.layerOrder = draft.layerOrder.filter(
          (o) => (o as string) !== id,
        ) as typeof draft.layerOrder;
        for (const g of draft.layerGroups) {
          g.childOrder = g.childOrder.filter(
            (o) => (o as string) !== id,
          ) as typeof g.childOrder;
        }
        draft.layers = draft.layers.filter((l) => (l.id as string) !== id);
        draft.imageLayers = draft.imageLayers.filter(
          (l) => (l.id as string) !== id,
        );
        if ((draft.activeLayerId as string) === id) {
          const remaining = draft.layerOrder;
          draft.activeLayerId =
            remaining.length > 0
              ? (remaining[remaining.length - 1] as ImageEditorLayerId)
              : null;
        }
      });
    },
    [state, setState],
  );

  const deleteImageEditorGroup = useCallback(
    (groupId: string) => {
      if (!state) return;
      setState((draft) => {
        const group = draft.layerGroups.find(
          (g) => (g.id as string) === groupId,
        );
        if (!group) return;

        // Collect all descendant IDs
        function collectDescendants(
          order: (ImageEditorLayerId | ImageEditorGroupId)[],
        ): { layerIds: string[]; groupIds: string[] } {
          const layerIds: string[] = [];
          const groupIds: string[] = [];
          for (const id of order) {
            const g = draft.layerGroups.find(
              (x) => (x.id as string) === (id as string),
            );
            if (g) {
              groupIds.push(g.id as string);
              const child = collectDescendants(g.childOrder);
              layerIds.push(...child.layerIds);
              groupIds.push(...child.groupIds);
            } else {
              layerIds.push(id as string);
            }
          }
          return { layerIds, groupIds };
        }

        const { layerIds, groupIds } = collectDescendants(group.childOrder);
        const allGroupIds = [groupId, ...groupIds];

        draft.layers = draft.layers.filter(
          (l) => !layerIds.includes(l.id as string),
        );
        draft.imageLayers = draft.imageLayers.filter(
          (l) => !layerIds.includes(l.id as string),
        );
        draft.layerGroups = draft.layerGroups.filter(
          (g) => !allGroupIds.includes(g.id as string),
        );
        draft.layerOrder = draft.layerOrder.filter(
          (o) => !allGroupIds.includes(o as string),
        ) as typeof draft.layerOrder;
        for (const g of draft.layerGroups) {
          g.childOrder = g.childOrder.filter(
            (o) => !allGroupIds.includes(o as string),
          ) as typeof g.childOrder;
        }

        if (
          draft.activeLayerId &&
          layerIds.includes(draft.activeLayerId as string)
        ) {
          const remaining = draft.layerOrder;
          draft.activeLayerId =
            remaining.length > 0
              ? (remaining[remaining.length - 1] as ImageEditorLayerId)
              : null;
        }
      });
    },
    [state, setState],
  );

  const renameImageEditorLayer = useCallback(
    (id: string, name: string) => {
      if (!state || !name.trim()) return;
      setState((draft) => {
        const layer = draft.layers.find((l) => (l.id as string) === id);
        if (layer) {
          layer.name = name;
          return;
        }
        const imgLayer = draft.imageLayers.find((l) => (l.id as string) === id);
        if (imgLayer) {
          imgLayer.name = name;
          return;
        }
        const group = draft.layerGroups.find((g) => (g.id as string) === id);
        if (group) group.name = name;
      });
    },
    [state, setState],
  );

  const toggleImageEditorLayerVisible = useCallback(
    (id: string, isGroup: boolean) => {
      if (!state) return;
      setState((draft) => {
        if (isGroup) {
          const group = draft.layerGroups.find((g) => (g.id as string) === id);
          if (group) group.visible = !group.visible;
        } else {
          const layer = draft.layers.find((l) => (l.id as string) === id);
          if (layer) {
            layer.visible = !layer.visible;
            return;
          }
          const imgLayer = draft.imageLayers.find(
            (l) => (l.id as string) === id,
          );
          if (imgLayer) imgLayer.visible = !imgLayer.visible;
        }
      });
    },
    [state, setState],
  );

  const toggleImageEditorLayerLocked = useCallback(
    (id: string, isGroup: boolean) => {
      if (!state) return;
      setState((draft) => {
        if (isGroup) {
          const group = draft.layerGroups.find((g) => (g.id as string) === id);
          if (group) group.locked = !group.locked;
        } else {
          const layer = draft.layers.find((l) => (l.id as string) === id);
          if (layer) {
            layer.locked = !layer.locked;
            return;
          }
          const imgLayer = draft.imageLayers.find(
            (l) => (l.id as string) === id,
          );
          if (imgLayer) imgLayer.locked = !imgLayer.locked;
        }
      });
    },
    [state, setState],
  );

  const setActiveImageEditorLayer = useCallback(
    (id: string) => {
      if (!state) return;
      setState((draft) => {
        draft.activeLayerId = id as ImageEditorLayerId;
      });
    },
    [state, setState],
  );

  const toggleImageEditorGroupExpanded = useCallback(
    (id: string) => {
      if (!state) return;
      setState((draft) => {
        const group = draft.layerGroups.find((g) => (g.id as string) === id);
        if (group) group.expanded = !group.expanded;
      });
    },
    [state, setState],
  );

  const moveImageEditorLayerItem = useCallback(
    (id: string, direction: "up" | "down", parentGroupId: string | null) => {
      if (!state) return;
      setState((draft) => {
        let order: (ImageEditorLayerId | ImageEditorGroupId)[];
        if (parentGroupId) {
          const group = draft.layerGroups.find(
            (g) => (g.id as string) === parentGroupId,
          );
          if (!group) return;
          order = group.childOrder;
        } else {
          order = draft.layerOrder;
        }
        const idx = (order as string[]).indexOf(id);
        if (idx === -1) return;
        // "up" = higher position visually = higher index in data
        const targetIdx = direction === "up" ? idx + 1 : idx - 1;
        if (targetIdx < 0 || targetIdx >= order.length) return;
        const temp = order[idx]!;
        order[idx] = order[targetIdx]!;
        order[targetIdx] = temp;
      });
    },
    [state, setState],
  );

  const duplicateImageEditorLayer = useCallback(
    (id: string) => {
      if (!state) return;
      const newId = uuidv4() as ImageEditorLayerId;

      // Copy pixel data for all frames
      for (const frame of state.frames) {
        const srcData = moduleLayerFrameData.get(layerDataKey(frame.id, id));
        moduleLayerFrameData.set(
          layerDataKey(frame.id, newId),
          srcData
            ? new ImageData(
                new Uint8ClampedArray(srcData.data),
                srcData.width,
                srcData.height,
              )
            : new ImageData(state.width, state.height),
        );
      }

      setState((draft) => {
        const layer = draft.layers.find((l) => (l.id as string) === id);
        if (layer) {
          const copy: ImageEditorRasterLayer = {
            ...layer,
            id: newId,
            name: `${layer.name} copy`,
          };
          draft.layers.push(copy);
          insertAfterInOrder(id, newId, draft.layerOrder, draft.layerGroups);
          draft.activeLayerId = newId;
          return;
        }
        const imgLayer = draft.imageLayers.find((l) => (l.id as string) === id);
        if (imgLayer) {
          const copy: ImageEditorImageLayer = {
            ...imgLayer,
            id: newId,
            name: `${imgLayer.name} copy`,
          };
          draft.imageLayers.push(copy);
          insertAfterInOrder(id, newId, draft.layerOrder, draft.layerGroups);
          draft.activeLayerId = newId;
        }
      });
    },
    [state, setState],
  );

  const duplicateImageEditorGroup = useCallback(
    (id: string) => {
      if (!state) return;
      const newGroupId = uuidv4() as ImageEditorGroupId;
      setState((draft) => {
        const srcGroup = draft.layerGroups.find((g) => (g.id as string) === id);
        if (!srcGroup) return;
        const copy: ImageEditorLayerGroup = {
          ...srcGroup,
          id: newGroupId,
          name: `${srcGroup.name} copy`,
          childOrder: [...srcGroup.childOrder],
        };
        draft.layerGroups.push(copy);
        insertAfterInOrder(id, newGroupId, draft.layerOrder, draft.layerGroups);
      });
    },
    [state, setState],
  );

  const moveImageEditorLayerIntoOrder = useCallback(
    (
      dragId: string,
      targetId: string,
      position: "above" | "below" | "inside",
    ) => {
      if (!state) return;
      setState((draft) => {
        const removeFromOrder = (
          order: (ImageEditorLayerId | ImageEditorGroupId)[],
        ) => {
          const idx = (order as string[]).indexOf(dragId);
          if (idx !== -1) order.splice(idx, 1);
        };
        removeFromOrder(draft.layerOrder);
        for (const g of draft.layerGroups) {
          removeFromOrder(g.childOrder);
        }

        if (position === "inside") {
          const targetGroup = draft.layerGroups.find(
            (g) => (g.id as string) === targetId,
          );
          if (targetGroup) {
            targetGroup.childOrder.push(
              dragId as ImageEditorLayerId | ImageEditorGroupId,
            );
            targetGroup.expanded = true;
          }
        } else {
          let targetOrder: (ImageEditorLayerId | ImageEditorGroupId)[] | null =
            null;
          if ((draft.layerOrder as string[]).includes(targetId)) {
            targetOrder = draft.layerOrder;
          } else {
            for (const g of draft.layerGroups) {
              if ((g.childOrder as string[]).includes(targetId)) {
                targetOrder = g.childOrder;
                break;
              }
            }
          }
          if (targetOrder) {
            const targetIdx = (targetOrder as string[]).indexOf(targetId);
            if (targetIdx !== -1) {
              const insertIdx =
                position === "above" ? targetIdx + 1 : targetIdx;
              targetOrder.splice(
                insertIdx,
                0,
                dragId as ImageEditorLayerId | ImageEditorGroupId,
              );
            }
          }
        }
      });
    },
    [state, setState],
  );

  return {
    state,
    setState,
    initProject,
    resizeCanvas,
    isInitialized: state !== null,

    // Frame data
    getCurrentFrameId,
    getCurrentFrameData,
    getActiveLayerData,
    getCompositeBelowActiveLayer,
    getCompositeAboveActiveLayer,
    getFrameData,
    getLayerFrameData,
    setFrameData,
    getPreviousFrameData,

    // Undo / redo
    pushUndoSnapshot,
    undoPixels,
    redoPixels,
    performUndo,
    performRedo,
    canUndo,
    canRedo,

    // Frame management
    addFrame,
    duplicateFrame,
    deleteFrame,
    moveFrame,
    undoFrameOp,
    redoFrameOp,
    setCurrentFrame,
    setFrameDuration,

    // Tool state
    setTool,
    setPrimaryColor,
    setSecondaryColor,
    setBrushSize,
    setZoom,
    setSelection,
    setOnionSkin,
    setFps,
    setBlurSize,
    setBlurIntensity,
    markSavePoint,
    hasUnsavedImageChanges,

    // Palette
    addPaletteColor,
    removePaletteColor,
    updatePaletteColor,
    resetPalette,
    importPalette,
    exportPalette,
    switchPalette,
    renamePalette,
    deletePalette,
    duplicatePalette,
    reorderPaletteColors,
    restorePaletteLibrary,

    // Playback
    playAnimation,
    stopAnimation,

    // Import / Export
    exportPng,
    exportGif,
    exportSpriteSheet,

    // Layers
    addRasterLayer,
    addImageEditorImageLayer,
    addImageEditorLayerGroup,
    deleteImageEditorLayer,
    deleteImageEditorGroup,
    renameImageEditorLayer,
    toggleImageEditorLayerVisible,
    toggleImageEditorLayerLocked,
    setActiveImageEditorLayer,
    toggleImageEditorGroupExpanded,
    moveImageEditorLayerItem,
    duplicateImageEditorLayer,
    duplicateImageEditorGroup,
    moveImageEditorLayerIntoOrder,
  };
}
