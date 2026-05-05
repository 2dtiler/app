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
import { useImageEditorFrameActions } from "@/features/image-editor/hooks/use-image-editor-frame-actions";
import { useImageEditorLayerActions } from "@/features/image-editor/hooks/use-image-editor-layer-actions";
import { useImageEditorPaletteActions } from "@/features/image-editor/hooks/use-image-editor-palette-actions";
import { encodeGifFrames } from "@/services/gif";
import {
  initImageEditorStore,
  getImageEditorStore,
  isImageEditorStoreReady,
  subscribeToImageEditorStoreInstance,
} from "@/store/image-editor-store";
import * as pixelHistory from "@/features/image-editor/lib/image-editor-history";
import {
  actionLog,
  canvasToPngBlob,
  captureResizeSnapshot,
  clearEditorSelectionState,
  computeComposite,
  computeCompositeAboveLayer,
  computeCompositeBelowLayer,
  downloadBlob,
  ensureStoreReady,
  frameOpRedoStack,
  getLeafLayerIds,
  hasUnsavedImageChanges as hasUnsavedDocumentChanges,
  layerDataKey,
  markSavePoint as markDocumentSavePoint,
  moduleLayerFrameData,
  paletteRedoStack,
  paletteUndoStack,
  redoLog,
  resetImageEditorDocumentState,
  resizeRedoStack,
  resizeUndoStack,
  restoreResizeSnapshot,
  snapshotPaletteLibrary,
} from "@/features/image-editor/lib/image-editor-document";
import type {
  FrameId,
  Color,
  Palette,
  ImageEditorTool,
  ImageEditorState,
  PixelSelection,
} from "@/features/image-editor/types";

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
      resetImageEditorDocumentState();
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

  const applyCanvasResize = useCallback(
    (newWidth: number, newHeight: number) => {
      const store = getImageEditorStore();
      const s = store.getState();
      const oldW = s.width;
      const oldH = s.height;

      if (newWidth === oldW && newHeight === oldH) {
        return;
      }

      const allLayerIds = getLeafLayerIds(
        s.layerOrder,
        s.layers,
        s.imageLayers,
        s.layerGroups,
        true,
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

      clearEditorSelectionState();
      store.setState((draft) => {
        draft.width = newWidth;
        draft.height = newHeight;
        draft.selection = null;
        draft.pixelDataVersion = (draft.pixelDataVersion ?? 0) + 1;
      });
    },
    [],
  );

  const resizeCanvas = useCallback(
    (newWidth: number, newHeight: number) => {
      if (!isImageEditorStoreReady()) return;
      const store = getImageEditorStore();
      const s = store.getState();
      if (newWidth === s.width && newHeight === s.height) return;

      const before = captureResizeSnapshot(s);
      applyCanvasResize(newWidth, newHeight);
      const after = captureResizeSnapshot(store.getState());

      resizeUndoStack.push({ before, after });
      resizeRedoStack.length = 0;
      redoLog.length = 0;
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      actionLog.push("resize");
      forceHistoryUpdate();
    },
    [applyCanvasResize, forceHistoryUpdate],
  );

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

  const frameActions = useImageEditorFrameActions({ state, setState });
  const { undoFrameOp, redoFrameOp } = frameActions;

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
    } else if (type === "resize") {
      const op = resizeUndoStack.pop();
      if (op && isImageEditorStoreReady()) {
        restoreResizeSnapshot(op.before);
        resizeRedoStack.push(op);
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
    } else if (type === "resize") {
      const op = resizeRedoStack.pop();
      if (op && isImageEditorStoreReady()) {
        restoreResizeSnapshot(op.after);
        resizeUndoStack.push(op);
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

  const paletteActions = useImageEditorPaletteActions({ state, setState });

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

    const blob = await encodeGifFrames({
      width: state.width,
      height: state.height,
      transparency: true,
      frames: state.frames.map((frame) => ({
        data: computeComposite(frame.id, state).data,
        delay: frame.duration,
      })),
    });

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
    markDocumentSavePoint(state);
  }, [state]);

  const hasUnsavedImageChanges = useCallback((): boolean => {
    return hasUnsavedDocumentChanges(state);
  }, [state]);

  const layerActions = useImageEditorLayerActions({ state, setState });

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

    ...frameActions,

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

    ...paletteActions,

    // Playback
    playAnimation,
    stopAnimation,

    // Import / Export
    exportPng,
    exportGif,
    exportSpriteSheet,

    ...layerActions,
  };
}
