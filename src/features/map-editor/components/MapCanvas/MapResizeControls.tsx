import type { MapResizeControlsProps } from "@/features/map-editor/types/map-canvas";
import { RESIZE_CURSORS } from "./resize-utils";

const MAP_RESIZE_GUTTER = 14;
const MAP_RESIZE_RAIL_SIZE = 10;
const MAP_RESIZE_BADGE_OFFSET = 6;

function getRailBackground(active: boolean, hovered: boolean): string {
  if (active) {
    return "rgba(251, 146, 60, 0.45)";
  }
  if (hovered) {
    return "rgba(251, 146, 60, 0.24)";
  }
  return "rgba(148, 163, 184, 0.28)";
}

function getRailBorder(hovered: boolean): string {
  return hovered
    ? "1px solid rgba(251, 146, 60, 0.35)"
    : "1px solid rgba(255, 255, 255, 0.18)";
}

function getRailShadow(hovered: boolean, size = 10): string {
  return hovered ? `0 0 ${size}px rgba(251, 146, 60, 0.18)` : "none";
}

export function MapResizeControls({
  canvasW,
  canvasH,
  canvasX,
  canvasY,
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
  const leftGripActive = activeHandle === "w" || activeHandle === "nw";
  const topGripActive = activeHandle === "n" || activeHandle === "nw";
  const rightGripActive = activeHandle === "e" || activeHandle === "se";
  const bottomGripActive = activeHandle === "s" || activeHandle === "se";
  const leftGripHovered = hoveredHandle === "w" || hoveredHandle === "nw";
  const topGripHovered = hoveredHandle === "n" || hoveredHandle === "nw";
  const rightGripHovered = hoveredHandle === "e" || hoveredHandle === "se";
  const bottomGripHovered = hoveredHandle === "s" || hoveredHandle === "se";
  const topLeftGripActive = activeHandle === "nw";
  const topLeftGripHovered = hoveredHandle === "nw";
  const cornerGripActive = activeHandle === "se";
  const cornerGripHovered = hoveredHandle === "se";

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasY,
          left: 0,
          width: MAP_RESIZE_GUTTER,
          height: canvasH,
          cursor: RESIZE_CURSORS.w,
          touchAction: "none",
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerEnter={() => onHoverHandleChange("w")}
        onPointerLeave={() => {
          if (!isResizing) {
            onHoverHandleChange(null);
          }
        }}
        onPointerDown={(event) => onBeginMapResize("w", event)}
      >
        <div
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: (MAP_RESIZE_GUTTER - MAP_RESIZE_RAIL_SIZE) / 2,
            width: MAP_RESIZE_RAIL_SIZE,
            borderRadius: 999,
            background: getRailBackground(leftGripActive, leftGripHovered),
            border: getRailBorder(leftGripHovered),
            boxShadow: getRailShadow(leftGripHovered),
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: canvasX,
          width: canvasW,
          height: MAP_RESIZE_GUTTER,
          cursor: RESIZE_CURSORS.n,
          touchAction: "none",
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerEnter={() => onHoverHandleChange("n")}
        onPointerLeave={() => {
          if (!isResizing) {
            onHoverHandleChange(null);
          }
        }}
        onPointerDown={(event) => onBeginMapResize("n", event)}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: (MAP_RESIZE_GUTTER - MAP_RESIZE_RAIL_SIZE) / 2,
            height: MAP_RESIZE_RAIL_SIZE,
            borderRadius: 999,
            background: getRailBackground(topGripActive, topGripHovered),
            border: getRailBorder(topGripHovered),
            boxShadow: getRailShadow(topGripHovered),
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: MAP_RESIZE_GUTTER,
          height: MAP_RESIZE_GUTTER,
          cursor: RESIZE_CURSORS.nw,
          touchAction: "none",
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerEnter={() => onHoverHandleChange("nw")}
        onPointerLeave={() => {
          if (!isResizing) {
            onHoverHandleChange(null);
          }
        }}
        onPointerDown={(event) => onBeginMapResize("nw", event)}
      >
        <div
          style={{
            position: "absolute",
            inset: 2,
            borderRadius: 4,
            background: getRailBackground(
              topLeftGripActive,
              topLeftGripHovered,
            ),
            border: getRailBorder(topLeftGripHovered),
            boxShadow: getRailShadow(topLeftGripHovered, 12),
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasY,
          left: canvasX + canvasW,
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
            background: getRailBackground(rightGripActive, rightGripHovered),
            border: getRailBorder(rightGripHovered),
            boxShadow: getRailShadow(rightGripHovered),
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasY + canvasH,
          left: canvasX,
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
            background: getRailBackground(bottomGripActive, bottomGripHovered),
            border: getRailBorder(bottomGripHovered),
            boxShadow: getRailShadow(bottomGripHovered),
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
          }}
        />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: canvasY + canvasH,
          left: canvasX + canvasW,
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
            background: getRailBackground(cornerGripActive, cornerGripHovered),
            border: getRailBorder(cornerGripHovered),
            boxShadow: getRailShadow(cornerGripHovered, 12),
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
            top: Math.max(canvasY, canvasY + canvasH - MAP_RESIZE_GUTTER - 24),
            left: Math.max(
              canvasX,
              canvasX + canvasW - 70 - MAP_RESIZE_BADGE_OFFSET,
            ),
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
