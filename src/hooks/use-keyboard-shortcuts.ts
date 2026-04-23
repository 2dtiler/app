/**
 * Global keyboard shortcuts for the editor.
 *
 * Shortcuts:
 *   S — Select tool
 *   B — Paint tool
 *   E — Erase tool
 *   G — Fill tool
 *   1–5 — Brush sizes 1×1 through 5×5
 *   Ctrl+Z / Cmd+Z — Undo
 *   Ctrl+Shift+Z / Cmd+Shift+Z — Redo
 *   Ctrl+S / Cmd+S — Manual save
 *   Delete / Backspace — Delete current selection
 *   + / = — Zoom in (map)
 *   - — Zoom out (map)
 */

import { useEffect } from "react";
import { getEditorStore, markEditorSaved } from "@/store/editor-store";
import { zoomStore } from "@/store/zoom-store";
import { saveProject } from "@/services/db";
import type { BrushSize } from "@/types";

const BRUSH_SIZE_MAP: Record<string, BrushSize> = {
  "1": "1x1",
  "2": "2x2",
  "3": "3x3",
  "4": "4x4",
  "5": "5x5",
};

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Undo / Redo
      if (isCtrlOrCmd && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const store = getEditorStore();
        const controls = store.getControls();
        if (controls.canBack()) controls.back();
        return;
      }
      if (isCtrlOrCmd && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const store = getEditorStore();
        const controls = store.getControls();
        if (controls.canForward()) controls.forward();
        return;
      }
      // Also support Ctrl+Y for redo
      if (isCtrlOrCmd && e.key === "y") {
        e.preventDefault();
        const store = getEditorStore();
        const controls = store.getControls();
        if (controls.canForward()) controls.forward();
        return;
      }

      // Manual save
      if (isCtrlOrCmd && e.key === "s") {
        e.preventDefault();
        const store = getEditorStore();
        const project = store.getState().project;
        if (project) {
          markEditorSaved();
          void saveProject({ ...project, updatedAt: Date.now() });
        }
        return;
      }

      // Find and Replace
      if (isCtrlOrCmd && e.key === "h") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("open-find-replace"));
        return;
      }

      // Copy / Cut / Paste — dispatch to whichever panel is listening
      if (isCtrlOrCmd && e.key === "c") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("tile-copy"));
        return;
      }
      if (isCtrlOrCmd && e.key === "x") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("tile-cut"));
        return;
      }
      if (isCtrlOrCmd && e.key === "v") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("tile-paste"));
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("map-delete-selection"));
        return;
      }

      // Don't process tool shortcuts if modifier keys are held
      if (isCtrlOrCmd || e.altKey) return;

      const store = getEditorStore();

      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          store.setState((draft) => {
            draft.currentTool = "select";
          });
          break;
        case "b":
          e.preventDefault();
          store.setState((draft) => {
            draft.currentTool = "paint";
          });
          break;
        case "e":
          e.preventDefault();
          store.setState((draft) => {
            draft.currentTool = "erase";
          });
          break;
        case "g":
          e.preventDefault();
          store.setState((draft) => {
            draft.currentTool = "fill";
          });
          break;
        case "=":
        case "+":
          e.preventDefault();
          zoomStore.setMapZoom(zoomStore.getSnapshot().mapZoom + 0.5);
          break;
        case "-":
          e.preventDefault();
          zoomStore.setMapZoom(zoomStore.getSnapshot().mapZoom - 0.5);
          break;
        default:
          // Brush sizes 1-5
          if (e.key in BRUSH_SIZE_MAP) {
            e.preventDefault();
            const size = BRUSH_SIZE_MAP[e.key];
            store.setState((draft) => {
              draft.brushSize = size;
            });
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
