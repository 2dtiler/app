/**
 * Central React hook for the pixel-art image editor.
 *
 * Combines the travels metadata store, the pixel history manager,
 * frame pixel data management, animation playback, and import/export.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  initImageEditorStore,
  getImageEditorStore,
  isImageEditorStoreReady,
  destroyImageEditorStore,
} from "@/lib/image-editor-store";
import * as pixelHistory from "@/lib/image-editor-history";
import { parseAsePalette, writeAsePalette } from "@/lib/ase-palette";
import type {
  Frame,
  FrameId,
  Color,
  ImageEditorTool,
  ImageEditorState,
  PaletteId,
  PixelSelection,
} from "@/types/image-editor";
import { DEFAULT_PALETTE_COLORS } from "@/types/image-editor";

// ---------------------------------------------------------------------------
// Module-level frame data — survives component unmount/remount so the
// editor remembers what you had open when you close and reopen the drawer.
// ---------------------------------------------------------------------------

const moduleFrameData: Map<FrameId, ImageData> = new Map();

// ---------------------------------------------------------------------------
// Frame deletion undo/redo stacks
// ---------------------------------------------------------------------------

interface DeletedFrameRecord {
  frame: Frame;
  index: number;
  pixelData: ImageData;
}

const deletedFrameUndoStack: DeletedFrameRecord[] = [];
const deletedFrameRedoStack: DeletedFrameRecord[] = [];

/**
 * Ensure the image editor store is initialized.
 * If it's already ready, this is a no-op.
 * Otherwise creates a default 32×32 canvas.
 */
function ensureStoreReady() {
  if (isImageEditorStoreReady()) return;

  const w = 32;
  const h = 32;
  initImageEditorStore(w, h);

  const store = getImageEditorStore();
  const s = store.getState();
  if (s.frames.length > 0 && !moduleFrameData.has(s.frames[0].id)) {
    moduleFrameData.set(s.frames[0].id, new ImageData(w, h));
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
    if (!isImageEditorStoreReady()) return () => {};
    return getImageEditorStore().subscribe(cb);
  }, []);

  const getSnapshot = useCallback((): ImageEditorState | null => {
    if (!isImageEditorStoreReady()) return null;
    return getImageEditorStore().getState();
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot);

  const setState = useCallback((updater: (draft: ImageEditorState) => void) => {
    if (!isImageEditorStoreReady()) return;
    getImageEditorStore().setState(updater);
  }, []);

  // -----------------------------------------------------------------------
  // Initialize
  // -----------------------------------------------------------------------

  const initProject = useCallback((width: number, height: number) => {
    // Tear down any previous instance
    destroyImageEditorStore();
    pixelHistory.clearAllHistory();
    moduleFrameData.clear();

    initImageEditorStore(width, height);

    // Create initial blank ImageData for frame 1
    const store = getImageEditorStore();
    const s = store.getState();
    if (s.frames.length > 0) {
      const frame = s.frames[0];
      const imgData = new ImageData(width, height);
      moduleFrameData.set(frame.id, imgData);
    }
  }, []);

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

    // Resize each frame's pixel data (top-left aligned copy)
    for (const frame of s.frames) {
      const oldData = moduleFrameData.get(frame.id);
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
      moduleFrameData.set(frame.id, newData);
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
    if (!frameId) return null;
    return moduleFrameData.get(frameId) ?? null;
  }, [getCurrentFrameId]);

  const getFrameData = useCallback((frameId: FrameId): ImageData | null => {
    return moduleFrameData.get(frameId) ?? null;
  }, []);

  const setFrameData = useCallback((frameId: FrameId, data: ImageData) => {
    moduleFrameData.set(frameId, data);
  }, []);

  // -----------------------------------------------------------------------
  // Pixel history — undo / redo for the canvas
  // -----------------------------------------------------------------------

  const pushUndoSnapshot = useCallback(() => {
    const frameId = getCurrentFrameId();
    const data = getCurrentFrameData();
    if (frameId && data) {
      pixelHistory.pushSnapshot(frameId, data);
    }
  }, [getCurrentFrameId, getCurrentFrameData]);

  const undoPixels = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    const data = getCurrentFrameData();
    if (!frameId || !data) return null;
    return pixelHistory.undo(frameId, data);
  }, [getCurrentFrameId, getCurrentFrameData]);

  const redoPixels = useCallback((): ImageData | null => {
    const frameId = getCurrentFrameId();
    const data = getCurrentFrameData();
    if (!frameId || !data) return null;
    return pixelHistory.redo(frameId, data);
  }, [getCurrentFrameId, getCurrentFrameData]);

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

    // Create blank ImageData
    moduleFrameData.set(newId, new ImageData(state.width, state.height));

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

    // Deep copy pixel data
    const srcData = moduleFrameData.get(srcFrame.id);
    if (srcData) {
      const copy = new ImageData(
        new Uint8ClampedArray(srcData.data),
        srcData.width,
        srcData.height,
      );
      moduleFrameData.set(newId, copy);
    } else {
      moduleFrameData.set(newId, new ImageData(state.width, state.height));
    }

    setState((d) => {
      d.frames.splice(d.currentFrameIndex + 1, 0, newFrame);
      d.currentFrameIndex = d.currentFrameIndex + 1;
    });
  }, [state, setState]);

  const deleteFrame = useCallback(() => {
    if (!state || state.frames.length <= 1) return;
    const frameToDelete = state.frames[state.currentFrameIndex];
    if (!frameToDelete) return;

    // Save undo record before deleting
    const pixelData = moduleFrameData.get(frameToDelete.id);
    if (pixelData) {
      deletedFrameUndoStack.push({
        frame: { ...frameToDelete },
        index: state.currentFrameIndex,
        pixelData: new ImageData(
          new Uint8ClampedArray(pixelData.data),
          pixelData.width,
          pixelData.height,
        ),
      });
      // New deletion invalidates redo stack
      deletedFrameRedoStack.length = 0;
    }

    moduleFrameData.delete(frameToDelete.id);
    pixelHistory.clearFrameHistory(frameToDelete.id);

    setState((d) => {
      d.frames.splice(d.currentFrameIndex, 1);
      if (d.currentFrameIndex >= d.frames.length) {
        d.currentFrameIndex = d.frames.length - 1;
      }
    });
  }, [state, setState]);

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

  const undoDeleteFrame = useCallback((): boolean => {
    if (deletedFrameUndoStack.length === 0) return false;
    const record = deletedFrameUndoStack.pop()!;

    // Restore pixel data
    moduleFrameData.set(record.frame.id, record.pixelData);

    // Restore frame in state
    setState((d) => {
      const idx = Math.min(record.index, d.frames.length);
      d.frames.splice(idx, 0, record.frame);
      d.currentFrameIndex = idx;
    });

    deletedFrameRedoStack.push(record);
    return true;
  }, [setState]);

  const redoDeleteFrame = useCallback((): boolean => {
    if (deletedFrameRedoStack.length === 0) return false;
    const record = deletedFrameRedoStack.pop()!;

    moduleFrameData.delete(record.frame.id);
    pixelHistory.clearFrameHistory(record.frame.id);

    setState((d) => {
      const idx = d.frames.findIndex((f) => f.id === record.frame.id);
      if (idx >= 0) {
        d.frames.splice(idx, 1);
        if (d.currentFrameIndex >= d.frames.length) {
          d.currentFrameIndex = d.frames.length - 1;
        }
      }
    });

    deletedFrameUndoStack.push(record);
    return true;
  }, [setState]);

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

  const setLoop = useCallback(
    (on: boolean) =>
      setState((d) => {
        d.loop = on;
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
      setState((d) => {
        d.palette.colors.push(color);
      });
    },
    [setState],
  );

  const removePaletteColor = useCallback(
    (index: number) => {
      setState((d) => {
        d.palette.colors.splice(index, 1);
      });
    },
    [setState],
  );

  const updatePaletteColor = useCallback(
    (index: number, color: Color) => {
      setState((d) => {
        if (d.palette.colors[index]) {
          d.palette.colors[index] = color;
        }
      });
    },
    [setState],
  );

  const resetPalette = useCallback(() => {
    setState((d) => {
      d.palette = {
        id: uuidv4() as PaletteId,
        name: "Default",
        colors: [...DEFAULT_PALETTE_COLORS],
      };
    });
  }, [setState]);

  const importPalette = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const colors = parseAsePalette(buffer);
      if (colors.length === 0) return;

      setState((d) => {
        d.palette = {
          id: uuidv4() as PaletteId,
          name: file.name.replace(/\.(ase|aseprite)$/i, ""),
          colors,
        };
      });
    },
    [setState],
  );

  const exportPalette = useCallback(() => {
    if (!state) return;
    const buffer = writeAsePalette(state.palette.colors);
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.palette.name || "palette"}.ase`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

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
          if (s.loop) {
            getImageEditorStore().setState((d) => {
              d.currentFrameIndex = 0;
            });
          } else {
            stopAnimation();
            return;
          }
        } else {
          getImageEditorStore().setState((d) => {
            d.currentFrameIndex = nextIndex;
          });
        }
      }

      animTimerRef.current = requestAnimationFrame(tick);
    };

    animTimerRef.current = requestAnimationFrame(tick);
  }, [state, setState, stopAnimation]);

  // -----------------------------------------------------------------------
  // Import image
  // -----------------------------------------------------------------------

  const importImage = useCallback(
    async (file: File): Promise<ImageData | null> => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }

      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // Draw the image onto an offscreen canvas to get pixel data
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h);

      // Switch to selection tool so the user can position the imported image
      setTool("selection");

      return imgData;
    },
    [setTool],
  );

  // -----------------------------------------------------------------------
  // Export PNG (single frame)
  // -----------------------------------------------------------------------

  const exportPng = useCallback(() => {
    if (!state) return;
    const frameId = getCurrentFrameId();
    if (!frameId) return;
    const data = moduleFrameData.get(frameId);
    if (!data) return;

    const canvas = document.createElement("canvas");
    canvas.width = state.width;
    canvas.height = state.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(data, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sprite.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [state, getCurrentFrameId]);

  // -----------------------------------------------------------------------
  // Export animated GIF
  // -----------------------------------------------------------------------

  const exportGif = useCallback(async () => {
    if (!state || state.frames.length === 0) return;

    // Dynamic import gifenc
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");

    const gif = GIFEncoder();

    for (const frame of state.frames) {
      const data = moduleFrameData.get(frame.id);
      if (!data) continue;

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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "animation.gif";
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  // -----------------------------------------------------------------------
  // Export sprite sheet
  // -----------------------------------------------------------------------

  const exportSpriteSheet = useCallback(
    (columns?: number) => {
      if (!state || state.frames.length === 0) return;

      const cols = columns ?? state.frames.length;
      const rows = Math.ceil(state.frames.length / cols);
      const totalW = cols * state.width;
      const totalH = rows * state.height;

      const canvas = document.createElement("canvas");
      canvas.width = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext("2d")!;

      state.frames.forEach((frame, i) => {
        const data = moduleFrameData.get(frame.id);
        if (!data) return;
        const col = i % cols;
        const row = Math.floor(i / cols);
        ctx.putImageData(data, col * state.width, row * state.height);
      });

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "spritesheet.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
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
    return moduleFrameData.get(prevFrame.id) ?? null;
  }, [state]);

  return {
    state,
    setState,
    initProject,
    resizeCanvas,
    isInitialized: state !== null,

    // Frame data
    getCurrentFrameId,
    getCurrentFrameData,
    getFrameData,
    setFrameData,
    getPreviousFrameData,

    // Undo / redo
    pushUndoSnapshot,
    undoPixels,
    redoPixels,

    // Frame management
    addFrame,
    duplicateFrame,
    deleteFrame,
    undoDeleteFrame,
    redoDeleteFrame,
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
    setLoop,
    setFps,
    setBlurSize,
    setBlurIntensity,

    // Palette
    addPaletteColor,
    removePaletteColor,
    updatePaletteColor,
    resetPalette,
    importPalette,
    exportPalette,

    // Playback
    playAnimation,
    stopAnimation,

    // Import / Export
    importImage,
    exportPng,
    exportGif,
    exportSpriteSheet,
  };
}
