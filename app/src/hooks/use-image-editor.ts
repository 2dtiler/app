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
} from "@/lib/image-editor-store";
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

export type PaletteExportFormat =
  | "ase"
  | "aseprite"
  | "gpl"
  | "pal"
  | "txt"
  | "hex"
  | "png";
export type PngSwatchSize = 1 | 8 | 16 | 32;

// ---------------------------------------------------------------------------
// Module-level frame data — survives component unmount/remount so the
// editor remembers what you had open when you close and reopen the drawer.
// ---------------------------------------------------------------------------

const moduleFrameData: Map<FrameId, ImageData> = new Map();

// ---------------------------------------------------------------------------
// Frame operation undo/redo stacks
// ---------------------------------------------------------------------------

interface FrameOperation {
  type: "add" | "delete" | "duplicate";
  frameId: FrameId;
  frame: Frame;
  index: number;
  pixelData: ImageData;
  prevFrameIndex: number;
}

const frameOpUndoStack: FrameOperation[] = [];
const frameOpRedoStack: FrameOperation[] = [];

// ---------------------------------------------------------------------------
// Palette undo/redo history
// ---------------------------------------------------------------------------

interface PaletteLibrarySnapshot {
  palettes: Palette[];
  activePaletteId: PaletteId;
}

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

type UndoableActionType = "pixel" | "frame" | "palette";
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
      moduleFrameData.clear();
      paletteUndoStack.length = 0;
      paletteRedoStack.length = 0;
      frameOpUndoStack.length = 0;
      frameOpRedoStack.length = 0;
      actionLog.length = 0;
      redoLog.length = 0;

      initImageEditorStore(width, height, initialPalettes);

      // Create initial blank ImageData for frame 1
      const store = getImageEditorStore();
      const s = store.getState();
      if (s.frames.length > 0) {
        const frame = s.frames[0];
        const imgData = new ImageData(width, height);
        moduleFrameData.set(frame.id, imgData);
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
      // Clear all redo history — any new action voids redo
      redoLog.length = 0;
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      actionLog.push("pixel");
      forceHistoryUpdate();
    }
  }, [getCurrentFrameId, getCurrentFrameData, forceHistoryUpdate]);

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
    const blankData = new ImageData(state.width, state.height);
    moduleFrameData.set(newId, blankData);

    // Record for undo
    frameOpUndoStack.push({
      type: "add",
      frameId: newId,
      frame: { ...newFrame },
      index: state.frames.length,
      pixelData: new ImageData(
        new Uint8ClampedArray(blankData.data),
        blankData.width,
        blankData.height,
      ),
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

    // Deep copy pixel data
    const srcData = moduleFrameData.get(srcFrame.id);
    let copyData: ImageData;
    if (srcData) {
      copyData = new ImageData(
        new Uint8ClampedArray(srcData.data),
        srcData.width,
        srcData.height,
      );
    } else {
      copyData = new ImageData(state.width, state.height);
    }
    moduleFrameData.set(newId, copyData);

    const insertIndex = state.currentFrameIndex + 1;

    // Record for undo
    frameOpUndoStack.push({
      type: "duplicate",
      frameId: newId,
      frame: { ...newFrame },
      index: insertIndex,
      pixelData: new ImageData(
        new Uint8ClampedArray(copyData.data),
        copyData.width,
        copyData.height,
      ),
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

    // Save undo record before deleting
    const pixelData = moduleFrameData.get(frameToDelete.id);
    frameOpUndoStack.push({
      type: "delete",
      frameId: frameToDelete.id,
      frame: { ...frameToDelete },
      index: state.currentFrameIndex,
      pixelData: pixelData
        ? new ImageData(
            new Uint8ClampedArray(pixelData.data),
            pixelData.width,
            pixelData.height,
          )
        : new ImageData(state.width, state.height),
      prevFrameIndex: state.currentFrameIndex,
    });
    frameOpRedoStack.length = 0;
    redoLog.length = 0;
    paletteRedoStack.length = 0;
    actionLog.push("frame");

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

  const undoFrameOp = useCallback((): boolean => {
    if (frameOpUndoStack.length === 0) return false;
    const op = frameOpUndoStack.pop()!;

    switch (op.type) {
      case "add":
      case "duplicate": {
        // Undo add/duplicate: remove the frame that was added
        const currentPixelData = moduleFrameData.get(op.frameId);
        frameOpRedoStack.push({
          ...op,
          pixelData: currentPixelData
            ? new ImageData(
                new Uint8ClampedArray(currentPixelData.data),
                currentPixelData.width,
                currentPixelData.height,
              )
            : op.pixelData,
        });
        moduleFrameData.delete(op.frameId);
        pixelHistory.clearFrameHistory(op.frameId);
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
        // Undo delete: re-insert the frame with its pixel data
        moduleFrameData.set(
          op.frameId,
          new ImageData(
            new Uint8ClampedArray(op.pixelData.data),
            op.pixelData.width,
            op.pixelData.height,
          ),
        );
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
        // Redo add/duplicate: re-insert the frame
        moduleFrameData.set(
          op.frameId,
          new ImageData(
            new Uint8ClampedArray(op.pixelData.data),
            op.pixelData.width,
            op.pixelData.height,
          ),
        );
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
        const currentPixelData = moduleFrameData.get(op.frameId);
        frameOpUndoStack.push({
          ...op,
          pixelData: currentPixelData
            ? new ImageData(
                new Uint8ClampedArray(currentPixelData.data),
                currentPixelData.width,
                currentPixelData.height,
              )
            : op.pixelData,
        });
        moduleFrameData.delete(op.frameId);
        pixelHistory.clearFrameHistory(op.frameId);
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
      if (frameId) {
        const current = moduleFrameData.get(frameId);
        if (current) {
          const restored = pixelHistory.undo(frameId, current);
          if (restored) {
            moduleFrameData.set(frameId, restored);
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
      if (frameId) {
        const current = moduleFrameData.get(frameId);
        if (current) {
          const restored = pixelHistory.redo(frameId, current);
          if (restored) {
            moduleFrameData.set(frameId, restored);
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

  // -----------------------------------------------------------------------
  // Layer management
  // -----------------------------------------------------------------------

  const addRasterLayer = useCallback(
    (name?: string) => {
      if (!state) return;
      const newId = uuidv4() as ImageEditorLayerId;
      const layerCount = state.layers.length + state.imageLayers.length;
      const layerName = name ?? `Layer ${layerCount + 1}`;
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
      const newId = uuidv4() as ImageEditorLayerId;
      const layerCount = state.layers.length + state.imageLayers.length;
      const layerName = name ?? `Image ${layerCount + 1}`;
      setState((draft) => {
        const newLayer: ImageEditorImageLayer = {
          id: newId,
          name: layerName,
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
    },
    [state, setState],
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
    getFrameData,
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
