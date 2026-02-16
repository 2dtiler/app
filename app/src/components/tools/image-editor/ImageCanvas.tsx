import { useRef, useEffect, useCallback } from "react";
import type {
  Color,
  ImageEditorTool,
  PixelSelection,
} from "@/types/image-editor";
import type { FrameId } from "@/types/image-editor";
import {
  createStrokeState,
  dispatchDown,
  dispatchMove,
  dispatchUp,
  commitFloatingSelection,
  resetSelectionState,
  getSelectionState,
  copySelectionPixels,
  pasteSelectionPixels,
  hitTestResizeHandle,
  getResizeHandleCursor,
  drawFloatingOnOverlay,
  type ToolContext,
  type StrokeState,
} from "@/lib/image-editor-tools";

interface ImageCanvasProps {
  width: number;
  height: number;
  zoom: number;
  tool: ImageEditorTool;
  primaryColor: Color;
  secondaryColor: Color;
  brushSize: number;
  blurSize: number;
  blurIntensity: number;
  currentFrameId: FrameId | null;
  currentFrameData: ImageData | null;
  previousFrameData: ImageData | null;
  onionSkin: boolean;
  selection: PixelSelection | null;
  onZoom: (zoom: number) => void;
  onPushUndo: () => void;
  onSelectionChange: (sel: PixelSelection | null) => void;
  onFrameDataChange: (frameId: FrameId, data: ImageData) => void;
}

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
  currentFrameData,
  previousFrameData,
  onionSkin,
  selection,
  onZoom,
  onPushUndo,
  onSelectionChange,
  onFrameDataChange,
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const selBorderRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<StrokeState>(createStrokeState());
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const clipboardRef = useRef<ImageData | null>(null);
  const prevToolRef = useRef<ImageEditorTool>(tool);

  // When switching away from selection tool, commit any floating selection
  useEffect(() => {
    if (prevToolRef.current === "selection" && tool !== "selection") {
      const ss = getSelectionState();
      if (ss.floatingPixels) {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (canvas && overlay) {
          const ctx = canvas.getContext("2d");
          const overlayCtx = overlay.getContext("2d");
          if (ctx && overlayCtx) {
            const tc: ToolContext = {
              ctx,
              overlayCtx,
              width,
              height,
              color: primaryColor,
              brushSize,
              tool,
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
    // Reset cursor when leaving selection tool
    if (tool !== "selection") {
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
    onSelectionChange,
    onFrameDataChange,
  ]);

  // Sync frame data onto main canvas whenever it changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrameData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(currentFrameData, 0, 0);
  }, [currentFrameData, currentFrameId]);

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
      const ctx = canvas.getContext("2d");
      const overlayCtx = overlay.getContext("2d");
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

  // Animated marching-ants selection border (screen-resolution canvas)
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useEffect(() => {
    const c = selBorderRef.current;
    if (!c) return;

    if (tool !== "selection") {
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
      if (ss.floatingPixels) {
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

      const tc = getToolContext({ shiftKey: e.shiftKey });
      if (!tc) return;

      // Use secondary color for right-click
      if (e.button === 2) {
        tc.color = secondaryColor;
      }

      // Push undo snapshot before modifying
      onPushUndo();

      const [px, py] = toPixel(e as unknown as React.MouseEvent);
      dispatchDown(tool, tc, px, py, strokeRef.current);

      // Capture pointer for drag
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [tool, currentFrameId, secondaryColor, getToolContext, toPixel, onPushUndo],
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

      if (!strokeRef.current.active) return;
      const tc = getToolContext({ shiftKey: e.shiftKey });
      if (!tc) return;

      const sel = dispatchMove(tool, tc, px, py, strokeRef.current);

      if (tool === "selection" && sel) {
        onSelectionChange(sel);
      }
    },
    [tool, getToolContext, toPixel, onSelectionChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const tc = getToolContext({ shiftKey: e.shiftKey });
      if (!tc) return;

      const [px, py] = toPixel(e as unknown as React.MouseEvent);
      const sel = dispatchUp(tool, tc, px, py, strokeRef.current);

      if (tool === "selection") {
        onSelectionChange(sel);
      }

      // Save updated frame data back
      if (currentFrameId) {
        const imgData = tc.ctx.getImageData(0, 0, width, height);
        onFrameDataChange(currentFrameId, imgData);
      }
    },
    [
      tool,
      currentFrameId,
      width,
      height,
      getToolContext,
      toPixel,
      onSelectionChange,
      onFrameDataChange,
    ],
  );

  const pixelW = width * zoom;
  const pixelH = height * zoom;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-neutral-900"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="relative inline-block"
        style={{
          width: pixelW,
          height: pixelH,
          minWidth: pixelW,
          minHeight: pixelH,
        }}
      >
        {/* Checkerboard background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #333 25%, transparent 25%), " +
              "linear-gradient(-45deg, #333 25%, transparent 25%), " +
              "linear-gradient(45deg, transparent 75%, #333 75%), " +
              "linear-gradient(-45deg, transparent 75%, #333 75%)",
            backgroundSize: `${zoom * 2}px ${zoom * 2}px`,
            backgroundPosition: `0 0, 0 ${zoom}px, ${zoom}px -${zoom}px, -${zoom}px 0`,
            opacity: 0.5,
          }}
        />

        {/* Onion skin canvas */}
        <canvas
          ref={onionRef}
          width={width}
          height={height}
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: pixelW,
            height: pixelH,
            imageRendering: "pixelated",
            opacity: 0.3,
          }}
        />

        {/* Main drawing canvas */}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="absolute top-0 left-0"
          style={{
            width: pixelW,
            height: pixelH,
            imageRendering: "pixelated",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {/* Overlay canvas (tool previews) */}
        <canvas
          ref={overlayRef}
          width={width}
          height={height}
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: pixelW,
            height: pixelH,
            imageRendering: "pixelated",
          }}
        />

        {/* Screen-resolution selection border canvas (marching ants) */}
        <canvas
          ref={selBorderRef}
          width={pixelW}
          height={pixelH}
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: pixelW,
            height: pixelH,
          }}
        />
      </div>
    </div>
  );
}
