import type { MapResizeControlsProps } from "@/types/map-canvas";
import { RESIZE_CURSORS } from "./resize-utils";

const MAP_RESIZE_GUTTER = 14;
const MAP_RESIZE_RAIL_SIZE = 10;
const MAP_RESIZE_BADGE_OFFSET = 6;

export function MapResizeControls({
  canvasW,
  canvasH,
  previewWidth,
  previewHeight,
  activeHandle,
  hoveredHandle,
  mapResizePreview,
  isResizing,
  onHoverHandleChange,
  onBeginMapResize,
}: MapResizeControlsProps) {
  const sizeLabel = `${previewWidth} × ${previewHeight}`;
  const rightGripActive = activeHandle === "e" || activeHandle === "se";
  const bottomGripActive = activeHandle === "s" || activeHandle === "se";
  const rightGripHovered = hoveredHandle === "e" || hoveredHandle === "se";
  const bottomGripHovered = hoveredHandle === "s" || hoveredHandle === "se";
  const cornerGripActive = activeHandle === "se";
  const cornerGripHovered = hoveredHandle === "se";

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: canvasW,
          width: MAP_RESIZE_GUTTER,
          height: canvasH,
          cursor: RESIZE_CURSORS.e,
          touchAction: "none",
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerEnter={() => onHoverHandleChange("e")}
        onPointerLeave={() => {
          if (!isResizing) {
            onHoverHandleChange(null);
          }
        }}
        onPointerDown={(event) => onBeginMapResize("e", event)}
      >
        <div
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: (MAP_RESIZE_GUTTER - MAP_RESIZE_RAIL_SIZE) / 2,
            width: MAP_RESIZE_RAIL_SIZE,
            borderRadius: 999,
            background: rightGripActive
              ? "rgba(251, 146, 60, 0.45)"
              : rightGripHovered
                ? "rgba(251, 146, 60, 0.24)"
                : "rgba(148, 163, 184, 0.28)",
            border: rightGripHovered
              ? "1px solid rgba(251, 146, 60, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.18)",
            boxShadow: rightGripHovered
              ? "0 0 10px rgba(251, 146, 60, 0.18)"
              : "none",
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasH,
          left: 0,
          width: canvasW,
          height: MAP_RESIZE_GUTTER,
          cursor: RESIZE_CURSORS.s,
          touchAction: "none",
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerEnter={() => onHoverHandleChange("s")}
        onPointerLeave={() => {
          if (!isResizing) {
            onHoverHandleChange(null);
          }
        }}
        onPointerDown={(event) => onBeginMapResize("s", event)}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: (MAP_RESIZE_GUTTER - MAP_RESIZE_RAIL_SIZE) / 2,
            height: MAP_RESIZE_RAIL_SIZE,
            borderRadius: 999,
            background: bottomGripActive
              ? "rgba(251, 146, 60, 0.45)"
              : bottomGripHovered
                ? "rgba(251, 146, 60, 0.24)"
                : "rgba(148, 163, 184, 0.28)",
            border: bottomGripHovered
              ? "1px solid rgba(251, 146, 60, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.18)",
            boxShadow: bottomGripHovered
              ? "0 0 10px rgba(251, 146, 60, 0.18)"
              : "none",
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasH,
          left: canvasW,
          width: MAP_RESIZE_GUTTER,
          height: MAP_RESIZE_GUTTER,
          cursor: RESIZE_CURSORS.se,
          touchAction: "none",
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerEnter={() => onHoverHandleChange("se")}
        onPointerLeave={() => {
          if (!isResizing) {
            onHoverHandleChange(null);
          }
        }}
        onPointerDown={(event) => onBeginMapResize("se", event)}
      >
        <div
          style={{
            position: "absolute",
            inset: 2,
            borderRadius: 4,
            background: cornerGripActive
              ? "rgba(251, 146, 60, 0.45)"
              : cornerGripHovered
                ? "rgba(251, 146, 60, 0.24)"
                : "rgba(148, 163, 184, 0.28)",
            border: cornerGripHovered
              ? "1px solid rgba(251, 146, 60, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.18)",
            boxShadow: cornerGripHovered
              ? "0 0 12px rgba(251, 146, 60, 0.2)"
              : "none",
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      {mapResizePreview && (
        <div
          aria-live="polite"
          style={{
            position: "absolute",
            top: Math.max(0, canvasH - MAP_RESIZE_GUTTER - 24),
            left: Math.max(0, canvasW - 70 - MAP_RESIZE_BADGE_OFFSET),
            minWidth: 70,
            padding: "2px 6px",
            borderRadius: 999,
            background: "rgba(15, 23, 42, 0.88)",
            color: "rgba(248, 250, 252, 0.95)",
            border: "1px solid rgba(251, 146, 60, 0.35)",
            fontSize: 11,
            lineHeight: 1.4,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {sizeLabel}
        </div>
      )}
    </>
  );
}