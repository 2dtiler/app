import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  parseAsePalette,
  writeAsePalette,
} from "@/features/image-editor/lib/ase-palette";
import {
  downloadBlob,
  getActivePaletteIndex,
  paletteRedoStack,
  paletteUndoStack,
  snapshotPaletteLibrary,
} from "@/features/image-editor/lib/image-editor-document";
import {
  getImageEditorStore,
  isImageEditorStoreReady,
} from "@/store/image-editor-store";
import {
  parseGpl,
  parseHex,
  parseJascPal,
  parsePaintNetTxt,
  parsePng,
  writeGpl,
  writeHex,
  writeJascPal,
  writePaintNetTxt,
  writePng,
} from "@/features/image-editor/lib/palette-formats";
import {
  parsePhotoshopAse,
  writePhotoshopAse,
} from "@/features/image-editor/lib/photoshop-ase";
import { DEFAULT_PALETTE_COLORS, getActivePalette } from "@/types/image-editor";
import type { Color, Palette, PaletteId } from "@/types/image-editor";
import type {
  PaletteExportFormat,
  PngSwatchSize,
} from "@/types/image-editor/image-editor-hook";
import type { ImageEditorPaletteActionsParams } from "@/types/image-editor/image-editor-hook-internals";
import {
  actionLog,
  frameOpRedoStack,
  redoLog,
} from "@/features/image-editor/lib/image-editor-document";

export function useImageEditorPaletteActions({
  state,
  setState,
}: ImageEditorPaletteActionsParams) {
  const addPaletteColor = useCallback(
    (color: Color) => {
      if (state) {
        paletteUndoStack.push(snapshotPaletteLibrary(state));
        paletteRedoStack.length = 0;
        frameOpRedoStack.length = 0;
        redoLog.length = 0;
        actionLog.push("palette");
      }
      setState((draft) => {
        draft.palettes[getActivePaletteIndex(draft)].colors.push(color);
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
      setState((draft) => {
        draft.palettes[getActivePaletteIndex(draft)].colors.splice(index, 1);
      });
    },
    [state, setState],
  );

  const updatePaletteColor = useCallback(
    (index: number, color: Color) => {
      setState((draft) => {
        const palette = draft.palettes[getActivePaletteIndex(draft)];
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
    setState((draft) => {
      const palette = draft.palettes[getActivePaletteIndex(draft)];
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
        const buffer = await file.arrayBuffer();
        const signature = new DataView(buffer).getUint32(0, false);
        colors =
          signature === 0x41534546
            ? parsePhotoshopAse(buffer)
            : parseAsePalette(buffer);
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

      if (isImageEditorStoreReady()) {
        const currentState = getImageEditorStore().getState();
        paletteUndoStack.push(snapshotPaletteLibrary(currentState));
        paletteRedoStack.length = 0;
        frameOpRedoStack.length = 0;
        redoLog.length = 0;
        actionLog.push("palette");
      }

      const paletteName = file.name.replace(/\.[^.]+$/, "");
      const newId = uuidv4() as PaletteId;
      setState((draft) => {
        draft.palettes.push({
          id: newId,
          name: paletteName,
          colors,
        });
        draft.activePaletteId = newId;
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
        blob = await writePng(colors, swatchSize);
        filename = `${baseName}-${swatchSize}px.png`;
      }

      downloadBlob(blob, filename);
    },
    [state],
  );

  const switchPalette = useCallback(
    (id: PaletteId) => {
      setState((draft) => {
        if (draft.palettes.some((palette) => palette.id === id)) {
          draft.activePaletteId = id;
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
      setState((draft) => {
        const palette = draft.palettes.find((entry) => entry.id === id);
        if (palette) {
          palette.name = name;
        }
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
      setState((draft) => {
        const index = draft.palettes.findIndex((palette) => palette.id === id);
        if (index < 0) return;

        draft.palettes.splice(index, 1);
        if (draft.activePaletteId === id) {
          draft.activePaletteId =
            draft.palettes[Math.min(index, draft.palettes.length - 1)].id;
        }
      });
    },
    [state, setState],
  );

  const duplicatePalette = useCallback(
    (id: PaletteId) => {
      if (!state) return;

      const source = state.palettes.find((palette) => palette.id === id);
      if (!source) return;

      paletteUndoStack.push(snapshotPaletteLibrary(state));
      paletteRedoStack.length = 0;
      frameOpRedoStack.length = 0;
      redoLog.length = 0;
      actionLog.push("palette");

      const newId = uuidv4() as PaletteId;
      const sourceColors = source.colors.map((color) => ({ ...color }));
      setState((draft) => {
        const sourceIndex = draft.palettes.findIndex(
          (palette) => palette.id === id,
        );
        draft.palettes.splice(sourceIndex + 1, 0, {
          id: newId,
          name: `${source.name} (copy)`,
          colors: sourceColors,
        });
        draft.activePaletteId = newId;
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

      setState((draft) => {
        const palette = draft.palettes[getActivePaletteIndex(draft)];
        const colors = palette.colors;
        if (
          fromIndex < 0 ||
          fromIndex >= colors.length ||
          toIndex < 0 ||
          toIndex >= colors.length
        ) {
          return;
        }

        const [moved] = colors.splice(fromIndex, 1);
        colors.splice(toIndex, 0, moved);
      });
    },
    [state, setState],
  );

  const restorePaletteLibrary = useCallback(
    (palettes: Palette[]) => {
      if (!isImageEditorStoreReady() || palettes.length === 0) return;

      paletteUndoStack.length = 0;
      paletteRedoStack.length = 0;
      setState((draft) => {
        draft.palettes = palettes.map((palette) => ({
          ...palette,
          colors: palette.colors.map((color) => ({ ...color })),
        }));
        draft.activePaletteId = palettes[0].id;
      });
    },
    [setState],
  );

  return {
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
  };
}
