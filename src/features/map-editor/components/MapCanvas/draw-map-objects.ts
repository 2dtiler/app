import type { MapObject, ObjectLayer } from "@/types";
import type { UseSceneInteractionReturn } from "@/features/map-editor/types/map-canvas";
import {
  getBoxObjectHandlePositions,
  getObjectDisplayBounds,
  isBoxObjectType,
} from "./object-utils";
import { drawTextObject } from "./text-object-rendering";

export function drawMapObjects(
  ctx: CanvasRenderingContext2D,
  objectLayers: ObjectLayer[],
  objects: MapObject[],
  activeObjectId: string | null,
  liveObjectPos: UseSceneInteractionReturn["liveObjectPos"],
  liveObjectResize: UseSceneInteractionReturn["liveObjectResize"],
  livePolyVertex: UseSceneInteractionReturn["livePolyVertex"],
  zoom: number,
) {
  for (const objLayer of objectLayers) {
    if (!objLayer.visible) continue;
    const layerObjects = objects.filter(
      (object) => object.layerId === objLayer.id,
    );
    for (const obj of layerObjects) {
      if (!obj.visible) continue;

      const isActive = obj.id === activeObjectId;
      const colorBase = isActive ? "rgba(0, 170, 255," : "rgba(0, 204, 170,";
      const colorAlpha = isActive ? 1 : 0.7;
      const lineWidth = isActive ? 2 : 1.5;
      const drag = liveObjectPos?.objectId === obj.id ? liveObjectPos : null;
      const resize =
        liveObjectResize?.objectId === obj.id ? liveObjectResize : null;
      const bounds = getObjectDisplayBounds(obj, zoom, {
        x: resize?.x ?? drag?.x,
        y: resize?.y ?? drag?.y,
        width: resize?.width,
        height: resize?.height,
      });
      const { x: ox, y: oy, width: ow, height: oh } = bounds;

      ctx.strokeStyle = `${colorBase} ${colorAlpha})`;
      ctx.lineWidth = lineWidth;

      if (obj.type === "rectangle") {
        ctx.strokeRect(ox, oy, ow, oh);
        ctx.fillStyle = `${colorBase} 0.08)`;
        ctx.fillRect(ox, oy, ow, oh);
      } else if (obj.type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          ox + ow / 2,
          oy + oh / 2,
          ow / 2,
          oh / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.fillStyle = `${colorBase} 0.08)`;
        ctx.fill();
      } else if (obj.type === "text") {
        ctx.fillStyle = `${colorBase} 0.08)`;
        ctx.fillRect(ox, oy, ow, oh);
        ctx.strokeRect(ox, oy, ow, oh);
        drawTextObject(
          ctx,
          obj,
          {
            x: ox,
            y: oy,
            width: ow,
            height: oh,
          },
          zoom,
          isActive,
        );
      } else if (obj.type === "point") {
        const ps = 6 * zoom;
        ctx.beginPath();
        ctx.moveTo(ox - ps, oy);
        ctx.lineTo(ox + ps, oy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, oy - ps);
        ctx.lineTo(ox, oy + ps);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, oy - ps * 0.7);
        ctx.lineTo(ox + ps * 0.7, oy);
        ctx.lineTo(ox, oy + ps * 0.7);
        ctx.lineTo(ox - ps * 0.7, oy);
        ctx.closePath();
        ctx.fillStyle = `${colorBase} 0.3)`;
        ctx.fill();
        ctx.stroke();
      } else if (obj.type === "polygon" && obj.points.length >= 2) {
        const points = obj.points.map((point, index) =>
          livePolyVertex &&
          livePolyVertex.objectId === obj.id &&
          livePolyVertex.vertexIndex === index
            ? livePolyVertex
            : point,
        );
        ctx.beginPath();
        ctx.moveTo(ox + points[0].x * zoom, oy + points[0].y * zoom);
        for (let index = 1; index < points.length; index++) {
          ctx.lineTo(ox + points[index].x * zoom, oy + points[index].y * zoom);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = `${colorBase} 0.08)`;
        ctx.fill();
      }

      if (isActive && isBoxObjectType(obj)) {
        const hs = 6;
        const hh = hs / 2;
        const handles = getBoxObjectHandlePositions(obj, zoom, {
          x: resize?.x ?? drag?.x,
          y: resize?.y ?? drag?.y,
          width: resize?.width,
          height: resize?.height,
        });
        for (const [, hx, hy] of handles) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(hx - hh, hy - hh, hs, hs);
          ctx.strokeStyle = `${colorBase} 1)`;
          ctx.lineWidth = 1;
          ctx.strokeRect(hx - hh, hy - hh, hs, hs);
        }
      }

      if (isActive && obj.type === "polygon") {
        for (
          let vertexIndex = 0;
          vertexIndex < obj.points.length;
          vertexIndex++
        ) {
          const point = obj.points[vertexIndex];
          const liveVertex =
            livePolyVertex &&
            livePolyVertex.objectId === obj.id &&
            livePolyVertex.vertexIndex === vertexIndex
              ? livePolyVertex
              : null;
          const vx = ox + (liveVertex ? liveVertex.x : point.x) * zoom;
          const vy = oy + (liveVertex ? liveVertex.y : point.y) * zoom;
          ctx.beginPath();
          ctx.arc(vx, vy, 4, 0, Math.PI * 2);
          ctx.fillStyle = `${colorBase} 0.9)`;
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }
}

export function drawLiveObjectPlacementPreview(
  ctx: CanvasRenderingContext2D,
  liveObjectPlace: UseSceneInteractionReturn["liveObjectPlace"],
  zoom: number,
) {
  if (!liveObjectPlace) return;

  const { type, x, y, width, height } = liveObjectPlace;
  const px = x * zoom;
  const py = y * zoom;
  const pw = width * zoom;
  const ph = height * zoom;

  ctx.strokeStyle = "rgba(0, 170, 255, 0.8)";
  ctx.lineWidth = 2;

  if (type === "rectangle") {
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = "rgba(0, 170, 255, 0.1)";
    ctx.fillRect(px, py, pw, ph);
    return;
  }

  if (type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(0, 170, 255, 0.1)";
    ctx.fill();
    return;
  }

  if (type === "text") {
    ctx.fillStyle = "rgba(0, 170, 255, 0.08)";
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = "rgba(0, 170, 255, 0.9)";
    ctx.font = `${Math.max(11 * zoom, 10)}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText("Text", px + 4, py + 4, Math.max(pw - 8, 1));
  }
}
