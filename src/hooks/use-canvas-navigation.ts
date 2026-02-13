import { useEffect, useRef } from "react";

/**
 * Hook that adds image-editor-style navigation to a scrollable container:
 * - Ctrl + Mousewheel → zoom in/out (towards cursor)
 * - Middle mouse drag → pan (scroll)
 *
 * @param containerRef - Ref to the scrollable container div
 * @param zoom - Current zoom level
 * @param onZoom - Callback to change zoom. Receives the new zoom value.
 * @param zoomMin - Minimum zoom (default 0.5)
 * @param zoomMax - Maximum zoom (default 4)
 * @param zoomStep - Zoom increment per wheel tick (default 0.1)
 */
export function useCanvasNavigation(
  containerRef: React.RefObject<HTMLDivElement | null>,
  zoom: number,
  onZoom: (newZoom: number) => void,
  zoomMin = 0.5,
  zoomMax = 4,
  zoomStep = 0.1,
) {
  // Keep latest zoom/callback in refs so event handlers always see current values
  const zoomRef = useRef(zoom);
  const onZoomRef = useRef(onZoom);
  useEffect(() => {
    zoomRef.current = zoom;
    onZoomRef.current = onZoom;
  });

  // Middle-mouse panning state
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ------------------------------------------------------------------
    // Ctrl + Wheel → Zoom towards cursor
    // ------------------------------------------------------------------
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const el = containerRef.current!;
      const rect = el.getBoundingClientRect();

      // Cursor position within the container viewport
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Position in content space before zoom
      const contentX = cursorX + el.scrollLeft;
      const contentY = cursorY + el.scrollTop;

      const currentZoom = zoomRef.current;

      // Determine direction: deltaY > 0 → scroll down → zoom out
      const direction = e.deltaY < 0 ? 1 : -1;
      const rawNext = currentZoom + direction * zoomStep;
      const newZoom =
        Math.round(Math.max(zoomMin, Math.min(zoomMax, rawNext)) * 100) / 100;

      if (newZoom === currentZoom) return;

      // Apply zoom
      onZoomRef.current(newZoom);

      // Adjust scroll to keep cursor over the same content point
      const scale = newZoom / currentZoom;
      const newContentX = contentX * scale;
      const newContentY = contentY * scale;

      requestAnimationFrame(() => {
        el.scrollLeft = newContentX - cursorX;
        el.scrollTop = newContentY - cursorY;
      });
    }

    // ------------------------------------------------------------------
    // Middle mouse drag → Pan
    // ------------------------------------------------------------------
    function handleMouseDown(e: MouseEvent) {
      // Button 1 = middle mouse
      if (e.button !== 1) return;
      e.preventDefault();

      const el = containerRef.current!;
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    }

    function handleMouseMove(e: MouseEvent) {
      if (!isPanningRef.current) return;
      e.preventDefault();

      const el = containerRef.current!;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      el.scrollLeft = panStartRef.current.scrollLeft - dx;
      el.scrollTop = panStartRef.current.scrollTop - dy;
    }

    function handleMouseUp(e: MouseEvent) {
      if (!isPanningRef.current) return;
      if (e.button !== 1) return;

      isPanningRef.current = false;
      const el = containerRef.current!;
      el.style.cursor = "";
      el.style.userSelect = "";
    }

    // Also stop panning if mouse leaves the window entirely
    function handleMouseLeaveWindow() {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      const el = containerRef.current;
      if (el) {
        el.style.cursor = "";
        el.style.userSelect = "";
      }
    }

    // Attach listeners
    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("mousedown", handleMouseDown);
    // Attach move/up to window so dragging outside the container still works
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleMouseLeaveWindow);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseLeaveWindow);
    };
  }, [containerRef, zoomMin, zoomMax, zoomStep]);
}
