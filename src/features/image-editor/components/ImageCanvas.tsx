import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
} from "react";
import type {
  ToolContext,
  StrokeState,
} from "@/features/image-editor/types/image-editor-internals";
import type { ImageEditorTool } from "@/features/image-editor/types";
import type { ImageCanvasProps } from "@/features/image-editor/types/image-editor-ui";
import type {
  ImageCanvasResizeAction,
  ImageCanvasResizeHandle,
  ImageCanvasResizePreview,
} from "@/features/image-editor/types/image-editor-ui";
import { ImageCanvasResizeControls } from "./ImageCanvasResizeControls";
import {
  createStrokeState,
  dispatchDown,
  dispatchMove,
  dispatchUp,
  commitFloatingSelection,
  resetSelectionState,
  getSelectionState,
  getCropState,
  resetCropState,
  copySelectionPixels,
  pasteSelectionPixels,
  hitTestResizeHandle,
  hitTestCropHandle,
  getResizeHandleCursor,
  drawFloatingOnOverlay,
} from "@/features/image-editor/lib/image-editor-tools";
import {
  beginCanvasResizeAction,
  getCanvasResizeCommit,
  updateCanvasResizeAction,
} from "@/features/image-editor/lib/canvas-resize-controller";

export function ImageCanvas({
  width,
  height,
  zoom,
  tool,
  primaryColor,
  secondaryColor,
  brushSize,
  blurSize,
  blurIntensity,
  currentFrameId,
  activeLayerData,
  belowComposite,
  aboveComposite,
  previousFrameData,
  onionSkin,
  selection,
  isLayerLocked,
  onZoom,
  onPushUndo,
  onSelectionChange,
  onFrameDataChange,
  onResizeCanvas,
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCompositeRef = useRef<HTMLCanvasElement>(null);
  const fgCompositeRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const selBorderRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<StrokeState>(createStrokeState());
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const clipboardRef = useRef<ImageData | null>(null);
  const prevToolRef = useRef<ImageEditorTool>(tool);
  const resizeActionRef = useRef<ImageCanvasResizeAction | null>(null);
  // Tracks which "WxH" we've already auto-zoomed for, so we only fire once per
  // new image dimensions regardless of how many ResizeObserver callbacks arrive.
  const autoZoomedForRef = useRef<string>("");
  const [activeResizeHandle, setActiveResizeHandle] =
    useState<ImageCanvasResizeHandle>(null);
  const [hoveredResizeHandle, setHoveredResizeHandle] =
    useState<ImageCanvasResizeHandle>(null);
  const [resizePreview, setResizePreview] =
    useState<ImageCanvasResizePreview | null>(null);

  const endCanvasResize = useCallback(
    (commit: boolean) => {
      const action = resizeActionRef.current;
      if (!action) return;

      const nextResize = getCanvasResizeCommit(action, commit);

      resizeActionRef.current = null;
      setActiveResizeHandle(null);
      setHoveredResizeHandle(null);
      setResizePreview(null);

      if (nextResize) {
        onResizeCanvas(nextResize.width, nextResize.height);
      }
    },
    [onResizeCanvas],
  );

  const updateCanvasResizePreview = useCallback(
    (clientX: number, clientY: number) => {
      const action = resizeActionRef.current;
      if (!action) return;

      setResizePreview(updateCanvasResizeAction(action, clientX, clientY, zoom));
    },
    [zoom],
  );

  const beginCanvasResize = useCallback(
    (
      handle: Exclude<ImageCanvasResizeHandle, null>,
      e: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();
      const nextAction = beginCanvasResizeAction(
        handle,
        e.clientX,
        e.clientY,
        width,
        height,
      );
      resizeActionRef.current = nextAction;
      setActiveResizeHandle(handle);
      setHoveredResizeHandle(handle);
      setResizePreview({ width: nextAction.nextWidth, height: nextAction.nextHeight });
    },
    [width, height],
  );

  useEffect(() => {
    if (!activeResizeHandle) return;

    function handleWindowPointerMove(e: PointerEvent) {
      e.preventDefault();
      updateCanvasResizePreview(e.clientX, e.clientY);
    }

    function handleWindowPointerUp(e: PointerEvent) {
      if (e.button !== 0) return;
      endCanvasResize(true);
    }

    function handleWindowPointerCancel() {
      endCanvasResize(false);
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [activeResizeHandle, endCanvasResize, updateCanvasResizePreview]);

  // When switching away from selection tool, commit any floating selection
  useEffect(() => {
    if (prevToolRef.current === "selection" && tool !== "selection") {
      const ss = getSelectionState();
      if (ss.floatingPixels) {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (canvas && overlay) {
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          const overlayCtx = overlay.getContext("2d", {
            willReadFrequently: true,
          });
          if (ctx && overlayCtx) {
            const tc: ToolContext = {
              ctx,
              overlayCtx,
              width,
              height,
              color: primaryColor,
              brushSize,
              tool,
              shiftKey: false,
              blurSize,
              blurIntensity,
            };
            commitFloatingSelection(tc);
            resetSelectionState();
            overlayCtx.clearRect(0, 0, width, height);
            onSelectionChange(null);
            if (currentFrameId) {
              const imgData = ctx.getImageData(0, 0, width, height);
              onFrameDataChange(currentFrameId, imgData);
            }
          }
        }
      }
    }
    if (prevToolRef.current === "crop" && tool !== "crop") {
      const overlay = overlayRef.current;
      const overlayCtx = overlay?.getContext("2d", {
        willReadFrequently: true,
      });
      overlayCtx?.clearRect(0, 0, width, height);
      resetCropState();
      onSelectionChange(null);
    }
    // Reset cursor when leaving selection tool
    if (tool !== "selection" && tool !== "crop") {
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "";
    }

    prevToolRef.current = tool;
  }, [
    tool,
    width,
    height,
    primaryColor,
    brushSize,
    currentFrameId,
    blurIntensity,
    blurSize,
    onSelectionChange,
    onFrameDataChange,
  ]);

  // Sync active layer data onto main (drawing) canvas whenever it changes.
  // Skip while a stroke is active to avoid overwriting in-progress pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeLayerData) return;
    if (strokeRef.current.active) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(activeLayerData, 0, 0);
  }, [activeLayerData, currentFrameId, width, height]);

  // Sync below-composite canvas (layers rendered behind the active layer)
  useEffect(() => {
    const canvas = bgCompositeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (belowComposite) ctx.putImageData(belowComposite, 0, 0);
  }, [belowComposite, currentFrameId, width, height]);

  // Sync above-composite canvas (layers rendered in front of the active layer)
  useEffect(() => {
    const canvas = fgCompositeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (aboveComposite) ctx.putImageData(aboveComposite, 0, 0);
  }, [aboveComposite, currentFrameId, width, height]);

  // Draw onion skin
  useEffect(() => {
    const onionCanvas = onionRef.current;
    if (!onionCanvas) return;
    const ctx = onionCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    if (onionSkin && previousFrameData) {
      ctx.globalAlpha = 0.3;
      ctx.putImageData(previousFrameData, 0, 0);
      ctx.globalAlpha = 1.0;
    }
  }, [onionSkin, previousFrameData, width, height]);

  // Zoom with Ctrl+Wheel
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const step = zoom < 4 ? 1 : zoom < 16 ? 2 : 4;
      const newZoom = Math.max(1, Math.min(64, zoom + direction * step));
      onZoom(newZoom);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoom, onZoom]);

  // Auto-zoom: use a ResizeObserver so we read the container's real laid-out
  // size (the rAF trick is unreliable because the Panel hasn't settled yet).
  // We fire once per unique image size; after that the user controls zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tryAutoZoom = (cw: number, ch: number) => {
      const key = `${width}x${height}`;
      if (autoZoomedForRef.current === key) return;
      if (cw === 0 || ch === 0) return;
      autoZoomedForRef.current = key;
      const raw = Math.min((cw * 0.8) / width, (ch * 0.8) / height);
      const newZoom = Math.max(1, Math.min(64, Math.floor(raw)));
      onZoom(newZoom);
    };

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) tryAutoZoom(rect.width, rect.height);
    });

    ro.observe(container);
    // Also try immediately in case the container is already sized
    tryAutoZoom(container.clientWidth, container.clientHeight);

    return () => ro.disconnect();
  }, [width, height, onZoom]); // new ResizeObserver when image dimensions change

  // Middle-mouse pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      };
      container.style.cursor = "grabbing";
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      container.scrollLeft = panStartRef.current.scrollLeft - dx;
      container.scrollTop = panStartRef.current.scrollTop - dy;
    };

    const handleMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        container.style.cursor = "";
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const getToolContext = useCallback(
    (opts?: { shiftKey?: boolean }): ToolContext | null => {
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (!canvas || !overlay) return null;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const overlayCtx = overlay.getContext("2d", { willReadFrequently: true });
      if (!ctx || !overlayCtx) return null;
      return {
        ctx,
        overlayCtx,
        width,
        height,
        color: primaryColor,
        brushSize,
        tool,
        shiftKey: opts?.shiftKey ?? false,
        blurSize,
        blurIntensity,
      };
    },
    [width, height, primaryColor, brushSize, tool, blurSize, blurIntensity],
  );

  // Draw floating pixels on overlay when selection exists
  useEffect(() => {
    if (tool !== "selection" || !selection) return;
    const tc = getToolContext();
    if (!tc) return;

    const ss = getSelectionState();
    if (
      ss.floatingPixels &&
      !ss.draggingFloating &&
      !ss.resizingHandle &&
      !strokeRef.current.active
    ) {
      drawFloatingOnOverlay(tc);
    }
  }, [tool, selection, width, height, getToolContext]);

  useEffect(() => {
    if (tool !== "crop") return;
    const tc = getToolContext();
    if (!tc) return;

    tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
    if (!selection) return;

    tc.overlayCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
    tc.overlayCtx.fillRect(0, 0, tc.width, tc.height);
    tc.overlayCtx.clearRect(
      selection.x,
      selection.y,
      selection.width,
      selection.height,
    );
  }, [tool, selection, getToolContext]);

  // Animated marching-ants selection border (screen-resolution canvas)
  const selectionRef = useRef(selection);
  useLayoutEffect(() => {
    selectionRef.current = selection;
  });

  useEffect(() => {
    const c = selBorderRef.current;
    if (!c) return;

    if (tool !== "selection" && tool !== "crop") {
      const ctx = c.getContext("2d");
      ctx?.clearRect(0, 0, c.width, c.height);
      return;
    }

    let animFrame: number;
    let offset = 0;
    let lastTime = 0;

    const draw = (time: number) => {
      const ctx = c.getContext("2d");
      if (!ctx) {
        animFrame = requestAnimationFrame(draw);
        return;
      }

      // Ensure canvas size matches display
      const targetW = width * zoom;
      const targetH = height * zoom;
      if (c.width !== targetW || c.height !== targetH) {
        c.width = targetW;
        c.height = targetH;
      }

      ctx.clearRect(0, 0, c.width, c.height);

      const sel = selectionRef.current;
      if (!sel || (sel.width <= 0 && sel.height <= 0)) {
        animFrame = requestAnimationFrame(draw);
        return;
      }

      // Advance marching offset (~15fps animation)
      const dt = time - lastTime;
      if (dt > 66) {
        offset = (offset + 1) % 12;
        lastTime = time;
      }

      const sx = Math.round(sel.x * zoom);
      const sy = Math.round(sel.y * zoom);
      const sw = Math.round(sel.width * zoom);
      const sh = Math.round(sel.height * zoom);

      if (sw <= 0 || sh <= 0) {
        animFrame = requestAnimationFrame(draw);
        return;
      }

      // Marching ants: alternating black/white dashes
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);

      ctx.strokeStyle = "#fff";
      ctx.lineDashOffset = -offset;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);

      ctx.strokeStyle = "#000";
      ctx.lineDashOffset = -(offset + 6);
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);

      ctx.setLineDash([]);

      // Resize handles for floating selection
      const ss = getSelectionState();
      if (tool === "selection" && ss.floatingPixels) {
        const hs = 4;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;

        const handles: [number, number][] = [
          [sx, sy],
          [sx + sw / 2, sy],
          [sx + sw, sy],
          [sx, sy + sh / 2],
          [sx + sw, sy + sh / 2],
          [sx, sy + sh],
          [sx + sw / 2, sy + sh],
          [sx + sw, sy + sh],
        ];

        for (const [hx, hy] of handles) {
          ctx.fillRect(
            Math.round(hx) - hs,
            Math.round(hy) - hs,
            hs * 2,
            hs * 2,
          );
          ctx.strokeRect(
            Math.round(hx) - hs + 0.5,
            Math.round(hy) - hs + 0.5,
            hs * 2 - 1,
            hs * 2 - 1,
          );
        }
      }

      if (tool === "crop") {
        const hs = 4;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;

        const handles: [number, number][] = [
          [sx, sy],
          [sx + sw / 2, sy],
          [sx + sw, sy],
          [sx, sy + sh / 2],
          [sx + sw, sy + sh / 2],
          [sx, sy + sh],
          [sx + sw / 2, sy + sh],
          [sx + sw, sy + sh],
        ];

        for (const [hx, hy] of handles) {
          ctx.fillRect(
            Math.round(hx) - hs,
            Math.round(hy) - hs,
            hs * 2,
            hs * 2,
          );
          ctx.strokeRect(
            Math.round(hx) - hs + 0.5,
            Math.round(hy) - hs + 0.5,
            hs * 2 - 1,
            hs * 2 - 1,
          );
        }
      }

      animFrame = requestAnimationFrame(draw);
    };

    animFrame = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animFrame);
  }, [tool, zoom, width, height]);

  // Selection tool keyboard shortcuts: copy, paste, delete, escape
  useEffect(() => {
    if (tool !== "selection") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const tc = getToolContext();
      if (!tc) return;

      // Ctrl+C: copy floating selection
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const copied = copySelectionPixels();
        if (copied) {
          clipboardRef.current = copied;
        }
        return;
      }

      // Ctrl+X: cut floating selection (copy + delete)
      if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        const ss = getSelectionState();
        if (ss.floatingPixels) {
          e.preventDefault();
          clipboardRef.current = copySelectionPixels();
          resetSelectionState();
          tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
          onSelectionChange(null);
          if (currentFrameId) {
            const imgData = tc.ctx.getImageData(0, 0, width, height);
            onFrameDataChange(currentFrameId, imgData);
          }
        }
        return;
      }

      // Ctrl+V: paste from clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        onPushUndo();
        const sel = pasteSelectionPixels(tc, clipboardRef.current);
        onSelectionChange(sel);
        if (currentFrameId) {
          const imgData = tc.ctx.getImageData(0, 0, width, height);
          onFrameDataChange(currentFrameId, imgData);
        }
        return;
      }

      // Delete/Backspace: delete floating selection
      if (e.key === "Delete" || e.key === "Backspace") {
        const ss = getSelectionState();
        if (ss.floatingPixels) {
          e.preventDefault();
          // Simply discard the floating pixels without committing
          resetSelectionState();
          tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
          onSelectionChange(null);
          if (currentFrameId) {
            const imgData = tc.ctx.getImageData(0, 0, width, height);
            onFrameDataChange(currentFrameId, imgData);
          }
        }
        return;
      }

      // Escape: commit floating selection and deselect
      if (e.key === "Escape") {
        const ss = getSelectionState();
        if (ss.floatingPixels) {
          e.preventDefault();
          commitFloatingSelection(tc);
          resetSelectionState();
          tc.overlayCtx.clearRect(0, 0, tc.width, tc.height);
          onSelectionChange(null);
          if (currentFrameId) {
            const imgData = tc.ctx.getImageData(0, 0, width, height);
            onFrameDataChange(currentFrameId, imgData);
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    tool,
    width,
    height,
    currentFrameId,
    getToolContext,
    onPushUndo,
    onSelectionChange,
    onFrameDataChange,
  ]);

  // Convert mouse event to pixel coordinates
  const toPixel = useCallback(
    (e: React.MouseEvent): [number, number] => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / zoom);
      const y = Math.floor((e.clientY - rect.top) / zoom);
      return [x, y];
    },
    [zoom],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1) return; // middle mouse = pan
      if (!currentFrameId) return;
      if (isLayerLocked) return; // locked layer — no drawing allowed

      const tc = getToolContext({ shiftKey: e.shiftKey });
      if (!tc) return;

      // Use secondary color for right-click
      if (e.button === 2) {
        tc.color = secondaryColor;
      }

      if (tool !== "crop") {
        onPushUndo();
      }

      const [px, py] = toPixel(e as unknown as React.MouseEvent);
      dispatchDown(tool, tc, px, py, strokeRef.current);

      // Capture pointer for drag
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      tool,
      currentFrameId,
      isLayerLocked,
      secondaryColor,
      getToolContext,
      toPixel,
      onPushUndo,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const [px, py] = toPixel(e as unknown as React.MouseEvent);

      // Update cursor for selection tool resize handles (even when not actively drawing)
      if (tool === "selection" && !strokeRef.current.active) {
        const ss = getSelectionState();
        if (ss.floatingPixels) {
          const handle = hitTestResizeHandle(px, py);
          const canvas = canvasRef.current;
          if (canvas) {
            if (handle) {
              canvas.style.cursor = getResizeHandleCursor(handle);
            } else if (
              px >= ss.floatingX &&
              py >= ss.floatingY &&
              px < ss.floatingX + ss.displayWidth &&
              py < ss.floatingY + ss.displayHeight
            ) {
              canvas.style.cursor = "move";
            } else {
              canvas.style.cursor = "crosshair";
            }
          }
        } else {
          const canvas = canvasRef.current;
          if (canvas) canvas.style.cursor = "crosshair";
        }
        return;
      }

      if (tool === "crop" && !strokeRef.current.active) {
        const cropState = getCropState();
        const canvas = canvasRef.current;
        if (canvas) {
          if (cropState.rect) {
            const handle = hitTestCropHandle(px, py);
            if (handle) {
              canvas.style.cursor = getResizeHandleCursor(handle);
            } else if (
              px >= cropState.rect.x &&
              py >= cropState.rect.y &&
              px < cropState.rect.x + cropState.rect.width &&
              py < cropState.rect.y + cropState.rect.height
            ) {
              canvas.style.cursor = "move";
            } else {
              canvas.style.cursor = "crosshair";
            }
          } else {
            canvas.style.cursor = "crosshair";
          }
        }
        return;
      }

      if (!strokeRef.current.active) return;
      const tc = getToolContext({ shiftKey: e.shiftKey });
      if (!tc) return;

      // Preserve secondary color for right-click drags
      if (e.buttons & 2) {
        tc.color = secondaryColor;
      }

      const sel = dispatchMove(tool, tc, px, py, strokeRef.current);

      if ((tool === "selection" || tool === "crop") && sel) {
        onSelectionChange(sel);
      }
    },
    [tool, secondaryColor, getToolContext, toPixel, onSelectionChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const tc = getToolContext({ shiftKey: e.shiftKey });
      if (!tc) return;

      // Preserve secondary color if right mouse button was released
      if (e.button === 2) {
        tc.color = secondaryColor;
      }

      const [px, py] = toPixel(e as unknown as React.MouseEvent);
      const sel = dispatchUp(tool, tc, px, py, strokeRef.current);

      if (tool === "selection" || tool === "crop") {
        onSelectionChange(sel);
      }

      // Save updated frame data back
      if (tool !== "crop" && currentFrameId) {
        const imgData = tc.ctx.getImageData(0, 0, width, height);
        onFrameDataChange(currentFrameId, imgData);
      }
    },
    [
      tool,
      currentFrameId,
      width,
      height,
      secondaryColor,
      getToolContext,
      toPixel,
      onSelectionChange,
      onFrameDataChange,
    ],
  );

  const canvasPixelW = width * zoom;
  const canvasPixelH = height * zoom;
  const previewWidth = resizePreview?.width ?? width;
  const previewHeight = resizePreview?.height ?? height;
  const previewPixelW = previewWidth * zoom;
  const previewPixelH = previewHeight * zoom;
  const wrapperWidth = previewPixelW + 14;
  const wrapperHeight = previewPixelH + 14;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-background"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="relative inline-block"
        style={{
          width: wrapperWidth,
          height: wrapperHeight,
          minWidth: wrapperWidth,
          minHeight: wrapperHeight,
        }}
      >
        <div
          className="absolute top-0 left-0 overflow-hidden"
          style={{
            width: previewPixelW,
            height: previewPixelH,
            backgroundColor: "var(--checkerboard-base)",
            backgroundImage:
              "linear-gradient(45deg, var(--checkerboard-accent) 25%, transparent 25%), " +
              "linear-gradient(-45deg, var(--checkerboard-accent) 25%, transparent 25%), " +
              "linear-gradient(45deg, transparent 75%, var(--checkerboard-accent) 75%), " +
              "linear-gradient(-45deg, transparent 75%, var(--checkerboard-accent) 75%)",
            backgroundSize: `${zoom * 2}px ${zoom * 2}px`,
            backgroundPosition: `0 0, 0 ${zoom}px, ${zoom}px -${zoom}px, -${zoom}px 0`,
          }}
        >
          {/* Onion skin canvas */}
          <canvas
            ref={onionRef}
            width={width}
            height={height}
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: canvasPixelW,
              height: canvasPixelH,
              imageRendering: "pixelated",
              opacity: 0.3,
            }}
          />

          {/* Layers below the active layer (background composite) */}
          <canvas
            ref={bgCompositeRef}
            width={width}
            height={height}
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: canvasPixelW,
              height: canvasPixelH,
              imageRendering: "pixelated",
            }}
          />

          {/* Main drawing canvas — only holds active layer pixels */}
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute top-0 left-0"
            style={{
              width: canvasPixelW,
              height: canvasPixelH,
              imageRendering: "pixelated",
              cursor: isLayerLocked ? "not-allowed" : undefined,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />

          {/* Layers above the active layer (foreground composite) */}
          <canvas
            ref={fgCompositeRef}
            width={width}
            height={height}
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: canvasPixelW,
              height: canvasPixelH,
              imageRendering: "pixelated",
              opacity: 0.5,
            }}
          />

          {/* Overlay canvas (tool previews) */}
          <canvas
            ref={overlayRef}
            width={width}
            height={height}
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: canvasPixelW,
              height: canvasPixelH,
              imageRendering: "pixelated",
            }}
          />

          {/* Screen-resolution selection border canvas (marching ants) */}
          <canvas
            ref={selBorderRef}
            width={canvasPixelW}
            height={canvasPixelH}
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: canvasPixelW,
              height: canvasPixelH,
            }}
          />
        </div>

        <ImageCanvasResizeControls
          previewPixelW={previewPixelW}
          previewPixelH={previewPixelH}
          activeResizeHandle={activeResizeHandle}
          hoveredResizeHandle={hoveredResizeHandle}
          resizePreview={resizePreview}
          hasActiveResizeAction={resizeActionRef.current !== null}
          onPointerEnterHandle={setHoveredResizeHandle}
          onPointerLeaveHandle={() => setHoveredResizeHandle(null)}
          onBeginResize={beginCanvasResize}
        />
      </div>
    </div>
  );
}
