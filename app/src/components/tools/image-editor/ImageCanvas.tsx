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
  currentFrameId: FrameId | null;
  currentFrameData: ImageData | null;
  previousFrameData: ImageData | null;
  onionSkin: boolean;
  selection: PixelSelection | null;
  onZoom: (zoom: number) => void;
  onPushUndo: () => void;
  onColorPick: (color: Color) => void;
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
  currentFrameId,
  currentFrameData,
  previousFrameData,
  onionSkin,
  selection,
  onZoom,
  onPushUndo,
  onColorPick,
  onSelectionChange,
  onFrameDataChange,
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<StrokeState>(createStrokeState());
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

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

  const getToolContext = useCallback((): ToolContext | null => {
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
    };
  }, [width, height, primaryColor, brushSize, tool]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1) return; // middle mouse = pan
      if (!currentFrameId) return;

      const tc = getToolContext();
      if (!tc) return;

      // Use secondary color for right-click
      if (e.button === 2) {
        tc.color = secondaryColor;
      }

      // Push undo snapshot before modifying
      const needsUndo = tool !== "eyedropper" && tool !== "marquee";
      if (needsUndo) {
        onPushUndo();
      }

      const [px, py] = toPixel(e as unknown as React.MouseEvent);
      const pickedColor = dispatchDown(tool, tc, px, py, strokeRef.current);

      if (tool === "eyedropper" && pickedColor) {
        onColorPick(pickedColor);
      }

      // Capture pointer for drag
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      tool,
      currentFrameId,
      secondaryColor,
      getToolContext,
      toPixel,
      onPushUndo,
      onColorPick,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!strokeRef.current.active && tool !== "marquee") return;
      const tc = getToolContext();
      if (!tc) return;

      const [px, py] = toPixel(e as unknown as React.MouseEvent);
      const sel = dispatchMove(tool, tc, px, py, strokeRef.current);

      if (tool === "marquee" && sel) {
        onSelectionChange(sel);
      }
    },
    [tool, getToolContext, toPixel, onSelectionChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const tc = getToolContext();
      if (!tc) return;

      const [px, py] = toPixel(e as unknown as React.MouseEvent);
      const sel = dispatchUp(tool, tc, px, py, strokeRef.current);

      if (tool === "marquee") {
        onSelectionChange(sel);
        // Clear overlay
        tc.overlayCtx.clearRect(0, 0, width, height);
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

        {/* Selection overlay */}
        {selection && (
          <div
            className="absolute pointer-events-none border border-dashed border-white mix-blend-difference"
            style={{
              left: selection.x * zoom,
              top: selection.y * zoom,
              width: selection.width * zoom,
              height: selection.height * zoom,
            }}
          />
        )}
      </div>
    </div>
  );
}
