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
// Hook
// ---------------------------------------------------------------------------

export function useImageEditor() {
  // Track whether we've initialized
  const initializedRef = useRef(false);

  // Per-frame pixel data stored in a Map<FrameId, ImageData>
  const frameDataRef = useRef<Map<FrameId, ImageData>>(new Map());

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
    frameDataRef.current.clear();

    initImageEditorStore(width, height);

    // Create initial blank ImageData for frame 1
    const store = getImageEditorStore();
    const s = store.getState();
    if (s.frames.length > 0) {
      const frame = s.frames[0];
      const imgData = new ImageData(width, height);
      frameDataRef.current.set(frame.id, imgData);
    }

    initializedRef.current = true;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) {
        cancelAnimationFrame(animTimerRef.current);
      }
      destroyImageEditorStore();
      pixelHistory.clearAllHistory();
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
    return frameDataRef.current.get(frameId) ?? null;
  }, [getCurrentFrameId]);

  const getFrameData = useCallback((frameId: FrameId): ImageData | null => {
    return frameDataRef.current.get(frameId) ?? null;
  }, []);

  const setFrameData = useCallback((frameId: FrameId, data: ImageData) => {
    frameDataRef.current.set(frameId, data);
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
    frameDataRef.current.set(newId, new ImageData(state.width, state.height));

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
    const srcData = frameDataRef.current.get(srcFrame.id);
    if (srcData) {
      const copy = new ImageData(
        new Uint8ClampedArray(srcData.data),
        srcData.width,
        srcData.height,
      );
      frameDataRef.current.set(newId, copy);
    } else {
      frameDataRef.current.set(newId, new ImageData(state.width, state.height));
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

    frameDataRef.current.delete(frameToDelete.id);
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

      const currentFrame = s.frames[s.currentFrameIndex];
      const frameDuration = currentFrame ? currentFrame.duration : 1000 / s.fps;

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
    async (file: File) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = url;
      });

      URL.revokeObjectURL(url);

      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // Reinitialize with image dimensions
      initProject(w, h);

      // Draw the image onto frame 1
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h);
      const store = getImageEditorStore();
      const s = store.getState();
      if (s.frames.length > 0) {
        frameDataRef.current.set(s.frames[0].id, imgData);
      }
    },
    [initProject],
  );

  // -----------------------------------------------------------------------
  // Export PNG (single frame)
  // -----------------------------------------------------------------------

  const exportPng = useCallback(() => {
    if (!state) return;
    const frameId = getCurrentFrameId();
    if (!frameId) return;
    const data = frameDataRef.current.get(frameId);
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
      const data = frameDataRef.current.get(frame.id);
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
        const data = frameDataRef.current.get(frame.id);
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
    return frameDataRef.current.get(prevFrame.id) ?? null;
  }, [state]);

  return {
    state,
    setState,
    initProject,
    isInitialized: initializedRef.current && state !== null,

    // Frame data
    getCurrentFrameId,
    getCurrentFrameData,
    getFrameData,
    setFrameData,
    frameDataRef,
    getPreviousFrameData,

    // Undo / redo
    pushUndoSnapshot,
    undoPixels,
    redoPixels,

    // Frame management
    addFrame,
    duplicateFrame,
    deleteFrame,
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
